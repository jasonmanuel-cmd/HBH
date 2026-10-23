// Duplicate-aware CSV / JSON lead importer for migrating historical Harbison Standard or Call Harbison records into HQ.
import { createHash } from 'node:crypto';
import { STANDARD_FORM, brandOf } from './shared-intake.js';

const VALID_STATUSES = new Set([
  'new', 'contact_attempted', 'connected', 'qualified', 'appointment_set',
  'property_reviewed', 'options_presented', 'nurture', 'under_contract',
  'closed_won', 'closed_lost', 'not_a_fit', 'spam',
]);
const VALID_ROUTES = new Set(['direct', 'listing', 'renovate', 'development', 'not_ready']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_ALIASES = {
  open: 'new',
  unread: 'new',
  contacted: 'connected',
  in_progress: 'connected',
  working: 'qualified',
  appointment: 'appointment_set',
  offered: 'options_presented',
  offer_made: 'options_presented',
  won: 'closed_won',
  closed: 'closed_won',
  lost: 'closed_lost',
  archived: 'closed_lost',
  junk: 'spam',
};

// Deterministic UUIDv4-shaped hash from row content so re-importing the same CSV without IDs is idempotent.
export function deterministicId(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// RFC-4180 CSV parser supporting quoted fields, embedded newlines, escaped quotes, and UTF-8 BOM.
export function parseCsvRows(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).map((vals) => {
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = (vals[idx] ?? '').trim(); });
    return obj;
  });
}

const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
  }
  return '';
};

const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

function signatureOf(lead) {
  const brand = lead.form_type === STANDARD_FORM ? 'harbison_standard' : 'call_harbison';
  const day = lead.created_at ? String(lead.created_at).slice(0, 10) : '';
  const email = (lead.email || '').trim().toLowerCase();
  const phone = normPhone(lead.phone);
  const name = (lead.name || '').trim().toLowerCase();
  const keys = [];
  if (email && day) keys.push(`e:${brand}|${email}|${day}`);
  if (phone.length >= 7 && day) keys.push(`p:${brand}|${phone}|${day}`);
  if (email && !day && name) keys.push(`en:${brand}|${email}|${name}`);
  if (phone.length >= 7 && !day && name) keys.push(`pn:${brand}|${phone}|${name}`);
  return keys;
}

