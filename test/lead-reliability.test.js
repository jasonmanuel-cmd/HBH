import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import handler,{readDetailsToken,makeDetailsToken} from '../api/leads.js';
import { createTestDatabase,rpc } from '../dev/test-database.mjs';
import { digest } from '../lib/lead-reliability.js';
import { processLeadAlerts,publicAlertSender } from '../lib/lead-alerts.js';
const env={SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',HQ_SESSION_SECRET:'synthetic-only',LEAD_RELIABILITY_ENABLED:'true',RESEND_API_KEY:'synthetic',LEAD_NOTIFY_EMAIL:'one@example.invalid,two@example.invalid'};
const body=()=>({reliability_version:1,submission_id:randomUUID(),recovery_key:randomUUID(),address:'123 Synthetic St, Test CA',name:'Synthetic Person',phone:'6615550101',email:'person@example.invalid',form_type:'options',consent_response:true});
const response=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}});
async function invoke(data,config=env,method='POST',url='/api/leads'){const res=response();await handler({method,url,body:data,headers:{}},res,config);return res;}
async function fixture(fn){const db=await createTestDatabase(),original=globalThis.fetch;const calls=[];
 await db.exec("update lead_reliability_control set enabled=true,worker_until=now()+interval '5 minutes'");
 const fetcher=async(url,init)=>{
  assert.ok(String(url).startsWith('https://synthetic.invalid/rest/v1/rpc/'),'external request BLOCKED');
  const name=String(url).split('/').at(-1);calls.push(name);
  try{return Response.json(await rpc(db,name,JSON.parse(init.body)));}catch(e){return Response.json({code:e.code},{status:400});}
 };
 globalThis.fetch=fetcher;
 try{await fn(db,calls,fetcher);}finally{globalThis.fetch=original;await db.close();}
}
const status=b=>({kind:'command_status',request_id:b.submission_id||b.request_id,recovery_key:b.recovery_key});
const details=(b,r)=>({kind:'details',reliability_version:1,request_id:randomUUID(),recovery_key:randomUUID(),details_token:r.body.details_token,expected_revision:r.body.details_revision,timeline:'Soon',occupancy:'Vacant',condition_flags:['Roof'],desired_outcome:'Discuss options'});

test('SQL-backed route atomically saves inquiry and one intent; duplicate/concurrent replay preserves staff edits',()=>fixture(async(db)=>{
 const b=body();const results=await Promise.all([invoke(b),invoke(b)]);assert.deepEqual(results.map(r=>r.statusCode),[200,200]);
 assert.equal((await db.query('select count(*)::int n from lead_alert_outbox')).rows[0].n,1);
 await db.query("update leads set name='Staff edit',assigned_to='billy' where id=$1",[b.submission_id]);
 assert.equal((await invoke(b)).statusCode,200);
 assert.equal((await db.query('select name from leads where id=$1',[b.submission_id])).rows[0].name,'Staff edit');
 assert.equal((await invoke({...b,name:'Changed intent'})).statusCode,409);
 assert.equal((await invoke({...b,recovery_key:randomUUID()})).statusCode,409);
 const job=(await db.query('select * from lead_alert_outbox')).rows[0];assert.deepEqual(job.payload.to,['one@example.invalid','two@example.invalid']);
 assert.ok(!JSON.stringify(job).includes('synthetic-only'));assert.equal((await db.query('select count(*)::int n from notification_outbox')).rows[0].n,0);
}));

test('lost SQL response/crash after save is recovered by authenticated status without another intent',()=>fixture(async(db,calls,fetcher)=>{
 const b=body();let lost=true;globalThis.fetch=async(u,o)=>{const r=await fetcher(u,o);if(String(u).endsWith('lead_command_execute')&&lost){lost=false;throw new Error('Lost response');}return r;};
 const first=await invoke(b);assert.equal(first.statusCode,503);assert.equal(first.body.state,'unresolved');
 const recovered=await invoke(status(b));assert.equal(recovered.body.state,'committed');assert.equal(recovered.body.result.id,b.submission_id);assert.ok(recovered.body.result.details_token);
 assert.equal((await invoke(b)).statusCode,200);assert.equal((await db.query('select count(*)::int n from lead_alert_outbox')).rows[0].n,1);
 assert.equal((await invoke({...status(b),recovery_key:randomUUID()})).statusCode,403);
 assert.equal((await invoke({kind:'command_status',request_id:b.submission_id})).statusCode,400);
}));

