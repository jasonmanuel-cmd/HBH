// Build-time Spanish version of the finished English pages.
//
// The English templates stay the single source of truth. For each page we parse the generated HTML, find every
// visitor-facing "unit" of text (a paragraph, heading, button, list item, label, alt text, meta description...),
// and swap it for the Spanish entry in the dictionary (src/i18n/es/*.json, keyed by the English text).
//
// Inline markup inside a unit is abstracted so translators cannot damage it:
//     More on <a class="link" href="/how-it-works">how it works</a>   ->   More on <a1>how it works</a1>
// Attributes (class, href, ...) are kept aside and put back after translation.
//
// Anything missing from the dictionary falls back to English and is reported; `npm test` fails on a gap.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- dictionary

/** Tag tokens (`<a1>`, `</a1>`, `<br>`) and `{date1}` / `{year}` placeholders, as a sorted list for comparison. */
export function shapeOf(text) {
  const tags = text.match(/<\/?[a-z]+\d*\s*\/?>/gi) || [];
  const marks = text.match(/\{(?:date\d+|year)\}/g) || [];
  return [...tags.map((t) => t.toLowerCase().replace(/\s+/g, '')), ...marks].sort().join('|');
}

export function loadDictionary(dir = join(here, 'es')) {
  const dict = new Map();
  const problems = [];
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    // No dictionary yet: every unit is reported as missing.
  }
  for (const file of files) {
    const part = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const [en, es] of Object.entries(part)) {
      if (typeof es !== 'string' || !es.trim()) {
        problems.push(`${file}: empty translation for "${en.slice(0, 60)}"`);
        continue;
      }
      if (shapeOf(en) !== shapeOf(es)) problems.push(`${file}: tags or placeholders differ in "${en.slice(0, 60)}"`);
      dict.set(en, es);
    }
  }
  return { dict, problems };
}

// ---------------------------------------------------------------- HTML tree (our own, well-formed templates)

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'svg']);
const INLINE = new Set(['a', 'abbr', 'b', 'br', 'cite', 'code', 'em', 'i', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'wbr']);
const TEXT_TAGS = new Set(['a', 'button', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'dd', 'td', 'th', 'summary', 'figcaption', 'legend', 'label', 'option', 'caption', 'blockquote', 'title']);
const TOKEN = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/gi;

function parse(html) {
  const root = { tag: '#root', attrs: '', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(html))) {
    if (m[1]) {
      const name = m[1].toLowerCase();
      const at = stack.map((n) => n.tag).lastIndexOf(name);
      if (at > 0) stack.length = at;
    } else if (m[2]) {
      const el = { tag: m[2].toLowerCase(), attrs: m[3], children: [] };
      top().children.push(el);
      if (VOID.has(el.tag) || /\/\s*$/.test(m[3])) continue;
      if (RAW.has(el.tag)) {
        const close = html.toLowerCase().indexOf(`</${el.tag}>`, TOKEN.lastIndex);
        const end = close === -1 ? html.length : close;
        el.children.push({ raw: html.slice(TOKEN.lastIndex, end) });
        TOKEN.lastIndex = end;
        continue;
      }
      stack.push(el);
    } else if (m[4] !== undefined) {
      top().children.push({ text: m[4] });
    } else {
      top().children.push({ raw: m[0] });
    }
  }
  return root;
}

function serialize(node) {
  if (node.raw !== undefined) return node.raw;
  if (node.text !== undefined) return node.text;
  const inner = node.children.map(serialize).join('');
  if (node.tag === '#root') return inner;
  if (VOID.has(node.tag)) return `<${node.tag}${node.attrs}>`;
  return `<${node.tag}${node.attrs}>${inner}</${node.tag}>`;
}

// ---------------------------------------------------------------- text helpers

