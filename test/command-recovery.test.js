import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import hq,{makeSession} from '../api/hq.js';
import publicHandler from '../api/leads.js';
import { installOperationsMock } from '../dev/operations-mock.mjs';
import { rpc } from '../dev/test-database.mjs';
const helper=await readFile(new URL('../static/command-recovery.js',import.meta.url),'utf8');
const operations=await readFile(new URL('../static/hq/operations.js',import.meta.url),'utf8');
const mockRes=()=>({code:200,headers:{},status(c){this.code=c;return this;},json(b){this.body=b;return this;},setHeader(k,v){this.headers[k]=v;}});
function storage(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function locks(){let tail=Promise.resolve();return {request(_name,fn){const result=tail.then(fn);tail=result.catch(()=>{});return result;}};}
async function fixture(fn){const env={},oldFetch=globalThis.fetch,db=await installOperationsMock(env);env.SELLER_COMMAND_RECOVERY_ENABLED='true';
 const request=async(action,body,{auth=true,csrf=true}={})=>{const res=mockRes();await hq({method:body?'POST':'GET',url:`/api/hq?action=ops-${action}`,headers:{...(csrf?{'x-hq':'1'}:{}),...(auth?{cookie:`hq_session=${makeSession('Synthetic',env)}`}:{})},body},res,env);return res;};
 try{await fn({env,db,request});}finally{globalThis.fetch=oldFetch;await db.close();}
}

test('authenticated HQ route executes once, recovers after deletion and rejects cross-record/fenced/stale commands',()=>fixture(async({db,request,env})=>{
 const lead=(await db.query("select * from leads where status='new' and do_not_contact=false limit 1")).rows[0];
 const command={id:lead.id,request_id:randomUUID(),revision:lead.ops_revision,event:'suppress',detail:'Synthetic suppression evidence',reliability_version:1};
 const before=(await db.query('select count(*)::int n from lead_events')).rows[0].n;
 const results=await Promise.all([request('workflow',command),request('workflow',command)]);assert.deepEqual(results.map(r=>r.code),[200,200]);
 assert.equal((await db.query('select count(*)::int n from lead_events')).rows[0].n,before+1);
 assert.equal((await request('workflow',{...command,detail:'Changed evidence'})).code,409);
 const status={id:lead.id,request_id:command.request_id};
 assert.equal((await request('command-status',status,{auth:false})).code,401);
 assert.equal((await request('command-status',status,{csrf:false})).code,403);
 assert.equal((await request('command-status',{...status,id:randomUUID()})).code,409); // Safe identity conflict, never success.
 await db.query('update leads set deleted_at=now() where id=$1',[lead.id]);assert.equal((await request('command-status',status)).body.state,'committed');
 await db.query('delete from leads where id=$1',[lead.id]);assert.equal((await request('command-status',status)).body.state,'committed');
 assert.equal((await request('workflow',command)).code,200);
 env.SELLER_OPERATIONS_ENABLED='false';env.SELLER_COMMAND_RECOVERY_ENABLED='false';assert.equal((await request('command-status',status)).body.state,'committed');assert.equal((await request('workflow',command)).code,503);
 env.SELLER_OPERATIONS_ENABLED='true';env.SELLER_COMMAND_RECOVERY_ENABLED='true';
 const other=(await db.query('select * from leads where deleted_at is null limit 1')).rows[0];const pending={id:other.id,request_id:randomUUID()};
 assert.equal((await request('command-status',pending)).body.state,'unresolved');assert.equal((await request('command-status',{...pending,fence:true})).body.state,'aborted');
 assert.equal((await request('workflow',{...command,...pending,revision:other.ops_revision})).code,409);
 const stale={...command,id:other.id,request_id:randomUUID(),revision:999};assert.equal((await request('workflow',stale)).code,409);
}));

function browser(shared,fetcher,sharedLocks=locks()){
 const context={window:{},localStorage:shared,navigator:{locks:sharedLocks},crypto:{randomUUID},fetch:fetcher,AbortSignal,URLSearchParams,setTimeout,location:{pathname:'/'},Map,console};
 vm.runInNewContext(helper,context);return context;
}
const payload={address:'123 Synthetic Road',name:'Synthetic Public',phone:'6615550101',email:'public@example.invalid',form_type:'options',consent_response:true};
test('fresh browser restart recovers lost inquiry and details replies through actual SQL route; storage stays opaque',()=>fixture(async({db,env})=>{
 env.SELLER_OPERATIONS_ENABLED='false';env.LEAD_RELIABILITY_ENABLED='true';env.RESEND_API_KEY='synthetic';
 await db.exec("update lead_reliability_control set enabled=true,worker_until=now()+interval '5 minutes'");
 let lose=true,commands=0;
 const transport=async(url,options={})=>{const body=options.body?JSON.parse(options.body):{};const res=mockRes();await publicHandler({method:options.method||'GET',url,body,headers:{}},res,env);if(body.reliability_version){commands++;if(lose){lose=false;throw new Error('Lost final reply');}}return Response.json(res.body,{status:res.code});};
 const shared=storage();let page=browser(shared,transport);
 await assert.rejects(page.window.HBHCommands.submit(payload),/Lost final/);
 const original=shared.getItem('hbh_reliable_inquiry');assert.ok(original);assert.ok(!original.includes('Synthetic'));
 page=browser(shared,transport);const recovered=await page.window.HBHCommands.submit({...payload,name:'Edited after restart'});assert.equal(recovered.ok,true);assert.equal(commands,1);assert.equal(shared.getItem('hbh_reliable_inquiry'),original);
 lose=true;await assert.rejects(page.window.HBHCommands.submit({timeline:'Soon',occupancy:'Vacant',condition_flags:[],desired_outcome:'Talk'},true),/Lost final/);
 page=browser(shared,transport);assert.equal((await page.window.HBHCommands.submit({timeline:'Edited'},true)).ok,true);assert.equal(commands,2);
 for(const value of shared.map.values()){const record=JSON.parse(value);assert.deepEqual(Object.keys(record).sort(),['recovery_key','request_id']);}
 assert.equal((await db.query('select count(*)::int n from lead_alert_outbox')).rows[0].n,2);
 await page.window.HBHCommands.startNew();assert.equal(shared.getItem('hbh_reliable_inquiry'),null);
}));

test('browser unknown outcome requires fence, concurrent tabs share identity, storage failure blocks mutation',async()=>{
 const shared=storage(),sharedLocks=locks();let attempts=0,fenced=false;
 const fetcher=async(_url,options={})=>{
  if(!options.body)return Response.json({enabled:true,version:1});
  const b=JSON.parse(options.body);
  if(b.kind==='command_status'){if(b.fence)fenced=true;return Response.json({ok:true,state:fenced?'aborted':'unresolved'});}
  attempts++;throw new Error('Dropped before admission');
 };
 const a=browser(shared,fetcher,sharedLocks),b=browser(shared,fetcher,sharedLocks);
 const outcomes=await Promise.allSettled([a.window.HBHCommands.submit(payload),b.window.HBHCommands.submit(payload)]);assert.ok(outcomes.every(r=>r.status==='rejected'));assert.equal(attempts,1);
 const identity=shared.getItem('hbh_reliable_inquiry');assert.ok(identity);
 await assert.rejects(b.window.HBHCommands.startNew(),/Resolve/);assert.equal(shared.getItem('hbh_reliable_inquiry'),identity);
 assert.equal((await b.window.HBHCommands.resolve()).state,'aborted');assert.equal(shared.getItem('hbh_reliable_inquiry'),null);
 const broken=storage();broken.setItem=()=>{throw new Error('Storage denied');};await assert.rejects(browser(broken,fetcher).window.HBHCommands.submit(payload),/Storage denied/);assert.equal(attempts,1);
 const corrupt=storage();corrupt.setItem('hbh_reliable_inquiry','{bad');await assert.rejects(browser(corrupt,fetcher).window.HBHCommands.submit(payload),/damaged/);assert.equal(attempts,1);
 const unsupported=browser(storage(),fetcher);unsupported.navigator.locks=null;await assert.rejects(unsupported.window.HBHCommands.submit(payload),/cannot safely/);assert.equal(attempts,1);
});

function hqBrowser(shared,transport,leadId){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{id,disabled:false,value:'',checked:false,hidden:false,innerHTML:'',textContent:'',elements:{},addEventListener(n,f){this[n]=f;},dispatchEvent(e){this[e.type]?.(e);},scrollIntoView(){},reset(){}});return nodes.get(id);};
 const form=node('#ops-workflow');form.elements.authority_confirmed={checked:false};form.elements.service_fit={checked:false};node('#ops-lead').value=leadId;
 const edit={disabled:false,dataset:{}};
 const context=browser(shared,transport);Object.assign(context,{document:{querySelector:node,querySelectorAll:s=>s.startsWith('#ops-workflow')?[edit]:[]},location:{search:''},Event:class{constructor(type){this.type=type;}},FormData:class{*[Symbol.iterator](){yield ['id',leadId];yield ['event','suppress'];yield ['detail','Synthetic UI evidence'];}}});
 vm.runInNewContext(operations,context);return {context,node,form,edit};
}
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,10));};
test('actual HQ UI preserves opaque marker on lost response/logout and fresh VM resolves without resubmission',()=>fixture(async({request,db})=>{
 const lead=(await db.query('select id from leads where deleted_at is null limit 1')).rows[0].id;let writes=0,lose=true;
 const transport=async(url,options={})=>{const action=new URL(url,'http://local').searchParams.get('action').replace('ops-','');const r=await request(action,options.body?JSON.parse(options.body):undefined);if(action==='workflow'){writes++;if(lose){lose=false;throw new Error('lost response');}}return Response.json(r.body,{status:r.code});};
 const shared=storage();let page=hqBrowser(shared,transport,lead);await page.context.window.loadSellerOperations();
 page.form.onsubmit({preventDefault(){},target:page.form,submitter:{disabled:false}});await settle();assert.equal(writes,1);assert.equal(page.edit.disabled,true);
 const marker=JSON.parse(shared.getItem('hbh_seller_pending'));assert.deepEqual(Object.keys(marker).sort(),['id','request_id']);page.context.window.clearSellerOperations();assert.ok(shared.getItem('hbh_seller_pending'));
 page=hqBrowser(shared,transport,lead);await page.context.window.loadSellerOperations();assert.equal(shared.getItem('hbh_seller_pending'),null);assert.equal(writes,1);assert.equal(page.edit.disabled,false);
 const unknown={id:lead,request_id:randomUUID()};shared.setItem('hbh_seller_pending',JSON.stringify(unknown));page=hqBrowser(shared,transport,lead);await page.context.window.loadSellerOperations();assert.equal(page.node('#ops-submit').textContent,'Resolve original request');
 page.form.onsubmit({preventDefault(){},target:page.form,submitter:{disabled:false}});await settle();assert.equal(shared.getItem('hbh_seller_pending'),null);assert.equal(writes,1);
 assert.equal((await rpc(db,'seller_command_status',{request_id:unknown.request_id,lead_id:lead,fence:false})).state,'aborted');
}));

