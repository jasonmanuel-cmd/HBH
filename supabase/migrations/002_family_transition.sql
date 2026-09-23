-- 002 — Family Property Transition funnel: attribution, pipeline, partners, activity log, dashboard views.
-- Run after schema.sql, in the Supabase SQL editor. Safe to re-run.

-- ---------- 1. Attribution + qualification columns on leads ----------
alter table public.leads
  add column if not exists utm_term        text,
  add column if not exists utm_content     text,
  add column if not exists gclid           text,
  add column if not exists gbraid          text,
  add column if not exists wbraid          text,
  add column if not exists ref_partner     text,
  add column if not exists landing_page    text,
  add column if not exists referrer        text,
  add column if not exists channel         text,           -- google_ads | partner | youtube | organic | social | ai_search | direct ...
  add column if not exists form_type       text default 'standard',
  add column if not exists relationship    text,           -- owner / POA / trustee / executor / conservator ...
  add column if not exists help_needed     text,
  add column if not exists contact_pref    text,
  -- pipeline (worked by the team, not the form)
  add column if not exists assigned_to     text default 'nathanael',
  add column if not exists first_contact_at timestamptz,
  add column if not exists next_followup   timestamptz,
  add column if not exists appointment_at  timestamptz,
  add column if not exists authority_confirmed boolean default false,  -- signer has legal authority (title/POA/trust/court)
  add column if not exists estimated_value numeric(12,2),
  add column if not exists offer_amount    numeric(12,2),
  add column if not exists outcome_path    text,           -- direct_purchase | listing | referral_out | none
  add column if not exists closed_value    numeric(12,2),  -- purchase price or listing sale price
  add column if not exists gross_profit    numeric(12,2),  -- spread or commission actually earned
  add column if not exists closed_at       timestamptz,
  add column if not exists lost_reason     text,
  add column if not exists notes           text,
  add column if not exists updated_at      timestamptz not null default now();

-- Pipeline stages. Drop + re-add so the constraint can be revised later.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status in (
  'new', 'contact_attempted', 'connected', 'qualified', 'appointment_set', 'property_reviewed',
  'options_presented', 'nurture', 'under_contract', 'closed_won', 'closed_lost', 'not_a_fit', 'spam'
));

create index if not exists leads_status_idx   on public.leads (status);
create index if not exists leads_channel_idx  on public.leads (channel, created_at desc);
create index if not exists leads_partner_idx  on public.leads (ref_partner) where ref_partner is not null;
create index if not exists leads_followup_idx on public.leads (next_followup) where next_followup is not null;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- ---------- 2. Referral partners (resource relationships — NO referral fees, see docs) ----------
create table if not exists public.partners (
  slug          text primary key,                    -- matches ?ref= value, e.g. 'rosewood'
  name          text not null,
  category      text not null,                        -- placement | senior_community | estate_sale | fiduciary | elder_law | move_manager | other
  contact_name  text,
  contact_phone text,
  contact_email text,
  status        text not null default 'prospect' check (status in ('prospect','contacted','meeting_set','active','paused','declined')),
  last_touch_at timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);
alter table public.partners enable row level security;

insert into public.partners (slug, name, category) values
  ('aroundtheclock', 'Around the Clock (senior placement)', 'placement'),
  ('rosewood',       'Rosewood',                            'senior_community'),
  ('besp',           'Bakersfield Estate Sale Professionals','estate_sale'),
  ('kernfiduciary',  'Kern Fiduciary Services',              'fiduciary'),
  ('botti',          'Botti Law Group',                      'elder_law'),
  ('cem',            'Complete Estate Management',           'estate_sale')
on conflict (slug) do nothing;

-- ---------- 3. Activity log (calls, texts, status changes) ----------
create table if not exists public.lead_events (
  id         bigserial primary key,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  at         timestamptz not null default now(),
  kind       text not null,          -- call | text | email | status_change | note | appointment | offer
  detail     text,
  actor      text
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, at desc);
alter table public.lead_events enable row level security;