test('unknown/in-flight absence never grants new identity; explicit fence rejects late execution',()=>fixture(async(db)=>{
 const b=body();assert.equal((await invoke(status(b))).body.state,'unresolved');
 assert.equal((await invoke({...status(b),fence:true})).body.state,'aborted');
 const late=await invoke(b);assert.equal(late.statusCode,409);assert.equal(late.body.state,'aborted');
 assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,0);
 const committed=body();await invoke(committed);assert.equal((await invoke({...status(committed),fence:true})).body.state,'committed');
}));

test('details replay is immutable, stale updates abort and every writer advances revision',()=>fixture(async(db)=>{
 const b=body(),r=await invoke(b),d=details(b,r);const saved=await invoke(d);assert.equal(saved.statusCode,200);assert.equal(saved.body.details_revision,1);
 await db.query("update leads set timeline='New staff timeline' where id=$1",[b.submission_id]);
 assert.equal((await invoke(d)).statusCode,200);
 const stale={...d,request_id:randomUUID(),recovery_key:randomUUID(),timeline:'Old overwrite'};const rejected=await invoke(stale);
 assert.equal(rejected.statusCode,409);assert.equal(rejected.body.state,'aborted');assert.equal(rejected.body.code,'STALE');
 assert.equal((await invoke(status(stale))).body.state,'aborted');
 assert.equal((await invoke({...d,desired_outcome:'Changed intent'})).statusCode,409);
 const lead=(await db.query('select timeline,details_revision from leads where id=$1',[b.submission_id])).rows[0];assert.equal(lead.timeline,'New staff timeline');assert.equal(lead.details_revision,2);
 assert.equal((await db.query('select count(*)::int n from lead_alert_outbox')).rows[0].n,2);
}));

test('cross-record token/command, suppression and Standard brand boundaries reject mutation',()=>fixture(async(db)=>{
 const a=body(),b=body(),ra=await invoke(a),rb=await invoke(b);const d=details(a,ra);await invoke(d);
 assert.equal((await invoke({...d,details_token:rb.body.details_token})).statusCode,409);
 for(const patch of ["do_not_contact=true","do_not_contact=false,form_type='harbison_standard'","form_type='options',deleted_at=now()"]){
  await db.query(`update leads set ${patch} where id=$1`,[b.submission_id]);
  const r=await invoke(details(b,rb));assert.equal(r.statusCode,409);assert.equal(r.body.code,'INELIGIBLE');
 }
 assert.equal((await invoke({...details(a,ra),details_token:'forged'})).statusCode,401);
}));

test('status token reissue preserves absolute deadline, expiry allows outcome only',()=>fixture(async(db)=>{
 const b=body(),r=await invoke(b),token=readDetailsToken(r.body.details_token,env);
 const recovered=await invoke(status(b));assert.equal(readDetailsToken(recovered.body.result.details_token,env).exp,token.exp);
 await db.query("update lead_commands set result=jsonb_set(result,'{details_expires_at}',to_jsonb($2::bigint)) where request_id=$1",[b.submission_id,Date.now()-1]);
 const expired=await invoke(status(b));assert.equal(expired.body.state,'committed');assert.equal(expired.body.result.details_expired,true);assert.equal(expired.body.result.details_token,undefined);
 const old=makeDetailsToken({id:b.submission_id,phone:b.phone,address:b.address,details_revision:0,details_expires_at:Date.now()-1},env);
 assert.equal((await invoke({...details(b,r),details_token:old})).statusCode,401);
}));

test('rollback/default-off/version/readiness matrix cannot enter legacy delivery',()=>fixture(async(db,calls)=>{
 const off={...env,LEAD_RELIABILITY_ENABLED:'false'};assert.equal((await invoke({},off,'GET','/api/leads?reliability=1')).body.enabled,false);
 const b=body();assert.equal((await invoke(b,off)).statusCode,503);assert.deepEqual(calls,['lead_command_execute']);
 assert.equal((await invoke(b)).statusCode,200);
 assert.equal((await invoke(b,off)).statusCode,200);assert.equal((await invoke(status(b),off)).body.state,'committed');
 await db.exec('update lead_reliability_control set worker_until=now()-interval \'1 second\'');
 assert.equal((await invoke(body())).statusCode,503);assert.equal((await invoke(b)).statusCode,200);
 assert.equal((await invoke(body(),{...env,SELLER_OPERATIONS_ENABLED:'true'})).statusCode,503);
 const legacy={...body()};delete legacy.reliability_version;assert.notEqual((await invoke(legacy)).statusCode,200);
}));