test('case-normalized seller fences and terminal evidence prevent late legacy mutation',()=>fixture(async({db,request})=>{
 const lead=(await db.query('select * from leads where deleted_at is null limit 1')).rows[0];
 const request_id=randomUUID();const command={id:lead.id.toUpperCase(),request_id:request_id.toUpperCase(),revision:lead.ops_revision,event:'suppress',detail:'Synthetic casing evidence',reliability_version:1};
 const outcomes=await Promise.all([request('workflow',command),request('command-status',{id:lead.id,request_id,fence:true})]);
 const status=await request('command-status',{id:lead.id,request_id});assert.ok(['committed','aborted'].includes(status.body.state));
 const saved=(await db.query('select * from leads where id=$1',[lead.id])).rows[0];assert.equal(saved.ops_revision,lead.ops_revision+(status.body.state==='committed'?1:0));
 if(status.body.state==='committed')assert.equal((await request('workflow',command)).code,200);
 const fenced=randomUUID();await rpc(db,'seller_command_status',{request_id:fenced,lead_id:lead.id,fence:true});
 // Even an old low-level caller cannot erase an abort tombstone or commit its mutation.
 const before=(await db.query('select ops_revision from leads where id=$1',[lead.id])).rows[0].ops_revision;
 await assert.rejects(rpc(db,'seller_workflow',{command:{id:lead.id,request_id:fenced,revision:before,event:'suppress',detail:'Synthetic late call',patch:{do_not_contact:true}},actor_name:'Synthetic'}),/terminal evidence/);
 assert.equal((await db.query('select ops_revision from leads where id=$1',[lead.id])).rows[0].ops_revision,before);
 const definition=(await db.query("select pg_get_functiondef('seller_workflow_reliable(jsonb,text)'::regprocedure) as sql")).rows[0].sql;
 assert.match(definition,/hashtext\(\(\(command->>'request_id'\)::uuid\)::text\)/);
}));

