-- Synthetic fixtures only. No provider call, login token, invitation or delivery.
-- Run in one transaction (optionally after the migration) and ALWAYS roll back.
begin;
create temporary table project_test_ids(owner uuid,other_owner uuid,assignment uuid,run uuid,version uuid);
-- Reuse an existing owner only as a foreign key. Touch no existing rows.
insert into project_test_ids
 select u.id,gen_random_uuid(),gen_random_uuid(),null,null from auth.users u
 where not exists(select 1 from public.agent_worker_runs r where r.owner_id=u.id and r.status='running')
 order by (select count(*) from public.agent_worker_runs r where r.owner_id=u.id and r.created_at>now()-interval '1 hour') limit 1;
insert into public.agent_team_assignments(id,owner_id,title,instructions,employee_ids,source_employee_id,coordination_status)
 select assignment,owner,'Synthetic team script','Write a 30-second landscape photography video script. Audience: beginners. Use the owner’s actual destination, not an invented one.',array['alex'],'alex','planning' from project_test_ids;

create function pg_temp.assert_project(ok boolean,description text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',description; end if; end; $$;
create function pg_temp.claim_project() returns jsonb language plpgsql as $$ declare ids record;r jsonb;begin
 select * into ids from project_test_ids;
 update public.agent_project_sessions set next_run_at=now() where assignment_id=ids.assignment;
 r:=public.claim_agent_project_turn(ids.owner,ids.assignment,'groq','synthetic-no-provider');
 perform pg_temp.assert_project(r->>'state'='claimed','turn reserved');
 update project_test_ids set run=(r->>'run_id')::uuid;
 return r;
end; $$;
create function pg_temp.commit_project(decision jsonb) returns jsonb language plpgsql as $$ declare ids record;rev int;result jsonb;begin
 select * into ids from project_test_ids;
 select revision into rev from public.agent_project_sessions where assignment_id=ids.assignment;
 result:=public.commit_agent_project_turn(ids.owner,ids.assignment,ids.run,rev,decision);
 -- Age only this synthetic run so ordinary fixture turns do not consume the real owner's allowance.
 update public.agent_worker_runs set created_at=now()-interval '2 hours' where id=ids.run and assignment_id=ids.assignment;
 return result;
end; $$;

select pg_temp.assert_project((select workflow_version=2 from public.agent_team_assignments where id=(select assignment from project_test_ids)),'new projects use shared conversation');
select pg_temp.claim_project();
select pg_temp.assert_project((public.claim_agent_project_turn(owner,assignment,'groq','synthetic-no-provider')->>'state')='working','duplicate claim does not run another worker') from project_test_ids;
select pg_temp.commit_project('{"kind":"plan","text":"Jordan, own the short script. Casey, challenge the hook and check audience fit before we share the finished version.","routes":[{"worker":"jordan","title":"Write video script","instructions":"Deliver a complete 30-second script for beginners."},{"worker":"casey","title":"Review engagement and clarity","instructions":"Check the hook and actionable takeaway."}]}'::jsonb);
select pg_temp.assert_project((select count(*)=0 from public.agent_messages where owner_id=(select owner from project_test_ids)),'no private work-order or draft spam');
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"ask_team","recipient":"casey","text":"Casey, should our opening lead with one beginner mistake or the finished landscape photo? What would make the hook clearer?"}');
select pg_temp.assert_project((select next_worker='casey' and peer_return_worker='jordan' from public.agent_project_sessions where assignment_id=(select assignment from project_test_ids)),'real teammate question routes to recipient');
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"answer","text":"Jordan, lead with the mistake and show the finished photo immediately afterward. That makes the improvement concrete without inventing a result."}');
select pg_temp.assert_project((select next_worker='jordan' and peer_target is null from public.agent_project_sessions where assignment_id=(select assignment from project_test_ids)),'answer returns to original worker');
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"ask_owner","text":"The actual location is essential to this script.","question":"Which landscape destination should this script feature?"}');
select pg_temp.assert_project((select phase='waiting_owner' and waiting_worker='jordan' from public.agent_project_sessions where assignment_id=(select assignment from project_test_ids)),'owner question pauses the correct project');
select pg_temp.assert_project((select count(*)=1 from public.agent_messages m join public.agent_conversations c on c.id=m.conversation_id where m.owner_id=(select owner from project_test_ids) and c.employee_id='jordan'),'question appears only in the requesting worker’s private thread');
do $$ declare ids record;begin select * into ids from project_test_ids;
 begin perform public.reply_agent_project_owner(ids.owner,ids.assignment,'casey','Wrong thread',null,1);raise exception 'wrong worker accepted';exception when raise_exception then if sqlerrm='wrong worker accepted' then raise;end if;end;
 begin perform public.reply_agent_project_owner(ids.other_owner,ids.assignment,'jordan','Wrong owner',null,1);raise exception 'wrong owner accepted';exception when raise_exception then if sqlerrm='wrong owner accepted' then raise;end if;end;
