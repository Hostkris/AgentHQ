-- Private, revocable OAuth credentials and explicit project handoffs to ChatGPT.
create table public.agent_chatgpt_limits(bucket text primary key,hits integer not null default 1,created_at timestamptz not null default now());
create table public.agent_chatgpt_clients (
 client_id text primary key, redirect_uris jsonb not null, created_at timestamptz not null default now()
);
create table public.agent_chatgpt_authorizations (
 id uuid primary key default gen_random_uuid(), client_id text not null, redirect_uri text not null,
 state text not null check(char_length(state) between 1 and 2048), challenge text not null check(challenge ~ '^[A-Za-z0-9_-]{43}$'),
 resource text not null, scopes text not null, owner_id uuid references auth.users(id) on delete cascade,
 code_hash text unique check(code_hash is null or code_hash ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz, consumed_at timestamptz, expires_at timestamptz not null default now()+interval '10 minutes',
 created_at timestamptz not null default now()
);
create table public.agent_chatgpt_connections (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 client_id text not null, resource text not null, scopes text not null,
 access_hash text not null unique check(access_hash ~ '^[a-f0-9]{64}$'), refresh_hash text not null unique check(refresh_hash ~ '^[a-f0-9]{64}$'),
 access_expires_at timestamptz not null default now()+interval '1 hour', refresh_expires_at timestamptz not null default now()+interval '30 days',
 created_at timestamptz not null default now(), revoked_at timestamptz, last_used_at timestamptz, last_return_at timestamptz
);
create index on public.agent_chatgpt_connections(owner_id,created_at);
create index on public.agent_chatgpt_authorizations(expires_at);
create table public.agent_chatgpt_handoffs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null, assignment_id uuid not null,
 revision integer not null check(revision>0), source_revision integer not null, brief text not null check(char_length(brief) between 5 and 6000),
 status text not null default 'ready' check(status in ('ready','in_progress','returned','cancelled','superseded')),
 claim_id uuid, blocker text not null default '' check(char_length(blocker)<=1000), return_lease uuid, return_lease_until timestamptz, was_paused boolean not null, previous_phase text not null,
 owner_feedback text not null default '' check(char_length(owner_feedback)<=10000), result_hash text, output_version uuid, result_summary text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(assignment_id,owner_id) references public.agent_team_assignments(id,owner_id) on delete cascade
);
create unique index agent_chatgpt_one_open_handoff on public.agent_chatgpt_handoffs(assignment_id) where status in ('ready','in_progress');
create index on public.agent_chatgpt_handoffs(owner_id,created_at);
do $$ declare t text;begin
 foreach t in array array['agent_chatgpt_limits','agent_chatgpt_clients','agent_chatgpt_authorizations','agent_chatgpt_connections','agent_chatgpt_handoffs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy service_only on public.%I to service_role using(true) with check(true)',t);
 end loop;
end $$;


