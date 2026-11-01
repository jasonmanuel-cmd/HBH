import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseCsvRows, deterministicId } from './lead-import.js';

export const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status, safe: true }); }
const text = (v, max = 2000) => {
  if (typeof v !== 'string' || !v.trim() || v.trim().toUpperCase() === 'UNKNOWN') return null;
  if (v.trim().length > max) fail('Value exceeds the supported length; shorten it explicitly before importing');
  return v.trim();
};
const required = (v, label, max) => text(v, max) || fail(`${label} is required`);
const canonical = v => JSON.stringify(v, Object.keys(v).sort());
export const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function normalizeResearch(raw, format = 'json') {
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw ?? null)) > 256000) fail('Import limit: 256 KB');
  if (format === 'csv' && typeof raw === 'string') {
    let quoted = false;
    for (let i=0;i<raw.length;i++) if (raw[i] === '"') { if (quoted && raw[i+1] === '"') i++; else quoted=!quoted; }
    if (quoted) fail('Unclosed CSV quote');
  }
  let input;
  try { input = typeof raw === 'string' ? (format === 'csv' ? parseCsvRows(raw) : JSON.parse(raw)) : raw; }
  catch { fail('Invalid CSV or JSON'); }
  if (!Array.isArray(input) || !input.length || input.length > 100) fail('Import 1–100 research records');
  const seen = new Set();
  return input.map((r, index) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail(`Invalid row ${index + 1}`);
    const source_system = required(r.source_system, 'Source system', 100);
    const source_record_id = required(r.source_record_id, 'Source record ID', 200);
    const source_url = text(r.source_url, 2000);
    if (source_url) { try { if (!['https:', 'http:'].includes(new URL(source_url).protocol)) fail('Invalid source URL'); } catch { fail('Invalid source URL'); } }
    const source_date = text(r.source_date, 40);
    if (source_date && !/^\d{4}-\d{2}-\d{2}$/.test(source_date)) fail('Source date must be YYYY-MM-DD or UNKNOWN');
    if (source_date && (Number.isNaN(Date.parse(source_date)) || new Date(source_date).toISOString().slice(0, 10) !== source_date)) fail('Invalid source date');
    const list = (v, label) => {
      if (v == null || v === '') return [];
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = [v]; } }
      if (!Array.isArray(v) || v.length > 30 || v.some(x => typeof x !== 'string' || x.length > 2000)) fail(`Invalid ${label}`);
      return v.map(x => x.trim()).filter(Boolean);
    };
    const facts = { source_system, source_record_id, source_url, source_date, jurisdiction: text(r.jurisdiction, 100), apn: text(r.apn, 100), address: text(r.address, 300), assertions: list(r.assertions, 'assertions'), conflicts: list(r.conflicts, 'conflicts') };
    const record_key = deterministicId(canonical({ source_system, source_record_id }));
    const id = deterministicId(JSON.stringify(facts));
    const duplicate = seen.has(id); seen.add(id);
    return { id, record_key, ...facts, verification_state: 'hold', hold_reasons: ['Current ownership, mailing, title and representation UNKNOWN', ...facts.conflicts], duplicate };
  });
}
export function previewToken(rows, env, expires = Date.now() + 15 * 60000) {
  const payload = `${expires}.${digest(rows)}`;
  return `${payload}.${createHmac('sha256', env.HQ_SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY).update(payload).digest('hex')}`;
}
export function checkPreview(token, rows, env) {
  const expires = Number(String(token).split('.')[0]);
  if (!expires || expires < Date.now()) fail('Preview expired; run dry run again', 409);
  const expected = Buffer.from(previewToken(rows, env, expires));
  const given = Buffer.from(String(token || ''));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) fail('Import changed; run dry run again', 409);
}
export function reviewCommand(body) {
  if (!uuid(body.id) || !Number.isInteger(body.revision)) fail('Record ID and revision required');
  if (!['hold', 'verified_facts', 'rejected'].includes(body.verification_state)) fail('Invalid verification state');
  const evidence = required(body.evidence, 'Review evidence');
  if (body.verification_state === 'verified_facts' && body.ownership_title_representation_checked !== true) fail('Confirm current ownership, mailing, title and representation review; name-only matches do not qualify');
  const hold_reasons = body.verification_state === 'hold' ? [required(body.hold_reason, 'Hold reason')] : [];
  return { id: body.id, revision: body.revision, verification_state: body.verification_state, evidence, hold_reasons };
}
export function workflowFingerprint(body) {
  const keys = ['id','request_id','revision','event','detail','channel','result','timeline','next_step','appointment_at','next_followup','assigned_to','status','outcome_path','authority_confirmed','service_fit'];
  return digest(Object.fromEntries(keys.map(k => [k, body[k] ?? null])));
}
export function workflowCommand(lead, body) {
  if (!uuid(body.request_id)) fail('Request ID required');
  if (!Number.isInteger(body.revision)) fail('Revision required');
  const patch = {};
  const detail = required(body.detail, 'Evidence / note');
  const event = body.event;
  if (['closed_won','closed_lost','not_a_fit','spam'].includes(lead.status) && ['qualify','handoff','followup','appointment_booked'].includes(event)) fail('Reopen this inquiry explicitly before resuming its workflow',409);
  if (event === 'response_permission') {
    if (lead.do_not_contact) fail('Suppression must be resolved through a separately reviewed process', 409);
    if (!['phone_call','email_request','web_form','in_person'].includes(body.channel)) fail('Choose permission source');
    patch.consent_response = true;
    patch.consent_provenance = { source: body.channel, evidence: detail, recorded_at: new Date().toISOString(), scope: 'response_only' };
  } else if (event === 'contact_attempt') {
    if (lead.do_not_contact || !lead.consent_response) fail('Contact blocked: suppression or no response permission', 409);
    if (!['call', 'text', 'email'].includes(body.channel)) fail('Choose contact channel');
    if (!['no_answer', 'voicemail', 'connected', 'failed'].includes(body.result)) fail('Choose actual contact result');
    if (body.result !== 'failed') patch.first_contact_at = lead.first_contact_at || new Date().toISOString();
    patch.status = body.result === 'connected' && ['new','contact_attempted'].includes(lead.status) ? 'connected' : lead.status === 'new' && body.result !== 'failed' ? 'contact_attempted' : lead.status;
  } else if (event === 'qualify') {
    if (lead.do_not_contact) fail('Suppressed inquiry cannot be qualified', 409);
    if (body.authority_confirmed !== true || body.service_fit !== true) fail('Confirm authority and service fit');
    if (!lead.conversation_at) fail('Record a real conversation first', 409);
    patch.authority_confirmed = true;
    patch.qualification = { service_fit: true, timeline: required(body.timeline, 'Timeline', 200), next_step: required(body.next_step, 'Next step', 500), evidence: detail };
    patch.qualified_at = new Date().toISOString(); patch.status = 'qualified';
  } else if (event === 'handoff') {
    if (!lead.qualified_at || lead.do_not_contact) fail('Qualify an unsuppressed inquiry before handoff', 409);
    patch.assigned_to = 'nathanael'; patch.handoff_at = new Date().toISOString();
  } else if (event === 'followup') {
    if (!['jay', 'billy', 'nathanael'].includes(body.assigned_to)) fail('Choose an operator');
    patch.assigned_to = body.assigned_to;
    if (body.next_followup && !Number.isNaN(Date.parse(body.next_followup))) patch.next_followup = new Date(body.next_followup).toISOString();
    else fail('Choose a follow-up time');
    if (lead.do_not_contact) fail('Suppressed inquiries cannot have contact reminders', 409);
  } else if (event === 'appointment_booked') {
    if (lead.do_not_contact || !lead.handoff_at) fail('Handoff required before appointment', 409);
    if (!body.appointment_at || Number.isNaN(Date.parse(body.appointment_at))) fail('Choose appointment time');
    patch.appointment_at = new Date(body.appointment_at).toISOString(); patch.appointment_result = 'booked'; patch.status = 'appointment_set';
  } else if (event === 'appointment_result') {
    if (!lead.appointment_at || !['kept', 'cancelled', 'no_show'].includes(body.result)) fail('Choose result of an existing appointment');
    if (body.result === 'kept' && Date.parse(lead.appointment_at) > Date.now()) fail('Cannot mark a future appointment kept');
    patch.appointment_result = body.result;
  } else if (event === 'outcome') {
    if (!['closed_won', 'closed_lost', 'not_a_fit'].includes(body.status) || !['direct_purchase', 'listing', 'buyer_purchase', 'referral_out', 'none'].includes(body.outcome_path)) fail('Choose outcome and path');
    patch.status = body.status; patch.outcome_path = body.outcome_path; patch.closed_at = new Date().toISOString(); patch.next_followup = null;
  } else if (event === 'reopen') {
    if (!['closed_won','closed_lost','not_a_fit'].includes(lead.status) || lead.do_not_contact) fail('Only unsuppressed closed inquiries can be reopened',409);
    patch.closed_at = null; patch.outcome_path = null; patch.qualified_at = null; patch.handoff_at = null; patch.next_followup = null; patch.assigned_to = 'jay';
    patch.status = lead.conversation_at ? 'connected' : 'new';
  } else if (event === 'spam') { patch.status = 'spam'; patch.do_not_contact = true; patch.next_followup = null; }
  else if (event === 'suppress') { patch.do_not_contact = true; patch.next_followup = null; }
  else fail('Unknown workflow event');
  if (event === 'contact_attempt' && body.result === 'connected') patch.conversation_at = lead.conversation_at || new Date().toISOString();
  const inputs = Object.fromEntries(['timeline','next_step','appointment_at','next_followup','assigned_to','status','outcome_path','authority_confirmed','service_fit'].map(k => [k, body[k] ?? null]));
  return { request_fingerprint: workflowFingerprint(body), inputs, id: lead.id, revision: body.revision, request_id: body.request_id, event, detail, channel: body.channel || null, result: body.result || null, patch };
}
export function operationalMetrics(leads, research) {
  const real = leads.filter(l => !l.deleted_at && l.status !== 'spam' && l.intake_kind !== 'historical');
  const sources = {};
  for (const l of real) {
    const key = `${l.form_type || 'unknown'} / ${l.utm_source || l.channel || l.source || 'unknown'}`;
    const s = sources[key] ||= { inquiries: 0, conversations: 0, qualified: 0, booked: 0, kept: 0, outcomes: {}, responseMinutes: [] };
    s.inquiries++; s.conversations += Boolean(l.conversation_at); s.qualified += Boolean(l.qualified_at); s.booked += Boolean(l.appointment_at); s.kept += l.appointment_result === 'kept';
    if (l.closed_at) s.outcomes[l.outcome_path || 'none'] = (s.outcomes[l.outcome_path || 'none'] || 0) + 1;
    // Only explicit contact evidence is eligible, never legacy status-derived timestamps.
    if (l.response_evidence_at) { const m = (Date.parse(l.response_evidence_at) - Date.parse(l.created_at)) / 60000; if (m >= 0) s.responseMinutes.push(m); }
  }
  for (const s of Object.values(sources)) { s.responseMinutes.sort((a,b)=>a-b); s.medianResponseMinutes = s.responseMinutes.length ? s.responseMinutes[Math.floor((s.responseMinutes.length-1)/2)] : null; s.responseSample = s.responseMinutes.length; delete s.responseMinutes; }
  return { sources, researchRevisions: research.length, researchSources: new Set(research.map(r => r.record_key)).size, heldRevisions: research.filter(r => r.verification_state === 'hold').length };
}
