import { COMMAND_PHASE } from './command-phase.js';
import { checkPreview, normalizeResearch, previewToken, reviewCommand, workflowCommand, workflowFingerprint, operationalMetrics, uuid, fail } from './seller-operations.js';
import { clientIp, createRateLimiter } from './request-ip.js';
const reviewerLimiter = createRateLimiter({max:8,windowMs:15*60e3});
import { createHash, timingSafeEqual } from 'node:crypto';

export async function sellerOperations({ action, req, res, body, session, env, sb, phase = COMMAND_PHASE }) {
  if (!action.startsWith('ops-')) return false;
  const reply = (data, code = 200) => { res.status(code).json({ ok: true, ...data }); return true; };
  if (env.SELLER_OPERATIONS_ENABLED !== 'true' && action !== 'ops-command-status') { res.status(503).json({ ok: false, error: 'Seller operations await migration and activation.' }); return true; }
  const db = (path, options) => sb(env, path, options);
  const rpc = (name, payload) => db(`rpc/${name}`, { method: 'POST', body: payload });
  try {
    if (action === 'ops-command-status') {
      if (req.method !== 'POST') fail('Method not allowed',405);
      if (!uuid(body.request_id) || !uuid(body.id)) fail('Invalid recovery reference');
      const result = await rpc('seller_command_status',{request_id:body.request_id,lead_id:body.id,fence:body.fence===true});
      if (!['unresolved','aborted','committed'].includes(result?.state) || (result.state === 'committed' && (result.result?.id !== body.id.toLowerCase() || !Number.isInteger(result.result?.ops_revision)))) throw new Error('Invalid recovery confirmation');
      return reply(result);
    }
    if (req.method === 'GET' && action === 'ops-overview') {
      const [research, leads, outbox, audit] = await Promise.all([
        db('research_records?select=*&order=created_at.desc&limit=501'),
        db('leads?select=*&deleted_at=is.null&order=created_at.desc&limit=501'),
        db('notification_outbox?select=*&order=created_at.desc&limit=501'),
        db('research_audit?select=*&order=at.desc&limit=1000'),
      ]);
      return reply({ recoveryEnabled: phase === 'protocol' && env.SELLER_COMMAND_RECOVERY_ENABLED === 'true', auditTruncated: audit.length >= 1000, audit, research: research.slice(0,500), leads: leads.slice(0,500), outbox: outbox.slice(0,500), metrics: operationalMetrics(leads.slice(0,500), research.slice(0,500)), truncated: [research,leads,outbox].some(r => r.length > 500), dispatchEnabled: env.SELLER_OUTBOX_DISPATCH_ENABLED === 'true' });
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
      const reliable = body.reliability_version === 1;
      if ((phase !== 'preactivation' && !reliable) || (phase !== 'protocol' && reliable)) fail('Command protocol phase unavailable',503);
      // Runtime OFF preserves authenticated status/fence, not new workflow admission.
      if ((phase === 'protocol' && env.SELLER_COMMAND_RECOVERY_ENABLED !== 'true') || (phase === 'preactivation' && env.SELLER_COMMAND_RECOVERY_ENABLED === 'true')) fail('Recovery protocol unavailable; refresh and resolve the original command',503);
      if (reliable && uuid(body.request_id) && uuid(body.id)) {
        body = { ...body, id: body.id.toLowerCase(), request_id: body.request_id.toLowerCase() };
        const [record] = await db(`seller_command_recovery?request_id=eq.${body.request_id}&select=lead_id,state,fingerprint,result`);
        if (record) {
          if (record.lead_id !== body.id || record.state !== 'committed' || record.fingerprint !== workflowFingerprint(body)) fail('Request identity conflict; reconcile original command',409);
          if (record.result?.id !== body.id || !Number.isInteger(record.result.ops_revision) || record.result.ops_revision < 0) throw new Error('Replay confirmation invalid');
          return reply({ result:record.result,replayed:true,state:'committed' });
        }
      }
      if (!uuid(body.id) || !uuid(body.request_id)) fail('Invalid inquiry or request ID');
      // Resolve an acknowledged transaction before current-state prerequisites: its HTTP reply may have been lost.
      const [prior] = await db(`seller_commands?request_id=eq.${body.request_id}&select=lead_id,command,result`);
      if (prior) {
        if (prior.lead_id !== body.id || prior.command.request_fingerprint !== workflowFingerprint(body)) fail('Request identity conflict',409);
        return reply({ result: prior.result, replayed: true });
      }
      const [lead] = await db(`leads?id=eq.${body.id}&deleted_at=is.null&select=*`);
      if (!lead) fail('Inquiry not found', 404);
      const result = await rpc(reliable ? 'seller_workflow_reliable' : 'seller_workflow', { command: workflowCommand(lead, body), actor_name: session.n });
      if (reliable && (result?.id !== body.id || !Number.isInteger(result.ops_revision) || result.ops_revision < 0)) throw new Error('Workflow confirmation invalid');
      return reply({ result, ...(reliable ? { state:'committed' } : {}) });
    }
    if (action === 'ops-reconcile') {
      if (!uuid(body.id) || typeof body.evidence !== 'string' || body.evidence.trim().length < 10 || !['accepted','pending'].includes(body.state)) fail('Provider evidence and reconciliation decision required');
      return reply({ result: await rpc('seller_reconcile', { job_id: body.id, decision: body.state, evidence: body.evidence.slice(0,2000), actor_name: session.n }) });
    }
    fail('Unknown operation', 404);
  } catch (error) {
    // PostgREST/SQL errors may contain PII. Only application validation is shown.
    const status = error.safe ? error.status : error.code === '40001' || error.code === '23505' || error.status === 400 ? 409 : 502;
    res.status(status).json({ ok: false, error: error.safe ? error.message : 'Operation could not be confirmed. Refresh to check the latest record and retry if needed. No external message was sent.' });
    return true;
  }
}
