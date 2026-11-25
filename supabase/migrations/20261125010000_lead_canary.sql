-- Additive canary marker. Apply to the configured HBH lead database before enabling the cron.
alter table public.leads add column if not exists is_test boolean not null default false;
create index if not exists leads_real_created_at_idx on public.leads(created_at desc) where is_test = false;

-- Test records cannot enter the seller notification queue.
create or replace function public.seller_enqueue_inquiry() returns trigger language plpgsql set search_path='' as $$
begin
 if not new.is_test and new.status='new' and new.intake_kind='inquiry' and new.notification_mode='durable' then
  insert into public.notification_outbox(lead_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;

create or replace view public.v_funnel with (security_invoker = true) as
select date_trunc('month', created_at)::date as month, coalesce(channel, 'unknown') as channel,
 count(*) filter (where status <> 'spam') as leads,
 count(*) filter (where status in ('qualified','appointment_set','property_reviewed','options_presented','under_contract','closed_won')) as qualified,
 count(*) filter (where appointment_at is not null) as appointments,
 count(*) filter (where offer_amount is not null) as offers,
 count(*) filter (where status = 'under_contract') as under_contract,
 count(*) filter (where status = 'closed_won') as closed,
 count(*) filter (where status = 'closed_won' and outcome_path = 'direct_purchase') as purchases,
 count(*) filter (where status = 'closed_won' and outcome_path = 'listing') as listings,
 coalesce(sum(gross_profit) filter (where status = 'closed_won'), 0) as gross_profit,
 percentile_cont(0.5) within group (order by extract(epoch from (first_contact_at - created_at)) / 60)
   filter (where first_contact_at is not null) as median_minutes_to_contact
from public.leads l where deleted_at is null and not is_test group by 1, 2;

create or replace view public.v_partner_results with (security_invoker = true) as
select p.slug, p.name, p.category, p.status,
 count(l.id) as inquiries,
 count(l.id) filter (where l.appointment_at is not null) as appointments,
 count(l.id) filter (where l.status = 'closed_won') as closed,
 coalesce(sum(l.gross_profit) filter (where l.status = 'closed_won'), 0) as gross_profit
from public.partners p
left join public.leads l on l.ref_partner = p.slug and l.deleted_at is null and not l.is_test
group by p.slug, p.name, p.category, p.status;

create or replace view public.v_routes with (security_invoker = true) as
select date_trunc('month', created_at)::date as month,
 coalesce(route_interest, 'none') as route_interest,
 coalesce(outcome_path, 'open') as outcome_path,
 count(*) filter (where status <> 'spam') as leads,
 count(*) filter (where status = 'closed_won') as closed
from public.leads where deleted_at is null and not is_test group by 1, 2, 3;

create or replace view public.v_uncontacted with (security_invoker = true) as
select id, created_at, name, phone, address, channel, ref_partner,
 round(extract(epoch from (now() - created_at)) / 60) as minutes_waiting,
 email, situation, form_type, do_not_contact
from public.leads
where status = 'new' and coalesce(do_not_contact, false) = false
 and created_at < now() - interval '5 minutes' and deleted_at is null and not is_test
order by created_at;
