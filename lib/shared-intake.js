import { createHash, timingSafeEqual } from 'node:crypto';

export const STANDARD_FORM = 'harbison_standard';
export const BRANDS = { harbison_standard: 'Harbison Standard', call_harbison: 'Call Harbison' };
export const INTAKE_LABELS = {
  goal: 'Inquiry type', interest: 'Property of interest', current_city: 'Current city',
  desired_area: 'Preferred area', budget: 'Budget', bedrooms: 'Bedrooms',
  acreage_requirement: 'Acreage requirement', property_type: 'Property type',
  timeline: 'Timeline', financing_status: 'Financing status', age_range: 'Self-reported age range',
  message: 'Submitted message', session_id: 'Website session', source: 'Source page',
  utm_source: 'Campaign source', utm_medium: 'Campaign medium', utm_campaign: 'Campaign',
  utm_term: 'Campaign term', utm_content: 'Campaign content', referrer: 'Referrer',
};
const limits = {
  name: 100, phone: 40, email: 200, goal: 100, interest: 200, current_city: 120,
  desired_area: 200, budget: 100, bedrooms: 2, acreage_requirement: 100, property_type: 100,
  timeline: 100, financing_status: 120, age_range: 40, message: 3000, session_id: 64,
  source: 500, utm_source: 200, utm_medium: 200, utm_campaign: 200, utm_term: 200,
  utm_content: 200, referrer: 300,
};

export function authorized(header, secret) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof header !== 'string') return false;
  const hash = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(header), hash(`Bearer ${secret}`));
}

// Brand is derived from our trusted intake path, never from a public form field.
export function brandOf(lead) {
  return lead.form_type === STANDARD_FORM ? 'harbison_standard' : 'call_harbison';
}

export function normalizeStandard(body) {
  if (!body || body.version !== 1 || body.brand !== STANDARD_FORM || !body.lead || typeof body.lead !== 'object' || Array.isArray(body.lead)) {
    throw new Error('Invalid intake envelope');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.submission_id || '')) throw new Error('Invalid submission id');
  const fields = {};
  for (const [key, max] of Object.entries(limits)) {
    if (body.lead[key] == null) continue;
    if (typeof body.lead[key] !== 'string') throw new Error(`Invalid ${key}`);
    fields[key] = body.lead[key].trim().slice(0, max);
  }
  if (!fields.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || '')) throw new Error('Name and valid email are required');
  // Standard has historically allowed email-only inquiries through its API.
  // Empty strings satisfy the existing HBH table's NOT NULL constraints without inventing a property or phone.
  const notes = ['Harbison Standard website inquiry', 'Follow-up: Nathanael Harbison',
    ...Object.entries(INTAKE_LABELS).filter(([key]) => fields[key]).map(([key, label]) => `${label}: ${fields[key]}`),
    'Consent: no marketing opt-in recorded. No automated customer messages authorized by this intake.'].join('\n');
  const src = fields.utm_source?.toLowerCase() || '';
  const medium = fields.utm_medium?.toLowerCase() || '';
  const referrer = fields.referrer || '';
  const channel = ['cpc', 'ppc', 'paid'].includes(medium) && src === 'google' ? 'google_ads'
    : /chatgpt|perplexity|claude\.ai|copilot|gemini/i.test(src + referrer) ? 'ai_search'
    : /social/.test(medium) || /facebook|instagram|linkedin|youtube/i.test(src + referrer) ? 'social'
    : /google\.|bing\.|duckduckgo\./i.test(referrer) ? 'organic'
    : src || medium ? 'campaign' : referrer ? 'other_referral' : 'direct';
  return {
    id: body.submission_id, name: fields.name, phone: fields.phone || '', email: fields.email.toLowerCase(),
    address: '', situation: fields.goal || 'General inquiry', timeline: fields.timeline || null,
    source: fields.source || 'https://www.harbisonstandard.com', landing_page: fields.source || null,
    referrer: fields.referrer || null, form_type: STANDARD_FORM, channel,
    utm_source: fields.utm_source || null, utm_medium: fields.utm_medium || null,
    utm_campaign: fields.utm_campaign || null, utm_term: fields.utm_term || null, utm_content: fields.utm_content || null,
    status: 'new', assigned_to: 'nathanael', consent_response: false, consent_marketing: false, notes,
  };
}

export function brandFilter(brand) {
  if (brand === 'harbison_standard') return `form_type.eq.${STANDARD_FORM}`;
  if (brand === 'call_harbison') return `or(form_type.is.null,form_type.neq.${STANDARD_FORM})`;
  return null;
}
