// PostgreSQL-backed mock: memory only, synthetic seeds, all other fetches fail closed.
import { createTestDatabase, rpc } from './test-database.mjs';
import { db as seed, matches } from './mock-supabase.mjs';
export async function installOperationsMock(env=process.env) {
 const db=await createTestDatabase();
 for(const row of seed.leads) {
  const fields=Object.keys(row); await db.query(`insert into leads (${fields.join(',')}) values (${fields.map((_,i)=>`$${i+1}`).join(',')})`,fields.map(k=>row[k]));
 }
 Object.assign(env,{SUPABASE_URL:'http://mock.supabase.local',SUPABASE_SERVICE_ROLE_KEY:'mock-only',HQ_PASSWORD:'demo',HQ_REVIEW_PASSWORD:'review-demo',SELLER_OPERATIONS_ENABLED:'true',SELLER_OUTBOX_DISPATCH_ENABLED:'false'});
 globalThis.fetch=async (url,init={})=>{
  if (!String(url).startsWith(env.SUPABASE_URL+'/rest/v1/')) throw new Error('External fetch blocked in mock mode');
  const u=new URL(url), path=u.pathname.replace('/rest/v1/','');
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const body=init.body?JSON.parse(init.body):null;
  try {
   if(path.startsWith('rpc/')) return reply(await rpc(db,path.slice(4),body||{}));
   if(!/^[a-z_]+$/.test(path)) return reply({},400);
   const all=(await db.query(`select * from public.${path}`)).rows;
   const filters=[...u.searchParams].filter(([k])=>!['select','order','limit','offset','on_conflict'].includes(k));
   let rows=all.filter(r=>filters.every(([k,v])=>matches(r,k,v)));
   const method=init.method||'GET';
   if(method==='POST') {
    const result=[];
    for(const row of Array.isArray(body)?body:[body]) {
     const fields=Object.keys(row); if(fields.some(k=>!/^[a-z_]+$/.test(k))) throw new Error('Invalid fields');
     const ignore=String(init.headers?.Prefer||'').includes('ignore-duplicates');
     result.push(...(await db.query(`insert into public.${path} (${fields.join(',')}) values (${fields.map((_,i)=>`$${i+1}`).join(',')}) ${ignore?'on conflict do nothing':''} returning *`,fields.map(k=>row[k]))).rows);
    } return reply(result,201);
   }
   if(method==='PATCH'||method==='DELETE') {
    const result=[];
    for(const row of rows) {
     if(method==='DELETE') result.push(...(await db.query(`delete from public.${path} where id=$1 returning *`,[row.id])).rows);
     else {
      const fields=Object.keys(body); if(fields.some(k=>!/^[a-z_]+$/.test(k))) throw new Error('Invalid fields');
      result.push(...(await db.query(`update public.${path} set ${fields.map((k,i)=>`${k}=$${i+1}`).join(',')} where id=$${fields.length+1} returning *`,[...fields.map(k=>body[k]),row.id])).rows);
     }
    } return reply(result);
   }
   const order=u.searchParams.get('order');
   if(order) {const [key,dir]=order.split('.'); rows.sort((a,b)=>((a[key] instanceof Date && b[key] instanceof Date)?a[key]-b[key]:String(a[key]||'').localeCompare(String(b[key]||'')))*(dir==='desc'?-1:1));}
   const start=Number(u.searchParams.get('offset'))||0; return reply(rows.slice(start,start+(Number(u.searchParams.get('limit'))||1000)));
  } catch(e) {return reply({message:e.message},e.code==='23505'?409:400);}
 };
 return db;
}
