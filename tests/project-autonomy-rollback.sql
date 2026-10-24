-- Database-only synthetic fixtures. No real model, outside account or delivery.
-- Run after installing the migration inside the SAME transaction; always rollback.
begin;
create temporary table autonomy_ids(owner uuid,assignment uuid,run uuid);
insert into autonomy_ids values(gen_random_uuid(),gen_random_uuid(),null);
insert into auth.users(id,aud,role) select owner,'authenticated','authenticated' from autonomy_ids;
insert into public.agent_team_assignments(id,owner_id,title,instructions,employee_ids,source_employee_id,coordination_status)
 select assignment,owner,'Synthetic autonomous script','Create a complete short script from supplied verified facts.',array['jordan','casey'],'alex','ready' from autonomy_ids;
insert into public.agent_project_sessions(assignment_id,owner_id,phase,team_order,lead_worker,next_worker,shared_draft,final_output,turn_count)
 select assignment,owner,'discussion',array['jordan','casey'],'jordan','jordan','SAVED SHARED DRAFT','EARLIER OUTPUT',4 from autonomy_ids;
create function pg_temp.assert_autonomy(ok boolean,description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',description; end if;end; $$;
create function pg_temp.claim_autonomy() returns jsonb language plpgsql as $$ declare f record;r jsonb;begin
 select * into f from autonomy_ids;
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where assignment_id=f.assignment;
 update public.agent_project_sessions set next_run_at=now() where assignment_id=f.assignment;
 r:=public.claim_agent_project_turn(f.owner,f.assignment,'groq','synthetic-no-provider');
 perform pg_temp.assert_autonomy(r->>'state'='claimed','saved turn can be reserved');
 update autonomy_ids set run=(r->>'run_id')::uuid;return r;
end; $$;
do $$ declare f record;i int;begin
 for i in 1..3 loop
  perform pg_temp.claim_autonomy();select * into f from autonomy_ids;
  perform pg_temp.assert_autonomy(public.fail_agent_project_turn(f.owner,f.assignment,f.run,'Response correction [self_address/discussion/jordan/1/ask_team]. A question must address another teammate.'),'failure saved');
  perform pg_temp.assert_autonomy((select last_error='' and active_run is null and recovery_attempts=i and shared_draft='SAVED SHARED DRAFT' and final_output='EARLIER OUTPUT' and revision=1 and turn_count=4 from public.agent_project_sessions where assignment_id=f.assignment),'automatic recovery preserves all project content');
 end loop;
end; $$;
select pg_temp.assert_autonomy((select recovery_state='diagnosing' from public.agent_project_sessions where assignment_id=(select assignment from autonomy_ids)),'repeated failures route to Alex');
select pg_temp.claim_autonomy();
select pg_temp.assert_autonomy((select active_worker='alex' and next_worker='jordan' from public.agent_project_sessions where assignment_id=(select assignment from autonomy_ids)),'manager diagnoses while specialist retains work');
select public.complete_agent_project_diagnosis(owner,assignment,run,1,'Return a discussion contribution as Jordan and address only the assigned teammate Casey.') from autonomy_ids;
select pg_temp.assert_autonomy((select recovery_state='correcting' and active_run is null and turn_count=4 and shared_draft='SAVED SHARED DRAFT' from public.agent_project_sessions where assignment_id=(select assignment from autonomy_ids)),'diagnosis queues correction without faking progress');
select pg_temp.claim_autonomy();
select public.commit_agent_project_turn(owner,assignment,run,1,'{"kind":"contribute","text":"Casey, the owner facts support the agreed opening and the shared draft remains our working version."}'::jsonb) from autonomy_ids;
select pg_temp.assert_autonomy((select recovery_state='idle' and recovery_error='' and recovery_attempts=0 and turn_count=5 from public.agent_project_sessions where assignment_id=(select assignment from autonomy_ids)),'successful work clears recovery state');

-- A real missing owner fact pauses; its answer resumes without another approval.
select pg_temp.claim_autonomy();
select public.commit_agent_project_turn(owner,assignment,run,1,'{"kind":"ask_owner","text":"The private budget ceiling is essential.","question":"What is the approved budget ceiling?","blocking_reason":"owner_only_fact","why_blocking":"This private figure is absent from all saved context."}'::jsonb) from autonomy_ids;
select pg_temp.assert_autonomy(jsonb_array_length(public.get_agent_project_runner_work(array[owner]))=0,'waiting owner projects do not generate in the background') from autonomy_ids;
select public.reply_agent_project_owner(owner,assignment,'casey','The budget ceiling is $100.',null,1) from autonomy_ids;
select pg_temp.assert_autonomy(jsonb_array_length(public.get_agent_project_runner_work(array[owner]))=1,'answer automatically returns project to the background queue') from autonomy_ids;

-- Service authorization is a necessary human step; replying resumes the project.
select pg_temp.claim_autonomy();
select public.fail_agent_project_turn(owner,assignment,run,'AI provider HTTP 401') from autonomy_ids;
select pg_temp.assert_autonomy((select phase='waiting_owner' and recovery_state='needs_authorization' from public.agent_project_sessions where assignment_id=(select assignment from autonomy_ids)),'real service authorization is not auto-approved');
select public.reply_agent_project_owner(owner,assignment,'casey','The service connection has been restored.',null,1) from autonomy_ids;
select pg_temp.assert_autonomy((select phase='discussion' and recovery_state='idle' from public.agent_project_sessions where assignment_id=(select assignment from autonomy_ids)),'service response resumes without a second confirmation');

select pg_temp.claim_autonomy();
select public.control_agent_project(owner,assignment,'pause') from autonomy_ids;
select pg_temp.assert_autonomy(not public.fail_agent_project_turn(owner,assignment,run,'late failure'),'late failure cannot resume an owner-paused project') from autonomy_ids;
select pg_temp.assert_autonomy(jsonb_array_length(public.get_agent_project_runner_work(array[owner]))=0,'owner pause stops background work') from autonomy_ids;
select public.control_agent_project(owner,assignment,'resume') from autonomy_ids;
update public.agent_project_sessions set turn_count=18 where assignment_id=(select assignment from autonomy_ids);
select pg_temp.assert_autonomy((public.claim_agent_project_turn(owner,assignment,'groq','synthetic-no-provider')->>'state')='recovering','internal work checkpoint continues automatically instead of asking the owner to narrow the task') from autonomy_ids;
select pg_temp.assert_autonomy((select execution_cycle=2 and turn_count=0 and phase='discussion' and pending_question='' and shared_draft='SAVED SHARED DRAFT' from public.agent_project_sessions where assignment_id=(select assignment from autonomy_ids)),'checkpoint preserves phase, project and draft');
select pg_temp.claim_autonomy();
select public.complete_agent_project_diagnosis(owner,assignment,run,1,'Continue the saved discussion using the existing owner facts and complete the current specialist responsibility.') from autonomy_ids;
insert into public.agent_worker_runs(owner_id,assignment_id,employee_id,status,provider,model,finished_at)
 select owner,assignment,'jordan','failed','groq','synthetic-no-provider',now() from autonomy_ids cross join generate_series(1,10);
update public.agent_project_sessions set next_run_at=now() where assignment_id=(select assignment from autonomy_ids);
select pg_temp.assert_autonomy((public.claim_agent_project_turn(owner,assignment,'groq','synthetic-no-provider')->>'state')='budget','all autonomous and repair calls obey the same free allowance') from autonomy_ids;

select pg_temp.assert_autonomy(not public.verify_agent_project_runner(repeat('0',64)),'a forged scheduler credential is denied');
select pg_temp.assert_autonomy(not has_function_privilege('authenticated','public.complete_agent_project_diagnosis(uuid,uuid,uuid,integer,text)','EXECUTE'),'browser cannot forge manager diagnoses');
select pg_temp.assert_autonomy(not has_function_privilege('anon','public.verify_agent_project_runner(text)','EXECUTE'),'anonymous clients cannot call credential verifier');
select pg_temp.assert_autonomy(not has_function_privilege('authenticated','public.get_agent_project_runner_work(uuid[])','EXECUTE'),'browser cannot sweep other owners queues');
select pg_temp.assert_autonomy(not has_schema_privilege('authenticated','agent_hq_private','USAGE'),'scheduler secrets stay outside browser access');
rollback;
