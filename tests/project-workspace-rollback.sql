-- Run after the draft migration in the SAME transaction; every fixture rolls back.
do $$
declare owner uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); project uuid; result jsonb; claim jsonb; run uuid; old_run uuid; old_revision int;
 workers text[]:=array['maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']; w text; routes jsonb:='[]'; cnt int; rejected boolean; version_id uuid;
begin
 insert into auth.users(id,email) values(owner,'agenthq-workspace-fixture@example.invalid'),(other_owner,'agenthq-other-fixture@example.invalid');
 if has_function_privilege('authenticated','public.create_agent_workspace_project(uuid,text,text,jsonb)','execute') then raise exception 'Client can bypass the trusted owner handler';end if;
 result:=public.create_agent_workspace_project(owner,'alex','Create a personal study plan. Return a PDF.',jsonb_build_object('project_kind','general','output_format','pdf','requirements',jsonb_build_array('Use the supplied notes'),'completion_criteria','Return a verified PDF'));
 project:=(result->>'id')::uuid;
 if not exists(select 1 from public.agent_project_workspaces where assignment_id=project and project_kind='general' and output_format='pdf') then raise exception 'Intake metadata was lost';end if;
 claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');
 if claim->>'state'<>'claimed' then raise exception 'Planning claim failed: %',claim;end if;
 run:=(claim->>'run_id')::uuid;
 foreach w in array workers loop routes:=routes||jsonb_build_array(jsonb_build_object('worker',w,'title',w||' task','instructions','Produce a complete work product for this project.'));end loop;
 perform public.commit_agent_project_turn(owner,project,run,1,jsonb_build_object('kind','plan','text','Every relevant specialist has an accountable step and a real handoff.','routes',routes,'lead_worker','jordan'));
 if (select cardinality(team_order) from public.agent_project_sessions where assignment_id=project)<>9 then raise exception 'All nine specialists were not enrolled';end if;
 foreach w in array workers loop
  update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
  claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
  if claim->'session'->>'active_worker'<>w then raise exception 'Wrong handoff worker';end if;
  perform public.commit_agent_project_turn(owner,project,run,1,jsonb_build_object('kind','contribute','text',w||' completed a usable work product from the verified upstream inputs. The owner requirements remain intact.'));
 end loop;
 -- The ten-turn allowance must pause, rather than lose, a longer project.
 update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
 claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');
 if claim->>'state'<>'budget' then raise exception 'The owner usage cap was bypassed';end if;
 -- Advance fixture timestamps, not the real account's quota.
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where assignment_id=project;
 update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
 claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
 perform public.commit_agent_project_turn(owner,project,run,1,jsonb_build_object('kind','draft','text',repeat('A complete combined draft preserves all evidence and task requirements. ',3)));
 foreach w in array workers loop
  if w='jordan' then continue;end if;
  update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
  claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
  if claim->>'state'='recovering' then
   update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
   claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');
   perform public.complete_agent_project_diagnosis(owner,project,(claim->>'run_id')::uuid,1,'Continue the same saved review stage with its assigned specialist and verified upstream work.');
   update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
   claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
  end if;
  if claim->'session'->>'active_worker'<>w then raise exception 'Wrong review worker: %',claim;end if;
  perform public.commit_agent_project_turn(owner,project,run,1,jsonb_build_object('kind','check','text','Jordan, I checked the actual combined draft against the source requirements and my saved work product.'));
 end loop;
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where assignment_id=project;
 update public.agent_project_sessions set turn_count=0,recovery_state='idle',next_run_at=now() where assignment_id=project;
 claim:=public.claim_agent_project_turn(owner,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
 rejected:=false;
 begin
  perform public.commit_agent_project_turn(owner,project,run,1,jsonb_build_object('kind','final','text',repeat('The complete final deliverable preserves the approved project requirements. ',3)));
 exception when others then if sqlerrm like '%output file%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'Final completed without a verified file record';end if;
 insert into public.agent_project_artifacts(owner_id,assignment_id,revision,run_id,employee_id,artifact_kind,filename,mime_type,object_path,sha256,source_sha256,size_bytes)
 values(owner,project,1,run,'jordan','final','fixture.pdf','application/pdf',owner::text||'/'||project::text||'/fixture.pdf',repeat('a',64),repeat('b',64),100);
 perform public.commit_agent_project_turn(owner,project,run,1,jsonb_build_object('kind','final','text',repeat('The complete final deliverable preserves the approved project requirements. ',3)));
 if not exists(select 1 from public.agent_project_artifacts where assignment_id=project and status='ready') then raise exception 'Verified file was not published atomically';end if;
 result:=public.update_agent_project_context(owner,project,'Update the store-specific section using the newly supplied notes.','morgan',1);
 if result->>'revision'<>'2' then raise exception 'Update did not revise the same project';end if;
 select count(*) into cnt from public.agent_task_steps where assignment_id=project and status='completed' and output_revision=2;
 if cnt<>5 then raise exception 'Unchanged upstream work was not preserved: %',cnt;end if;
 if (select count(*) from public.agent_project_step_history where assignment_id=project)<>9 then raise exception 'Prior outputs were not retained';end if;
 rejected:=false;
 begin perform public.commit_agent_project_turn(owner,project,run,1,jsonb_build_object('kind','final','text',repeat('Stale response cannot replace the updated project. ',3)));exception when others then rejected:=true;end;
 if not rejected then raise exception 'A stale worker overwrote the updated project';end if;
 rejected:=false;
 begin perform public.update_agent_project_context(other_owner,project,'Unauthorized project update.');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Another owner changed the project';end if;
 -- Handbook edits are versioned and invalidate the linked active work.
 perform public.save_agent_project_handbook(owner,'fixture-business','Fixture Business','business','Products and prices are verified owner supplied facts.',true);
 perform public.update_agent_project_context(owner,project,'Link the verified business handbook.','morgan',2,'fixture-business');
 perform public.save_agent_project_handbook(owner,'fixture-business','Fixture Business','business','Products and revised prices are verified owner supplied facts.',true,1);
 if (select revision from public.agent_project_sessions where assignment_id=project)<>4 then raise exception 'Handbook did not invalidate affected project work';end if;
 rejected:=false;
 begin perform public.save_agent_project_handbook(owner,'fixture-business','Fixture Business','business','A stale editor must not overwrite the revised prices.',true,1);exception when others then rejected:=true;end;
 if not rejected or (select version from public.agent_project_handbooks where owner_id=owner and handbook_key='fixture-business')<>2 then raise exception 'Stale handbook overwrite was accepted';end if;
 rejected:=false;
 begin perform public.add_agent_project_reference(owner,project,'stale.txt','This reference belongs to a stale update.',null,3);exception when others then rejected:=true;end;
 if not rejected or exists(select 1 from public.agent_project_references where assignment_id=project) then raise exception 'Stale reference was partially inserted';end if;
 perform public.save_agent_project_handbook(owner,'scope-fixture','Scope fixture','general','General approved working rules for this owner.',true);
 old_revision:=(select revision from public.agent_project_sessions where assignment_id=project);
 perform public.save_agent_project_handbook(owner,'scope-fixture','Scope fixture','business','Business-only approved rules for this owner.',true,1);
 if (select revision from public.agent_project_sessions where assignment_id=project)<>old_revision+1 then raise exception 'Removing a general handbook did not refresh affected work';end if;
 update public.agent_team_assignments set owner_paused=true where id=project;
 result:=public.update_agent_project_context(owner,project,'Keep the saved project paused while adding this requirement.');
 if result->>'state'<>'paused' or not (select owner_paused from public.agent_team_assignments where id=project) then raise exception 'A context update bypassed the owner pause';end if;
 perform set_config('request.jwt.claim.sub',other_owner::text,true);
 execute 'set local role authenticated';
 select count(*) into cnt from public.agent_project_artifacts where assignment_id=project;
 if cnt<>0 then raise exception 'Another owner read private output metadata';end if;
 execute 'reset role';
 raise notice 'PASS: all-ten routing, intake, real handoff state, quota pause, output gating, partial revisions, stale-lease rejection and owner isolation';
end $$;
