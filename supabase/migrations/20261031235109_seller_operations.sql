-- DRAFT: apply only to isolated development database until rollout approved.
-- All RPCs are invoker functions restricted to service_role; browser roles have no access.
begin;
alter table public.leads
 add column if not exists consent_provenance jsonb,
 add column if not exists intake_kind text not null default 'inquiry',
 add column if not exists notification_mode text not null default 'legacy' check (notification_mode in ('legacy','durable')),
 add column if not exists ops_revision integer not null default 0,
 add column if not exists qualification jsonb,
 add column if not exists conversation_at timestamptz,
 add column if not exists qualified_at timestamptz,
 add column if not exists handoff_at timestamptz,
 add column if not exists response_evidence_at timestamptz,
 add column if not exists appointment_result text check (appointment_result in ('booked','kept','cancelled','no_show'));

-- Reconcile fresh installs and previously applied 005/006 view variants without dropping columns.
create or replace view public.v_uncontacted with (security_invoker=true) as
select id,created_at,name,phone,address,channel,ref_partner,
 round(extract(epoch from (now()-created_at))/60) as minutes_waiting,
 email,situation,form_type,do_not_contact
from public.leads where status='new' and coalesce(do_not_contact,false)=false
 and created_at<now()-interval '5 minutes' and deleted_at is null
order by created_at;

create table public.research_records (
 id uuid primary key, record_key uuid not null, source_system text not null, source_record_id text not null,
 source_url text, source_date date, jurisdiction text, apn text, address text,
 assertions jsonb not null default '[]', conflicts jsonb not null default '[]',
 verification_state text not null default 'hold' check (verification_state in ('hold','verified_facts','rejected')),
 hold_reasons jsonb not null default '[]', revision integer not null default 0,
 reviewed_by text, reviewed_at timestamptz, created_at timestamptz not null default now()
);
create index research_source_history on public.research_records(record_key,created_at desc);
create table public.research_audit (
 id uuid primary key default gen_random_uuid(), record_id uuid not null references public.research_records(id),
 at timestamptz not null default now(), actor text not null, action text not null, evidence text not null,
 snapshot jsonb not null
);
create table public.research_links (
 record_id uuid not null references public.research_records(id), lead_id uuid not null references public.leads(id) on delete cascade,
 at timestamptz not null default now(), actor text not null, evidence text not null, primary key(record_id,lead_id)
);
create table public.seller_commands (
 request_id uuid primary key, lead_id uuid not null references public.leads(id) on delete cascade,
 command jsonb not null, result jsonb not null, at timestamptz not null default now()
);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), lead_id uuid not null unique references public.leads(id) on delete cascade,
 state text not null default 'pending' check (state in ('pending','sending','accepted','failed','uncertain','suppressed')),
 created_at timestamptz not null default now(), attempted_at timestamptz, lease uuid, lease_until timestamptz,
 attempts integer not null default 0, provider_id text, evidence text
);
create index notification_pending on public.notification_outbox(state,created_at);

alter table public.research_records enable row level security;
alter table public.research_audit enable row level security;
alter table public.research_links enable row level security;
alter table public.seller_commands enable row level security;
alter table public.notification_outbox enable row level security;
revoke all on public.research_records, public.research_audit, public.research_links, public.seller_commands, public.notification_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.research_records, public.research_audit, public.research_links, public.seller_commands, public.notification_outbox to service_role;

create function public.seller_import(records jsonb, actor_name text) returns integer
language plpgsql set search_path='' as $$
declare r jsonb; inserted integer := 0; count_insert integer;
begin
 if jsonb_array_length(records) > 100 then raise exception 'batch too large'; end if;
 for r in select * from jsonb_array_elements(records) loop
  perform pg_advisory_xact_lock(hashtext(r->>'record_key'));
  insert into public.research_records(id,record_key,source_system,source_record_id,source_url,source_date,jurisdiction,apn,address,assertions,conflicts,hold_reasons)
  values ((r->>'id')::uuid,(r->>'record_key')::uuid,r->>'source_system',r->>'source_record_id',r->>'source_url',(r->>'source_date')::date,r->>'jurisdiction',r->>'apn',r->>'address',r->'assertions',r->'conflicts',r->'hold_reasons') on conflict(id) do nothing;
  get diagnostics count_insert = row_count;
  if count_insert = 1 then
   with changed as (
    update public.research_records set verification_state='hold',hold_reasons='["New source revision requires renewed review"]',revision=revision+1
    where record_key=(r->>'record_key')::uuid and id<>(r->>'id')::uuid and verification_state='verified_facts' returning *
   ) insert into public.research_audit(record_id,actor,action,evidence,snapshot)
     select id,actor_name,'superseded','New source evidence invalidates prior verification',to_jsonb(changed) from changed;
   insert into public.research_audit(record_id,actor,action,evidence,snapshot) values((r->>'id')::uuid,actor_name,'import','Reviewed import; research only',r);
   inserted := inserted+1;
  end if;
 end loop;
 return inserted;
