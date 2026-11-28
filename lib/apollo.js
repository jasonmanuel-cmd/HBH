import { neon } from '@neondatabase/serverless';

export const QR_URL = 'https://callharbison.com/go/apollo';
const ID = /^[A-Za-z0-9_-]{11}$/;
const empty = Object.freeze({ revision: 0, destination: null, video: null });

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u : null;
  } catch { return null; }
}
export function walkthroughId(value) {
  const u = httpsUrl(value);
  if (!u || u.hash) return null;
  let id = '';
  if (u.hostname === 'youtu.be' && !u.search) id = u.pathname.slice(1);
  else if (['www.youtube.com','youtube.com'].includes(u.hostname) && !u.hash) {
    if (u.pathname === '/watch' && [...u.searchParams].length === 1) id = u.searchParams.get('v');
    else if (!u.search && u.pathname.startsWith('/shorts/')) id = u.pathname.slice('/shorts/'.length);
  }
  return typeof id === 'string' && ID.test(id) ? id : null;
}
export function approvedDestination(value, env) {
  const u = httpsUrl(value);
  if (!u || u.hash) return null;
  const yt = walkthroughId(value);
  if (yt) return 'https://www.youtube.com/watch?v=' + yt;
  // Only explicit, reviewed URLs: no user-defined host or redirect parameter.
  if (u.search || /%|\/\//.test(u.pathname) || /^\/(?:go|api|hq)(?:\/|\.|$)/i.test(u.pathname)) return null;
  const list = (env.APOLLO_APPROVED_URLS || '').split(/\s+/).map(httpsUrl).filter(Boolean);
  return list.some(entry => entry.href === u.href) ? u.href : null;
}
export function apolloHost(host, env) {
  return /^(?:www\.)?callharbison\.com$/i.test(host || '') ||
    (env.VERCEL_ENV === 'preview' && /^hbh-[a-z0-9-]+-jasons-projects-1d845fc4\.vercel\.app$/i.test(host || '')) ||
    (env.APOLLO_LOCAL_DEV === '1' && /^(?:localhost|127\.0\.0\.1):[1-9]\d{0,4}$/.test(host || ''));
}
export function apolloStore(query) {
  return {
    async read() {
      const rows = await query('select revision,destination,video from apollo.revisions order by revision desc limit 1', []);
      return rows[0] ?? { ...empty };
    },
    async save({ revision, destination, video, actor }) {
      const rows = await query(`insert into apollo.revisions (revision,destination,video,actor_label)
        select $1::integer+1,$2,$3,$4
        where $1::integer=coalesce((select max(revision) from apollo.revisions),0)
        on conflict (revision) do nothing returning revision,destination,video`, [revision,destination,video,actor]);
      return rows[0] ?? null;
    },
  };
}
export function configuredApolloStore(env) {
  if (!env.APOLLO_DATABASE_URL) return null;
  const sql = neon(env.APOLLO_DATABASE_URL);
  return apolloStore((query,params) => sql.query(query, params, { fetchOptions: { signal: AbortSignal.timeout(2000) } }));
}
export async function apolloHq({req,res,env,body,session,store}) {
  const reply = (code,obj) => res.status(code).json(obj);
  const error = (code,message) => reply(code,{ok:false,error:message});
  const host = req.headers?.host;
  if (!apolloHost(host,env)) return error(403,'Use Apollo settings on Call Harbison HQ.');
  if (!['GET','PATCH'].includes(req.method)) {
    res.setHeader('Allow','GET, PATCH');
    return error(405,'Method not allowed.');
  }
  if (req.method === 'PATCH') {
    const scheme = env.APOLLO_LOCAL_DEV === '1' && /^(localhost|127\.0\.0\.1):/.test(host) ? 'http' : 'https';
    if (req.headers?.origin !== scheme+'://'+host || !/^application\/json(?:;|$)/i.test(req.headers?.['content-type'] || '')) return error(403,'Forbidden.');
  }
  try {
    store ??= configuredApolloStore(env);
    if (!store) return error(503,'Apollo settings storage is not configured. The QR uses the original page.');
    if (req.method === 'GET') return reply(200,{ok:true,qrUrl:QR_URL,state:await store.read()});
    const { revision, destination, video } = body;
    if (Object.keys(body).length !== 3 || !Number.isInteger(revision) || revision < 0 || revision > 2147483646 ||
        typeof destination !== 'string' || typeof video !== 'string') return error(400,'Invalid Apollo settings.');
    const target = destination === '' ? null : approvedDestination(destination,env);
    const id = video === '' ? null : walkthroughId(video);
    if (destination && !target) return error(400,'Enter an approved HTTPS destination or an exact YouTube video link.');
    if (video && !id) return error(400,'Enter an exact YouTube video link.');
    const state = await store.save({revision,destination:target,video:id,actor:String(session.n).slice(0,40)});
    if (!state) return error(409,'Someone updated Apollo. Reload the settings and try again.');
    return reply(200,{ok:true,qrUrl:QR_URL,state});
  } catch {
    console.warn('[apollo] settings store unavailable');
    return error(503,'Apollo settings are temporarily unavailable. Reload to check whether your change was saved.');
  }
}
export function addWalkthrough(html, id) {
  if (typeof id !== 'string' || !ID.test(id)) return html;
  const slot = '<div class="hold"><span class="eyebrow">Final matched angle<br>to be filmed or verified</span></div>';
  const player = '<div style="aspect-ratio:16/9;background:#031f2b"><iframe style="border:0;width:100%;height:100%" title="Apollo walkthrough" src="https://www.youtube-nocookie.com/embed/'+id+'" loading="lazy" allowfullscreen></iframe></div>';
  return html.replace(slot, player);
}
