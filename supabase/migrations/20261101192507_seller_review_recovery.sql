-- Recovery corrections; additive, no lead deletion or outbound dispatch. Apply after seller_operations.
begin;
alter table public.research_records add column source_sequence bigint;
-- Preserve ambiguity in pre-existing equal-time history: tied versions cannot be verified/linked.
with ordered as (select id,dense_rank() over(partition by record_key order by created_at) as ordinal from public.research_records)
update public.research_records r set source_sequence=o.ordinal from ordered o where o.id=r.id;
alter table public.research_records alter column source_sequence set not null;
create index research_source_order on public.research_records(record_key,source_sequence desc);
create or replace function public.seller_import(records jsonb, actor_name text) returns integer
language plpgsql set search_path='' as $$
declare r jsonb; inserted integer := 0; count_insert integer; lock_key integer; next_sequence bigint;
begin
 if jsonb_array_length(records) > 100 then raise exception 'batch too large'; end if;
 for lock_key in select distinct hashtext(value->>'record_key') from jsonb_array_elements(records) order by 1 loop
  perform pg_advisory_xact_lock(lock_key);
 end loop;
 for r in select * from jsonb_array_elements(records) loop
  select coalesce(max(source_sequence),0)+1 into next_sequence from public.research_records where record_key=(r->>'record_key')::uuid;
  insert into public.research_records(id,record_key,source_system,source_record_id,source_url,source_date,jurisdiction,apn,address,assertions,conflicts,hold_reasons,source_sequence)
  values ((r->>'id')::uuid,(r->>'record_key')::uuid,r->>'source_system',r->>'source_record_id',r->>'source_url',(r->>'source_date')::date,r->>'jurisdiction',r->>'apn',r->>'address',r->'assertions',r->'conflicts',r->'hold_reasons',next_sequence) on conflict(id) do nothing;
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
create or replace function public.seller_review(command jsonb, actor_name text) returns jsonb
language plpgsql set search_path='' as $$
declare r public.research_records;
begin
 perform pg_advisory_xact_lock(hashtext(record_key::text)) from public.research_records where id=(command->>'id')::uuid;
 select * into r from public.research_records where id=(command->>'id')::uuid for update;
 if not found or r.revision<>(command->>'revision')::integer then raise exception 'stale revision' using errcode='40001'; end if;
 if command->>'verification_state'='verified_facts' and exists(select 1 from public.research_records newer where newer.record_key=r.record_key and newer.id<>r.id and newer.source_sequence>=r.source_sequence) then raise exception 'newer or ambiguous source revision'; end if;
 if command->>'verification_state'='verified_facts' and (r.apn is null or r.jurisdiction is null or jsonb_array_length(r.conflicts)>0) then raise exception 'unresolved facts or conflicts'; end if;
 update public.research_records set verification_state=command->>'verification_state',hold_reasons=command->'hold_reasons',revision=revision+1,reviewed_by=actor_name,reviewed_at=now() where id=r.id returning * into r;
 insert into public.research_audit(record_id,actor,action,evidence,snapshot) values(r.id,actor_name,'review',command->>'evidence',to_jsonb(r));
 return to_jsonb(r);
end $$;
create or replace function public.seller_link(command jsonb, actor_name text) returns jsonb
language plpgsql set search_path='' as $$
declare r public.research_records; l public.leads;
begin
 perform pg_advisory_xact_lock(hashtext(record_key::text)) from public.research_records where id=(command->>'id')::uuid;
 select * into r from public.research_records where id=(command->>'id')::uuid for update;
 if not found or r.revision<>(command->>'revision')::integer or r.verification_state<>'verified_facts' or exists(select 1 from public.research_records newer where newer.record_key=r.record_key and newer.id<>r.id and newer.source_sequence>=r.source_sequence) then raise exception 'review required or stale'; end if;
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
commit;
