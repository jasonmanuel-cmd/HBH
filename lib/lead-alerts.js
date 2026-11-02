// Public notification intents: one job is one external request. No credentials in snapshots.
import { digest } from './lead-reliability.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e164=p=>{const d=String(p||'').replace(/\D/g,'');return d.length===10?`+1${d}`:d.length===11&&d[0]==='1'?`+${d}`:null;};
export function alertIntents(lead, env, {details=false, recipients, ack, spanish=false}={}) {
 const jobs=[];const add=(channel,target,payload)=>jobs.push({channel,target,payload});
 const site=(env.SITE_URL||'https://www.callharbison.com').replace(/\/$/,'');
 const link=`<p><a href="${esc(`${site}/hq?lead=${encodeURIComponent(lead.id)}`)}">Open in Harbison HQ →</a></p>`;
 if(env.RESEND_API_KEY){
  let body;
  if(details){
   const summary=[lead.timeline&&`Timeline: ${lead.timeline}`,lead.occupancy&&`Occupancy: ${lead.occupancy}`,lead.condition_flags?.length&&`Condition: ${lead.condition_flags.join(', ')}`,lead.desired_outcome&&`Goal: ${lead.desired_outcome}`].filter(Boolean);
   body={from:env.LEAD_FROM_EMAIL||'Harbison Leads <onboarding@resend.dev>',to:recipients,subject:`Lead details added: ${lead.address}`,html:`<p><strong>${esc(lead.address)}</strong> · ${esc(lead.phone)}</p><ul>${summary.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>${link}`};
  }else{
   const rows=[...Object.entries(lead),...(spanish?[['language','Spanish: please reply in Spanish']]:[])].filter(([k,v])=>v&&k!=='id').map(([k,v])=>`<tr><td style="padding:4px 12px 4px 0;color:#62717a">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join('');
   body={from:env.LEAD_FROM_EMAIL||'Harbison Leads <onboarding@resend.dev>',to:recipients,reply_to:lead.email||undefined,subject:`New ${lead.form_type==='family_transition'?'family property':'property'} lead [${lead.channel}]${spanish?' [ES]':''}: ${lead.address}`,html:`<h2 style="font-family:Georgia,serif;color:#031f2b">New property lead</h2><table>${rows}</table><p><a href="tel:${esc(lead.phone)}">Call ${esc(lead.name)}</a> · <a href="${esc(`${site}/hq?lead=${encodeURIComponent(lead.id)}`)}">Open in Harbison HQ →</a></p>`};
  }
  add('email',JSON.stringify(recipients),body);
 }
 if(env.LEAD_WEBHOOK_URL) add('webhook',digest(env.LEAD_WEBHOOK_URL),{...(details?{kind:'details'}:{}),...lead,submitted_at:new Date().toISOString()});
 if(!details && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM){
  const to=e164(lead.phone);
  if(env.LEAD_ACK_ENABLED==='true'&&to&&lead.contact_pref!=='Email'&&lead.consent_response) add('customer_sms',to,{to,from:env.TWILIO_FROM,body:ack});
  const alert=`NEW LEAD${spanish?' [SPANISH]':''} (${lead.channel}${lead.ref_partner?`:${lead.ref_partner}`:''}) ${lead.name} ${lead.phone} — ${lead.address.split(',')[0]}. ${lead.situation||''} ${lead.relationship?`| ${lead.relationship}`:''}${lead.route_interest?` | path: ${lead.route_interest}`:''} | prefers ${lead.contact_pref||'call'}`.slice(0,320);
  for(const n of new Set((env.LEAD_ALERT_SMS||'').split(',').map(n=>e164(n.trim())).filter(Boolean))) add('sms',n,{to:n,from:env.TWILIO_FROM,body:alert});
 }
 return jobs;
}
export function publicAlertSender(env, fetcher=fetch){
 const validate=()=>{if(!env.RESEND_API_KEY&&!env.LEAD_WEBHOOK_URL&&!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_FROM))throw new Error('No dispatch configuration');};
 const prepare=job=>{
  if(job.channel==='email'){
   if(!env.RESEND_API_KEY)throw new Error('Email unavailable');
   return ['https://api.resend.com/emails',{headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`hbh-command-${job.id}`},body:JSON.stringify(job.payload)}];
  }
  if(job.channel==='webhook'){
   if(!env.LEAD_WEBHOOK_URL||digest(env.LEAD_WEBHOOK_URL)!==job.target)throw new Error('Webhook configuration changed');
   return [env.LEAD_WEBHOOK_URL,{headers:{'Content-Type':'application/json'},body:JSON.stringify(job.payload)}];
  }
  if(!['sms','customer_sms'].includes(job.channel)||!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||env.TWILIO_FROM!==job.payload.from)throw new Error('SMS configuration changed');
  return [`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,{headers:{Authorization:`Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:job.payload.to,From:job.payload.from,Body:job.payload.body})}];
 };
 const send=async(job,prepared)=>{
  const [url,options]=prepared;const r=await fetcher(url,{...options,method:'POST',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Object.assign(new Error('Provider response unconfirmed'),{definitelyRejected:r.status>=400&&r.status<500&&r.status!==408});
  if(job.channel==='webhook')return {id:`http:${r.status}`};
  const receipt=await r.json();return {id:job.channel==='email'?receipt.id:receipt.sid};
 };
 return Object.assign(send,{validate,prepare});
}
export async function processLeadAlerts({env,rpc,send}){
 if(env.LEAD_RELIABILITY_DISPATCH_ENABLED!=='true')return {disabled:true,processed:0};
 send.validate();await rpc('lead_worker_heartbeat');
 const jobs=await rpc('lead_claim_alert');let processed=0;
 for(const job of jobs){
  let prepared;
  try{prepared=send.prepare(job);}catch(error){
   if(await rpc('lead_release_alert',{job_id:job.id,lease:job.lease})!==true)throw new Error('Release unconfirmed');
   throw error;
  }
  if(!(Date.parse(job.lease_until)-Date.now()>=30000))throw new Error('Lease expired; reconcile');
  let result;
  try{const receipt=await send(job,prepared);result=receipt?.id?{state:'accepted',provider_id:String(receipt.id)}:{state:'uncertain',provider_id:null};}
  catch(e){result={state:e.definitelyRejected===true?'failed':'uncertain',provider_id:null};}
  if(await rpc('lead_finish_alert',{job_id:job.id,lease:job.lease,...result})!==true)throw new Error('Completion unconfirmed; reconcile');
  processed++;
 }
 return {processed};
}
