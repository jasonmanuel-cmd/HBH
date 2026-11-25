export function prefersMarkdown(accept = '') {
  let markdown = -1;
  let html = -1;
  for (const part of accept.toLowerCase().split(',')) {
    const [type, ...params] = part.trim().split(';');
    const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
    const weight = q ? Number(q.slice(2)) : 1;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) continue;
    if (type.trim() === 'text/markdown') markdown = Math.max(markdown, weight);
    if (type.trim() === 'text/html') html = Math.max(html, weight);
  }
  return markdown > 0 && markdown >= html;
}
