import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {COMMAND_PHASE,assertCommandBuild} from '../lib/command-phase.js';
import {buildPages} from '../src/pages.mjs';
import leads from '../api/leads.js';
import {sellerOperations} from '../lib/seller-operations-api.js';
import {processLeadAlerts} from '../lib/lead-alerts.js';
import {processOutbox} from '../lib/notification-outbox.js';
const helper=await readFile(new URL('../static/command-recovery.js',import.meta.url),'utf8');
const script=await readFile(new URL('../static/script.js',import.meta.url),'utf8');
const operations=await readFile(new URL('../static/hq/operations.js',import.meta.url),'utf8');
const res=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
const denied={getItem(){throw Error('Storage denied');},setItem(){throw Error('Storage denied');}};
function context(phase,fetcher,storage=denied){return {window:{},document:{documentElement:{dataset:{commandPhase:phase}}},localStorage:storage,sessionStorage:{},navigator:{locks:{request:async(_n,fn)=>fn()}},fetch:fetcher,crypto:{randomUUID},AbortSignal,AbortController,setTimeout,clearTimeout,location:{pathname:'/'},URLSearchParams,console};}
function formPage(phase,{details=false,withHelper=true,oldHelper=false,readiness='network'}={}){
 const posts=[],events=[],handlers=[];let gets=0;
 const page=context(phase,async(_url,options={})=>{if(options.method!=='POST'){gets++;if(readiness==='network')throw Error('Readiness unavailable');return Response.json({});}posts.push(JSON.parse(options.body));return Response.json({ok:true,id:randomUUID()});});
 const status={textContent:'',classList:{add(){}},after(){}};const button={textContent:'Send',disabled:false};
 const form={dataset:{formType:'options'},querySelector:s=>s==='.form-status'?status:s==='button[type="submit"]'?button:null,querySelectorAll:()=>[],addEventListener:(type,fn)=>{if(type==='submit')handlers.push(fn);}};
 Object.assign(page.document,{querySelectorAll:s=>s===(details?'form[data-details-form]':'form[data-lead-form]')?[form]:[],querySelector:()=>null,createElement:()=>({after(){}})});
 Object.assign(page,{spanish:false,attribution:()=>({}),formProps:()=>({}),say:s=>s,track:n=>events.push(n),store:{get:()=>details?{id:randomUUID(),phone:'6615550101',address:'123 Synthetic Road'}:null,set(){}},FormData:class{entries(){return Object.entries({name:'Synthetic Only',address:'123 Synthetic Road',phone:'6615550101',form_type:'options'});}get(k){return k==='timeline'?'Soon':'';}getAll(){return [];}}});
 if(withHelper)vm.runInNewContext(helper,page);
 if(oldHelper)page.window.HBHCommands={bind(){},submit:async()=>({legacy:true})};
 vm.runInNewContext(script.slice(script.indexOf('// ---------- Lead forms ----------')),page);
 return {page,posts,status,events,get gets(){return gets;},submit:async()=>{for(const fn of handlers)await fn({preventDefault(){}});}};
}

test('first-release phase is explicit in every public page; build refuses accidental new activation',()=>{
 assert.equal(COMMAND_PHASE,'preactivation');
 for(const [,html]of buildPages())assert.match(html,/data-command-phase="preactivation"/);
 for(const flag of ['LEAD_RELIABILITY_ENABLED','LEAD_RELIABILITY_DISPATCH_ENABLED','SELLER_COMMAND_RECOVERY_ENABLED','SELLER_OUTBOX_DISPATCH_ENABLED'])assert.throws(()=>assertCommandBuild({[flag]:'true'}),/reviewed/);
 assert.doesNotThrow(()=>assertCommandBuild({SELLER_OPERATIONS_ENABLED:'true'}));
 assert.throws(()=>assertCommandBuild({},'unknown'),/Invalid/);
});

test('actual preactivation inquiry/details forms work with missing helper, denied storage and failing/malformed readiness',async()=>{
 for(const details of [false,true])for(const withHelper of [false,true])for(const readiness of ['network','malformed']){
  const p=formPage('preactivation',{details,withHelper,readiness});await p.submit();assert.equal(p.posts.length,1);assert.equal(p.gets,0);assert.equal(p.posts[0].reliability_version,undefined);
  if(!details)assert.ok(p.events.includes('generate_lead'));
 }
});

