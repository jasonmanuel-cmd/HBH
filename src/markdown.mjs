import TurndownService from 'turndown';
import gfmPlugin from 'turndown-plugin-gfm';

const converter = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
converter.use(gfmPlugin.gfm);
converter.addRule('omitInterface', {
  filter: node => ['SCRIPT', 'STYLE', 'NOSCRIPT', 'FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'IFRAME', 'SVG', 'VIDEO', 'AUDIO'].includes(node.nodeName)
    || /(?:^|\s)(lead-card|hp|sr-only)(?:\s|$)/.test(node.getAttribute('class') || '')
    || (node.nodeName === 'IMG' && !node.getAttribute('alt'))
    || node.getAttribute('aria-hidden') === 'true',
  replacement: () => '',
});

export function pageMarkdown(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (!main) throw new Error('Public Markdown page has no main content');
  const separated = main.replace(/<\/span>(?=[^\s<])/gi, '</span> ');
  return converter.turndown(separated).trim() + '\n';
}