test('HQ API and browser retain pending identity on malformed confirmations; same-page rejection exposes fence',()=>fixture(async({db,request})=>{
 const lead=(await db.query('select * from leads where deleted_at is null limit 1')).rows[0];const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>String(url).endsWith('rpc/seller_workflow_reliable')?Response.json({}):oldFetch(url,options);
 const command={id:lead.id,request_id:randomUUID(),revision:lead.ops_revision,event:'suppress',detail:'Synthetic malformed response',reliability_version:1};
 assert.equal((await request('workflow',command)).code,502);globalThis.fetch=oldFetch;
 for(const responseMode of ['invalid','rejected']){
  const shared=storage();let workflowCalls=0;
  const transport=async(url,options={})=>{const action=new URL(url,'http://local').searchParams.get('action').replace('ops-','');if(action==='workflow'){workflowCalls++;return responseMode==='invalid'?Response.json({ok:true}):Response.json({ok:false,error:'Stale revision'},{status:409});}const result=await request(action,options.body?JSON.parse(options.body):undefined);return Response.json(result.body,{status:result.code});};
  const page=hqBrowser(shared,transport,lead.id);await page.context.window.loadSellerOperations();page.form.onsubmit({preventDefault(){},target:page.form,submitter:{disabled:false}});await settle();assert.ok(shared.getItem('hbh_seller_pending'));assert.equal(page.edit.disabled,true);
  if(responseMode==='rejected'){
   assert.equal(page.node('#ops-submit').textContent,'Resolve original request');page.form.onsubmit({preventDefault(){},target:page.form,submitter:{disabled:false}});await settle();assert.equal(shared.getItem('hbh_seller_pending'),null);assert.equal(workflowCalls,1);
  }
 }
}));

