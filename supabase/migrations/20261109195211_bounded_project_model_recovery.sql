-- Preserve owner scope, pause/lease guards and saved work; bound failed model requests.
CREATE OR REPLACE FUNCTION public.fail_agent_project_turn(p_owner uuid, p_assignment uuid, p_run uuid, p_error text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 if p_error like '[research:rate_limited]%' or p_error like '[ai:rate_limited]%' then
  retry_text:=substring(p_error from 'Retry after ([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)');
  begin
   if retry_text is not null then retry_at:=greatest(retry_at,least(retry_text::timestamptz,now()+interval '24 hours')); end if;
  exception when invalid_datetime_format or datetime_field_overflow then null; end;
 end if;
 mode:=case when p_error like 'Response correction [%' and attempts in (3,7) then 'diagnosing' when p_error like 'Response correction [%' then 'correcting' else 'reconnecting' end;
 -- Permanent request defects must not occupy the unattended queue forever.
 -- Rate limits keep their scheduled retry; no budget or permission is expanded.
 if p_error ~ '\[ai:request_too_large\]|AI provider HTTP (400|404|413|422)([^0-9]|$)'
   or (p_error like '[ai:output_limit]%' and attempts>=3)
   or (attempts>=12 and p_error !~ 'rate_limited|HTTP 429|HTTP (401|403)|credentials unavailable|Sign-in expired|GROQ_API_KEY|\[research:(authentication|permission|missing_key|model_unavailable)\]') then
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,
   last_error=left(p_error,400),recovery_state='idle',recovery_attempts=attempts,recovery_error='',recovery_guidance='',updated_at=now()
   where assignment_id=p_assignment and owner_id=p_owner;
  return true;
 end if;
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
end; $function$