-- Log status changes + first contact automatically.
create or replace function public.log_status_change() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, kind, detail) values (new.id, 'status_change', old.status || ' → ' || new.status);
    if old.status = 'new' and new.first_contact_at is null then new.first_contact_at = now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_status_log on public.leads;
create trigger leads_status_log before update on public.leads for each row execute function public.log_status_change();

-- ---------- 4. Monthly ad spend (entered by hand or synced) ----------
create table if not exists public.ad_spend (
  month    date not null,               -- first of month
  channel  text not null,               -- google_ads | ...
  campaign text not null default 'all',
  spend    numeric(10,2) not null,
  primary key (month, channel, campaign)
);
alter table public.ad_spend enable row level security;

-- ---------- 5. Dashboard views ----------
-- Funnel by channel and month: the numbers the 60-day test is judged on.
create or replace view public.v_funnel as
select
  date_trunc('month', l.created_at)::date                                         as month,
  coalesce(l.channel, 'unknown')                                                  as channel,
  count(*) filter (where l.status <> 'spam')                                      as leads,
  count(*) filter (where l.status in ('qualified','appointment_set','property_reviewed','options_presented','under_contract','closed_won')) as qualified,
  count(*) filter (where l.appointment_at is not null)                            as appointments,
  count(*) filter (where l.offer_amount is not null)                              as offers,
  count(*) filter (where l.status = 'under_contract')                             as under_contract,
  count(*) filter (where l.status = 'closed_won')                                 as closed,
  count(*) filter (where l.status = 'closed_won' and l.outcome_path = 'direct_purchase') as purchases,
  count(*) filter (where l.status = 'closed_won' and l.outcome_path = 'listing')  as listings,
  coalesce(sum(l.gross_profit) filter (where l.status = 'closed_won'), 0)         as gross_profit,
  percentile_cont(0.5) within group (order by extract(epoch from (l.first_contact_at - l.created_at)) / 60)
    filter (where l.first_contact_at is not null)                                 as median_minutes_to_contact
from public.leads l
group by 1, 2;

-- Cost per stage, joined to spend.
create or replace view public.v_cost_per_stage as
select f.*, s.spend,
  round(s.spend / nullif(f.leads, 0), 2)        as cost_per_lead,
  round(s.spend / nullif(f.qualified, 0), 2)    as cost_per_qualified,
  round(s.spend / nullif(f.appointments, 0), 2) as cost_per_appointment,
  round(s.spend / nullif(f.closed, 0), 2)       as cost_per_acquisition,
  round(f.gross_profit / nullif(s.spend, 0), 2) as roas
from public.v_funnel f
left join (select month, channel, sum(spend) spend from public.ad_spend group by 1, 2) s using (month, channel);

-- Partner scoreboard.
create or replace view public.v_partner_results as
select p.slug, p.name, p.category, p.status,
  count(l.id)                                          as inquiries,
  count(l.id) filter (where l.appointment_at is not null) as appointments,
  count(l.id) filter (where l.status = 'closed_won')   as closed,
  coalesce(sum(l.gross_profit) filter (where l.status = 'closed_won'), 0) as gross_profit
from public.partners p
left join public.leads l on l.ref_partner = p.slug
group by 1, 2, 3, 4;

-- Leads nobody has touched in 5+ minutes — the speed-to-lead alarm.
create or replace view public.v_uncontacted as
select id, created_at, name, phone, address, channel, ref_partner,
  round(extract(epoch from (now() - created_at)) / 60) as minutes_waiting
from public.leads
where status = 'new' and created_at < now() - interval '5 minutes'
order by created_at;

-- Views run with the caller's permissions, so RLS on the base tables still applies.
alter view public.v_funnel set (security_invoker = true);
alter view public.v_cost_per_stage set (security_invoker = true);
alter view public.v_partner_results set (security_invoker = true);
alter view public.v_uncontacted set (security_invoker = true);
