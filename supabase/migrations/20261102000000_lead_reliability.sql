-- LOCAL DRAFT only. Additive, transactional; flags/readiness OFF. No sends or backfill alerts.
-- CLI unavailable locally; filename recorded explicitly. Rehearse before separately approved application.
begin;
alter table public.leads add column details_revision integer not null default 0 check(details_revision>=0);
create function public.lead_details_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.timeline,new.occupancy,new.condition_flags,new.desired_outcome) is distinct from row(old.timeline,old.occupancy,old.condition_flags,old.desired_outcome) then new.details_revision:=old.details_revision+1;
 else new.details_revision:=old.details_revision; end if;
 return new;
end $$;
create trigger lead_details_revision before update on public.leads for each row execute function public.lead_details_revision();
create table public.lead_reliability_control(singleton boolean primary key default true check(singleton),enabled boolean not null default false,worker_until timestamptz);
insert into public.lead_reliability_control(singleton) values(true);
create table public.lead_commands(
 request_id uuid primary key, owner_hash text not null check(owner_hash ~ '^[a-f0-9]{64}$'),
 kind text check(kind in ('inquiry','details')),lead_id uuid,intent jsonb,
 state text not null check(state in ('committed','aborted')),result jsonb,created_at timestamptz not null default now()
);
create table public.lead_alert_outbox(
 id uuid primary key default gen_random_uuid(),command_id uuid not null references public.lead_commands(request_id),lead_id uuid not null,
 channel text not null check(channel in ('email','webhook','sms','customer_sms')),target text not null,payload jsonb not null,
 state text not null default 'pending' check(state in ('pending','sending','accepted','uncertain','failed','suppressed')),
 lease uuid,lease_until timestamptz,attempts integer not null default 0,provider_id text,evidence text,
 created_at timestamptz not null default now(),attempted_at timestamptz,unique(command_id,channel,target)
);
create index lead_alert_pending on public.lead_alert_outbox(created_at) where state='pending';
create index lead_alert_expiry on public.lead_alert_outbox(lease_until) where state='sending';
create index lead_alert_command on public.lead_alert_outbox(command_id);
create table public.seller_command_recovery(
 request_id uuid primary key,lead_id uuid not null,state text not null check(state in ('aborted','committed')),
 fingerprint text,result jsonb,created_at timestamptz not null default now()
);
insert into public.seller_command_recovery(request_id,lead_id,state,fingerprint,result)
 select request_id,lead_id,'committed',command->>'request_fingerprint',jsonb_build_object('id',lead_id,'ops_revision',result->'ops_revision') from public.seller_commands;

