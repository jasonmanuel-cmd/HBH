-- Apply as the owner of an Apollo-only database; point APOLLO_DATABASE_URL
-- at an app role with USAGE on apollo and SELECT/INSERT on apollo.revisions.
-- Neither the migration nor the runtime code reads or writes CRM tables.
create schema if not exists apollo;
revoke all on schema apollo from public;
create table if not exists apollo.revisions (
  revision integer primary key check (revision > 0),
  destination text check (length(destination) <= 2048),
  video text check (video ~ '^[A-Za-z0-9_-]{11}$'),
  actor_label text not null check (length(actor_label) between 1 and 40),
  changed_at timestamptz not null default now()
);
