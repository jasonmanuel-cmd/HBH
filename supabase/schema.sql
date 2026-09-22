-- Run in the Supabase SQL editor to create the leads table used by /api/leads.
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  address       text not null,
  name          text not null,
  phone         text not null,
  email         text,
  situation     text,
  timeline      text,
  source        text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  status        text not null default 'new'
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

-- Lock the table down: only the service role key (used server-side by the API) can read/write.
alter table public.leads enable row level security;
