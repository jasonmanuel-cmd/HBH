import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import hq, { makeSession } from '../api/hq.js';
import { normalizeResearch, operationalMetrics, previewToken, workflowCommand } from '../lib/seller-operations.js';
import { installOperationsMock } from '../dev/operations-mock.mjs';
import { processOutbox, emailAdapter } from '../lib/notification-outbox.js';
import { rpc } from '../dev/test-database.mjs';
import { deliver } from '../api/leads.js';
import intake from '../api/intake.js';

const fixture={source_system:'synthetic',source_record_id:'record-1',jurisdiction:'Kern',apn:'SYNTHETIC-001',address:'101 Example Ave, Bakersfield, CA 93301',assertions:['Owner UNKNOWN'],conflicts:[]};
test('research normalization rejects unbounded/invalid input and preserves independent source history',()=>{
 const rows=normalizeResearch([fixture,fixture,{...fixture,assertions:['Notice rescinded; current status UNKNOWN']},{...fixture,source_record_id:'record-2'}]);
 assert.equal(rows[1].duplicate,true);assert.notEqual(rows[0].id,rows[2].id);assert.equal(rows[0].record_key,rows[2].record_key);assert.notEqual(rows[0].record_key,rows[3].record_key);
 assert.equal(rows[0].verification_state,'hold');assert.equal(rows[0].source_date,null);
 assert.throws(()=>normalizeResearch([{...fixture,source_url:'javascript:alert(1)'}]));
 assert.throws(()=>normalizeResearch(Array(101).fill(fixture)));
 assert.throws(()=>normalizeResearch([{...fixture,source_date:'2026-02-30'}]));
 const csv=normalizeResearch('source_system,source_record_id,address\nsynthetic,one,"A, B"','csv');assert.equal(csv[0].address,'A, B');assert.equal(csv[0].apn,null);
});

