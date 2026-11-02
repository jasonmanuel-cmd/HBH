import { createHash } from 'node:crypto';
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const digest = value => createHash('sha256').update(value).digest('hex');
export function reliabilityRpc(env, fetcher = fetch) {
 return async (name, body = {}) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Storage unavailable');
  const r = await fetcher(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${name}`, {
   method:'POST',signal:AbortSignal.timeout(15000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body),
  });
  if (!r.ok) {
   let code;try { const data=await r.json(); if (['23505','42501','40001','55000'].includes(data.code)) code=data.code; } catch {}
   throw Object.assign(new Error('Operation unconfirmed'),{code});
  }
  return r.json();
 };
}
export function confirmedCommand(value, expectedId) {
 if (!value || !['committed','aborted','unresolved'].includes(value.state)) throw new Error('Invalid command response');
 if (value.state === 'committed' && (!uuid(value.result?.id) || (expectedId && value.result.id.toLowerCase()!==expectedId.toLowerCase()) || !Number.isInteger(value.result.details_revision) || value.result.details_revision<0)) throw new Error('Save not confirmed');
 return value;
}
