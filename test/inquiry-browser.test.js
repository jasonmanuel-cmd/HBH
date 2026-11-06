import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const script=readFileSync(new URL('../static/script.js',import.meta.url),'utf8');
const code=script.slice(script.indexOf('// ---------- Lead forms ----------'),script.indexOf('// ---------- Thank-you page:'));
function browser(phase, transport, route='buyer') {
 const values={form_type:'options',route_interest:route,name:'Synthetic Browser',phone:'6615550195',consent_response:'yes'};
 const status={textContent:'',className:'',classList:{add(){}}},button={textContent:'Send',disabled:false};
 let submit;const memory=new Map([['hbh_lead',{address:'stale seller',details_token:'stale'}]]), events=[];
 const storage={removeItem:k=>memory.delete(k)};
 const form={dataset:{formType:'options'},addEventListener:(name,fn)=>{if(name==='submit')submit=fn;},querySelectorAll:()=>[],querySelector:s=>s==='.form-status'?status:s==='button[type="submit"]'?button:s==='[name="consent_response"]'?{classList:{add(){}},closest:()=>null}:null};
 const context={document:{documentElement:{dataset:{commandPhase:phase}},querySelectorAll:()=>[form],querySelector:()=>null},window:{sessionStorage:storage,HBHCommands:{bind(){},submit:transport}},location:{pathname:'/buyers',href:''},spanish:false,FormData:class{entries(){return Object.entries(values);}},attribution:()=>({utm_source:'synthetic'}),formProps:()=>({route_interest:route}),track:(event,props)=>events.push({event,...props}),store:{get:k=>memory.get(k),set:(k,v)=>memory.set(k,v)},crypto:{randomUUID},fetch:transport,AbortController,setTimeout,clearTimeout,say:en=>en};
 vm.runInNewContext(code,context);
 return {send:()=>submit({preventDefault(){}}),context,values,status,button,memory,events};
}
test('legacy form failure/retry and repeated submit preserve identity and replace stale seller details',async()=>{
 let release,calls=0;const bodies=[];
 const page=browser('preactivation',async(_url,init)=>{calls++;bodies.push(JSON.parse(init.body));if(calls===1)await new Promise((_resolve,reject)=>release=()=>reject(new Error('interrupted')));return Response.json({ok:true,id:randomUUID(),details_token:''});});
 const first=page.send();await new Promise(r=>setImmediate(r));await page.send();assert.equal(calls,1);
 release();await first;assert.equal(page.button.disabled,false);assert.match(page.status.textContent,/try again/);
 await page.send();assert.equal(calls,2);assert.equal(bodies[0].submission_id,bodies[1].submission_id);
 assert.equal(bodies[1].route_interest,'buyer');assert.equal(bodies[1].utm_source,'synthetic');
 assert.equal(page.context.location.href,'/thank-you');assert.equal(page.memory.get('hbh_lead').details_token,'');
 assert.equal(page.events.filter(e=>e.event==='lead_form_success').length,1);
 assert.equal(page.events.find(e=>e.event==='generate_lead').qualification,'unqualified');
});
test('legacy replay does not count a recovered duplicate as a new successful inquiry',async()=>{
 const page=browser('preactivation',async()=>Response.json({ok:true,duplicate:true,details_token:''}),'investor');
 await page.send();assert.equal(page.context.location.href,'/thank-you');assert.equal(page.events.some(e=>e.event==='generate_lead'),false);
});
test('protocol double-click and recovered duplicate use neutral completion without false success events',async()=>{
 let finish,calls=0;
 const page=browser('protocol',async()=>{calls++;return new Promise(resolve=>finish=()=>resolve({ok:true,duplicate:true}));},'home_value');
 const first=page.send();await new Promise(r=>setImmediate(r));await page.send();assert.equal(calls,1);
 finish();await first;assert.equal(page.context.location.href,'/thank-you');assert.equal(page.events.some(e=>e.event==='generate_lead'),false);
});
test('client requires consent on general inquiry and address on seller path',async()=>{
 for(const route of ['buyer','investor','home_value','direct']){
  const page=browser('preactivation',()=>assert.fail('Invalid request must not send'),route);
  if(route!=='direct')page.values.consent_response='';
  await page.send();assert.equal(page.context.location.href,'');assert.ok(page.status.textContent);
 }
});