test('failed/ambiguous SQL saves and malformed matching confirmation admit no external sends',()=>fixture(async(db,calls,fetcher)=>{
 const b=body();globalThis.fetch=async()=>{throw new Error('Network uncertainty');};assert.equal((await invoke(b)).statusCode,503);
 assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,0);
 for(const result of [{},{state:'committed',result:{id:randomUUID(),details_revision:0}},{state:'committed',result:{id:b.submission_id}}]){
  globalThis.fetch=async()=>Response.json(result);assert.equal((await invoke(b)).statusCode,503);
 }
 globalThis.fetch=fetcher;
 await db.exec("create function public.synthetic_reject() returns trigger language plpgsql as $$ begin raise exception 'synthetic reject'; end $$; create trigger synthetic_reject before insert on lead_alert_outbox for each row execute function synthetic_reject();");
 assert.equal((await invoke(b)).statusCode,503);
 for(const table of ['leads','lead_commands','lead_alert_outbox'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0);
}));

test('outbox lease expiry/finish fencing and uncertain sends require evidence before retry',()=>fixture(async(db)=>{
 const b=body();await invoke(b);const [job]=await rpc(db,'lead_claim_alert',{});assert.ok(job.lease);assert.equal((await rpc(db,'lead_claim_alert',{})).length,0);
 assert.equal(await rpc(db,'lead_finish_alert',{job_id:job.id,lease:randomUUID(),state:'accepted',provider_id:'receipt'}),false);
 await db.query("update lead_alert_outbox set lease_until=now()-interval '1 second' where id=$1",[job.id]);
 assert.equal(await rpc(db,'lead_finish_alert',{job_id:job.id,lease:job.lease,state:'accepted',provider_id:'late'}),false);
 assert.equal((await rpc(db,'lead_claim_alert',{})).length,0);assert.equal((await db.query('select state from lead_alert_outbox where id=$1',[job.id])).rows[0].state,'uncertain');
 await assert.rejects(rpc(db,'lead_reconcile_alert',{job_id:job.id,decision:'pending',evidence:'short'}));
 assert.equal(await rpc(db,'lead_reconcile_alert',{job_id:job.id,decision:'pending',evidence:'Synthetic provider proves nonacceptance'}),true);
 let sends=0;const send=Object.assign(async()=>{sends++;throw new Error('timeout after acceptance');},{validate(){},prepare(){return [];}});
 const localRpc=(name,args={})=>rpc(db,name,args);
 assert.equal((await processLeadAlerts({env:{},rpc:localRpc,send})).disabled,true);assert.equal(sends,0);
 await processLeadAlerts({env:{LEAD_RELIABILITY_DISPATCH_ENABLED:'true'},rpc:localRpc,send});assert.equal(sends,1);
 await processLeadAlerts({env:{LEAD_RELIABILITY_DISPATCH_ENABLED:'true'},rpc:localRpc,send});assert.equal(sends,1);
}));

test('channel snapshots preserve recipients, no webhook URL secrets; consent revoked before claim suppresses ACK',()=>fixture(async(db)=>{
 const b=body();const config={...env,LEAD_WEBHOOK_URL:'https://webhook.invalid/private-secret',TWILIO_ACCOUNT_SID:'test-account',TWILIO_AUTH_TOKEN:'test-secret',TWILIO_FROM:'+16615550102',LEAD_ALERT_SMS:'+16615550103,+16615550104',LEAD_ACK_ENABLED:'true'};
 assert.equal((await invoke(b,config)).statusCode,200);const jobs=(await db.query('select * from lead_alert_outbox')).rows;assert.equal(jobs.length,5);
 assert.equal(jobs.filter(j=>j.channel==='sms').length,2);assert.equal(jobs.filter(j=>j.channel==='customer_sms').length,1);
 const webhook=jobs.find(j=>j.channel==='webhook');assert.equal(webhook.target,digest(config.LEAD_WEBHOOK_URL));assert.ok(!JSON.stringify(jobs).includes('private-secret'));assert.ok(!JSON.stringify(jobs).includes('test-secret'));
 const sender=publicAlertSender({...config,LEAD_WEBHOOK_URL:'https://changed.invalid'},()=>{throw new Error('External fetch blocked');});assert.throws(()=>sender.prepare(webhook),/changed/);
 await db.query('update leads set consent_response=false where id=$1',[b.submission_id]);
 for(let i=0;i<5;i++){const claimed=await rpc(db,'lead_claim_alert',{});if(claimed[0])await rpc(db,'lead_finish_alert',{job_id:claimed[0].id,lease:claimed[0].lease,state:'accepted',provider_id:'synthetic'});}
 assert.equal((await db.query("select state from lead_alert_outbox where channel='customer_sms'")).rows[0].state,'suppressed');
}));