test('full HQ workflow runs against isolated PostgreSQL with external fetch blocked',async t=>{
 const env={}, oldFetch=globalThis.fetch, db=await installOperationsMock(env);
 t.after(async()=>{globalThis.fetch=oldFetch;await db.close();});
 const request=async(action,body,{review=true,session=true}={})=>{
  const res={code:200,status(c){this.code=c;return this;},json(b){this.body=b;return this;},setHeader(){}};
  await hq({method:body?'POST':'GET',url:`/api/hq?action=ops-${action}`,headers:{'x-hq':'1',...(session?{cookie:`hq_session=${makeSession('Jay',env)}`} : {}),...(review?{'x-hq-review':'review-demo'}:{})},body},res,env);return res;
 };
 assert.equal((await request('overview',null,{session:false})).code,401);
 for (const action of ['import','review','link','workflow','reconcile']) assert.equal((await request(action,{}, {session:false})).code,401);
 assert.equal((await request('import',{raw:[fixture]},{review:false})).code,403);
 const initial=(await request('overview')).body; const lead=initial.leads.find(l=>l.name==='Sample Seller A');
 const baseline=(await db.query('select count(*)::integer as n from leads')).rows[0].n;
 const originalOutboxCount=(await db.query('select count(*)::integer as n from notification_outbox')).rows[0].n;
 const expired=previewToken(normalizeResearch([fixture]),env,Date.now()-1000);
 assert.equal((await request('import',{raw:[fixture],commit:true,token:expired})).code,409);
 const preview=await request('import',{raw:[fixture]});assert.equal(preview.code,200);
 assert.equal((await request('import',{raw:[{...fixture,apn:'changed'}],commit:true,token:preview.body.token})).code,409);
 for(let i=0;i<2;i++) assert.equal((await request('import',{raw:[fixture],commit:true,token:preview.body.token})).code,200);
 assert.equal((await db.query('select count(*)::integer as n from research_records')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::integer as n from research_audit')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::integer as n from leads')).rows[0].n,baseline);
 assert.equal((await db.query('select count(*)::integer as n from notification_outbox')).rows[0].n,originalOutboxCount);
 const r=(await request('overview')).body.research[0];
 assert.equal((await request('link',{identity_confirmed:true,id:r.id,lead_id:lead.id,revision:0,evidence:'Same parcel independently verified'})).code,409);
 const review=await request('review',{id:r.id,revision:0,verification_state:'verified_facts',ownership_title_representation_checked:true,evidence:'Synthetic parcel and source verified'});assert.equal(review.code,200);
 assert.equal((await request('review',{id:r.id,revision:0,verification_state:'rejected',evidence:'stale edit'})).code,409);
 const unrelated=initial.leads.find(l=>l.name==='Sample Seller B');
 assert.equal((await request('link',{identity_confirmed:true,id:r.id,revision:1,lead_id:unrelated.id,evidence:'Reviewer chose the wrong inquiry'})).code,409);
 assert.equal((await request('link',{identity_confirmed:false,id:r.id,revision:1,lead_id:lead.id,evidence:'Identity was not checked'})).code,400);
 await db.query('update leads set do_not_contact=true where id=$1',[lead.id]);
 assert.equal((await request('link',{identity_confirmed:true,id:r.id,revision:1,lead_id:lead.id,evidence:'Suppression must prevent this link'})).code,409);
 await db.query('update leads set do_not_contact=false where id=$1',[lead.id]);
 assert.equal((await request('link',{identity_confirmed:true,id:r.id,revision:1,lead_id:lead.id,evidence:'Same parcel and requester confirmed'})).code,200);
 let current=lead;
 async function event(fields,expect=200){const response=await request('workflow',{id:current.id,revision:current.ops_revision,request_id:randomUUID(),detail:'Synthetic operator evidence',...fields});assert.equal(response.code,expect,JSON.stringify(response.body));if(expect===200)current=response.body.result;return response;}
 await event({event:'qualify',authority_confirmed:true,service_fit:true,timeline:'30 days',next_step:'Discuss options'},409);
 const cmd={id:current.id,revision:current.ops_revision,request_id:randomUUID(),event:'contact_attempt',channel:'call',result:'connected',detail:'Seller requested conversation, actual connection recorded'};
 const contact=await request('workflow',cmd);assert.equal(contact.code,200,JSON.stringify(contact.body));current=contact.body.result;
 assert.equal((await request('workflow',cmd)).code,200);
 assert.equal((await db.query("select count(*)::integer as n from lead_events where lead_id=$1 and kind='contact_attempt'",[lead.id])).rows[0].n,1);
 await event({event:'qualify',authority_confirmed:true,service_fit:true,timeline:'30 days',next_step:'Nathanael options consultation'});
 await event({event:'handoff'});assert.equal(current.assigned_to,'nathanael');
 await event({event:'appointment_booked',appointment_at:'2026-01-01T10:00:00Z'});
 await event({event:'appointment_result',result:'kept'});
 await event({event:'outcome',status:'closed_won',outcome_path:'listing'});
 const report=operationalMetrics([current],[r]);const stats=Object.values(report.sources)[0];assert.equal(stats.conversations,1);assert.equal(stats.qualified,1);assert.equal(stats.kept,1);assert.equal(stats.responseSample,1);
 const reopen={id:current.id,revision:current.ops_revision,request_id:randomUUID(),event:'reopen',detail:'Seller reopened discussion; synthetic evidence'};
 const reopened=await request('workflow',reopen);assert.equal(reopened.code,200);current=reopened.body.result;
 const replayedReopen=await request('workflow',reopen);assert.equal(replayedReopen.code,200);assert.equal(replayedReopen.body.replayed,true);
 assert.equal((await request('workflow',{...reopen,detail:'different evidence'})).code,409);
 assert.equal((await db.query("select count(*)::integer as n from lead_events where lead_id=$1 and kind='reopen'",[current.id])).rows[0].n,1);
 await event({event:'suppress'});await event({event:'contact_attempt',channel:'call',result:'connected'},409);await event({event:'response_permission',channel:'phone_call'},409);
 assert.equal(current.consent_marketing,lead.consent_marketing);
 // Public intake returns storage confirmation while all external providers are unreachable.
 const historicalId=randomUUID();
 await db.query("insert into leads(id,name,phone,address,status,intake_kind,notification_mode) values($1,'Synthetic historical','','Test','new','historical','durable')",[historicalId]);
 assert.equal((await db.query('select count(*)::integer as n from notification_outbox where lead_id=$1',[historicalId])).rows[0].n,0);
 const newer={...fixture,assertions:['Later cancellation recorded; owner remains UNKNOWN']};
 const nextPreview=await request('import',{raw:[newer]});
 assert.equal((await request('import',{raw:[newer],commit:true,token:nextPreview.body.token})).code,200);
 const superseded=(await db.query('select * from research_records where id=$1',[r.id])).rows[0];
 assert.equal(superseded.verification_state,'hold');
 assert.equal((await db.query("select count(*)::integer as n from research_audit where action='superseded'")).rows[0].n,1);
 const newId=randomUUID();const delivery=await deliver({id:newId,name:'Synthetic new inquiry',phone:'6615550199',address:'Test only',consent_response:true,status:'new'}, {...env,RESEND_API_KEY:'mock-no-network'});assert.equal(delivery.ok,true);assert.equal(delivery.notification,'queued');
 await db.query("update leads set assigned_to='billy' where id=$1",[newId]);
 assert.equal((await deliver({id:newId,name:'Synthetic new inquiry',phone:'6615550199',address:'Test only'},env)).duplicate,true);
 await db.query("update leads set assigned_to='nathanael' where id=$1",[newId]);
 assert.equal((await deliver({id:newId,name:'Synthetic new inquiry',phone:'6615550199',address:'Test only'},env)).duplicate,true);
 assert.equal((await db.query('select count(*)::integer as n from notification_outbox where lead_id=$1',[newId])).rows[0].n,1);
 // Standard bridge: same API contract; consent is not invented from a form submission.
 const standardId=randomUUID(), bridgeEnv={...env,CRM_INGEST_SECRET:'x'.repeat(40)};
 const res={status(c){this.code=c;return this;},json(b){this.body=b;return this;},setHeader(){}};
 await intake({method:'POST',headers:{authorization:`Bearer ${bridgeEnv.CRM_INGEST_SECRET}`},body:{version:1,brand:'harbison_standard',submission_id:standardId,lead:{name:'Synthetic Standard',email:'standard@example.invalid',goal:'Sell'}}},res,bridgeEnv);assert.equal(res.code,201);
 const standard=(await db.query('select * from leads where id=$1',[standardId])).rows[0];assert.equal(standard.assigned_to,'jay');assert.equal(standard.consent_response,false);
 current=standard;await event({event:'contact_attempt',channel:'email',result:'connected'},409);await event({event:'response_permission',channel:'email_request'});assert.equal(current.consent_marketing,false);
 // Every browser role is denied table access and RPC execution.
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  for (const table of ['research_records','research_audit','research_links','seller_commands','notification_outbox']) {
   await assert.rejects(db.query('select * from '+table));
   await assert.rejects(db.query('delete from '+table));
  }
  await assert.rejects(db.query("select seller_import('[]','forged')"));
  await db.exec('reset role');
 }
 let sends=0;assert.deepEqual(await processOutbox({phase:'protocol',env,rpc:()=>{throw Error('must not claim');},send:()=>sends++}),{disabled:true,processed:0});assert.equal(sends,0);
 const [claims,competingClaims]=await Promise.all([rpc(db,'seller_claim_outbox',{}),rpc(db,'seller_claim_outbox',{})]);
 assert.equal(claims.length,1); assert.equal(competingClaims.length,1); assert.notEqual(claims[0].id,competingClaims[0].id);assert.equal((await rpc(db,'seller_claim_outbox',{})).length,0);
 await db.exec("update notification_outbox set lease_until=now()-interval '1 minute' where state='sending'");
 await rpc(db,'seller_claim_outbox',{});assert.equal((await db.query("select count(*)::integer as n from notification_outbox where state='uncertain'")).rows[0].n,claims.length+competingClaims.length);
 assert.equal(await rpc(db,'seller_finish_outbox',{job_id:claims[0].id,lease:claims[0].lease,state:'accepted',provider_id:'late-receipt'}),false);
 assert.equal((await request('reconcile',{id:claims[0].id,state:'pending',evidence:'Mock provider confirms no acceptance'}, {review:false})).code,403);
 assert.equal((await request('reconcile',{id:claims[0].id,state:'pending',evidence:'short'})).code,400);
 assert.equal((await request('reconcile',{id:claims[0].id,state:'pending',evidence:'Mock provider confirms no acceptance'})).code,200);
 await processOutbox({phase:'protocol',env:{...env,SELLER_OUTBOX_DISPATCH_ENABLED:'true'},rpc:(n,b)=>rpc(db,n,b),send:async()=>({id:'mock-provider-receipt'})});
 assert.equal((await db.query('select state from notification_outbox where id=$1',[claims[0].id])).rows[0].state,'accepted');
 // Applying the schema alone does not opt legacy intake into assignment or outbox changes.
 const legacyId=randomUUID();const legacyEnv={...env,SELLER_OPERATIONS_ENABLED:'false'};
 assert.equal((await deliver({id:legacyId,name:'Synthetic legacy',phone:'6615550198',address:'Test',status:'new'},legacyEnv)).ok,true);
 const legacy=(await db.query('select * from leads where id=$1',[legacyId])).rows[0];assert.equal(legacy.notification_mode,'legacy');assert.equal(legacy.assigned_to,'nathanael');
 assert.equal((await db.query('select count(*)::integer as n from notification_outbox where lead_id=$1',[legacyId])).rows[0].n,0);
 await db.query("update leads set status='connected' where id=$1",[legacyId]);
 assert.ok((await db.query('select first_contact_at from leads where id=$1',[legacyId])).rows[0].first_contact_at);
 const metrics=operationalMetrics([current,{...current,id:historicalId,intake_kind:'historical'}],[r]);
 assert.equal(Object.values(metrics.sources).reduce((n,v)=>n+v.inquiries,0),1);
 // Simulate Supabase's pre-existing base-table grants; new RPC/table grants come from our migration.
 await db.exec('grant select,insert,update,delete on public.leads,public.lead_events to service_role; grant usage,select on all sequences in schema public to service_role; set role service_role;');
 assert.equal(typeof await rpc(db,'seller_import',{records:[],actor_name:'service role test'}),'number');
 await rpc(db,'seller_claim_outbox',{});await db.exec('reset role');
 await assert.rejects(fetch('https://api.resend.com/emails'));
});

