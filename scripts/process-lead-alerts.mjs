// Manual only; scheduling and activation require separate approval.
import { reliabilityRpc } from '../lib/lead-reliability.js';
import { processLeadAlerts, publicAlertSender } from '../lib/lead-alerts.js';
const env=process.env;
if(env.LEAD_RELIABILITY_DISPATCH_ENABLED!=='true')console.log('Public alert dispatch OFF; no database access or sends.');
else {
 try{console.log(JSON.stringify(await processLeadAlerts({env,rpc:reliabilityRpc(env),send:publicAlertSender(env)})));}
 catch{console.error('Alert completion unconfirmed. Inspect queue and provider evidence before retry.');process.exitCode=1;}
}
