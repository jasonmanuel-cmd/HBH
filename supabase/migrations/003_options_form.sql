-- 003 — Progressive "options" form (site playbook §4, §10): split name/address, route + location interest,
-- separate transactional vs. marketing consent, and the optional thank-you-page details.
-- Run after 002, in the Supabase SQL editor. Safe to re-run.

alter table public.leads
  add column if not exists first_name        text,
  add column if not exists last_name         text,
  add column if not exists street            text,
  add column if not exists city              text,
  add column if not exists zip               text,
  add column if not exists route_interest    text,   -- direct | listing | renovate | development | not_ready
  add column if not exists location_interest text,   -- area slug, e.g. bakersfield
  add column if not exists page_type         text,   -- home | situation | location | guide | contact ...
  add column if not exists consent_response  boolean not null default false,  -- may contact about this property
  add column if not exists consent_marketing boolean not null default false,  -- separate, optional
  add column if not exists consent_at        timestamptz,
  add column if not exists occupancy         text,
  add column if not exists condition_flags   text[],
  add column if not exists desired_outcome   text,
  add column if not exists do_not_contact    boolean not null default false;

create index if not exists leads_route_idx    on public.leads (route_interest) where route_interest is not null;
create index if not exists leads_location_idx on public.leads (location_interest) where location_interest is not null;

-- Route chosen vs. route asked about — the playbook's "percentage routed to non-acquisition solutions".
create or replace view public.v_routes as
select
  date_trunc('month', created_at)::date                 as month,
  coalesce(route_interest, 'none')                       as route_interest,
  coalesce(outcome_path, 'open')                         as outcome_path,
  count(*) filter (where status <> 'spam')               as leads,
  count(*) filter (where status = 'closed_won')          as closed
from public.leads
group by 1, 2, 3;
alter view public.v_routes set (security_invoker = true);
