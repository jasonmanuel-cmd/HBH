(() => {
 const q=s=>document.querySelector(s), safe=s=>String(s??'UNKNOWN').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let data=null, token=null, selectedResearch=null, selectedJob=null, sequence=0, pendingCommand=null, requestId=crypto.randomUUID();
 const message=s=>{q('#ops-message').textContent=s;};
 function pendingState() {
  document.querySelectorAll('#ops-workflow input,#ops-workflow select,#ops-workflow textarea').forEach(el=>{
   if(pendingCommand){if(el.dataset.pendingDisabled===undefined)el.dataset.pendingDisabled=String(el.disabled);el.disabled=true;}
   else if(el.dataset.pendingDisabled!==undefined){el.disabled=el.dataset.pendingDisabled==='true';delete el.dataset.pendingDisabled;}
  });
  q('#ops-submit').textContent=pendingCommand?'Retry original event':'Record event';
  q('#ops-pending').textContent=pendingCommand?`Unconfirmed ${pendingCommand.event} for inquiry ${pendingCommand.id}. Retry resolves this original event. Do not reload or sign out until resolved; check its activity history before re-entering an event after interruption.`:'';
 }
 async function call(action,body) {
  const r=await fetch(`/api/hq?action=ops-${action}`,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json','X-HQ':'1','X-HQ-Review':q('#ops-review-key').value},body:body?JSON.stringify(body):undefined});
  const result=await r.json(); if(!r.ok) throw Object.assign(new Error(result.error||'Request failed'), {status:r.status}); return result;
 }
 async function run(button,fn) {button.disabled=true; message('Working…'); try {await fn();} catch(e){message(e.message);} finally {button.disabled=button.id==='ops-import'&&!token;} }
 function inquiryContext() {
  const lead=data?.leads.find(l=>l.id===q('#ops-lead').value); if(!lead)return;
  q('#ops-lead-context').textContent=`${lead.status} · Assigned: ${lead.assigned_to||'unassigned'} · Response permission: ${lead.consent_response?'recorded':'UNKNOWN'} · Marketing: ${lead.consent_marketing?'recorded':'not granted'} · Suppressed: ${lead.do_not_contact?'YES':'no'} · Next follow-up: ${lead.next_followup||'none'} · Appointment: ${lead.appointment_at||'none'} (${lead.appointment_result||'UNKNOWN'})`;
 }
 function researchDetail() {
  const r=data?.research.find(x=>x.id===selectedResearch);q('#ops-review-form').hidden=!r;if(!r)return;
  q('#ops-selected-research').textContent=`${r.source_system} / ${r.source_record_id} · ${r.verification_state} · revision ${r.revision}`;
  q('#ops-review-form').elements.verification_state.value=r.verification_state;
  q('#ops-review-form').elements.hold_reason.value=(r.hold_reasons||[]).join('; ');
  q('#ops-audit').innerHTML='<h3>Recent audit history</h3>'+data.audit.filter(a=>a.record_id===r.id).map(a=>`<p>${safe(a.at)} · ${safe(a.actor)} · ${safe(a.action)}<br>${safe(a.evidence)}</p>`).join('');
 }
 window.loadSellerOperations=async()=>{
  const generation=++sequence;message('Loading…');
  try {
   const d=await call('overview');if(generation!==sequence)return;data=d;
   const old=q('#ops-lead').value || new URLSearchParams(location.search).get('inquiry');
   const options=d.leads.filter(l=>l.status!=='spam'&&l.intake_kind!=='historical').map(l=>`<option value="${safe(l.id)}">${safe(l.name)} · ${safe(l.status)}</option>`).join('');
   q('#ops-lead').innerHTML=options;q('#ops-link-lead').innerHTML='<option value="">Choose genuine inquiry</option>'+options;
   if(d.leads.some(l=>l.id===old))q('#ops-lead').value=old;inquiryContext();
   q('#ops-research').innerHTML=d.research.length?d.research.map(r=>`<article class="card"><h3>${safe(r.verification_state)}</h3><strong>${safe(r.address)}</strong><p>APN ${safe(r.apn)} · ${safe(r.jurisdiction)}</p><p>Source: ${safe(r.source_system)} / ${safe(r.source_record_id)}<br>${safe(r.source_date)}<br>${safe(r.source_url)}</p><p>Assertions: ${safe(r.assertions.join('; '))}<br>Conflicts: ${safe(r.conflicts.join('; '))}<br>Hold: ${safe(r.hold_reasons.join('; '))}</p><button class="btn ghost" data-research="${safe(r.id)}">Review history</button></article>`).join(''):'<p class="muted">No research imported. Use a synthetic fixture for development.</p>';
   q('#ops-metrics').innerHTML=`<p>Research: ${d.metrics.researchSources} source records / ${d.metrics.researchRevisions} revisions / ${d.metrics.heldRevisions} held revisions</p>`+Object.entries(d.metrics.sources).map(([key,s])=>`<p><strong>${safe(key)}</strong><br>${s.inquiries} inquiries · ${s.conversations} conversations · ${s.qualified} qualified · ${s.booked} booked · ${s.kept} kept<br>Median response: ${s.medianResponseMinutes===null?'UNKNOWN':Math.round(s.medianResponseMinutes)+' min'} (${s.responseSample} evidenced)<br>Outcomes: ${safe(JSON.stringify(s.outcomes))}</p>`).join('');
   q('#ops-dispatch').textContent=d.dispatchEnabled?'Dispatch enabled by configuration; worker runs separately. Accepted means provider acceptance, not confirmed inbox delivery.':'External dispatch OFF. No messages are sent by this workbench. Accepted means provider acceptance, not inbox delivery.';
   q('#ops-outbox').innerHTML=d.outbox.map(j=>`<div class="card"><strong>${safe(j.state)}</strong> · Inquiry ${safe(d.leads.find(l=>l.id===j.lead_id)?.name||j.lead_id)} · Attempts ${j.attempts}<p>${safe(j.evidence||(j.provider_id?'Provider acceptance receipt: '+j.provider_id:'No provider acceptance evidence yet'))}</p>${['uncertain','failed'].includes(j.state)?`<button class="btn ghost" data-reconcile="${j.id}">Reconcile</button>`:''}</div>`).join('')||'<p>No queued notifications.</p>';
   researchDetail();message(d.auditTruncated?'Recent audit history is limited to 1,000 entries; older evidence remains in the database.':d.truncated?'Showing up to 500 recent records per queue. Metrics cover this displayed window only.':'Loaded. Research and inquiry counts remain separate.');
  }catch(e){if(generation===sequence)message(e.message);}
 };
 q('#ops-refresh').onclick=()=>window.loadSellerOperations();
 q('#ops-raw').oninput=q('#ops-format').onchange=()=>{token=null;q('#ops-import').disabled=true;q('#ops-preview-result').textContent='Input changed; dry run again.';};
 q('#ops-preview').onclick=e=>run(e.target,async()=>{const r=await call('import',{raw:q('#ops-raw').value,format:q('#ops-format').value});token=r.token;q('#ops-preview-result').textContent=JSON.stringify(r.rows,null,2);q('#ops-import').disabled=false;message('Dry run only. Review every source revision before import.');});
 q('#ops-import').onclick=e=>run(e.target,async()=>{const r=await call('import',{raw:q('#ops-raw').value,format:q('#ops-format').value,token,commit:true});token=null;await window.loadSellerOperations();message(`${r.result} new research revisions imported. No inquiries or notifications created.`);});
 q('#ops-research').onclick=e=>{const b=e.target.closest('[data-research]');if(b){if(selectedResearch!==b.dataset.research){q('#ops-review-form').reset();q('#ops-link-identity').checked=false;q('#ops-link-lead').value='';}selectedResearch=b.dataset.research;researchDetail();q('#ops-review-form').scrollIntoView({block:'start'});}};
 q('#ops-review-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const r=data.research.find(x=>x.id===selectedResearch);await call('review',{...Object.fromEntries(new FormData(e.target)),ownership_title_representation_checked:e.target.elements.ownership_title_representation_checked.checked,id:r.id,revision:r.revision});await window.loadSellerOperations();message('Review saved. Verified facts do not grant contact permission.');});};
 q('#ops-link').onclick=e=>run(e.target,async()=>{const r=data.research.find(x=>x.id===selectedResearch);await call('link',{identity_confirmed:q('#ops-link-identity').checked,id:r.id,revision:r.revision,lead_id:q('#ops-link-lead').value,evidence:q('#ops-review-form').elements.evidence.value});await window.loadSellerOperations();message('Evidence-based link saved. Existing inquiry consent unchanged.');});
 q('#ops-workflow').onchange=()=>{if(!pendingCommand)requestId=crypto.randomUUID();inquiryContext();};
 q('#ops-workflow').oninput=()=>{if(!pendingCommand)requestId=crypto.randomUUID();};
 q('#ops-event').addEventListener('change',()=>{
  const event=q('#ops-event').value;
  document.querySelectorAll('[data-ops-events]').forEach(el=>{el.hidden=!el.dataset.opsEvents.split(' ').includes(event);el.querySelectorAll('input,select').forEach(x=>x.disabled=el.hidden);});
  q('#ops-channel').innerHTML=(event==='response_permission'?['phone_call','email_request','web_form','in_person']:['call','text','email']).map(v=>`<option>${v}</option>`).join('');
  q('#ops-result').innerHTML=(event==='appointment_result'?['kept','cancelled','no_show']:['no_answer','voicemail','connected','failed']).map(v=>`<option>${v}</option>`).join('');
 });q('#ops-event').dispatchEvent(new Event('change'));
 q('#ops-workflow').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const form=e.target,lead=data.leads.find(l=>l.id===q('#ops-lead').value);if(!pendingCommand&&!lead)throw new Error('Choose an inquiry');const body=pendingCommand||{...Object.fromEntries(new FormData(form)),revision:lead.ops_revision,request_id:requestId,authority_confirmed:form.elements.authority_confirmed.checked,service_fit:form.elements.service_fit.checked};for(const k of ['next_followup','appointment_at']) if(body[k])body[k]=new Date(body[k]).toISOString();pendingCommand=body;pendingState();try{await call('workflow',body);}catch(error){if(error.status&&error.status<500){pendingCommand=null;pendingState();requestId=crypto.randomUUID();}else error.message+=' Retry resolves the original submitted event before any edited event.';throw error;}pendingCommand=null;pendingState();requestId=crypto.randomUUID();await window.loadSellerOperations();message('Event recorded. No external message sent.');});};
 q('#ops-outbox').onclick=e=>{const b=e.target.closest('[data-reconcile]');if(b){selectedJob=b.dataset.reconcile;q('#ops-reconcile').hidden=false;}};
 q('#ops-reconcile').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await call('reconcile',{...Object.fromEntries(new FormData(e.target)),id:selectedJob});q('#ops-reconcile').hidden=true;await window.loadSellerOperations();message('Provider evidence recorded. Dispatch remains separately controlled.');});};
 window.clearSellerOperations=()=>{++sequence;data=null;token=null;pendingCommand=null;pendingState();selectedResearch=null;selectedJob=null;q('#ops-review-key').value='';q('#ops-raw').value='';q('#ops-preview-result').textContent='';q('#ops-research').textContent='';q('#ops-outbox').textContent='';};
})();
