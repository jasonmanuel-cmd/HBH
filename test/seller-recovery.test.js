import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, rpc } from '../dev/test-database.mjs';
import { normalizeResearch, workflowCommand } from '../lib/seller-operations.js';
import { emailAdapter, processOutbox } from '../lib/notification-outbox.js';
import { computeStats } from '../api/hq.js';

test('same-batch history has explicit order and older revisions cannot be verified or linked', async () => {
 const db=await createTestDatabase();
 try {
  const rows=normalizeResearch([{source_system:'test',source_record_id:'one',apn:'a',jurisdiction:'test',assertions:['old']},{source_system:'test',source_record_id:'one',apn:'a',jurisdiction:'test',assertions:['new']}]);
  assert.equal(await rpc(db,'seller_import',{records:rows,actor_name:'Synthetic'}),2);
  const saved=(await db.query('select * from research_records order by source_sequence')).rows;
  assert.equal(saved[0].source_sequence,1);assert.equal(saved[1].source_sequence,2);
  assert.equal(saved[0].created_at.getTime(),saved[1].created_at.getTime());
  const command={id:rows[0].id,revision:0,verification_state:'verified_facts',hold_reasons:[],evidence:'Synthetic parcel verification'};
  await assert.rejects(rpc(db,'seller_review',{command,actor_name:'Synthetic'}),/newer or ambiguous/);
  await rpc(db,'seller_review',{command:{...command,id:rows[1].id},actor_name:'Synthetic'});
  await db.query("update research_records set verification_state='verified_facts' where id=$1",[rows[0].id]);
  await assert.rejects(rpc(db,'seller_link',{command:{id:rows[0].id,revision:0,lead_id:randomUUID()},actor_name:'Synthetic'}),/review required/);
  assert.equal(await rpc(db,'seller_import',{records:rows,actor_name:'Synthetic'}),0);
  assert.equal((await db.query('select count(*)::int as n from research_audit')).rows[0].n,3);
 } finally {await db.close();}
});

test('missing provider configuration leaves jobs unclaimed; spam triage is evidence-recorded',async()=>{
 let claims=0;
 await assert.rejects(processOutbox({phase:'protocol',env:{SELLER_OUTBOX_DISPATCH_ENABLED:'true'},rpc:async()=>{claims++;return[];},send:emailAdapter({SELLER_OUTBOX_DISPATCH_ENABLED:'true'})}),/configuration/);
 assert.equal(claims,0);
 const command=workflowCommand({id:randomUUID(),status:'new'},{request_id:randomUUID(),revision:0,event:'spam',detail:'Synthetic junk submission reviewed'});
 assert.equal(command.patch.status,'spam');assert.equal(command.patch.do_not_contact,true);assert.equal(command.patch.next_followup,null);
 assert.throws(()=>workflowCommand({id:randomUUID()},{request_id:randomUUID(),revision:0,event:'spam',detail:''}),/Evidence/);
 const now=Date.now();
 assert.equal(computeStats([{status:'appointment_set',created_at:new Date(now).toISOString(),appointment_at:new Date(now+100000).toISOString(),appointment_result:'cancelled'}],now).appointments7,0);
});

test('research changes clear confirmations and ambiguous browser retry preserves the exact command',async()=>{
 const nodes=new Map();
 function node(id){if(!nodes.has(id))nodes.set(id,{id,disabled:false,value:'',checked:false,hidden:false,innerHTML:'',textContent:'',elements:{},addEventListener(n,f){this[n]=f;},dispatchEvent(e){this[e.type]?.(e);},scrollIntoView(){},reset(){for(const el of Object.values(this.elements)){el.value='';el.checked=false;}}});return nodes.get(id);}
 const researchA=randomUUID(),researchB=randomUUID(),leadId=randomUUID();
 const review=node('#ops-review-form');for(const key of ['evidence','ownership_title_representation_checked','verification_state','hold_reason'])review.elements[key]={value:'',checked:false};
 node('#ops-lead').value=leadId;
 const form=node('#ops-workflow');form.elements.authority_confirmed={checked:false};form.elements.service_fit={checked:false};
 let revision=0,attempts=0;const commands=[];
 const data=()=>({research:[researchA,researchB].map(id=>({id,source_system:'synthetic',source_record_id:id,verification_state:'hold',revision:0,assertions:[],conflicts:[],hold_reasons:[]})),leads:[{id:leadId,status:'new',ops_revision:revision}],outbox:[],audit:[],metrics:{sources:{}}});
 const editable={disabled:false,dataset:{}};
 const context={window:{},document:{documentElement:{dataset:{commandPhase:"preactivation"}},querySelector:node,querySelectorAll:selector=>selector.startsWith('#ops-workflow')?[editable]:[]},crypto:{randomUUID},location:{search:''},URLSearchParams,Event:class{constructor(type){this.type=type;}},FormData:class{*[Symbol.iterator](){yield ['id',leadId];yield ['event','spam'];yield ['detail','Synthetic evidence'];}},fetch:async(url,init)=>{
  if(url.endsWith('ops-overview'))return {ok:true,json:async()=>data()};
  commands.push(JSON.parse(init.body));if(attempts++===0){revision=1;throw new Error('lost HTTP response');}
  return {ok:true,json:async()=>({ok:true})};
 }};
 vm.runInNewContext(await readFile(new URL('../static/hq/operations.js',import.meta.url),'utf8'),context);
 await context.window.loadSellerOperations();
 const select=id=>node('#ops-research').onclick({target:{closest:()=>({dataset:{research:id}})}});
 select(researchA);review.elements.evidence.value='Evidence for A';review.elements.ownership_title_representation_checked.checked=true;node('#ops-link-identity').checked=true;
 select(researchA);assert.equal(review.elements.evidence.value,'Evidence for A');
 select(researchB);assert.equal(review.elements.evidence.value,'');assert.equal(review.elements.ownership_title_representation_checked.checked,false);assert.equal(node('#ops-link-identity').checked,false);
 const button={disabled:false};const event={preventDefault(){},target:form,submitter:button};
 form.onsubmit(event);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(editable.disabled,true);assert.equal(node('#ops-submit').textContent,'Retry original event');assert.match(node('#ops-pending').textContent,new RegExp(leadId));
 await context.window.loadSellerOperations();node('#ops-lead').value='';form.oninput();form.onsubmit(event);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(commands.length,2);assert.deepEqual(commands[1],commands[0]);assert.equal(commands[1].revision,0);
 assert.equal(editable.disabled,false);
 attempts=0;node('#ops-lead').value=leadId;form.onsubmit(event);await new Promise(resolve=>setImmediate(resolve));assert.equal(editable.disabled,true);
 context.window.clearSellerOperations();assert.equal(editable.disabled,false);assert.equal(node('#ops-submit').textContent,'Record event');
});
