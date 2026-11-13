import { COMMAND_PHASE } from '../lib/command-phase.js';
import { useNeon } from '../lib/neon.js';
// Manual one-shot worker. Nothing is scheduled by this repository.
import { processOutbox, emailAdapter } from '../lib/notification-outbox.js';
const env=process.env;
useNeon(env);
if (COMMAND_PHASE !== 'protocol' || env.SELLER_OUTBOX_DISPATCH_ENABLED !== 'true') {
 console.log('Notification dispatch is OFF. No database access or messages attempted.');
} else {
 if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Database configuration required');
 const rpc=async(name,body)=>{
  const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok) throw new Error('Outbox database operation failed; inspect queue before retrying');
  return response.json();
 };
 try { console.log(JSON.stringify(await processOutbox({env,rpc,send:emailAdapter(env)}))); }
 catch { console.error('Worker could not confirm completion. Inspect queue; expired claims require provider reconciliation.'); process.exitCode=1; }
}
