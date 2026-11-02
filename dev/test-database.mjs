import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export async function createTestDatabase({ excludeMigrations = [] } = {}) {
 const db = new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 for (const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql') && !excludeMigrations.includes(f)).sort()) {
  try { await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')); }
  catch(e) { throw new Error(`Migration ${file}: ${e.message}`); }
 }
 return db;
}
export async function rpc(db,name,body) {
 const allowed = ['lead_command_execute','lead_command_status','lead_claim_alert','lead_finish_alert','lead_release_alert','lead_reconcile_alert','lead_worker_heartbeat','seller_command_status','seller_workflow_reliable','seller_import','seller_review','seller_link','seller_workflow','seller_claim_outbox','seller_finish_outbox','seller_reconcile'];
 if (!allowed.includes(name)) throw new Error('Unknown RPC');
 const args=Object.entries(body); if (args.some(([k])=>!/^[a-z_]+$/.test(k))) throw new Error('Invalid arguments');
 const sql=`select * from public.${name}(${args.map(([k],i)=>`${k} => $${i+1}`).join(',')})`;
 const {rows}=await db.query(sql,args.map(([,v])=>v && typeof v==='object'? JSON.stringify(v):v));
 return ['seller_claim_outbox','lead_claim_alert'].includes(name)?rows:rows[0]?.[name];
}
