create table if not exists public.hbh_analytics_pages (
  site text not null check (site in ('call_harbison', 'harbison_standard')),
  session_id uuid not null,
  page_token uuid not null,
  path text not null,
  first_seen timestamptz not null default now(),
  viewed boolean not null default false,
  duration_seconds integer not null default 0 check (duration_seconds between 0 and 1800),
  referrer_type text check (referrer_type in ('direct', 'search', 'social', 'referral')),
  primary key (site, session_id, page_token)
);
create index if not exists hbh_analytics_pages_site_date on public.hbh_analytics_pages (site, first_seen);
alter table public.hbh_analytics_pages enable row level security;
revoke all on public.hbh_analytics_pages from public, anon, authenticated;