end $$;

create function public.seller_review(command jsonb, actor_name text) returns jsonb
language plpgsql set search_path='' as $$
declare r public.research_records;
begin
 select * into r from public.research_records where id=(command->>'id')::uuid for update;
 if not found or r.revision<>(command->>'revision')::integer then raise exception 'stale revision' using errcode='40001'; end if;
 if command->>'verification_state'='verified_facts' and (r.apn is null or r.jurisdiction is null or jsonb_array_length(r.conflicts)>0) then raise exception 'unresolved facts or conflicts'; end if;
 update public.research_records set verification_state=command->>'verification_state',hold_reasons=command->'hold_reasons',revision=revision+1,reviewed_by=actor_name,reviewed_at=now() where id=r.id returning * into r;
 insert into public.research_audit(record_id,actor,action,evidence,snapshot) values(r.id,actor_name,'review',command->>'evidence',to_jsonb(r));
 return to_jsonb(r);
end $$;

create function public.seller_link(command jsonb, actor_name text) returns jsonb
language plpgsql set search_path='' as $$
declare r public.research_records; l public.leads;
begin
 select * into r from public.research_records where id=(command->>'id')::uuid for update;
 if not found or r.revision<>(command->>'revision')::integer or r.verification_state<>'verified_facts' or exists(select 1 from public.research_records newer where newer.record_key=r.record_key and newer.created_at>r.created_at) then raise exception 'review required or stale'; end if;
 select * into l from public.leads where id=(command->>'lead_id')::uuid and deleted_at is null for update;
 if not found or l.status='spam' or l.do_not_contact or not coalesce(l.consent_response,false) or l.intake_kind<>'inquiry' then raise exception 'genuine permissioned inquiry required'; end if;
 if r.address is null or length(regexp_replace(lower(r.address),'[^a-z0-9]','','g'))=0
    or regexp_replace(lower(r.address),'[^a-z0-9]','','g')<>regexp_replace(lower(l.address),'[^a-z0-9]','','g')
    or coalesce((command->>'identity_confirmed')::boolean,false)=false then raise exception 'property and requester match required'; end if;
 insert into public.research_links(record_id,lead_id,actor,evidence) values(r.id,l.id,actor_name,command->>'evidence') on conflict do nothing;
 insert into public.research_audit(record_id,actor,action,evidence,snapshot) values(r.id,actor_name,'link',command->>'evidence',command);
 update public.research_records set revision=revision+1 where id=r.id;
 return command;
end $$;

create function public.seller_workflow(command jsonb, actor_name text) returns jsonb
language plpgsql set search_path='' as $$
declare l public.leads; prior public.seller_commands; p jsonb; event_name text; event_time timestamptz:=now();
begin
 select * into l from public.leads where id=(command->>'id')::uuid and deleted_at is null for update;
 if not found then raise exception 'inquiry not found'; end if;
 select * into prior from public.seller_commands where request_id=(seller_workflow.command->>'request_id')::uuid;
 if found then
  if prior.lead_id<>l.id or (prior.command - 'patch')<>(command - 'patch') then raise exception 'request identity conflict'; end if;
  return prior.result;
 end if;
 if l.ops_revision<>(command->>'revision')::integer then raise exception 'stale revision' using errcode='40001'; end if;
 p:=command->'patch'; event_name:=command->>'event';
 if event_name='contact_attempt' and (l.do_not_contact or not coalesce(l.consent_response,false)) then raise exception 'contact suppressed'; end if;
 if event_name='qualify' and (l.do_not_contact or l.conversation_at is null) then raise exception 'conversation required'; end if;
 if event_name='handoff' and (l.do_not_contact or l.qualified_at is null) then raise exception 'qualification required'; end if;
 if event_name='appointment_booked' and (l.do_not_contact or l.handoff_at is null) then raise exception 'handoff required'; end if;
 -- Populate only explicitly allowed workflow columns. Never overwrite consent or original attribution.
 l:=jsonb_populate_record(l,p);
 update public.leads set notification_mode='durable',status=l.status,assigned_to=l.assigned_to,next_followup=l.next_followup,appointment_at=l.appointment_at,
  appointment_result=l.appointment_result,authority_confirmed=l.authority_confirmed,qualification=l.qualification,
  conversation_at=l.conversation_at,qualified_at=l.qualified_at,handoff_at=l.handoff_at,first_contact_at=l.first_contact_at,
  response_evidence_at=case when event_name='contact_attempt' and command->>'result'<>'failed' then coalesce(l.response_evidence_at,event_time) else l.response_evidence_at end,
  consent_response=l.consent_response,consent_provenance=l.consent_provenance,do_not_contact=l.do_not_contact,outcome_path=l.outcome_path,closed_at=l.closed_at,ops_revision=ops_revision+1
 where id=l.id returning * into l;
 insert into public.lead_events(lead_id,kind,detail,actor) values(l.id,event_name,concat(command->>'channel',' ',command->>'result',': ',command->>'detail'),actor_name);
 insert into public.seller_commands(request_id,lead_id,command,result) values((seller_workflow.command->>'request_id')::uuid,l.id,seller_workflow.command,to_jsonb(l));
 return to_jsonb(l);