test('bound public controls appear after delayed configuration and actual form conversion events avoid replay duplicates',async()=>{
 const shared=storage(),events=[],handlers=[],buttons=[],listeners=new Map();let releaseConfig,configPromise=new Promise(r=>releaseConfig=r),failFirst=true;const committed=new Map();
 const transport=async(_url,options={})=>{
  if(!options.body){await configPromise;return Response.json({enabled:true,version:1});}
  const b=JSON.parse(options.body);if(b.kind==='command_status')return Response.json(committed.has(b.request_id)?{ok:true,state:'committed',result:committed.get(b.request_id)}:{ok:true,state:'unresolved'});
  if(failFirst){failFirst=false;throw new Error('Synthetic lost response');}
  const result={id:b.submission_id,details_revision:0};committed.set(b.submission_id,result);return Response.json({ok:true,state:'committed',duplicate:false,...result});
 };
 const page=browser(shared,transport);page.Event=class{constructor(type){this.type=type;}};page.window.addEventListener=(type,fn)=>listeners.set(type,fn);page.window.dispatchEvent=e=>listeners.get(e.type)?.(e);
 const statusNode={textContent:'',classList:{add(){}},after(){}};const submitButton={textContent:'Send',disabled:false};
 const form={dataset:{formType:'options'},querySelector:s=>s==='.form-status'?statusNode:s==='button[type="submit"]'?submitButton:null,querySelectorAll:()=>[],addEventListener:(type,fn)=>{if(type==='submit')handlers.push(fn);}};
 page.document={createElement:()=>{const b={after(){}};buttons.push(b);return b;},querySelectorAll:s=>s==='form[data-lead-form]'?[form]:[],querySelector:()=>null};
 Object.assign(page,{spanish:false,attribution:()=>({}),formProps:()=>({form_type:'options'}),say:s=>s,track:(name)=>events.push(name),FormData:class{entries(){return Object.entries(payload);}},store:{get(){return null;}}});
 const source=await readFile(new URL('../static/script.js',import.meta.url),'utf8');vm.runInNewContext(source.slice(source.indexOf('// ---------- Lead forms ----------')),page);
 const first=handlers.map(fn=>fn({preventDefault(){}}));await new Promise(r=>setTimeout(r,5));assert.equal(buttons[0].hidden,true);releaseConfig();await Promise.all(first);assert.equal(buttons[0].hidden,false);assert.ok(events.includes('lead_form_error'));
 await Promise.all(handlers.map(fn=>fn({preventDefault(){}})));assert.equal(events.filter(n=>n==='generate_lead').length,1);assert.equal(events.filter(n=>n==='lead_form_success').length,1);
 await Promise.all(handlers.map(fn=>fn({preventDefault(){}})));assert.equal(events.filter(n=>n==='generate_lead').length,1);assert.equal(events.filter(n=>n==='lead_form_submit').length,2);
});

test('legacy unresolved browser marker blocks a new durable identity during activation',async()=>{
 let writes=0;const page=browser(storage(),async(_url,options={})=>{if(options.body)writes++;return Response.json({enabled:true,version:1});});
 page.sessionStorage={getItem:()=>JSON.stringify(randomUUID())};await assert.rejects(page.window.HBHCommands.submit(payload),/legacy reference/);assert.equal(writes,0);assert.equal(page.localStorage.getItem('hbh_reliable_inquiry'),null);
});