end; $$;
select public.reply_agent_project_owner(owner,assignment,'jordan','Use the Blue Ridge Mountains.',null,1) from project_test_ids;
select pg_temp.assert_project((select body like '%Blue Ridge%' from public.agent_team_messages where assignment_id=(select assignment from project_test_ids) and project_kind='owner_context' limit 1),'owner answer is saved as shared source context');
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"contribute","text":"We have the owner’s location: Blue Ridge Mountains. I’ll use the mistake-first hook, a clear horizon tip, and a short invitation to try it."}');
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"contribute","text":"Jordan, keep the opening under five seconds and make the horizon correction visible. Avoid promising engagement numbers we cannot verify."}');
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"draft","text":"0–5 seconds: Show a tilted horizon in the Blue Ridge Mountains. Voiceover: A beautiful view can still make a confusing photograph. 5–20 seconds: Level the horizon and give the ridge room to breathe. 20–30 seconds: Compare the two frames and invite beginners to try the same adjustment.","message":"Casey, the draft is ready. Please check pacing, clarity, and whether the action is specific enough."}');
select pg_temp.assert_project((select phase='checking' and final_output='' from public.agent_project_sessions where assignment_id=(select assignment from project_test_ids)),'intermediate draft is not a finished result');
do $$ declare ids record;begin select * into ids from project_test_ids;
 begin perform public.review_agent_project(ids.owner,ids.assignment,gen_random_uuid(),'approve','');raise exception 'unfinished approval accepted';exception when raise_exception then if sqlerrm='unfinished approval accepted' then raise;end if;end;
end; $$;
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"check","text":"Jordan, show the correction before explaining it. The comparison is strong; add a single clear on-screen instruction: Level the horizon. Keep the closing invitation under four seconds."}');
select pg_temp.claim_project();
select pg_temp.commit_project('{"kind":"final","text":"30-second beginner landscape video — Blue Ridge Mountains\n0–5s: Show a tilted horizon, then the corrected photo. Voiceover: One tiny adjustment can make this view easier to read.\n5–20s: Show the camera grid and level the horizon. On screen: Level the horizon. Voiceover: Use the grid to align the distant ridge, then leave enough space for the mountain layers.\n20–26s: Compare both frames side by side.\n26–30s: Try this on your next landscape photo.\nProduction note: Owner-provided location; no engagement metrics or outside actions were verified.","message":"I moved the corrected image earlier and tightened the closing, as Casey suggested. The finished script is ready."}');
update project_test_ids set version=(select output_version from public.agent_project_sessions where assignment_id=project_test_ids.assignment);
select pg_temp.assert_project((select phase='review' and review_status='pending' from public.agent_project_sessions where assignment_id=(select assignment from project_test_ids)),'finished work waits for owner review');
select pg_temp.assert_project((select count(*)=1 from public.agent_messages m join public.agent_conversations c on c.id=m.conversation_id where m.owner_id=(select owner from project_test_ids) and c.employee_id='alex'),'Alex sends exactly one finished notification');
do $$ declare ids record;begin select * into ids from project_test_ids;
 begin perform public.commit_agent_project_turn(ids.owner,ids.assignment,ids.run,1,'{"kind":"final","text":"replay"}');raise exception 'duplicate turn accepted';exception when raise_exception then if sqlerrm='duplicate turn accepted' then raise;end if;end;
 begin perform public.review_agent_project(ids.owner,ids.assignment,gen_random_uuid(),'approve','');raise exception 'stale version accepted';exception when raise_exception then if sqlerrm='stale version accepted' then raise;end if;end;
