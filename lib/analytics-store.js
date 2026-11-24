import { neon } from '@neondatabase/serverless';

export function analyticsSql(env) {
  if (!env.DATABASE_URL) throw Object.assign(new Error('Analytics database missing'), { code: 'DB_NOT_CONFIGURED' });
  return neon(env.DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
}

export async function storePage(sql, { site, sid, token, path, type, duration, referrer }) {
  await sql`
    insert into public.hbh_analytics_pages (site, session_id, page_token, path, viewed, duration_seconds, referrer_type)
    values (${site}, ${sid}, ${token}, ${path}, ${type === 'pageview'}, ${duration}, ${referrer})
    on conflict (site, session_id, page_token) do update set
      viewed = hbh_analytics_pages.viewed or excluded.viewed,
      duration_seconds = greatest(hbh_analytics_pages.duration_seconds, excluded.duration_seconds),
      referrer_type = coalesce(hbh_analytics_pages.referrer_type, excluded.referrer_type)
  `;
}

export async function readAnalytics(sql, site, days) {
  const rows = await sql`
    select session_id, path, first_seen::text as first_seen, duration_seconds, referrer_type
    from public.hbh_analytics_pages
    where site = ${site} and viewed
      and first_seen >= ((now() at time zone 'UTC')::date - (${days}::int - 1))::timestamp at time zone 'UTC'
    order by first_seen, page_token
  `;
  const sessions = new Map();
  const daily = new Map(Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10);
    return [day, { day, sessions: 0, pageViews: 0, duration: 0 }];
  }));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
  const tally = (items) => {
    const counts = new Map();
    for (const key of items) if (key) counts.set(key, (counts.get(key) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([key, value]) => ({ key, value }));
  };
  for (const row of rows) {
    const date = new Date(row.first_seen);
    const day = daily.get(date.toISOString().slice(0, 10));
    let session = sessions.get(row.session_id);
    if (!session) {
      session = { entry: row.path, exit: row.path, duration: 0, referrer: row.referrer_type };
      sessions.set(row.session_id, session);
      if (day) day.sessions++;
      hourly[date.getUTCHours()].value++;
    }
    session.exit = row.path;
    session.duration += row.duration_seconds;
    if (day) { day.pageViews++; day.duration += row.duration_seconds; }
  }
  const items = [...sessions.values()];
  const durations = items.map(s => s.duration).sort((a, b) => a - b);
  const total = durations.reduce((sum, value) => sum + value, 0);
  const n = items.length;
  return {
    site, days, daily: [...daily.values()], hourlyUtc: hourly,
    source: 'Recorded first-party page views stored in Neon. Historical Supabase data is separate. Cross-session visitor estimates are unavailable.',
    totals: { sessions: n, pageViews: rows.length, totalDurationSeconds: total,
      avgDurationSeconds: n ? Math.round(total / n) : 0,
      medianDurationSeconds: n ? Math.round((durations[Math.floor((n - 1) / 2)] + durations[Math.floor(n / 2)]) / 2) : 0,
      pagesPerSession: n ? Number((rows.length / n).toFixed(2)) : 0 },
    topPages: tally(rows.map(r => r.path)), entryPages: tally(items.map(r => r.entry)),
    exitPages: tally(items.map(r => r.exit)), referrers: tally(items.map(r => r.referrer)),
  };
}