test('protocol or unknown phase never falls through on missing or stale helper, failed/malformed readiness, or denied storage',async()=>{
 for(const phase of ['protocol',undefined,'__COMMAND_PHASE__'])for(const details of [false,true])for(const options of [{withHelper:false},{oldHelper:true},{readiness:'network'},{readiness:'malformed'}]){
  const p=formPage(phase,{details,...options});await p.submit();assert.equal(p.posts.length,0);assert.ok(p.status.textContent);
 }
 const p=context('protocol',async(_url,options)=>{assert.ok(options.signal);return Response.json({version:1,enabled:false});});vm.runInNewContext(helper,p);await assert.rejects(p.window.HBHCommands.submit({}),/Storage denied/);
});

test('protocol runtime OFF with no marker pauses new commands instead of authorizing legacy',async()=>{
 let posts=0;const p=context('protocol',async(_url,o)=>{if(o.method==='POST')posts++;return Response.json({version:1,enabled:false});},{getItem:()=>null});vm.runInNewContext(helper,p);
 await assert.rejects(p.window.HBHCommands.submit({}),/temporarily unavailable/);assert.equal(posts,0);
});

test('preactivation resolve and startNew do not touch denied storage or network',async()=>{
 const p=context('preactivation',()=>{throw Error('network touched');});vm.runInNewContext(helper,p);assert.equal((await p.window.HBHCommands.submit({})).legacy,true);p.window.HBHCommands.bind({});
 await assert.rejects(p.window.HBHCommands.resolve(),/protocol unavailable/);await assert.rejects(p.window.HBHCommands.startNew(),/protocol unavailable/);
});

test('API phase cannot be downgraded by flags or body; protocol OFF rejects unmarked writes without schema access',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network');};
 try{for(const phase of ['protocol','unknown']){const r=res();await leads({method:'POST',headers:{},body:{commandPhase:'preactivation',name:'Synthetic Only'}},r,{},phase);assert.notEqual(r.code,200);}assert.equal(calls,0);
  const r=res();await leads({method:'GET',url:'/api/leads?reliability=1'},r,{LEAD_RELIABILITY_ENABLED:'true'});assert.equal(r.body.enabled,false);
 }finally{globalThis.fetch=original;}
});

test('both reusable dispatchers default to source phase before any RPC or sender validation even with flags true',async()=>{
 const blocked=()=>{throw Error('side effect');};const args={env:{LEAD_RELIABILITY_DISPATCH_ENABLED:'true',SELLER_OUTBOX_DISPATCH_ENABLED:'true'},rpc:blocked,send:Object.assign(blocked,{validate:blocked})};
 assert.equal((await processLeadAlerts(args)).disabled,true);assert.equal((await processOutbox(args)).disabled,true);
});

test('seller protocol rejects unmarked workflow under runtime OFF; preactivation rejects marked accidental activation',async()=>{
 for(const [phase,body]of [['protocol',{}],['preactivation',{reliability_version:1}]]){const r=res();await sellerOperations({phase,action:'ops-workflow',req:{method:'POST'},res:r,body,session:{n:'Synthetic'},env:{SELLER_OPERATIONS_ENABLED:'true',SELLER_COMMAND_RECOVERY_ENABLED:phase==='preactivation'?'true':'false'},sb:()=>{throw Error('schema touched');}});assert.equal(r.code,503);}
});

test('HQ preactivation overview and legacy workflow do not depend on helper or recovery storage',async()=>{
 const nodes=new Map(),calls=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',elements:{authority_confirmed:{},service_fit:{}},dataset:{},addEventListener(){},dispatchEvent(){}});return nodes.get(id);};
 const lead={id:randomUUID(),name:'Synthetic',status:'new',ops_revision:0};
 const p=context('preactivation',async(url,o)=>{calls.push({url,body:o.body?JSON.parse(o.body):null});return Response.json(url.includes('overview')?{leads:[lead],research:[],audit:[],outbox:[],metrics:{sources:{}},recoveryEnabled:false}: {ok:true});});
 Object.assign(p.document,{querySelector:node,querySelectorAll:()=>[]});p.location.search='';p.Event=class{};p.FormData=class{*[Symbol.iterator](){yield ['id',lead.id];yield ['event','suppress'];}};
 vm.runInNewContext(operations,p);await p.window.loadSellerOperations();node('#ops-lead').value=lead.id;
 node('#ops-workflow').onsubmit({preventDefault(){},target:node('#ops-workflow'),submitter:{}});
 for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r,0));
 assert.ok(calls.some(c=>c.url.includes('overview')));const write=calls.find(c=>c.url.includes('workflow'));assert.ok(write);assert.equal(write.body.reliability_version,undefined);assert.ok(!calls.some(c=>c.url.includes('command-status')));
});