create function public.lead_command_status(request_id uuid,owner_hash text,fence boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare c public.lead_commands;
begin
 perform pg_advisory_xact_lock(hashtext('hbh-public'),hashtext(request_id::text));
 select * into c from public.lead_commands x where x.request_id=lead_command_status.request_id;
 if found then
  if c.owner_hash<>lead_command_status.owner_hash then raise exception 'unauthorized command' using errcode='42501'; end if;
  return jsonb_build_object('state',c.state,'result',c.result);
 end if;
 if fence then
  insert into public.lead_commands(request_id,owner_hash,state) values(request_id,owner_hash,'aborted');
  return jsonb_build_object('state','aborted');
 end if;
 return jsonb_build_object('state','unresolved');
end $$;

create function public.lead_command_execute(request_id uuid,owner_hash text,kind text,lead_id uuid,intent jsonb,alerts jsonb,allow_new boolean) returns jsonb
language plpgsql set search_path='' as $$
declare c public.lead_commands;l public.leads;r jsonb;a jsonb; expired_at bigint;
begin
 perform pg_advisory_xact_lock(hashtext('hbh-public'),hashtext(request_id::text));
 select * into c from public.lead_commands x where x.request_id=lead_command_execute.request_id;
 if found then
  if c.owner_hash<>lead_command_execute.owner_hash then raise exception 'identity conflict' using errcode='23505'; end if;
  if c.kind is not null and (c.kind<>lead_command_execute.kind or c.lead_id<>lead_command_execute.lead_id or c.intent<>lead_command_execute.intent) then raise exception 'intent conflict' using errcode='23505'; end if;
  return jsonb_build_object('state',c.state,'result',c.result,'replayed',true);
 end if;
 if not allow_new or not exists(select 1 from public.lead_reliability_control where enabled and worker_until>clock_timestamp()) then raise exception 'capture not ready' using errcode='55000'; end if;
 if kind not in ('inquiry','details') or jsonb_typeof(intent)<>'object' or jsonb_typeof(alerts)<>'array' or jsonb_array_length(alerts)=0 then raise exception 'invalid command'; end if;
 if kind='inquiry' then
  if request_id<>lead_id or intent->>'form_type' not in ('standard','options','family_transition') then raise exception 'invalid inquiry'; end if;
  l:=jsonb_populate_record(null::public.leads,intent);
  -- Explicit public field allowlist; all operational fields retain database defaults.
  insert into public.leads(id,address,name,phone,email,first_name,last_name,street,city,zip,situation,timeline,source,utm_source,utm_medium,utm_campaign,utm_term,utm_content,gclid,gbraid,wbraid,ref_partner,landing_page,referrer,form_type,relationship,help_needed,contact_pref,route_interest,location_interest,page_type,consent_response,consent_marketing,consent_at,channel)
  values(lead_id,l.address,l.name,l.phone,l.email,l.first_name,l.last_name,l.street,l.city,l.zip,l.situation,l.timeline,l.source,l.utm_source,l.utm_medium,l.utm_campaign,l.utm_term,l.utm_content,l.gclid,l.gbraid,l.wbraid,l.ref_partner,l.landing_page,l.referrer,l.form_type,l.relationship,l.help_needed,l.contact_pref,l.route_interest,l.location_interest,l.page_type,l.consent_response,l.consent_marketing,case when l.consent_response or l.consent_marketing then now() end,l.channel) returning * into l;
  expired_at:=floor(extract(epoch from l.created_at)*1000)::bigint+21600000;
  r:=jsonb_build_object('id',l.id,'details_revision',l.details_revision,'phone',l.phone,'address',l.address,'details_expires_at',expired_at);
 else
  select * into l from public.leads x where x.id=lead_command_execute.lead_id for update;
  if not found or l.deleted_at is not null or l.status='spam' or l.do_not_contact or l.form_type='harbison_standard' or l.intake_kind<>'inquiry' or l.created_at<now()-interval '6 hours' then
   r:=jsonb_build_object('code','INELIGIBLE');
  elsif l.details_revision<>(intent->>'expected_revision')::integer then r:=jsonb_build_object('code','STALE');
  else
   update public.leads set timeline=coalesce(nullif(intent->>'timeline',''),l.timeline),occupancy=nullif(intent->>'occupancy',''),condition_flags=case when jsonb_array_length(intent->'condition_flags')>0 then array(select jsonb_array_elements_text(intent->'condition_flags')) end,desired_outcome=nullif(intent->>'desired_outcome','') where id=l.id returning * into l;
   r:=jsonb_build_object('id',l.id,'details_revision',l.details_revision);
  end if;
 end if;
 insert into public.lead_commands(request_id,owner_hash,kind,lead_id,intent,state,result)
 values(request_id,owner_hash,kind,lead_id,intent,case when r ? 'code' then 'aborted' else 'committed' end,r);
 if not (r ? 'code') then
  for a in select value from jsonb_array_elements(alerts) loop
   insert into public.lead_alert_outbox(command_id,lead_id,channel,target,payload) values(request_id,lead_id,a->>'channel',a->>'target',a->'payload');
  end loop;
 end if;
 return jsonb_build_object('state',case when r ? 'code' then 'aborted' else 'committed' end,'result',r,'replayed',false);
end $$;

create function public.lead_worker_heartbeat() returns boolean language sql set search_path='' as $$
 update public.lead_reliability_control set worker_until=case when exists(select 1 from public.lead_alert_outbox where state='failed' and evidence='Configuration unavailable before external call') then null else clock_timestamp()+interval '5 minutes' end where singleton returning worker_until is not null;
$$;
create function public.lead_claim_alert() returns setof public.lead_alert_outbox language plpgsql set search_path='' as $$
declare j public.lead_alert_outbox;l public.leads;
begin
 update public.lead_alert_outbox set state='uncertain',evidence='Expired lease; reconcile provider evidence',lease=null,lease_until=null where state='sending' and lease_until<=clock_timestamp();
 select * into j from public.lead_alert_outbox where state='pending' order by created_at,id limit 1 for update skip locked;
 if not found then return; end if;
 select * into l from public.leads where id=j.lead_id for update;
 if not found or l.deleted_at is not null or l.status='spam' or l.do_not_contact or (j.channel='customer_sms' and (not coalesce(l.consent_response,false) or l.contact_pref='Email')) then
  update public.lead_alert_outbox set state='suppressed' where id=j.id; return;
 end if;
 return query update public.lead_alert_outbox set state='sending',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1,attempted_at=clock_timestamp() where id=j.id returning *;
end $$;
create function public.lead_finish_alert(job_id uuid,lease uuid,state text,provider_id text) returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 if state not in ('accepted','uncertain','failed') or (state='accepted' and coalesce(length(provider_id),0)=0) then raise exception 'invalid completion'; end if;
 update public.lead_alert_outbox o set state=lead_finish_alert.state,provider_id=lead_finish_alert.provider_id,lease=null,lease_until=null where o.id=job_id and o.lease=lead_finish_alert.lease and o.state='sending' and o.lease_until>clock_timestamp();
 get diagnostics n=row_count;return n=1;
end $$;
create function public.lead_release_alert(job_id uuid,lease uuid) returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 update public.lead_alert_outbox o set state='failed',lease=null,lease_until=null,evidence='Configuration unavailable before external call' where o.id=job_id and o.lease=lead_release_alert.lease and o.state='sending' and o.lease_until>clock_timestamp();
 get diagnostics n=row_count;
 if n=1 then update public.lead_reliability_control set worker_until=null where singleton; end if;
 return n=1;
end $$;
create function public.lead_reconcile_alert(job_id uuid,decision text,evidence text) returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
 if decision not in ('accepted','pending') or coalesce(length(trim(evidence)),0)<10 then raise exception 'evidence required'; end if;
 update public.lead_alert_outbox o set state=decision,evidence=lead_reconcile_alert.evidence,provider_id=case when decision='accepted' then 'manual-evidence' end where o.id=job_id and o.state in ('uncertain','failed');
 get diagnostics n=row_count;return n=1;
end $$;

create function public.seller_command_status(request_id uuid,lead_id uuid,fence boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare c public.seller_command_recovery;p public.seller_commands;
begin
 perform pg_advisory_xact_lock(hashtext('hbh-seller'),hashtext(request_id::text));
 select * into c from public.seller_command_recovery x where x.request_id=seller_command_status.request_id;
 if found then
  if c.lead_id<>seller_command_status.lead_id then raise exception 'identity conflict' using errcode='23505'; end if;
  return jsonb_build_object('state',c.state,'result',c.result);
 end if;
 select * into p from public.seller_commands x where x.request_id=seller_command_status.request_id;
 if found then
  if p.lead_id<>seller_command_status.lead_id then raise exception 'identity conflict' using errcode='23505'; end if;
  return jsonb_build_object('state','committed','result',jsonb_build_object('id',p.lead_id,'ops_revision',p.result->'ops_revision'));
 end if;
 if fence then
  insert into public.seller_command_recovery(request_id,lead_id,state) values(request_id,lead_id,'aborted');
  return jsonb_build_object('state','aborted');
 end if;
 return jsonb_build_object('state','unresolved');
end $$;
create function public.seller_workflow_reliable(command jsonb,actor_name text) returns jsonb language plpgsql set search_path='' as $$
declare c public.seller_command_recovery;r jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('hbh-seller'),hashtext(((command->>'request_id')::uuid)::text));
 select * into c from public.seller_command_recovery where request_id=(command->>'request_id')::uuid;
 if found then
  if c.lead_id<>(command->>'id')::uuid or c.state='aborted' or c.fingerprint is distinct from command->>'request_fingerprint' then raise exception 'identity conflict' using errcode='23505'; end if;
  return c.result;
 end if;
 r:=public.seller_workflow(command,actor_name);
 r:=jsonb_build_object('id',r->'id','ops_revision',r->'ops_revision');
 -- seller_preserve_outcome writes and validates durable terminal evidence atomically.
 return r;
end $$;
-- Preserve all future legacy terminal outcomes too; deletion can never erase committed evidence.
create function public.seller_preserve_outcome() returns trigger language plpgsql set search_path='' as $$
declare prior public.seller_command_recovery;
begin
 perform pg_advisory_xact_lock(hashtext('hbh-seller'),hashtext(new.request_id::text));
 select * into prior from public.seller_command_recovery where request_id=new.request_id;
 if found and (prior.state<>'committed' or prior.lead_id<>new.lead_id or prior.fingerprint is distinct from new.command->>'request_fingerprint') then raise exception 'conflicting terminal evidence' using errcode='23505'; end if;
 insert into public.seller_command_recovery(request_id,lead_id,state,fingerprint,result) values(new.request_id,new.lead_id,'committed',new.command->>'request_fingerprint',jsonb_build_object('id',new.lead_id,'ops_revision',new.result->'ops_revision')) on conflict(request_id) do nothing;
 return new;
end $$;
create trigger seller_preserve_outcome after insert on public.seller_commands for each row execute function public.seller_preserve_outcome();
-- Terminal evidence conflicts abort the entire workflow transaction, including legacy callers.

alter table public.lead_reliability_control enable row level security;
alter table public.lead_commands enable row level security;
alter table public.lead_alert_outbox enable row level security;
alter table public.seller_command_recovery enable row level security;
revoke all on public.lead_reliability_control,public.lead_commands,public.lead_alert_outbox,public.seller_command_recovery from public,anon,authenticated;
grant select,insert,update on public.lead_reliability_control,public.lead_commands,public.lead_alert_outbox,public.seller_command_recovery to service_role;
revoke execute on function public.lead_details_revision(),public.lead_command_status(uuid,text,boolean),public.lead_command_execute(uuid,text,text,uuid,jsonb,jsonb,boolean),public.lead_worker_heartbeat(),public.lead_claim_alert(),public.lead_finish_alert(uuid,uuid,text,text),public.lead_release_alert(uuid,uuid),public.lead_reconcile_alert(uuid,text,text),public.seller_command_status(uuid,uuid,boolean),public.seller_workflow_reliable(jsonb,text),public.seller_preserve_outcome() from public,anon,authenticated;
grant execute on function public.lead_details_revision(),public.lead_command_status(uuid,text,boolean),public.lead_command_execute(uuid,text,text,uuid,jsonb,jsonb,boolean),public.lead_worker_heartbeat(),public.lead_claim_alert(),public.lead_finish_alert(uuid,uuid,text,text),public.lead_release_alert(uuid,uuid),public.lead_reconcile_alert(uuid,text,text),public.seller_command_status(uuid,uuid,boolean),public.seller_workflow_reliable(jsonb,text),public.seller_preserve_outcome() to service_role;
commit;