test('outbox distinguishes accepted, known rejected and uncertain outcomes',async()=>{
 for(const [send,state] of [[async()=>({id:'receipt'}),'accepted'],[async()=>{throw Object.assign(Error(),{definitelyRejected:true});},'failed'],[async()=>{throw Error('timeout');},'uncertain'],[async()=>({}),'uncertain']]) {
  let finished;await processOutbox({phase:'protocol',env:{SELLER_OUTBOX_DISPATCH_ENABLED:'true'},rpc:async(n,b)=>n==='seller_claim_outbox'?[{id:'job',lease:'lease',lease_until:new Date(Date.now()+120000).toISOString()}]:(finished=b,true),send});assert.equal(finished.state,state);
 }
 let called=false;await assert.rejects(emailAdapter({},async()=>{called=true;})({id:'job'}));assert.equal(called,false);
});

test('durable intake never falls back to a schema that cannot queue notifications',async t=>{
 const old=globalThis.fetch; t.after(()=>globalThis.fetch=old); let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({message:'column notification_mode missing'}),{status:400});};
 const result=await deliver({id:randomUUID(),name:'Synthetic',phone:'6615550199',address:'Test'}, {SELLER_OPERATIONS_ENABLED:'true',SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock'});
 assert.equal(result.ok,false);assert.equal(calls,1);
});

