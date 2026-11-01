import { checkPreview, normalizeResearch, previewToken, reviewCommand, workflowCommand, workflowFingerprint, operationalMetrics, uuid, fail } from './seller-operations.js';
import { clientIp, createRateLimiter } from './request-ip.js';
const reviewerLimiter = createRateLimiter({max:8,windowMs:15*60e3});
import { createHash, timingSafeEqual } from 'node:crypto';

export async function sellerOperations({ action, req, res, body, session, env, sb }) {
  if (!action.startsWith('ops-')) return false;
  const reply = (data, code = 200) => { res.status(code).json({ ok: true, ...data }); return true; };
  if (env.SELLER_OPERATIONS_ENABLED !== 'true') { res.status(503).json({ ok: false, error: 'Seller operations await migration and activation.' }); return true; }
  const db = (path, options) => sb(env, path, options);
  const rpc = (name, payload) => db(`rpc/${name}`, { method: 'POST', body: payload });
  try {
    if (req.method === 'GET' && action === 'ops-overview') {
      const [research, leads, outbox, audit] = await Promise.all([
        db('research_records?select=*&order=created_at.desc&limit=501'),
        db('leads?select=*&deleted_at=is.null&order=created_at.desc&limit=501'),
        db('notification_outbox?select=*&order=created_at.desc&limit=501'),
        db('research_audit?select=*&order=at.desc&limit=1000'),
      ]);
      return reply({ auditTruncated: audit.length >= 1000, audit, research: research.slice(0,500), leads: leads.slice(0,500), outbox: outbox.slice(0,500), metrics: operationalMetrics(leads.slice(0,500), research.slice(0,500)), truncated: [research,leads,outbox].some(r => r.length > 500), dispatchEnabled: env.SELLER_OUTBOX_DISPATCH_ENABLED === 'true' });
    }
    if (req.method !== 'POST') fail('Method not allowed', 405);
    if (Buffer.byteLength(JSON.stringify(body)) > 300000) fail('Request too large', 413);
    // Existing HQ display names are not identities. New sensitive actions require a separately provisioned reviewer secret.
    // This does not create credentials or authorize production provisioning.
    if (['ops-import', 'ops-review', 'ops-link', 'ops-reconcile'].includes(action)) {
      const reviewerIp = clientIp(req) || 'local';
      if (reviewerLimiter.isLimited(reviewerIp)) fail('Too many reviewer attempts. Try again in 15 minutes.',429);
      const expected = env.HQ_REVIEW_PASSWORD;
      const supplied = req.headers?.['x-hq-review'];
      if (!expected || typeof supplied !== 'string' || !timingSafeEqual(createHash('sha256').update(expected).digest(), createHash('sha256').update(supplied).digest())) { reviewerLimiter.hit(reviewerIp); fail('Reviewer authorization required', 403); }
    }
    if (action === 'ops-import') {
      const rows = normalizeResearch(body.raw, body.format);
      if (body.commit !== true) return reply({ dry_run: true, rows, token: previewToken(rows, env) });
      checkPreview(body.token, rows, env);
      const records = rows.filter(r => !r.duplicate).map(({duplicate, ...r}) => r);
      const result = await rpc('seller_import', { records, actor_name: session.n });
      return reply({ result });
    }
    if (action === 'ops-review') return reply({ result: await rpc('seller_review', { command: reviewCommand(body), actor_name: session.n }) });
    if (action === 'ops-link') {
      if (body.identity_confirmed !== true || !uuid(body.id) || !uuid(body.lead_id) || !Number.isInteger(body.revision) || typeof body.evidence !== 'string' || body.evidence.trim().length < 10) fail('Select research, existing inquiry and matching evidence');
      return reply({ result: await rpc('seller_link', { command: { identity_confirmed: true, id: body.id, lead_id: body.lead_id, revision: body.revision, evidence: body.evidence.trim().slice(0,2000) }, actor_name: session.n }) });
    }
    if (action === 'ops-workflow') {
      if (!uuid(body.id) || !uuid(body.request_id)) fail('Invalid inquiry or request ID');
      // Resolve an acknowledged transaction before current-state prerequisites: its HTTP reply may have been lost.
      const [prior] = await db(`seller_commands?request_id=eq.${body.request_id}&select=lead_id,command,result`);
      if (prior) {
        if (prior.lead_id !== body.id || prior.command.request_fingerprint !== workflowFingerprint(body)) fail('Request identity conflict',409);
        return reply({ result: prior.result, replayed: true });
      }
      const [lead] = await db(`leads?id=eq.${body.id}&deleted_at=is.null&select=*`);
      if (!lead) fail('Inquiry not found', 404);
      return reply({ result: await rpc('seller_workflow', { command: workflowCommand(lead, body), actor_name: session.n }) });
    }
    if (action === 'ops-reconcile') {
      if (!uuid(body.id) || typeof body.evidence !== 'string' || body.evidence.trim().length < 10 || !['accepted','pending'].includes(body.state)) fail('Provider evidence and reconciliation decision required');
      return reply({ result: await rpc('seller_reconcile', { job_id: body.id, decision: body.state, evidence: body.evidence.slice(0,2000), actor_name: session.n }) });
    }
    fail('Unknown operation', 404);
  } catch (error) {
    // PostgREST/SQL errors may contain PII. Only application validation is shown.
    const status = error.safe ? error.status : error.status === 400 ? 409 : 502;
    res.status(status).json({ ok: false, error: error.safe ? error.message : 'Operation could not be confirmed. Refresh to check the latest record and retry if needed. No external message was sent.' });
    return true;
  }
}