create function public.check_agent_chatgpt_rate(p_bucket text,p_limit integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;begin
 if p_limit not between 1 and 180 or char_length(p_bucket)>100 then return false;end if;
 delete from public.agent_chatgpt_limits where created_at<now()-interval '1 day';
 insert into public.agent_chatgpt_limits(bucket) values(p_bucket) on conflict(bucket) do update set hits=public.agent_chatgpt_limits.hits+1 returning hits into n;
 return n<=p_limit;
end $$;

create function public.exchange_agent_chatgpt_code(p_hash text,p_client text,p_redirect text,p_challenge text,p_resource text,p_access text,p_refresh text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.agent_chatgpt_authorizations; connection_id uuid;begin
 select * into a from public.agent_chatgpt_authorizations where code_hash=p_hash for update;
 if not found or a.approved_at is null or a.consumed_at is not null or a.expires_at<clock_timestamp() or a.owner_id is null
 or a.client_id<>p_client or a.redirect_uri<>p_redirect or a.challenge<>p_challenge or a.resource<>p_resource then raise exception 'Invalid or expired authorization code';end if;
 update public.agent_chatgpt_authorizations set consumed_at=clock_timestamp() where id=a.id;
 insert into public.agent_chatgpt_connections(owner_id,client_id,resource,scopes,access_hash,refresh_hash)
 values(a.owner_id,a.client_id,a.resource,a.scopes,p_access,p_refresh) returning id into connection_id;
 return jsonb_build_object('connection_id',connection_id,'scopes',a.scopes);
end $$;
create function public.refresh_agent_chatgpt_connection(p_hash text,p_client text,p_resource text,p_access text,p_refresh text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.agent_chatgpt_connections;begin
 select * into c from public.agent_chatgpt_connections where refresh_hash=p_hash for update;
 if not found or c.revoked_at is not null or c.refresh_expires_at<clock_timestamp() or c.client_id<>p_client or c.resource<>p_resource then raise exception 'Invalid or expired refresh token';end if;
 update public.agent_chatgpt_connections set access_hash=p_access,refresh_hash=p_refresh,access_expires_at=now()+interval '1 hour' where id=c.id;
 return jsonb_build_object('connection_id',c.id,'scopes',c.scopes);
end $$;
create function public.queue_agent_chatgpt_handoff(p_owner uuid,p_assignment uuid,p_revision integer,p_brief text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.agent_team_assignments; s public.agent_project_sessions; h public.agent_chatgpt_handoffs; hid uuid; paused boolean; rev integer;begin
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found or a.workflow_version<>2 then raise exception 'Project not found';end if;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if not found then raise exception 'Project session not found';end if;
 if s.active_run is not null and s.lease_until>clock_timestamp() then raise exception 'A worker is finishing a step. Try the handoff after that step saves';end if;
 if s.phase='waiting_permission' then raise exception 'Resolve the existing permission request before handing over this project';end if;
 if coalesce(char_length(btrim(p_brief)),0) not between 5 and 6000 then raise exception 'Describe what ChatGPT should make';end if;
 select * into h from public.agent_chatgpt_handoffs where assignment_id=p_assignment and status in ('ready','in_progress') for update;
 if found and h.revision=s.revision and p_revision in (h.revision,h.source_revision) then
  if h.brief<>btrim(p_brief) then raise exception 'Cancel the existing handoff before changing its instructions';end if;
  return jsonb_build_object('handoff_id',h.id,'state',h.status,'revision',h.revision);
 end if;
 if s.revision<>p_revision then raise exception 'The project changed; refresh before handing it over';end if;
 rev:=s.revision+1;
 paused:=case when h.id is not null then h.was_paused else a.owner_paused end;
 if h.id is not null then update public.agent_chatgpt_handoffs set status='superseded',updated_at=now() where id=h.id;end if;
 insert into public.agent_chatgpt_handoffs(owner_id,assignment_id,revision,source_revision,brief,was_paused,previous_phase)
 values(p_owner,p_assignment,rev,p_revision,btrim(p_brief),paused,s.phase) returning id into hid;
 update public.agent_team_assignments set owner_paused=true,updated_at=now() where id=p_assignment;
 if s.active_run is not null then
  update public.agent_worker_runs set status='failed',error_summary='Expired turn replaced by owner-requested ChatGPT handoff.',finished_at=now() where id=s.active_run and owner_id=p_owner and status='running';
 end if;
 update public.agent_project_sessions set revision=rev,phase=case when phase in ('approved','review') then 'drafting' else phase end,review_status='pending',output_version=null,final_output='',active_run=null,active_worker=null,lease_until=null,updated_at=now() where assignment_id=p_assignment;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
 values(p_assignment,p_owner,'agent','alex','reply','The owner prepared a ChatGPT handoff. Internal work is held while ChatGPT makes the requested files. Start the handoff in ChatGPT, then review returned files in Projects.',rev,'discussion');
 return jsonb_build_object('handoff_id',hid,'state','ready','revision',rev);
end $$;
create function public.claim_agent_chatgpt_handoff(p_owner uuid,p_handoff uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.agent_chatgpt_handoffs; rev integer;begin
 select * into h from public.agent_chatgpt_handoffs where id=p_handoff and owner_id=p_owner for update;
 if not found or h.status not in ('ready','in_progress') then raise exception 'This project is not available for a ChatGPT handoff';end if;
 select revision into rev from public.agent_project_sessions where assignment_id=h.assignment_id and owner_id=p_owner;
 if rev<>h.revision then raise exception 'The project changed. Ask the owner to update its handoff in Projects';end if;
 update public.agent_chatgpt_handoffs set status='in_progress',claim_id=coalesce(claim_id,gen_random_uuid()),updated_at=now() where id=h.id returning * into h;
 return to_jsonb(h);
end $$;
create function public.cancel_agent_chatgpt_handoff(p_owner uuid,p_handoff uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.agent_chatgpt_handoffs; a public.agent_team_assignments;begin
 select * into h from public.agent_chatgpt_handoffs where id=p_handoff and owner_id=p_owner;
 if not found then raise exception 'Handoff not found';end if;
 select * into a from public.agent_team_assignments where id=h.assignment_id and owner_id=p_owner for update;
 select * into h from public.agent_chatgpt_handoffs where id=p_handoff and owner_id=p_owner for update;
 if h.status in ('ready','in_progress') then
  update public.agent_chatgpt_handoffs set status='cancelled',updated_at=now() where id=h.id;
  update public.agent_team_assignments set owner_paused=h.was_paused,updated_at=now() where id=h.assignment_id;
 end if;return jsonb_build_object('state','cancelled');
end $$;

create function public.begin_agent_chatgpt_return(p_owner uuid,p_handoff uuid,p_claim uuid,p_revision integer,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.agent_chatgpt_handoffs;begin
 select * into h from public.agent_chatgpt_handoffs where id=p_handoff and owner_id=p_owner for update;
 if not found or h.status<>'in_progress' or h.claim_id is distinct from p_claim or h.revision<>p_revision then raise exception 'Handoff changed';end if;
 if h.return_lease is not null and h.return_lease_until>clock_timestamp() then raise exception 'A file return is already being saved; wait before retrying';end if;
 update public.agent_chatgpt_handoffs set return_lease=p_lease,return_lease_until=now()+interval '4 minutes' where id=h.id;
 return jsonb_build_object('state','saving');
end $$;

-- ChatGPT session handoffs have explicit provenance; never label them Groq model calls.
alter table public.agent_worker_runs drop constraint agent_worker_runs_provider_check;
alter table public.agent_worker_runs add constraint agent_worker_runs_provider_check check(provider in ('groq','openrouter','chatgpt_handoff'));
create function public.finish_agent_chatgpt_handoff(p_owner uuid,p_connection uuid,p_handoff uuid,p_claim uuid,p_revision integer,p_summary text,p_hash text,p_files jsonb,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.agent_chatgpt_handoffs; s public.agent_project_sessions; a public.agent_team_assignments; f jsonb; run_id uuid; version uuid:=gen_random_uuid(); idx integer:=0;begin
 select * into h from public.agent_chatgpt_handoffs where id=p_handoff and owner_id=p_owner;
 if not found then raise exception 'Handoff not found';end if;
 select * into a from public.agent_team_assignments where id=h.assignment_id and owner_id=p_owner for update;
 select * into s from public.agent_project_sessions where assignment_id=h.assignment_id and owner_id=p_owner for update;
 select * into h from public.agent_chatgpt_handoffs where id=p_handoff and owner_id=p_owner for update;
 if not exists(select 1 from public.agent_chatgpt_connections where id=p_connection and owner_id=p_owner and revoked_at is null and access_expires_at>clock_timestamp()) then raise exception 'Connection expired or was revoked';end if;
 if h.status='returned' and h.claim_id=p_claim and h.result_hash=p_hash then return jsonb_build_object('state','review','output_version',h.output_version,'duplicate',true);end if;
 if h.status<>'in_progress' or h.claim_id is distinct from p_claim or h.revision<>p_revision or s.revision<>p_revision or not a.owner_paused then raise exception 'The handoff was cancelled, changed, or resumed';end if;
 if s.active_run is not null then raise exception 'An internal worker has resumed this project';end if;
 if h.return_lease is distinct from p_lease or h.return_lease_until<clock_timestamp() then raise exception 'The file return lease expired';end if;
 if coalesce(char_length(btrim(p_summary)),0) not between 40 and 10000 or p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 4 then raise exception 'Return a summary and one to four actual files';end if;
 for f in select * from jsonb_array_elements(p_files) loop
  if (f->>'path') not like p_owner::text||'/'||h.assignment_id::text||'/chatgpt/'||h.id::text||'/%'
   or (f->>'sha256') !~ '^[a-f0-9]{64}$' or (f->>'size_bytes')::integer not between 1 and 5242880
   or (f->>'mime_type') not in ('application/pdf','image/png','image/jpeg','image/webp','text/plain','text/markdown')
   or coalesce(char_length(f->>'filename'),0) not between 1 and 180 then raise exception 'Invalid returned file metadata';end if;
 end loop;
 for f in select * from jsonb_array_elements(p_files) loop
  -- Separate audited runs preserve the existing one-artifact-kind-per-run invariant.
  insert into public.agent_worker_runs(owner_id,assignment_id,employee_id,status,provider,model,result_preview,finished_at)
  values(p_owner,h.assignment_id,'jordan','completed','chatgpt_handoff','ChatGPT session; model not reported','Owner-started ChatGPT file return: '||left(f->>'filename',180),now()) returning id into run_id;
  insert into public.agent_project_artifacts(owner_id,assignment_id,revision,run_id,employee_id,artifact_kind,filename,mime_type,object_path,sha256,source_sha256,size_bytes,status,note)
  values(p_owner,h.assignment_id,p_revision,run_id,'jordan','final',f->>'filename',f->>'mime_type',f->>'path',f->>'sha256',f->>'sha256',(f->>'size_bytes')::integer,'ready','Returned through the owner-started ChatGPT handoff. Review the file contents before final approval.');idx:=idx+1;
 end loop;
 update public.agent_chatgpt_handoffs set status='returned',blocker='',return_lease=null,return_lease_until=null,result_hash=p_hash,output_version=version,result_summary=btrim(p_summary),updated_at=now() where id=h.id;
 update public.agent_chatgpt_connections set last_return_at=now() where id=p_connection and owner_id=p_owner;
 update public.agent_project_sessions set phase='review',lead_worker=coalesce(lead_worker,'jordan'),team_order=case when cardinality(team_order)=0 then array['jordan'] else team_order end,next_worker=coalesce(lead_worker,'jordan'),review_status='pending',shared_draft=btrim(p_summary),final_output=btrim(p_summary),output_version=version,last_error='',recovery_state='idle',updated_at=now() where assignment_id=h.assignment_id;
 update public.agent_team_assignments set owner_paused=h.was_paused,coordination_status='completed',status='in_progress',updated_at=now() where id=h.assignment_id;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
 values(h.assignment_id,p_owner,'agent','alex','reply','ChatGPT returned '||idx||' actual file(s). Open Projects to inspect, download, approve, or request changes. '||left(btrim(p_summary),600),p_revision,'discussion');
 return jsonb_build_object('state','review','output_version',version,'files_saved',idx);
end $$;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('exchange_agent_chatgpt_code','refresh_agent_chatgpt_connection','queue_agent_chatgpt_handoff','claim_agent_chatgpt_handoff','cancel_agent_chatgpt_handoff','finish_agent_chatgpt_handoff','begin_agent_chatgpt_return','check_agent_chatgpt_rate') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;

CREATE OR REPLACE FUNCTION public.review_agent_project(p_owner uuid, p_assignment uuid, p_version uuid, p_decision text, p_feedback text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.agent_project_sessions; a public.agent_team_assignments; cid uuid; label text; h public.agent_chatgpt_handoffs; queued jsonb;
begin
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if not found or s.phase<>'review' or s.output_version is distinct from p_version then raise exception 'This finished version changed or was already reviewed'; end if;
 if p_decision not in ('approve','changes') or p_decision is null then raise exception 'Invalid project decision'; end if;
 if char_length(coalesce(p_feedback,''))>10000 then raise exception 'Feedback too long'; end if;
 if p_decision='changes' then
  select * into h from public.agent_chatgpt_handoffs where owner_id=p_owner and assignment_id=p_assignment and status='returned' and output_version=p_version;
  if found then
   if char_length(btrim(coalesce(p_feedback,'')))<5 then raise exception 'Describe the changes to the returned files';end if;
   queued:=public.queue_agent_chatgpt_handoff(p_owner,p_assignment,s.revision,'Revise the previous ChatGPT files. Preserve the original project requirements. '||left(h.brief,5800));
   update public.agent_chatgpt_handoffs set owner_feedback=btrim(p_feedback) where id=(queued->>'handoff_id')::uuid and owner_id=p_owner;
   return queued||jsonb_build_object('state','ready','assignment_id',p_assignment,'chatgpt_handoff',true);
  end if;
 end if;
 if p_decision='approve' then
  update public.agent_project_sessions set phase='approved',review_status='approved',updated_at=now() where assignment_id=p_assignment;
  update public.agent_team_assignments set status='completed',updated_at=now() where id=p_assignment;
  insert into public.agent_approved_knowledge(owner_id,assignment_id,review_version,topic,approved_excerpt,source_worker)
   values(p_owner,p_assignment,left(md5(s.final_output),8),left(a.title||E'\n'||a.instructions,600),left(s.final_output,3000),s.lead_worker) on conflict(owner_id,assignment_id,review_version) do nothing;
  label:='The owner approved the finished work. No publishing, sending, spending or account access was authorized.';
 else
  update public.agent_project_sessions set review_status='changes_requested',phase='waiting_owner',resume_phase='discussion',waiting_worker=lead_worker,pending_question='What would you like the team to change in the finished work?',feedback=btrim(coalesce(p_feedback,'')),updated_at=now() where assignment_id=p_assignment;
  update public.agent_team_assignments set status='blocked',coordination_status='waiting_for_owner',updated_at=now() where id=p_assignment;
  if char_length(btrim(coalesce(p_feedback,'')))>0 then
   perform public.reply_agent_project_owner(p_owner,p_assignment,s.lead_worker,p_feedback,null,s.revision);
  else
   insert into public.agent_conversations(owner_id,employee_id) values(p_owner,s.lead_worker) on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
   insert into public.agent_messages(conversation_id,owner_id,sender,body) values(cid,p_owner,'employee','For “'||a.title||'”: what would you like us to change? Send the details here and I’ll bring them back to the team.') returning id into cid;
   update public.agent_project_sessions set question_message_id=cid where assignment_id=p_assignment;
  end if;
  label:='The owner requested changes. We’ll revise the same project and bring back a new version for review.';
 end if;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind) values(p_assignment,p_owner,'agent','alex','reply',label,s.revision,'decision');
 return jsonb_build_object('state',case when p_decision='approve' then 'approved' when char_length(btrim(coalesce(p_feedback,'')))>0 then 'ready' else 'waiting_owner' end,'assignment_id',p_assignment);
end; $function$;
