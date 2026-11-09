-- Synthetic fixtures, no provider calls, no durable owner-data changes.
begin;
do $$
declare owner uuid:=gen_random_uuid(); project uuid:=gen_random_uuid(); claim jsonb; run uuid; s public.agent_project_sessions; n int;
begin
 insert into auth.users(id,aud,role) values(owner,'authenticated','authenticated');
 insert into public.agent_team_assignments(id,owner_id,title,instructions,employee_ids,source_employee_id,workflow_version,status,coordination_status)
 values(project,owner,'Synthetic model-budget regression','Preserve this exact scope.',array['riley','jordan'],'alex',2,'in_progress','working');
 insert into public.agent_project_sessions(assignment_id,owner_id,phase,team_order,lead_worker,next_worker,shared_draft,final_output)
 values(project,owner,'discussion',array['riley','jordan'],'jordan','riley','PRESERVED DRAFT','PRESERVED FINAL');

 claim:=public.claim_agent_project_turn(owner,project,'groq','synthetic-no-provider');run:=(claim->>'run_id')::uuid;
 if claim->>'state'<>'claimed' then raise exception 'Fixture claim failed';end if;
 if public.fail_agent_project_turn(gen_random_uuid(),project,run,'AI provider HTTP 413') then raise exception 'Foreign owner changed a run';end if;
 perform public.fail_agent_project_turn(owner,project,run,'[ai:request_too_large] Reduced request still too large.');
 select * into s from public.agent_project_sessions where assignment_id=project;
 if s.last_error='' or s.recovery_state<>'idle' or s.active_run is not null then raise exception 'Permanent size error still retries';end if;
 if s.phase<>'discussion' or s.revision<>1 or s.shared_draft<>'PRESERVED DRAFT' or s.final_output<>'PRESERVED FINAL' then raise exception 'Recovery replaced work or advanced state';end if;

 update public.agent_project_sessions set last_error='',recovery_attempts=2,next_run_at=now() where assignment_id=project;
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where assignment_id=project;
 claim:=public.claim_agent_project_turn(owner,project,'groq','synthetic-no-provider');run:=(claim->>'run_id')::uuid;
 perform public.fail_agent_project_turn(owner,project,run,'[ai:rate_limited] AI provider HTTP 429. Retry after '||to_char(now()+interval '3 hours','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||'.');
 select * into s from public.agent_project_sessions where assignment_id=project;
 if s.next_run_at<now()+interval '179 minutes' or s.last_error<>'' or s.recovery_state<>'reconnecting' then raise exception 'Rate limit lost its cooldown or invoked a model diagnosis';end if;

 update public.agent_project_sessions set last_error='',recovery_attempts=11,next_run_at=now() where assignment_id=project;
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where assignment_id=project;
 claim:=public.claim_agent_project_turn(owner,project,'groq','synthetic-no-provider');run:=(claim->>'run_id')::uuid;
 perform public.fail_agent_project_turn(owner,project,run,'Response correction [invalid_response/discussion/riley/1]. Repeated invalid response.');
 select * into s from public.agent_project_sessions where assignment_id=project;
 if s.last_error='' or s.recovery_attempts<>12 then raise exception 'Consecutive failure bound is ineffective';end if;

 update public.agent_project_sessions set last_error='',recovery_attempts=0,next_run_at=now() where assignment_id=project;
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where assignment_id=project;
 claim:=public.claim_agent_project_turn(owner,project,'groq','synthetic-no-provider');run:=(claim->>'run_id')::uuid;
 update public.agent_team_assignments set owner_paused=true where id=project;
 if public.fail_agent_project_turn(owner,project,run,'AI provider HTTP 413') then raise exception 'Late failure overwrote an owner pause';end if;
 if has_function_privilege('authenticated','public.fail_agent_project_turn(uuid,uuid,uuid,text)','execute') then raise exception 'Client can forge provider failures';end if;
end $$;
rollback;
