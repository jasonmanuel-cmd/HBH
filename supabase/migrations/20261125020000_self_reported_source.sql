-- Post-submission attribution. Passive source and channel remain unchanged.
alter table public.leads add column if not exists self_reported_source text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'leads_self_reported_source_valid') then
    alter table public.leads add constraint leads_self_reported_source_valid
      check (self_reported_source is null or self_reported_source in
        ('Google Search', 'Google Maps', 'YouTube', 'Facebook/Instagram', 'Referral', 'Mail/Sign', 'Other'));
  end if;
end $$;
