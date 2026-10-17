// Names alone, an empty phone, or a real name containing "Test" are never enough.
export function demoLeadReason(lead) {
  const name = String(lead.name || '').trim();
  const email = String(lead.email || '').trim().toLowerCase();
  const phone = String(lead.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const reservedPhone = /^\d{3}55501\d{2}$/.test(phone);
  if (/^CIPHER (?:QA(?:\b|[- ])|STATION TEST$)/i.test(name) && email.endsWith('.invalid') && reservedPhone) return 'Marked CIPHER QA/test identity with reserved email and fictional phone';
  if (name === 'CRM verification - do not contact' && email === 'crm-verification@example.invalid' && lead.form_type === 'harbison_standard') return 'Known private CRM diagnostic fixture';
  if (/^Sample Seller [A-L]$/.test(name) && reservedPhone && /\b(?:Example|Demo|Test|Placeholder|Mock|Sample|Fake|Trial)\b/i.test(lead.address || '')) return 'Known local demo seller fixture';
  return null;
}
