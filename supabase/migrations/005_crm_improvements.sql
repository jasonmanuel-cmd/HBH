-- 005 — CRM speed-to-lead accuracy and uncontacted queue refinements.
-- Optional enhancement: API code also enforces these rules at the application layer.
-- Safe to re-run in the Supabase SQL editor.

-- Do not stamp first_contact_at when disqualifying a lead directly from 'new' to 'spam' or 'not_a_fit'.
create or replace function public.log_status_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, kind, detail)
    values (new.id, 'status_change', old.status || ' → ' || new.status);
    if old.status = 'new' and new.status not in ('spam', 'not_a_fit') and new.first_contact_at is null then
      new.first_contact_at = now();
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.log_status_change() from public, anon, authenticated;

-- Exclude opt-outs from the uncontacted speed-to-lead alarm and include brand/contact context.
create or replace view public.v_uncontacted as
select id, created_at, name, phone, address, channel, ref_partner,
  round(extract(epoch from (now() - created_at)) / 60) as minutes_waiting,
  email, situation, form_type, do_not_contact
from public.leads
where status = 'new'
  and coalesce(do_not_contact, false) = false
  and created_at < now() - interval '5 minutes'
order by created_at;

alter view public.v_uncontacted set (security_invoker = true);
