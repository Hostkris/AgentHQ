-- Autonomous internal recovery. Sensitive decisions and final editorial review remain human-owned.
alter table public.agent_project_sessions
 add column recovery_state text not null default 'idle' check (recovery_state in ('idle','correcting','diagnosing','reconnecting','needs_authorization')),
 add column recovery_attempts integer not null default 0 check (recovery_attempts between 0 and 1000),
 add column recovery_error text not null default '' check (char_length(recovery_error)<=400),
 add column recovery_guidance text not null default '' check (char_length(recovery_guidance)<=2000);

create schema if not exists agent_hq_private;
revoke all on schema agent_hq_private from public,anon,authenticated;
grant usage on schema agent_hq_private to service_role;

create function agent_hq_private.reset_project_recovery()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.revision<>old.revision or new.turn_count>old.turn_count or (old.phase in ('waiting_owner','waiting_permission') and new.phase in ('planning','discussion','drafting','checking','polishing')) then
  new.recovery_state:='idle'; new.recovery_attempts:=0;
  new.recovery_error:=''; new.recovery_guidance:='';
 end if;
 return new;
end; $$;
revoke all on function agent_hq_private.reset_project_recovery() from public,anon,authenticated;
create trigger agent_project_progress_clears_recovery before update on public.agent_project_sessions
 for each row execute function agent_hq_private.reset_project_recovery();

create or replace function public.fail_agent_project_turn(p_owner uuid,p_assignment uuid,p_run uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.agent_project_sessions; a public.agent_team_assignments; attempts int; delay_seconds int; mode text; cid uuid; mid uuid;
begin
 select * into a from public.agent_team_assignments where owner_id=p_owner and id=p_assignment for update;
 select * into s from public.agent_project_sessions where owner_id=p_owner and assignment_id=p_assignment for update;
 if not found or s.active_run is distinct from p_run or a.owner_paused then return false; end if;
 update public.agent_worker_runs set status='failed',error_summary=left(p_error,300),finished_at=now()
  where owner_id=p_owner and id=p_run and status='running';
 attempts:=least(s.recovery_attempts+1,1000);
 delay_seconds:=case when attempts=1 then 5 when attempts=2 then 15 when attempts=3 then 20 when attempts<6 then 60 when attempts<10 then 300 else 900 end;
 mode:=case when attempts in (3,7) then 'diagnosing' when p_error like 'Response correction [%' then 'correcting' else 'reconnecting' end;
 if p_error ~ 'AI provider HTTP (401|403)|credentials unavailable|Sign-in expired|GROQ_API_KEY|requires.*Groq|needs.*Groq.*connection' then
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,s.next_worker)
   on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
   values(cid,p_owner,'employee','For “'||a.title||'”: the AI service rejected its authorization. Please restore the service connection in Settings and tell me when it is ready. Do not send passwords or API keys in chat. I will continue this saved project automatically after your reply.') returning id into mid;
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,last_error='',recovery_state='needs_authorization',recovery_attempts=attempts,recovery_error=left(p_error,400),
   phase='waiting_owner',resume_phase=s.phase,waiting_worker=s.next_worker,question_message_id=mid,pending_question='Has the AI service connection been restored in Settings?',next_run_at=now(),updated_at=now()
   where assignment_id=p_assignment and owner_id=p_owner;
 else
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,last_error='',recovery_state=mode,recovery_attempts=attempts,recovery_error=left(p_error,400),
   next_run_at=now()+make_interval(secs=>delay_seconds),updated_at=now() where assignment_id=p_assignment and owner_id=p_owner;
 end if;
 return true;
end; $$;

