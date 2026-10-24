-- A failed direct search can recover in the SAME project. Owners still have
-- read-only research history; only trusted server code sets this relationship.
alter table public.agent_role_research add column recovery_assignment_id uuid references public.agent_team_assignments(id) on delete set null;
comment on column public.agent_role_research.recovery_assignment_id is 'Project preserving a failed standalone research request; does not grant a project research lease.';

-- Keep the existing owner/run/pause guards and free usage caps. Respect the
-- provider Retry-After for 429s; only missing service access needs a human.
create or replace function public.fail_agent_project_turn(p_owner uuid,p_assignment uuid,p_run uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.agent_project_sessions; a public.agent_team_assignments; attempts int; delay_seconds int; mode text; cid uuid; mid uuid; retry_at timestamptz; retry_text text;
begin
 select * into a from public.agent_team_assignments where owner_id=p_owner and id=p_assignment for update;
 select * into s from public.agent_project_sessions where owner_id=p_owner and assignment_id=p_assignment for update;
 if not found or s.active_run is distinct from p_run or a.owner_paused then return false; end if;
 update public.agent_worker_runs set status='failed',error_summary=left(p_error,300),finished_at=now()
  where owner_id=p_owner and id=p_run and status='running';
 attempts:=least(s.recovery_attempts+1,1000);
 delay_seconds:=case when attempts=1 then 5 when attempts=2 then 15 when attempts=3 then 20 when attempts<6 then 60 when attempts<10 then 300 else 900 end;
 retry_at:=now()+make_interval(secs=>delay_seconds);
 if p_error like '[research:rate_limited]%' then
  retry_text:=substring(p_error from 'Retry after ([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)');
  begin
   if retry_text is not null then retry_at:=greatest(retry_at,least(retry_text::timestamptz,now()+interval '6 hours')); end if;
  exception when invalid_datetime_format or datetime_field_overflow then null; end;
 end if;
 mode:=case when attempts in (3,7) then 'diagnosing' when p_error like 'Response correction [%' then 'correcting' else 'reconnecting' end;
 if p_error ~ 'AI provider HTTP (401|403)|credentials unavailable|Sign-in expired|GROQ_API_KEY|requires.*Groq|needs.*Groq.*connection|\[research:(authentication|permission|missing_key|model_unavailable)\]' then
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,s.next_worker)
   on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
   values(cid,p_owner,'employee','For “'||a.title||'”: the AI service rejected its authorization. Please restore the service connection in Settings and tell me when it is ready. Do not send passwords or API keys in chat. I will continue this saved project automatically after your reply.') returning id into mid;
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,last_error='',recovery_state='needs_authorization',recovery_attempts=attempts,recovery_error=left(p_error,400),
   phase='waiting_owner',resume_phase=s.phase,waiting_worker=s.next_worker,question_message_id=mid,pending_question='Has the AI service connection been restored in Settings?',next_run_at=now(),updated_at=now()
   where assignment_id=p_assignment and owner_id=p_owner;
 else
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,last_error='',recovery_state=mode,recovery_attempts=attempts,recovery_error=left(p_error,400),
   next_run_at=retry_at,updated_at=now() where assignment_id=p_assignment and owner_id=p_owner;
 end if;
 return true;
end; $$;