const decodeText = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
const encodeText = (s) => s.replace(/&(?!(?:lt|gt|amp|quot|nbsp|#\d+|#x[0-9a-f]+);)/gi, '&amp;');
const decodeAttr = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const encodeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MONTHS_EN = 'January|February|March|April|May|June|July|August|September|October|November|December';
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DATE_RE = new RegExp(`\\b(${MONTHS_EN}) (\\d{1,2}), (\\d{4})\\b`, 'g');
const monthIndex = (name) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(name);

/** Dates and the copyright year change on every build, so they become placeholders in dictionary keys. */
function withPlaceholders(text) {
  const dates = [];
  let out = text.replace(DATE_RE, (_, month, day, yearText) => {
    dates.push(`${Number(day)} de ${MONTHS_ES[monthIndex(month)]} de ${yearText}`);
    return `{date${dates.length}}`;
  });
  let year = null;
  out = out.replace(/©\s*(\d{4})/, (whole, y) => {
    year = y;
    return '© {year}';
  });
  return { text: out, dates, year };
}

const restorePlaceholders = (text, { dates, year }) =>
  text.replace(/\{date(\d+)\}/g, (whole, n) => dates[Number(n) - 1] ?? whole).replace(/\{year\}/g, year ?? '{year}');

const normalize = (s) => s.replace(/\s+/g, ' ').trim();

/** True when a string is real prose worth translating (not an email, phone number, URL or code). */
export function isTranslatable(text) {
  const plain = text.replace(/<\/?[a-z]+\d*\s*\/?>/gi, '').replace(/\{(?:date\d+|year)\}/g, '').trim();
  if (!/[A-Za-zÀ-ɏ]{2,}/.test(plain)) return false;
  if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(plain)) return false;
  if (/^(https?:)?\/\//.test(plain) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(plain)) return false;
  if (/^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(plain)) return false;
  return true;
}

// ---------------------------------------------------------------- units

/** Does this element contain only text and inline markup (so it can be translated as one sentence)? */
function inlineOnly(el) {
  return el.children.every((c) => c.text !== undefined || c.raw !== undefined || (INLINE.has(c.tag) && inlineOnly(c)));
}

const hasDirectText = (el) => el.children.some((c) => c.text !== undefined && /\S/.test(c.text));

/** Replace markup in a node list with numbered placeholders; returns the key and the held-aside tags. */
function abstractNodes(children) {
  const slots = {};
  const counts = {};
  const walk = (nodes) =>
    nodes
      .map((n) => {
        if (n.text !== undefined) return decodeText(n.text);
        if (n.raw !== undefined) return '';
        if (n.tag === 'br') return '<br>';
        counts[n.tag] = (counts[n.tag] || 0) + 1;
        const id = `${n.tag}${counts[n.tag]}`;
        slots[id] = n;
        return `<${id}>${walk(n.children)}</${id}>`;
      })
      .join('');
  return { key: walk(children), slots };
}

/** Turn a Spanish dictionary string back into HTML, restoring each tag's original attributes. */
function concretize(es, slots, placeholders) {
  return es
    .split(/(<\/?[a-z]+\d*\s*\/?>)/gi)
    .map((token) => {
      const tag = token.match(/^<(\/?)([a-z]+\d*)\s*\/?>$/i);
      if (!tag) return encodeText(restorePlaceholders(token, placeholders));
      const [, closing, id] = tag;
      if (id.toLowerCase() === 'br') return '<br>';
      const slot = slots[id.toLowerCase()];
      if (!slot) throw new Error(`Translation uses <${id}> which is not in the English text: ${es.slice(0, 80)}`);
      return closing ? `</${slot.tag}>` : `<${slot.tag}${slot.attrs}>`;
    })
    .join('');
}

// ---------------------------------------------------------------- attributes

const ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];
const META_TEXT = /(?:name|property)="(?:description|og:title|og:description|og:image:alt|twitter:title|twitter:description)"/;

// ---------------------------------------------------------------- links and structured data

const NOT_ROUTES = /^\/(?:assets|fonts|api|hq|_vercel|favicon|site\.webmanifest|sitemap|robots|llms|styles|script|analytics)/;
const FILE_EXT = /\.(?:png|jpe?g|gif|webp|svg|ico|xml|txt|webmanifest|css|js|woff2?|pdf|json|mp4)(?:$|[?#])/i;

export function isRoute(path) {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/es') && !NOT_ROUTES.test(path) && !FILE_EXT.test(path);
}

/** `/guides/x` -> `/es/guides/x`, `/#faq` -> `/es#faq`, `/` -> `/es`. */
export function esPath(path) {
  if (!isRoute(path)) return path;
  const [, route, rest = ''] = path.match(/^([^?#]*)(.*)$/);
  const base = route === '/' || route === '' ? '/es' : `/es${route}`;
  return `${base}${rest}`;
}

/** The English path of a generated file (`situations/x.html` -> `/situations/x`). */
export function pathOfFile(file) {
  const p = `/${file.replace(/(?:^|\/)index\.html$/, '').replace(/\.html$/, '')}`.replace(/\/$/, '');
  return p || '/';
}

const PAGE_NODE_TYPES = new Set(['WebPage', 'ProfilePage', 'CollectionPage', 'ContactPage', 'Article', 'Service', 'ListItem', 'ItemList', 'BreadcrumbList', 'FAQPage', 'VideoObject']);
const PAGE_ID_SUFFIX = /#(?:webpage|breadcrumb|faq|service|article|contact|list|video-.*)$/;

// ---------------------------------------------------------------- the translator

/**
 * @param {string} html  generated English page
 * @param {{ dict: Map<string,string>, siteUrl: string, filePath: string, report?: { missing: Set<string> } }} ctx
 * @returns {string} Spanish page (head, links, structured data and visible text)
 */
export function translatePage(html, ctx) {
  const { dict, siteUrl, report = { missing: new Set() } } = ctx;
  const enPath = pathOfFile(ctx.filePath);
  const placeholdersForPage = { dates: [], year: null };
  const tree = parse(html);

  const lookup = (rawKey) => {
    const holders = withPlaceholders(normalize(rawKey));
    if (!isTranslatable(holders.text)) return null;
    const es = dict.get(holders.text);
    if (!es) {
      report.missing.add(holders.text);
      return null;
    }
    return { es, holders };
  };

  // Plain-text view of the dictionary, for structured data (which has no markup).
  const plain = (s) => normalize(s.replace(/<\/?[a-z]+\d*\s*\/?>/gi, ''));
  const plainMap = ctx.plainMap || (ctx.plainMap = new Map([...dict].map(([en, es]) => [plain(en), plain(es)])));
  const translatePlain = (text) => {
    const holders = withPlaceholders(normalize(text));
    if (!isTranslatable(holders.text) || !/\s/.test(holders.text)) {
      const single = dict.get(holders.text);
      return single ? restorePlaceholders(single, holders) : text;
    }
    const hit = dict.get(holders.text) ?? plainMap.get(holders.text);
    if (hit) return restorePlaceholders(hit, holders);
    report.missing.add(holders.text);
    return text;
  };

  const rewriteJsonLd = (node, parentType) => {
    if (Array.isArray(node)) return node.map((n) => rewriteJsonLd(n, parentType));
    if (!node || typeof node !== 'object') return node;
    const types = [].concat(node['@type'] || []);
    const isPageNode = types.some((t) => PAGE_NODE_TYPES.has(t)) || (parentType && PAGE_NODE_TYPES.has(parentType) && !node['@type']);
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if (key === 'inLanguage') out[key] = 'es-US';
        else if (key === 'availableLanguage') out[key] = ['English', 'Spanish'];
        else if ((key === 'url' || key === 'item') && isPageNode && value.startsWith(siteUrl)) out[key] = `${siteUrl}${esPath(value.slice(siteUrl.length) || '/')}`;
        else if (key === '@id' && PAGE_ID_SUFFIX.test(value) && value.startsWith(siteUrl)) out[key] = `${siteUrl}${esPath(value.slice(siteUrl.length) || '/')}`;
        else if (/^(?:name|description|headline|text|jobTitle|slogan|serviceType|knowsAbout)$/.test(key)) out[key] = translatePlain(value);
        else out[key] = value;
      } else if (key === 'knowsAbout' && Array.isArray(value)) {
        out[key] = value.map((v) => (typeof v === 'string' ? translatePlain(v) : rewriteJsonLd(v, types[0])));
      } else if (key === 'availableLanguage') {
        out[key] = ['English', 'Spanish'];
      } else {
        out[key] = rewriteJsonLd(value, types[0] || parentType);
      }
    }
    return out;
  };

  const translateAttrValue = (attrs, name) =>
    attrs.replace(new RegExp(`(\\s${name}=)"([^"]*)"`), (whole, lead, value) => {
      const hit = lookup(decodeAttr(value));
      if (!hit) return whole;
      return `${lead}"${encodeAttr(restorePlaceholders(plain(hit.es), hit.holders))}"`;
    });

  const translateUnit = (el) => {
    const { key, slots } = abstractNodes(el.children);
    const hit = lookup(key);
    if (!hit) return;
    el.children = [{ raw: concretize(hit.es, slots, hit.holders) }];
  };

  const translateTextRun = (node) => {
    const lead = node.text.match(/^\s*/)[0];
    const trail = node.text.match(/\s*$/)[0];
    const hit = lookup(decodeText(node.text));
    if (hit) node.text = `${lead}${encodeText(restorePlaceholders(hit.es, hit.holders))}${trail}`;
  };

  const walk = (el) => {
    if (el.tag === 'script') {
      if (/type="application\/ld\+json"/.test(el.attrs) && el.children[0]?.raw) {
        const json = JSON.parse(el.children[0].raw);
        el.children = [{ raw: JSON.stringify(rewriteJsonLd(json)).replace(/</g, '\\u003c') }];
      }
      return;
    }
    if (RAW.has(el.tag)) return;

    if (el.tag === 'option' && !/\svalue=/.test(el.attrs)) {
      // The visible label changes; the value the CRM receives must stay the English one.
      el.attrs += ` value="${encodeAttr(normalize(decodeText(el.children.map((c) => c.text || '').join(''))))}"`;
    }
    if (el.tag === 'meta' && META_TEXT.test(el.attrs)) el.attrs = translateAttrValue(el.attrs, 'content');
    for (const name of ATTRS) if (new RegExp(`\\s${name}="`).test(el.attrs)) el.attrs = translateAttrValue(el.attrs, name);

    if ((hasDirectText(el) || TEXT_TAGS.has(el.tag)) && inlineOnly(el) && el.tag !== '#root') {
      // Inline children can carry translatable attributes too (an <img alt>, a <a title>).
      const visit = (node) => node.children?.forEach((c) => {
        if (c.tag) {
          for (const name of ATTRS) if (new RegExp(`\\s${name}="`).test(c.attrs)) c.attrs = translateAttrValue(c.attrs, name);
          visit(c);
        }
      });
      visit(el);
      translateUnit(el);
      return;
    }
    for (const child of el.children) {
      if (child.tag) walk(child);
      else if (child.text !== undefined && /\S/.test(child.text)) translateTextRun(child);
    }
  };
  walk(tree);

  let out = serialize(tree);
  const pageUrl = `${siteUrl}${enPath === '/' ? '/' : enPath}`;
  const esUrl = `${siteUrl}${esPath(enPath)}`;

  // Internal links stay inside the Spanish site.
  out = out.replace(/(\shref=")(\/[^"]*)"/g, (whole, lead, path) => `${lead}${esPath(path)}"`);
  // Page identity: language, locale, canonical and social URL.
  out = out
    .replace('<html lang="en-US">', '<html lang="es-US">')
    .replace('<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="es_US">\n  <meta property="og:locale:alternate" content="en_US">')
    .replace(`<link rel="canonical" href="${pageUrl}">`, `<link rel="canonical" href="${esUrl}">`)
    .replace(`<meta property="og:url" content="${pageUrl}">`, `<meta property="og:url" content="${esUrl}">`);
  return out;
}

// ---------------------------------------------------------------- shared page furniture (both languages)

const LANG_KEY = 'hbh-lang';

/** hreflang pairs, the header language switch, and (English only) the remembered-language redirect. */
export function decoratePage(html, { lang, filePath, siteUrl }) {
  const enPath = pathOfFile(filePath);
  const otherHref = lang === 'en' ? esPath(enPath) : enPath;
  const noindex = /<meta name="robots" content="noindex/.test(html);
  let out = html;

  if (!noindex) {
    const alternates = [
      `<link rel="alternate" hreflang="en" href="${siteUrl}${enPath === '/' ? '/' : enPath}">`,
      `<link rel="alternate" hreflang="es" href="${siteUrl}${esPath(enPath)}">`,
      `<link rel="alternate" hreflang="x-default" href="${siteUrl}${enPath === '/' ? '/' : enPath}">`,
    ].join('\n  ');
    out = out.replace('</head>', `  ${alternates}\n</head>`);
  }

  const label = lang === 'en' ? 'Español' : 'English';
  const aria = lang === 'en' ? 'Ver este sitio en español' : 'View this site in English';
  const switchLink = `<a class="lang-switch" href="${otherHref}" hreflang="${lang === 'en' ? 'es' : 'en'}" lang="${lang === 'en' ? 'es' : 'en'}" data-lang-pref="${lang === 'en' ? 'es' : 'en'}" aria-label="${aria}">${label}</a>`;
  out = out.replace(/(<a class="btn btn-gold header-cta"[^>]*>[^<]*<\/a>)/, `$1\n    ${switchLink}`);

  if (lang === 'es' && /^\/(?:privacy|terms|accessibility)$/.test(enPath)) {
    // Legal pages are a courtesy translation; the English text is the one that governs.
    const notice = '<p class="muted-note" lang="es">Esta página se ofrece en español como cortesía. Si existe alguna diferencia con la versión en inglés, prevalece la versión en inglés.</p>';
    out = out.replace('</h1>', `</h1>\n    ${notice}`);
  }

  if (lang === 'en') {
    // A visitor who chose Spanish earlier lands on the Spanish page. Crawlers keep no storage, so they always see English.
    const redirect = `<script>try{if(localStorage.getItem('${LANG_KEY}')==='es'){var p=location.pathname.replace(/\\/$/,'');location.replace('/es'+(p==='/'||p===''?'':p)+location.search+location.hash)}}catch(e){}</script>`;
    out = out.replace('</head>', `  ${redirect}\n</head>`);
  }
  return out;
}
