-- Synthetic fixtures only; no provider calls. Always roll back.
begin;
create temporary table research_recovery_ids(owner uuid,assignment uuid,run uuid);
insert into research_recovery_ids values(gen_random_uuid(),gen_random_uuid(),null);
insert into auth.users(id,aud,role) select owner,'authenticated','authenticated' from research_recovery_ids;
insert into public.agent_team_assignments(id,owner_id,title,instructions,employee_ids,source_employee_id,coordination_status)
 select assignment,owner,'Synthetic public research','Research official public guidance.',array['riley'],'riley','ready' from research_recovery_ids;
insert into public.agent_project_sessions(assignment_id,owner_id,phase,team_order,lead_worker,next_worker,shared_draft,final_output,turn_count)
 select assignment,owner,'drafting',array['riley'],'riley','riley','PRESERVED DRAFT','PRESERVED PRIOR OUTPUT',2 from research_recovery_ids;
create function pg_temp.assert_research_recovery(ok boolean,description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',description; end if;end; $$;
create function pg_temp.claim_research_recovery() returns void language plpgsql as $$ declare f record;r jsonb;begin
 select * into f from research_recovery_ids;
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where assignment_id=f.assignment;
 update public.agent_project_sessions set next_run_at=now() where assignment_id=f.assignment;
 r:=public.claim_agent_project_turn(f.owner,f.assignment,'groq','synthetic-no-provider');
 perform pg_temp.assert_research_recovery(r->>'state'='claimed','research turn claim');
 update research_recovery_ids set run=(r->>'run_id')::uuid;
end; $$;

select pg_temp.claim_research_recovery();
select public.fail_agent_project_turn(owner,assignment,run,'[research:rate_limited] Groq HTTP 429. Retry after '||to_char(now()+interval '10 minutes','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||'.') from research_recovery_ids;
select pg_temp.assert_research_recovery((select phase='drafting' and active_run is null and next_run_at>=now()+interval '9 minutes' and shared_draft='PRESERVED DRAFT' and final_output='PRESERVED PRIOR OUTPUT' and revision=1 and turn_count=2 from public.agent_project_sessions where assignment_id=(select assignment from research_recovery_ids)),'429 respects provider cooldown and preserves project');
select pg_temp.assert_research_recovery((public.claim_agent_project_turn(owner,assignment,'groq','synthetic-no-provider')->>'state')='ready','provider cooldown cannot be bypassed by clicking retry') from research_recovery_ids;

select pg_temp.claim_research_recovery();
select public.fail_agent_project_turn(owner,assignment,run,'[research:request_rejected] Groq HTTP 400. Field: tool_choice.') from research_recovery_ids;
select pg_temp.assert_research_recovery((select phase='drafting' and recovery_state<>'needs_authorization' and pending_question='' from public.agent_project_sessions where assignment_id=(select assignment from research_recovery_ids)),'request formatting errors stay with the team');

select pg_temp.claim_research_recovery();
select public.fail_agent_project_turn(owner,assignment,run,'[research:rate_limited] Retry after 9999-99-99T99:99:99Z.') from research_recovery_ids;
select pg_temp.assert_research_recovery((select active_run is null and next_run_at<=now()+interval '6 hours' from public.agent_project_sessions where assignment_id=(select assignment from research_recovery_ids)),'malformed Retry-After does not lose the turn');

select pg_temp.claim_research_recovery();
select public.fail_agent_project_turn(owner,assignment,run,'[research:permission] Groq denied browser_search (HTTP 403).') from research_recovery_ids;
select pg_temp.assert_research_recovery((select phase='waiting_owner' and recovery_state='needs_authorization' and shared_draft='PRESERVED DRAFT' from public.agent_project_sessions where assignment_id=(select assignment from research_recovery_ids)),'missing service access needs real human authorization');
select public.reply_agent_project_owner(owner,assignment,'riley','The server service permission is restored.',null,1) from research_recovery_ids;
select pg_temp.assert_research_recovery((select phase='drafting' and recovery_state='idle' from public.agent_project_sessions where assignment_id=(select assignment from research_recovery_ids)),'access restoration resumes the same project automatically');
select pg_temp.claim_research_recovery();
select public.control_agent_project(owner,assignment,'pause') from research_recovery_ids;
select pg_temp.assert_research_recovery(not public.fail_agent_project_turn(owner,assignment,run,'[research:provider_unavailable] Groq HTTP 503.'),'late provider failure cannot resume owner pause') from research_recovery_ids;
select pg_temp.assert_research_recovery(not has_function_privilege('authenticated','public.fail_agent_project_turn(uuid,uuid,uuid,text)','EXECUTE'),'browser cannot forge provider failures');
rollback;