create function public.complete_agent_project_diagnosis(p_owner uuid,p_assignment uuid,p_run uuid,p_revision integer,p_guidance text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.agent_project_sessions; a public.agent_team_assignments;
begin
 select * into a from public.agent_team_assignments where owner_id=p_owner and id=p_assignment for update;
 select * into s from public.agent_project_sessions where owner_id=p_owner and assignment_id=p_assignment for update;
 if not found or a.owner_paused or s.active_run is distinct from p_run or s.revision<>p_revision or s.lease_until<clock_timestamp() or s.active_worker<>'alex' or s.recovery_state<>'diagnosing' then raise exception 'Workflow diagnosis was stopped or superseded'; end if;
 if char_length(btrim(p_guidance)) not between 20 and 1800 then raise exception 'Invalid workflow diagnosis'; end if;
 update public.agent_worker_runs set status='completed',result_preview='Internal workflow diagnosis saved; specialist retains the assignment.',finished_at=now()
  where id=p_run and owner_id=p_owner and status='running';
 update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,last_error='',recovery_state='correcting',recovery_guidance=btrim(p_guidance),next_run_at=now()+interval '4 seconds',updated_at=now()
  where assignment_id=p_assignment and owner_id=p_owner;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
  values(p_assignment,p_owner,'agent','alex','reply','I diagnosed the workflow response issue and returned the saved turn to '||s.next_worker||' with a correction. The project and its work remain in place; no owner action is needed.',s.revision,'discussion');
 return jsonb_build_object('state','recovering','assignment_id',p_assignment,'next_worker',s.next_worker);
end; $$;
revoke all on function public.complete_agent_project_diagnosis(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.complete_agent_project_diagnosis(uuid,uuid,uuid,integer,text) to service_role;

-- Existing routine response failures can recover without an owner clicking Retry.
update public.agent_project_sessions set recovery_state='correcting',recovery_error=last_error,last_error='',next_run_at=now(),updated_at=now()
 where phase in ('planning','discussion','drafting','checking','polishing') and (
  last_error like 'Response correction [%' or last_error like 'The worker returned a response for the wrong project stage%' or last_error like 'The question must be addressed to another assigned teammate%');

-- A private, high-entropy scheduler credential; plaintext lives only in encrypted Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create table agent_hq_private.runner_config (
 singleton boolean primary key default true check(singleton),
 token_hash bytea not null,
 enabled boolean not null default false,
 last_dispatch_at timestamptz
);
alter table agent_hq_private.runner_config enable row level security;
alter table agent_hq_private.runner_config force row level security;
revoke all on agent_hq_private.runner_config from public,anon,authenticated;
grant select on agent_hq_private.runner_config to service_role;
do $$ declare token text; begin
 select decrypted_secret into token from vault.decrypted_secrets where name='agent_hq_project_runner_token';
 if token is null then
  token:=encode(extensions.gen_random_bytes(32),'hex');
  perform vault.create_secret(token,'agent_hq_project_runner_token','Private Agent HQ autonomous project dispatcher credential');
 end if;
 insert into agent_hq_private.runner_config(singleton,token_hash,enabled)
  values(true,extensions.digest(token,'sha256'),false);
end; $$;

create function public.verify_agent_project_runner(p_token text)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(p_token ~ '^[0-9a-f]{64}$' and exists(
  select 1 from agent_hq_private.runner_config where singleton and enabled and token_hash=extensions.digest(p_token,'sha256')),false);
$$;
create function public.get_agent_project_runner_work(p_owners uuid[])
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(work)),'[]'::jsonb) from (
  select a.id,a.owner_id,a.title,a.instructions,a.info_needed,a.employee_ids,a.status,a.source_employee_id,a.coordination_status,a.manager_summary,a.owner_paused,a.workflow_version
   from public.agent_team_assignments a left join public.agent_project_sessions s on s.assignment_id=a.id and s.owner_id=a.owner_id
   where a.owner_id=any(p_owners) and a.workflow_version=2 and not a.owner_paused and a.status<>'completed'
    and (s.assignment_id is null or (s.phase in ('planning','discussion','drafting','checking','polishing') and s.last_error='' and s.recovery_state<>'needs_authorization' and s.next_run_at<=now() and (s.active_run is null or s.lease_until<=now())))
   order by coalesce(s.next_run_at,a.created_at),a.created_at limit 1
 ) work;
$$;
revoke all on function public.verify_agent_project_runner(text),public.get_agent_project_runner_work(uuid[]) from public,anon,authenticated;
grant execute on function public.verify_agent_project_runner(text),public.get_agent_project_runner_work(uuid[]) to service_role;

create function agent_hq_private.dispatch_project_runner()
returns bigint language plpgsql security invoker set search_path='' as $$
declare cfg agent_hq_private.runner_config; request_id bigint;
begin
 select * into cfg from agent_hq_private.runner_config where singleton for update;
 if not cfg.enabled or cfg.last_dispatch_at>now()-interval '50 seconds' then return null; end if;
 if not exists(select 1 from public.agent_team_assignments a left join public.agent_project_sessions s on s.assignment_id=a.id and s.owner_id=a.owner_id
  where a.workflow_version=2 and not a.owner_paused and a.status<>'completed' and (s.assignment_id is null or (s.phase in ('planning','discussion','drafting','checking','polishing') and s.last_error='' and s.next_run_at<=now() and (s.active_run is null or s.lease_until<=now())))) then return null; end if;
 select net.http_post(
  url:='https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-hq-project-runner',
  headers:=jsonb_build_object('Content-Type','application/json','x-agent-hq-runner-token',(select decrypted_secret from vault.decrypted_secrets where name='agent_hq_project_runner_token')),
  body:='{}'::jsonb,timeout_milliseconds:=70000) into request_id;
 update agent_hq_private.runner_config set last_dispatch_at=now() where singleton;
 return request_id;