end; $$;
select public.review_agent_project(owner,assignment,version,'changes','Make it a 15-second version with the same location and beginner audience.') from project_test_ids;
select pg_temp.assert_project((select revision=2 and phase='discussion' and final_output<>'' and output_version is null and feedback like '%15-second%' from public.agent_project_sessions where assignment_id=(select assignment from project_test_ids)),'feedback reopens the same project and preserves previous final context');
select pg_temp.assert_project((select count(*)=0 from public.agent_approved_knowledge where owner_id=(select owner from project_test_ids)),'unapproved work is not remembered as approved');

-- Stops invalidate even a model response that was already in flight.
select pg_temp.claim_project();
select public.control_agent_project(owner,assignment,'pause') from project_test_ids;
do $$ declare ids record;begin select * into ids from project_test_ids;
 begin perform public.commit_agent_project_turn(ids.owner,ids.assignment,ids.run,2,'{"kind":"contribute","text":"late message"}');raise exception 'late paused turn accepted';exception when raise_exception then if sqlerrm='late paused turn accepted' then raise;end if;end;
end; $$;
select pg_temp.assert_project((public.claim_agent_project_turn(owner,assignment,'groq','synthetic-no-provider')->>'state')='paused','paused project does not generate') from project_test_ids;
select public.control_agent_project(owner,assignment,'resume') from project_test_ids;

-- Fill the allowance with synthetic, failed, same-project fixtures only.
insert into public.agent_worker_runs(owner_id,assignment_id,employee_id,status,provider,model,finished_at)
 select owner,assignment,'jordan','failed','groq','synthetic-no-provider',now() from project_test_ids cross join generate_series(1,10);
-- Every request counts toward the same ten-per-hour free worker allowance.
select pg_temp.assert_project((public.claim_agent_project_turn(owner,assignment,'groq','synthetic-no-provider')->>'state')='budget','ten model requests per hour is enforced') from project_test_ids;

-- Approve only an exact completed version. No external action record is created.
update public.agent_project_sessions set phase='review',output_version=gen_random_uuid(),review_status='pending' where assignment_id=(select assignment from project_test_ids);
update project_test_ids set version=(select output_version from public.agent_project_sessions where assignment_id=project_test_ids.assignment);
select public.review_agent_project(owner,assignment,version,'approve','') from project_test_ids;
select pg_temp.assert_project((select phase='approved' from public.agent_project_sessions where assignment_id=(select assignment from project_test_ids)),'exact finished version approved');
select pg_temp.assert_project((select count(*)=1 from public.agent_approved_knowledge where owner_id=(select owner from project_test_ids)),'only approved combined work is saved as an example');

select set_config('request.jwt.claim.sub',(select other_owner::text from project_test_ids),true);
set local role authenticated;
select pg_temp.assert_project((select count(*)=0 from public.agent_project_sessions),'another owner cannot read projects');
select pg_temp.assert_project(not has_function_privilege('authenticated','public.commit_agent_project_turn(uuid,uuid,uuid,integer,jsonb)','EXECUTE'),'browser cannot forge team turns');
select pg_temp.assert_project(not has_function_privilege('anon','public.review_agent_project(uuid,uuid,uuid,text,text)','EXECUTE'),'anonymous users cannot approve');
reset role;
rollback;
