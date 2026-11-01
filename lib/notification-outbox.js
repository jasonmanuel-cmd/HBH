// Explicitly invoked worker; no cron or public dispatch route. Activation is a separate rollout gate.
export async function processOutbox({ env, rpc, send }) {
  if (env.SELLER_OUTBOX_DISPATCH_ENABLED !== 'true') return { disabled: true, processed: 0 };
  // Adapter preflight must finish before a durable claim. Known missing configuration is not an uncertain send.
  if (send.validate) send.validate();
  const jobs = await rpc('seller_claim_outbox', {});
  let processed = 0;
  for (const job of jobs) {
    // One claim per invocation. Do not start I/O with an absent or nearly expired lease.
    if (!(Date.parse(job.lease_until) - Date.now() >= 30000)) throw new Error('Dispatch lease expired; wait for quarantine and reconcile');
    let result;
    try {
      const receipt = await send(job);
      result = receipt?.id ? { state: 'accepted', provider_id: receipt.id } : { state: 'uncertain', provider_id: null };
    } catch (e) {
      // A timeout might have sent. Never automatically retry an uncertain send.
      result = { state: e.definitelyRejected === true ? 'failed' : 'uncertain', provider_id: null };
    }
    const confirmed = await rpc('seller_finish_outbox', { job_id: job.id, lease: job.lease, ...result });
    if (confirmed !== true) throw new Error('Lease changed; reconcile provider evidence before retrying');
    processed++;
  }
  return { processed };
}

export function emailAdapter(env, fetcher = fetch) {
  const validate = () => {
    if (!env.RESEND_API_KEY || !env.LEAD_FROM_EMAIL || !env.LEAD_NOTIFY_EMAIL?.split(',').some(s => s.trim())) throw new Error('Provider configuration required');
  };
  const send = async job => {
    if (env.SELLER_OUTBOX_DISPATCH_ENABLED !== 'true') throw new Error('Dispatch disabled');
    validate();
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `seller-alert-${job.id}` },
      body: JSON.stringify({ from: env.LEAD_FROM_EMAIL, to: env.LEAD_NOTIFY_EMAIL.split(',').map(s => s.trim()).filter(Boolean), subject: 'New inquiry in Harbison HQ', text: `A genuine inquiry is waiting for administrative triage. Open ${env.SITE_URL || 'https://www.callharbison.com'}/hq?lead=${job.lead_id}. Provider acceptance does not confirm inbox delivery.` }),
    });
    if (!response.ok) throw Object.assign(new Error('Provider rejected request'), { definitelyRejected: response.status >= 400 && response.status < 500 && response.status !== 408 });
    return response.json();
  };
  send.validate = validate;
  return send;
}