export function prepareLeadImport(rawInput, { format = 'auto', defaultBrand = 'harbison_standard', existingLeads = [], maxRows = 500 } = {}) {
  let items = [];
  if (Array.isArray(rawInput)) {
    items = rawInput;
  } else {
    const str = String(rawInput || '').trim();
    if (!str) return { ready: [], duplicates: [], invalid: [{ row: 0, reason: 'Paste or upload CSV or JSON records first.' }] };
    const looksJson = format === 'json' || (format === 'auto' && (str.startsWith('[') || str.startsWith('{')));
    if (looksJson) {
      let parsed;
      try { parsed = JSON.parse(str); } catch { return { ready: [], duplicates: [], invalid: [{ row: 0, reason: 'Invalid JSON syntax.' }] }; }
      items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.leads) ? parsed.leads : Array.isArray(parsed?.rows) ? parsed.rows : [];
    } else {
      items = parseCsvRows(str);
    }
  }

  if (!items.length) return { ready: [], duplicates: [], invalid: [{ row: 0, reason: 'No data rows found.' }] };
  if (items.length > maxRows) {
    return { ready: [], duplicates: [], invalid: [{ row: 0, reason: `Maximum ${maxRows} rows per import batch (received ${items.length}).` }] };
  }

  const seenIds = new Set(existingLeads.map((l) => String(l.id || '').toLowerCase()).filter(Boolean));
  const seenSigs = new Set(existingLeads.flatMap(signatureOf));

  const ready = [];
  const duplicates = [];
  const invalid = [];

  items.forEach((raw, idx) => {
    const rowNum = idx + 1;
    if (!raw || typeof raw !== 'object') {
      invalid.push({ row: rowNum, reason: 'Row is not an object' });
      return;
    }

    const firstName = pick(raw, ['first_name', 'firstname']);
    const lastName = pick(raw, ['last_name', 'lastname']);
    const name = (pick(raw, ['name', 'full_name', 'contact_name', 'client_name']) || `${firstName} ${lastName}`.trim()).slice(0, 120);
    const rawEmail = pick(raw, ['email', 'email_address', 'contact_email']).toLowerCase().slice(0, 160);
    const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null;
    const rawPhone = pick(raw, ['phone', 'phone_number', 'mobile', 'tel', 'contact_phone']).slice(0, 40);
    const phoneDigits = normPhone(rawPhone);
    const phone = phoneDigits.length >= 7 ? rawPhone : '';

    if (!name) {
      invalid.push({ row: rowNum, reason: 'Missing name' });
      return;
    }
    if (rawEmail && !email) {
      invalid.push({ row: rowNum, name, reason: `Invalid email "${rawEmail}"` });
      return;
    }
    if (!email && !phone) {
      invalid.push({ row: rowNum, name, reason: 'Needs at least a valid phone or email' });
      return;
    }

    const rawBrand = pick(raw, ['brand', 'form_type', 'site']).toLowerCase();
    const isStandard = rawBrand
      ? rawBrand.includes('standard')
      : defaultBrand === 'harbison_standard';
    const formType = isStandard ? STANDARD_FORM : (pick(raw, ['form_type']) || 'imported');

    const rawDate = pick(raw, ['created_at', 'submitted_at', 'date', 'timestamp', 'created']);
    let createdAt = null;
    if (rawDate) {
      const parsedDate = Date.parse(rawDate);
      if (Number.isNaN(parsedDate)) {
        invalid.push({ row: rowNum, name, reason: `Invalid date "${rawDate}"` });
        return;
      }
      createdAt = new Date(parsedDate).toISOString();
    } else {
      createdAt = new Date().toISOString();
    }

    const rawStatus = pick(raw, ['status', 'stage']).toLowerCase().replace(/[\s-]+/g, '_');
    const status = VALID_STATUSES.has(rawStatus) ? rawStatus : (STATUS_ALIASES[rawStatus] || 'new');

    const rawRoute = pick(raw, ['route_interest', 'route', 'path']).toLowerCase();
    const route = VALID_ROUTES.has(rawRoute) ? rawRoute : null;

    const address = pick(raw, ['address', 'property_address', 'street_address', 'property']).slice(0, 200);
    const situation = (pick(raw, ['situation', 'goal', 'inquiry_type', 'inquiry', 'subject']) || (isStandard ? 'Historical Standard inquiry' : 'Imported inquiry')).slice(0, 120);
    const timeline = pick(raw, ['timeline', 'timeframe']).slice(0, 100) || null;
    const channel = (pick(raw, ['channel']) || 'direct').slice(0, 60);
    const source = (pick(raw, ['source', 'landing_page', 'page_url']) || (isStandard ? 'https://www.harbisonstandard.com (historical import)' : 'hq_import')).slice(0, 500);

    // Preserve extra buyer/property context from Harbison Standard or external spreadsheets in notes.
    const extraLines = [];
    for (const [k, label] of [
      ['interest', 'Property of interest'],
      ['desired_area', 'Preferred area'],
      ['current_city', 'Current city'],
      ['budget', 'Budget'],
      ['bedrooms', 'Bedrooms'],
      ['acreage_requirement', 'Acreage requirement'],
      ['property_type', 'Property type'],
      ['financing_status', 'Financing status'],
      ['message', 'Submitted message'],
    ]) {
      const val = pick(raw, [k]);
      if (val) extraLines.push(`${label}: ${val}`);
    }
    const baseNotes = pick(raw, ['notes', 'note', 'comments']);
    const composedNotes = [
      ...(isStandard && extraLines.length ? ['Harbison Standard historical inquiry'] : []),
      ...extraLines,
      ...(baseNotes ? [baseNotes] : []),
    ].join('\n').slice(0, 5000) || null;

    const explicitId = pick(raw, ['id', 'submission_id', 'uuid']).toLowerCase();
    const id = UUID_RE.test(explicitId)
      ? explicitId
      : deterministicId(`${formType}|${rawDate || ''}|${email || ''}|${phoneDigits}|${name.toLowerCase()}|${address.toLowerCase()}`);

    const candidate = {
      id,
      created_at: createdAt,
      name,
      phone,
      email,
      address,
      situation,
      timeline,
      route_interest: route,
      channel,
      source,
      form_type: formType,
      utm_source: pick(raw, ['utm_source']).slice(0, 200) || null,
      utm_medium: pick(raw, ['utm_medium']).slice(0, 200) || null,
      utm_campaign: pick(raw, ['utm_campaign']).slice(0, 200) || null,
      ref_partner: pick(raw, ['ref_partner', 'partner']).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || null,
      status,
      assigned_to: (pick(raw, ['assigned_to', 'assignee']) || 'nathanael').slice(0, 60),
      notes: composedNotes,
      consent_response: /^true|yes|1$/i.test(pick(raw, ['consent_response'])),
      consent_marketing: /^true|yes|1$/i.test(pick(raw, ['consent_marketing'])),
    };

    const sigs = signatureOf(candidate);
    if (seenIds.has(id) || sigs.some((s) => seenSigs.has(s))) {
      duplicates.push({ row: rowNum, id, name, email: email || phone, brand: brandOf(candidate) });
      return;
    }

    seenIds.add(id);
    sigs.forEach((s) => seenSigs.add(s));
    ready.push(candidate);
  });

  return { ready, duplicates, invalid };
}