test('worker rejects a lost lease instead of claiming confirmed completion',async()=>{
 await assert.rejects(processOutbox({phase:'protocol',env:{SELLER_OUTBOX_DISPATCH_ENABLED:'true'},rpc:async n=>n==='seller_claim_outbox'?[{id:'job',lease:'expired',lease_until:new Date(Date.now()+120000).toISOString()}]:false,send:async()=>({id:'accepted-by-provider'})}),/Lease changed/);
});

test('worker never starts a send with an expired or nearly expired lease',async()=>{
 let sent=0;for(const lease_until of [null,new Date(Date.now()-1).toISOString(),new Date(Date.now()+5000).toISOString()]) {
  await assert.rejects(processOutbox({phase:'protocol',env:{SELLER_OUTBOX_DISPATCH_ENABLED:'true'},rpc:async()=>[{id:'job',lease_until}],send:async()=>{sent++;}}),/lease expired/);
 }assert.equal(sent,0);
});

test('research identities are never silently truncated into duplicates',()=>{
 for (const source_record_id of ['x'.repeat(200)+'A','x'.repeat(200)+'B']) assert.throws(()=>normalizeResearch([{...fixture,source_record_id}]),/length/);
 assert.throws(()=>normalizeResearch([{...fixture,source_system:'s'.repeat(101)}]),/length/);
});
test('activity preserves advanced stages and closed inquiries require explicit reopening',()=>{
 const base={id:randomUUID(),consent_response:true,do_not_contact:false,conversation_at:'2026-01-01T00:00:00Z',closed_at:'2026-02-01T00:00:00Z',outcome_path:'listing'};
 const command={revision:0,request_id:randomUUID(),detail:'Actual synthetic conversation',event:'contact_attempt',channel:'call',result:'connected'};
 for (const status of ['qualified','appointment_set','under_contract','closed_won']) assert.equal(workflowCommand({...base,status},command).patch.status,status);
 assert.throws(()=>workflowCommand({...base,status:'closed_won'},{...command,event:'qualify'}),/Reopen/);
 const reopened=workflowCommand({...base,status:'closed_won'},{...command,event:'reopen'}).patch;
 assert.equal(reopened.closed_at,null);assert.equal(reopened.outcome_path,null);assert.equal(reopened.status,'connected');
});
