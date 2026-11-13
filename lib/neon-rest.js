// Serves the small PostgREST subset this site uses (api/leads.js, api/hq.js, api/intake.js, lib/*) from any
// Postgres, so the same handlers can run on Neon. Every identifier is validated and every value is a bound
// parameter. Results come back as JSON from Postgres itself, so numbers and timestamps look exactly like
// they did from Supabase.
//
//   const handle = createRestHandler((text, params) => pool.query(text, params));
//   const response = await handle(url, { method, headers, body });

const IDENT = /^[a-z_][a-z0-9_]*$/;
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const ERROR_STATUS = { '23505': 409, '23503': 409, '40001': 500, '42501': 403, '42P01': 404 };

class RestError extends Error {
  constructor(message, status = 400, code) { super(message); this.status = status; this.code = code; }
}

const ident = (name) => {
  if (!IDENT.test(name)) throw new RestError('Invalid identifier');
  return `"${name}"`;
};

const splitTop = (text) => {
  const parts = []; let depth = 0; let quoted = false; let current = '';
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '(') depth += 1;
    if (!quoted && ch === ')') depth -= 1;
    if (!quoted && depth === 0 && ch === ',') { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
};

const unquote = (v) => (v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);

export function createRestHandler(query) {
  // Builds one comparison. `params` collects bound values; returns SQL text.
  const comparison = (col, expr, params) => {
    const name = ident(col);
    let negate = false; let rest = expr;
    if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4); }
    const dot = rest.indexOf('.');
    if (dot < 0) throw new RestError('Invalid filter');
    const op = rest.slice(0, dot); const raw = rest.slice(dot + 1);
    const bind = (value) => { params.push(value); return `$${params.length}`; };
    let sql;
    switch (op) {
      case 'eq': sql = `${name} = ${bind(unquote(raw))}`; break;
      case 'neq': sql = `${name} <> ${bind(unquote(raw))}`; break;
      case 'gt': sql = `${name} > ${bind(unquote(raw))}`; break;
      case 'gte': sql = `${name} >= ${bind(unquote(raw))}`; break;
      case 'lt': sql = `${name} < ${bind(unquote(raw))}`; break;
      case 'lte': sql = `${name} <= ${bind(unquote(raw))}`; break;
      case 'like': sql = `${name}::text like ${bind(unquote(raw).replace(/\*/g, '%'))}`; break;
      case 'ilike': sql = `${name}::text ilike ${bind(unquote(raw).replace(/\*/g, '%'))}`; break;
      case 'is': {
        if (!['null', 'true', 'false'].includes(raw)) throw new RestError('Invalid is filter');
        sql = `${name} is ${raw}`; break;
      }
      case 'in': {
        if (!raw.startsWith('(') || !raw.endsWith(')')) throw new RestError('Invalid in filter');
        const values = splitTop(raw.slice(1, -1)).map(unquote);
        sql = values.length ? `${name} in (${values.map(bind).join(',')})` : 'false'; break;
      }
      case 'cs': sql = `${name} @> ${bind(unquote(raw))}`; break;
      default: throw new RestError(`Unsupported filter ${op}`);
    }
    return negate ? `not (${sql})` : sql;
  };

  const logical = (kind, body, params) => {
    const inner = body.startsWith('(') && body.endsWith(')') ? body.slice(1, -1) : body;
    const pieces = splitTop(inner).map((piece) => {
      const nested = piece.match(/^(not\.)?(or|and)(\(.*\))$/s);
      if (nested) return `${nested[1] ? 'not ' : ''}(${logical(nested[2], nested[3], params)})`;
      const dot = piece.indexOf('.');
      return comparison(piece.slice(0, dot), piece.slice(dot + 1), params);
    });
    return pieces.join(kind === 'or' ? ' or ' : ' and ');
  };

  const where = (searchParams, params) => {
    const clauses = [];
    for (const [key, value] of searchParams) {
      if (RESERVED.has(key)) continue;
      if (key === 'or' || key === 'and') clauses.push(`(${logical(key, value, params)})`);
      else clauses.push(`(${comparison(key, value, params)})`);
    }
    return clauses.length ? ` where ${clauses.join(' and ')}` : '';
  };

  const orderBy = (value) => {
    if (!value) return '';
    const parts = value.split(',').map((piece) => {
      const [col, ...mods] = piece.split('.');
      let out = ident(col);
      if (mods.includes('desc')) out += ' desc';
      else if (mods.includes('asc')) out += ' asc';
      if (mods.includes('nullsfirst')) out += ' nulls first';
      if (mods.includes('nullslast')) out += ' nulls last';
      return out;
    });
    return ` order by ${parts.join(', ')}`;
  };

  const columnList = (select) => {
    if (!select || select === '*') return '*';
    return select.split(',').map((c) => {
      const name = c.trim();
      if (!IDENT.test(name)) throw new RestError('Unsupported select');
      return `"${name}"`;
    }).join(', ');
  };

  const json = (data, status = 200) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const aggregate = (inner) => `select coalesce(json_agg(t), '[]'::json) as data from (${inner}) t`;
  const preferOf = (init) => {
    const headers = init.headers || {};
    const raw = headers.Prefer ?? headers.prefer ?? '';
    return String(raw).split(',').map((s) => s.trim());
  };

  async function run(table, u, init) {
    const method = (init.method || 'GET').toUpperCase();
    const params = [];
    const t = `public.${ident(table)}`;
    const prefer = preferOf(init);
    const wantsRows = prefer.includes('return=representation');
    let body = init.body;
    if (typeof body === 'string' && body) body = JSON.parse(body);

    if (method === 'GET') {
      const filter = where(u.searchParams, params);
      const limit = u.searchParams.get('limit'); const offset = u.searchParams.get('offset');
      let sql = `select ${columnList(u.searchParams.get('select'))} from ${t}${filter}${orderBy(u.searchParams.get('order'))}`;
      if (limit) sql += ` limit ${Math.max(0, parseInt(limit, 10) || 0)}`;
      if (offset) sql += ` offset ${Math.max(0, parseInt(offset, 10) || 0)}`;
      const { rows } = await query(aggregate(sql), params);
      return json(rows[0].data);
    }

    if (method === 'POST') {
      const records = Array.isArray(body) ? body : [body];
      if (!records.length || records.some((r) => !r || typeof r !== 'object')) throw new RestError('Invalid body');
      const keys = [...new Set(records.flatMap((r) => Object.keys(r)))];
      keys.forEach(ident);
      params.push(JSON.stringify(records));
      const cols = keys.map(ident).join(', ');
      let conflict = '';
      const target = u.searchParams.get('on_conflict');
      const targetCols = target ? target.split(',').map(ident).join(', ') : '';
      if (prefer.includes('resolution=ignore-duplicates')) conflict = targetCols ? ` on conflict (${targetCols}) do nothing` : ' on conflict do nothing';
      else if (prefer.includes('resolution=merge-duplicates') && targetCols) {
        const updatable = keys.filter((k) => !target.split(',').includes(k));
        conflict = updatable.length
          ? ` on conflict (${targetCols}) do update set ${updatable.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`
          : ` on conflict (${targetCols}) do nothing`;
      }
      const insert = `insert into ${t} (${cols}) select ${cols} from json_populate_recordset(null::${t}, $1::json)${conflict}`;
      if (wantsRows) {
        const { rows } = await query(`with r as (${insert} returning *) ${aggregate('select * from r')}`, params);
        return json(rows[0].data, 201);
      }
      await query(insert, params);
      return new Response(null, { status: 201 });
    }

    if (method === 'PATCH') {
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RestError('Invalid body');
      const keys = Object.keys(body); keys.forEach(ident);
      if (!keys.length) throw new RestError('Empty update');
      params.push(JSON.stringify(body));
      const sets = keys.map((k) => `${ident(k)} = (select ${ident(k)} from json_populate_record(null::${t}, $1::json))`).join(', ');
      const filter = where(u.searchParams, params);
      const update = `update ${t} set ${sets}${filter}`;
      if (wantsRows) {
        const { rows } = await query(`with r as (${update} returning *) ${aggregate('select * from r')}`, params);
        return json(rows[0].data);
      }
      await query(update, params);
      return new Response(null, { status: 204 });
    }

    if (method === 'DELETE') {
      const filter = where(u.searchParams, params);
      const del = `delete from ${t}${filter}`;
      if (wantsRows) {
        const { rows } = await query(`with r as (${del} returning *) ${aggregate('select * from r')}`, params);
        return json(rows[0].data);
      }
      await query(del, params);
      return new Response(null, { status: 204 });
    }
    throw new RestError('Method not allowed', 405);
  }

  async function rpc(name, init) {
    const args = init.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : {};
    const entries = Object.entries(args || {});
    entries.forEach(([k]) => ident(k));
    const fn = `public.${ident(name)}`;
    const params = entries.map(([, v]) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v));
    const call = `select * from ${fn}(${entries.map(([k], i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
    const { rows } = await query(call, params);
    const first = rows[0];
    // A function returning one value comes back as that value; one returning rows comes back as rows.
    if (first && Object.keys(first).length === 1 && Object.keys(first)[0] === name) return json(first[name]);
    return json(rows);
  }

  return async function handle(url, init = {}) {
    try {
      const u = new URL(url);
      const path = decodeURIComponent(u.pathname.replace(/^\/rest\/v1\//, ''));
      if (path.startsWith('rpc/')) return await rpc(path.slice(4), init);
      return await run(path, u, init);
    } catch (e) {
      const status = e instanceof RestError ? e.status : (ERROR_STATUS[e?.code] || 400);
      return json({ message: e?.message || 'Request failed', code: e?.code }, status);
    }
  };
}
