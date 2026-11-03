// Opaque identifiers only. Web Locks serialize marker creation across tabs.
(() => {
 const phase=()=>document.documentElement?.dataset.commandPhase;
 const protocol=()=>{if(phase()!=='protocol')throw new Error('Recovery protocol unavailable. Please reload or contact the team.');};
 const valid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
 const memory=new Map();
 const changed=()=>window.dispatchEvent?.(new Event('hbh-command-state'));
 const read=key=>{const raw=localStorage.getItem(key);if(raw===null)return null;let v;try{v=JSON.parse(raw);}catch{throw new Error('Recovery reference is damaged. Please contact the team before submitting again.');}if(!valid(v.request_id)||!valid(v.recovery_key)&&!valid(v.id))throw new Error('Recovery reference is invalid. Please contact the team.');return v;};
 const write=(key,value)=>{localStorage.setItem(key,JSON.stringify(value));if(localStorage.getItem(key)!==JSON.stringify(value))throw new Error('Browser could not preserve recovery reference.');changed();};
 const remove=key=>{localStorage.removeItem(key);changed();};
 const lock=(name,fn)=>{if(!navigator.locks?.request)throw new Error('This browser cannot safely preserve a pending request. Please call the team.');return navigator.locks.request(name,fn);};
 const post=async body=>{const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});const result=await r.json();if(!r.ok)throw Object.assign(new Error(result.error||'Request outcome unconfirmed.'),{state:result.state});return result;};
 const inquiryKey='hbh_reliable_inquiry',lastKey='hbh_reliable_last';
 async function config(){const r=await fetch('/api/leads?reliability=1',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Cannot check submission readiness. Please try again.');const c=await r.json();if(c.version!==1||typeof c.enabled!=='boolean')throw new Error('Invalid submission readiness response.');return c.enabled;}
 async function status(marker,fence=false){const r=await post({kind:'command_status',...marker,fence});if(!['committed','aborted','unresolved'].includes(r.state))throw new Error('Recovery outcome unconfirmed.');return r;}
 async function inquiry(){const marker=read(lastKey)||read(inquiryKey);if(!marker)throw new Error('Please mention these details when the team calls.');const r=await status(marker);if(r.state!=='committed'||!r.result?.id)throw new Error('Details reference unavailable or expired. Please mention these details when the team calls.');return r.result;}
 async function submit(data,details=false,onAttempt=()=>{}){
  if(phase()==='preactivation')return {legacy:true};
  protocol();
  const enabled=await config();
  return lock('hbh-lead-command',async()=>{
   if(enabled&&!details&&!read(inquiryKey)&&!read(lastKey)&&typeof sessionStorage!=='undefined'&&sessionStorage.getItem(`hbh_submission:${location.pathname}:${data.form_type||'standard'}`))throw new Error('An earlier request has an unresolved legacy reference. Please contact the team before submitting another inquiry.');
   let reference,key=inquiryKey;
   if(details){reference=await inquiry();key=`hbh_reliable_details:${reference.id}`;}
   let marker=read(key);
   if(marker){
    const prior=await status(marker);
    if(prior.state==='committed'){if(!details)write(lastKey,marker);return {ok:true,duplicate:true,...prior.result};}
    if(prior.state==='aborted'){remove(key);memory.delete(key);throw new Error('Original request was not applied. Review your answers, then submit again.');}
    if(!memory.has(key))throw new Error('Original outcome is unresolved. Use Resolve original request before starting another.');
   }else{
    if(!enabled)throw new Error('Submissions are temporarily unavailable.');
    if(details&&!reference.details_token)throw new Error('Details reference expired. Please mention these details when the team calls.');
    marker={request_id:crypto.randomUUID(),recovery_key:crypto.randomUUID()};write(key,marker);
    const payload={...data,reliability_version:1,recovery_key:marker.recovery_key,...(details?{kind:'details',request_id:marker.request_id,details_token:reference.details_token,expected_revision:reference.details_revision}:{submission_id:marker.request_id})};
    memory.set(key,payload);
   }
   onAttempt();
   const r=await post(memory.get(key));
   if(r.state!=='committed')throw new Error('Request outcome unconfirmed.');
   if(!details)write(lastKey,marker);
   return r;
  });
 }
 async function resolve(details=false){protocol();return lock('hbh-lead-command',async()=>{
  const ref=details?await inquiry():null,key=details?`hbh_reliable_details:${ref.id}`:inquiryKey,marker=read(key);
  if(!marker)return {state:'absent'};
  const r=await status(marker,true);
  if(r.state==='aborted'){remove(key);memory.delete(key);}
  if(r.state==='committed'&&!details)write(lastKey,marker);
  return r;
 });}
 async function startNew(){protocol();return lock('hbh-lead-command',async()=>{
  const marker=read(inquiryKey)||read(lastKey);
  if(marker){const r=await status(marker);if(!['committed','aborted'].includes(r.state))throw new Error('Resolve the original request before starting another.');}
  remove(inquiryKey);remove(lastKey);memory.delete(inquiryKey);
 });}
 function bind(form,details=false){
  if(phase()==='preactivation')return;
  protocol();
  const statusNode=form.querySelector('.form-status');
  const button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent='Resolve original request';button.hidden=true;statusNode.after(button);
  const next=document.createElement('button');next.type='button';next.className='btn ghost';next.textContent='Start another inquiry';next.hidden=true;if(!details)button.after(next);
  const show=()=>{try{button.hidden=!(read(inquiryKey)||read(lastKey));next.hidden=details||button.hidden;}catch(e){statusNode.textContent=e.message;}};
  next.onclick=async()=>{next.disabled=true;try{await startNew();statusNode.textContent='Ready for a separate inquiry. Review the form before submitting.';show();}catch(e){statusNode.textContent=e.message;}finally{next.disabled=false;}};
  button.onclick=async()=>{button.disabled=true;try{const r=await resolve(details);if(r.state==='committed'){statusNode.textContent='Original request was saved.';if(!details)location.href=location.pathname.startsWith('/es')?'/es/thank-you':'/thank-you';}else statusNode.textContent='Original request was not applied. You can review and submit again.';}catch(e){statusNode.textContent=e.message;}finally{button.disabled=false;show();}};
  window.addEventListener?.('hbh-command-state',show);form.addEventListener('submit',()=>setTimeout(show,0));show();
 }
 window.HBHCommands={read,write,remove,lock,submit,resolve,startNew,bind};
})();