test('external sender makes a single mocked attempt and classifies receipt/uncertainty per channel',async()=>{
 const config={...env,LEAD_RELIABILITY_DISPATCH_ENABLED:'true'};let n=0;
 for(const payload of [{id:'provider-id'},{}]){
  const sender=publicAlertSender(config,async()=>{n++;return Response.json(payload);});const job={id:randomUUID(),channel:'email',payload:{to:['one@example.invalid']}};
  const result=await sender(job,sender.prepare(job));assert.equal(result.id,payload.id);
 }
 assert.equal(n,2);
 const sender=publicAlertSender(config,async()=>new Response('',{status:408}));const job={channel:'email',payload:{},id:randomUUID()};await assert.rejects(sender(job,sender.prepare(job)),e=>e.definitelyRejected===false);
});

test('migration rollback and service-only RLS privileges are enforced in disposable SQL',()=>fixture(async(db)=>{
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from public.lead_commands'),/permission denied/);
  await assert.rejects(db.query('select public.lead_command_status($1,$2,false)',[randomUUID(),'a'.repeat(64)]),/permission denied/);
  await db.exec('reset role');
 }
 const sql=await readFile(new URL('../supabase/migrations/20261102000000_lead_reliability.sql',import.meta.url),'utf8');assert.match(sql,/^begin;/m);assert.match(sql,/commit;/);
 // A failed transactional DDL batch leaves no partial schema behind.
 await assert.rejects(db.exec('begin;create table public.synthetic_atomicity(id integer);select 1/0;commit;'));await db.exec('rollback;');
 assert.equal((await db.query("select to_regclass('public.synthetic_atomicity') name")).rows[0].name,null);
}));

test('actual additive migration rolls back completely when a late statement fails',async()=>{
 const file='20261102000000_lead_reliability.sql';const db=await createTestDatabase({excludeMigrations:[file]});
 try{
  const sql=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
  await assert.rejects(db.exec(sql.replace(/commit;\s*$/,'select 1/0; commit;')));await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('public.lead_commands') name")).rows[0].name,null);
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='leads' and column_name='details_revision'")).rows[0].n,0);
  await db.exec(sql);assert.equal((await db.query('select enabled from lead_reliability_control')).rows[0].enabled,false);
 }finally{await db.close();}
});

test('configuration mismatch quarantines only affected job, drains other channels and closes admission health',()=>fixture(async(db)=>{
 const b=body(),old={...env,RESEND_API_KEY:'',LEAD_WEBHOOK_URL:'https://old.invalid/secret'};await invoke(b,old);
 const next=body();await invoke(next,env);
 // Establish deterministic queue order regardless of clock resolution.
 await db.exec("update lead_alert_outbox set created_at=now()-interval '1 minute' where channel='webhook'");
 const config={...env,LEAD_WEBHOOK_URL:'https://new.invalid/secret',LEAD_RELIABILITY_DISPATCH_ENABLED:'true'};let sent=0;
 const send=publicAlertSender(config,async()=>{sent++;return Response.json({id:'synthetic-receipt'});});const localRpc=(n,args={})=>rpc(db,n,args);
 await assert.rejects(processLeadAlerts({env:config,rpc:localRpc,send}),/configuration changed/);assert.equal(sent,0);
 assert.equal((await db.query("select state from lead_alert_outbox where channel='webhook'")).rows[0].state,'failed');
 assert.equal((await db.query('select worker_until from lead_reliability_control')).rows[0].worker_until,null);
 await processLeadAlerts({env:config,rpc:localRpc,send});assert.equal(sent,1);
 assert.equal((await db.query('select worker_until from lead_reliability_control')).rows[0].worker_until,null);
 assert.equal((await invoke(body())).statusCode,503);
}));
