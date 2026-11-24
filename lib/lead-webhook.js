export function leadWebhookTarget(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || /(^|\.)(callharbison\.com|callharbisonbakersfield\.com|harbisonstandard\.(com|org))$/.test(host)
    || /^(hbh(?:-|\.)|harbison1\.)/.test(host) && host.endsWith('.vercel.app')) {
    throw new Error('Unsafe lead webhook destination');
  }
  return url.href;
}