end $$;

-- Queue insertion is atomic with genuine inquiry insertion, including the authenticated Standard bridge.
-- No backfill: historical records cannot silently become fresh notifications.
create function public.seller_enqueue_inquiry() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='new' and new.intake_kind='inquiry' and new.notification_mode='durable' then
  insert into public.notification_outbox(lead_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger seller_enqueue after insert on public.leads for each row execute function public.seller_enqueue_inquiry();

-- Status moves are not proof of contact. Existing timestamps are retained, but new metrics exclude them.
create or replace function public.log_status_change() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status is distinct from old.status then
  insert into public.lead_events(lead_id,kind,detail) values(new.id,'status_change',old.status||' -> '||new.status);
  if new.notification_mode='legacy' and old.status='new' and new.status not in ('spam','not_a_fit') and new.first_contact_at is null then new.first_contact_at:=now(); end if;
 end if;
 return new;
end $$;
create function public.seller_triage() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='new' and new.intake_kind='inquiry' and new.notification_mode='durable' then new.assigned_to:='jay'; end if;
 return new;
end $$;
create trigger seller_triage before insert on public.leads for each row execute function public.seller_triage();
revoke execute on function public.seller_triage() from public,anon,authenticated;
grant execute on function public.seller_triage() to service_role;
-- Preserve the legacy assigned_to default; durable intake explicitly assigns Jay.

create function public.seller_claim_outbox() returns setof public.notification_outbox
language plpgsql set search_path='' as $$
begin
 -- A crashed worker might have sent: quarantine instead of guessing and duplicating mail.
 update public.notification_outbox set state='uncertain',evidence='Worker lease expired; reconcile with provider before retry',lease=null,lease_until=null where state='sending' and lease_until<now();
 update public.notification_outbox o set state='suppressed' from public.leads l where o.lead_id=l.id and o.state in ('pending','failed') and (l.deleted_at is not null or l.status='spam' or l.do_not_contact);
 return query update public.notification_outbox set state='sending',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempted_at=now(),attempts=attempts+1
 where id in (select id from public.notification_outbox where state='pending' order by created_at for update skip locked limit 1) returning *;
end $$;
create function public.seller_finish_outbox(job_id uuid, lease uuid, state text, provider_id text) returns boolean
language plpgsql set search_path='' as $$
declare changed integer;
begin
 if state not in ('accepted','failed','uncertain') then raise exception 'invalid state'; end if;
 update public.notification_outbox o set state=seller_finish_outbox.state,provider_id=seller_finish_outbox.provider_id,lease=null,lease_until=null
 where o.id=job_id and o.lease=seller_finish_outbox.lease and o.state='sending';
 get diagnostics changed=row_count; return changed=1;
end $$;
create function public.seller_reconcile(job_id uuid, decision text, evidence text, actor_name text) returns boolean
language plpgsql set search_path='' as $$
declare job public.notification_outbox;
begin
 if decision not in ('pending','accepted') or length(evidence)<10 then raise exception 'provider evidence required'; end if;
 select * into job from public.notification_outbox where id=job_id for update;
 if not found or job.state not in ('failed','uncertain') then raise exception 'not recoverable'; end if;
 update public.notification_outbox set state=decision,evidence=actor_name||': '||seller_reconcile.evidence where id=job_id;
 insert into public.lead_events(lead_id,kind,detail,actor) values(job.lead_id,'note','Outbox reconciliation: '||decision||'; '||evidence,actor_name);
 return true;
end $$;

revoke execute on function public.seller_import(jsonb,text),public.seller_review(jsonb,text),public.seller_link(jsonb,text),public.seller_workflow(jsonb,text),public.seller_enqueue_inquiry(),public.seller_claim_outbox(),public.seller_finish_outbox(uuid,uuid,text,text),public.seller_reconcile(uuid,text,text,text),public.log_status_change() from public,anon,authenticated;
grant execute on function public.seller_import(jsonb,text),public.seller_review(jsonb,text),public.seller_link(jsonb,text),public.seller_workflow(jsonb,text),public.seller_enqueue_inquiry(),public.seller_claim_outbox(),public.seller_finish_outbox(uuid,uuid,text,text),public.seller_reconcile(uuid,text,text,text),public.log_status_change() to service_role;
commit;