end; $$;
revoke all on function agent_hq_private.dispatch_project_runner() from public,anon,authenticated,service_role;
select cron.schedule('agent-hq-autonomous-projects','* * * * *','select agent_hq_private.dispatch_project_runner();');

create or replace function public.claim_agent_project_turn(p_owner uuid,p_assignment uuid,p_provider text,p_model text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.agent_team_assignments; s public.agent_project_sessions; r uuid; used int; retry timestamptz; who text; cid uuid; mid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,4271));
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found or a.workflow_version<>2 then raise exception 'Project not found'; end if;
 insert into public.agent_project_sessions(assignment_id,owner_id) values(p_assignment,p_owner) on conflict do nothing;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if a.owner_paused then return jsonb_build_object('state','paused'); end if;
 if s.phase in ('waiting_owner','waiting_permission','review','approved') then return jsonb_build_object('state',s.phase); end if;
 if s.active_run is not null and s.lease_until>clock_timestamp() then return jsonb_build_object('state','working','worker_id',s.active_worker); end if;
 if s.active_run is not null then
  update public.agent_worker_runs set status='failed',error_summary='Interrupted turn; safe to retry',finished_at=now() where id=s.active_run and owner_id=p_owner and status='running';
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null where assignment_id=p_assignment;
 end if;
 if s.last_error<>'' then return jsonb_build_object('state','failed','message',s.last_error); end if;
 if s.turn_count>=18 then
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,coalesce(s.lead_worker,'alex')) on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
  insert into public.agent_messages(conversation_id,owner_id,sender,body) values(cid,p_owner,'employee','For “'||a.title||'”: this revision reached its bounded work limit before a complete result. Which requirements must be prioritized in the next revision? Reply here with the scope; I will continue the same saved project automatically.') returning id into mid;
  update public.agent_project_sessions set phase='waiting_owner',resume_phase='discussion',review_status='changes_requested',waiting_worker=coalesce(s.lead_worker,'alex'),question_message_id=mid,pending_question='Which requirements must be prioritized in the next revision?',last_error='',updated_at=now() where assignment_id=p_assignment;
  return jsonb_build_object('state','waiting_owner','message','An essential scope question was sent privately; the saved project will continue after the answer.');
 end if;
 if s.next_run_at>clock_timestamp() then return jsonb_build_object('state','ready','retry_at',s.next_run_at); end if;
 update public.agent_worker_runs set status='failed',error_summary='Interrupted worker',finished_at=now() where owner_id=p_owner and status='running' and created_at<now()-interval '2 minutes';
 if exists(select 1 from public.agent_worker_runs where owner_id=p_owner and status='running') then return jsonb_build_object('state','busy'); end if;
 select count(*),min(created_at)+interval '1 hour' into used,retry from public.agent_worker_runs where owner_id=p_owner and created_at>now()-interval '1 hour';
 if used>=10 then
  update public.agent_project_sessions set next_run_at=retry,updated_at=now() where assignment_id=p_assignment;
  return jsonb_build_object('state','budget','retry_at',retry,'message','Free worker allowance reached. Saved work will resume when the allowance resets.');
 end if;
 who:=case when s.recovery_state='diagnosing' then 'alex' else coalesce(s.peer_target,s.next_worker) end;
 insert into public.agent_worker_runs(owner_id,assignment_id,employee_id,status,provider,model)
 values(p_owner,p_assignment,who,'running',p_provider,p_model) returning id into r;
 update public.agent_project_sessions set active_run=r,active_worker=who,lease_until=now()+interval '90 seconds',updated_at=now() where assignment_id=p_assignment returning * into s;
 update public.agent_team_assignments set coordination_status=case when s.phase='planning' then 'planning' else 'working' end,status='in_progress',updated_at=now() where id=p_assignment;
 return jsonb_build_object('state','claimed','run_id',r,'session',to_jsonb(s));
end; $$;
