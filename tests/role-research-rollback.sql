-- Database-only synthetic research. No provider calls, auth accounts or tokens.
begin;
create temporary table web_ids(owner uuid,other_owner uuid,bot uuid,assignment uuid,run uuid,job uuid,cid uuid,original uuid);
insert into web_ids select u.id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,null from auth.users u
 where not exists(select 1 from public.agent_worker_runs r where r.owner_id=u.id and r.status='running')
 order by (select count(*) from public.agent_role_research r where r.owner_id=u.id and r.started_at>now()-interval '1 hour') limit 1;
create temporary table web_fixture_jobs(id uuid primary key);
create temporary table web_legacy_jobs(id uuid primary key);
create function pg_temp.web_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end; $$;

-- All identities have independent, correctly bound reports. Never update an existing conversation.
do $$ declare ids record;worker text;c uuid;m uuid;r jsonb;j uuid;before_messages int;
begin
 select * into ids from web_ids;
 foreach worker in array array['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq'] loop
  select id into c from public.agent_conversations where owner_id=ids.owner and employee_id=worker;
  if c is null then insert into public.agent_conversations(owner_id,employee_id) values(ids.owner,worker) returning id into c; end if;
  insert into public.agent_messages(owner_id,conversation_id,sender,body) values(ids.owner,c,'owner','Synthetic public role research request.') returning id into m;
  r:=public.begin_agent_role_research(ids.owner,worker,'Public role research guidance','Synthetic role specialist','Evidence for assigned work',jsonb_build_object('conversation_id',c,'message_id',m,'request_key','test-chat:'||m));
  perform pg_temp.web_assert(r->>'state'='claimed','research claimed for '||worker);j:=(r->>'job_id')::uuid;
  insert into web_fixture_jobs values(j);
  r:=public.begin_agent_role_research(ids.owner,worker,'Public role research guidance','Synthetic role specialist','Evidence for assigned work',jsonb_build_object('conversation_id',c,'message_id',m,'request_key','test-chat:'||m));
  perform pg_temp.web_assert(r->>'state'='running','replay does not re-execute');
  r:=public.finish_agent_role_research(ids.owner,j,'Synthetic source-backed report with enough evidence text and honest limitations. Source: https://example.com/official','[{"url":"https://example.com/official","title":"Official test evidence"}]','Synthetic safe summary');
  perform pg_temp.web_assert(r->>'state'='completed','report finished for '||worker);
  perform pg_temp.web_assert(exists(select 1 from public.agent_messages where id=(r->>'message_id')::uuid and owner_id=ids.owner and conversation_id=c and sender='employee'),'summary stays in requesting worker thread');
  begin perform public.finish_agent_role_research(ids.owner,j,'Duplicate report should not be saved, even with a source.','[{"url":"https://example.com/official"}]','Duplicate');raise exception 'duplicate accepted';exception when raise_exception then if sqlerrm='duplicate accepted' then raise;end if;end;
  update public.agent_role_research set started_at=now()-interval '2 hours' where id=j;
  update web_ids set cid=c,original=m;
 end loop;
end $$;

-- Real active custom-worker identity is validated against the owner and original message.
insert into public.agent_custom_bots(id,owner_id,name,role,mission,tone,instructions,skills,anti_jobs,starting_message,category,status)
 select bot,owner,'Synthetic researcher','Engineering research specialist','Research engineering designs for a synthetic test.','Clear','Use public technical sources and do not operate accounts.',array['Engineering'],array['No account actions'],'What should I research?','engineering','active' from web_ids;
do $$ declare ids record;m uuid;r jsonb;j uuid;begin
 select * into ids from web_ids;
 insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body) values(ids.owner,ids.bot,'owner','Research public engineering design guidance.') returning id into m;
 begin perform public.begin_agent_role_research(ids.other_owner,ids.bot::text,'Engineering design guidance','Engineer','Evidence',jsonb_build_object('bot_id',ids.bot,'message_id',m,'request_key','wrong-owner:'||m));raise exception 'other owner accepted';exception when raise_exception then if sqlerrm='other owner accepted' then raise;end if;end;
 r:=public.begin_agent_role_research(ids.owner,ids.bot::text,'Engineering design guidance','Engineer','Evidence',jsonb_build_object('bot_id',ids.bot,'message_id',m,'request_key','custom:'||m));j:=(r->>'job_id')::uuid;insert into web_fixture_jobs values(j);
 r:=public.finish_agent_role_research(ids.owner,j,'Complete synthetic engineering report with source evidence and limitations.','[{"url":"https://example.com/engineering"}]','Custom engineering evidence is ready.');
 perform pg_temp.web_assert(exists(select 1 from public.agent_custom_bot_messages where id=(r->>'message_id')::uuid and bot_id=ids.bot and owner_id=ids.owner),'custom result returns to exact bot');
 update public.agent_role_research set started_at=now()-interval '2 hours' where id=j;
 update public.agent_custom_bots set status='archived' where id=ids.bot;
 begin perform public.begin_agent_role_research(ids.owner,ids.bot::text,'Engineering design guidance','Engineer','Evidence',jsonb_build_object('bot_id',ids.bot,'message_id',m,'request_key','archived:'||m));raise exception 'archived accepted';exception when raise_exception then if sqlerrm='archived accepted' then raise;end if;end;
end $$;

-- Team evidence is committed to the project, not to the owner's private worker chat.
insert into public.agent_team_assignments(id,owner_id,title,instructions,employee_ids,source_employee_id,coordination_status)
 select assignment,owner,'Synthetic web project','Write a factual landscape script using public sources.',array['jordan','casey'],'alex','working' from web_ids;
insert into public.agent_worker_runs(id,owner_id,assignment_id,employee_id,status,provider,model)
 select run,owner,assignment,'jordan','running','groq','synthetic-no-provider' from web_ids;
insert into public.agent_project_sessions(assignment_id,owner_id,phase,revision,team_order,lead_worker,next_worker,active_run,active_worker,lease_until)
 select assignment,owner,'drafting',1,array['jordan','casey'],'jordan','jordan',run,'jordan',now()+interval '90 seconds' from web_ids;
do $$ declare ids record;r jsonb;j uuid;n int;begin
 select * into ids from web_ids;
 begin perform public.begin_agent_role_research(ids.owner,'casey','Landscape script photography','Creative specialist','Evidence',jsonb_build_object('assignment_id',ids.assignment,'revision',1,'run_id',ids.run,'request_key','wrong-worker:'||ids.run));raise exception 'wrong worker accepted';exception when raise_exception then if sqlerrm='wrong worker accepted' then raise;end if;end;
 select count(*) into n from public.agent_messages where owner_id=ids.owner;
 r:=public.begin_agent_role_research(ids.owner,'jordan','Landscape script photography','Creative specialist','Evidence',jsonb_build_object('assignment_id',ids.assignment,'revision',1,'run_id',ids.run,'request_key','project:'||ids.run));j:=(r->>'job_id')::uuid;insert into web_fixture_jobs values(j);
 r:=public.finish_agent_role_research(ids.owner,j,'A complete synthetic landscape research report with observed links and clear limitations.','[{"url":"https://example.com/landscape"}]','Landscape source evidence ready.');
 perform pg_temp.web_assert(r->>'state'='ready','team resumes after research');
 perform pg_temp.web_assert((select count(*)=n from public.agent_messages where owner_id=ids.owner),'project research does not spam private chats');
 perform pg_temp.web_assert(exists(select 1 from public.agent_team_messages where id=(r->>'message_id')::uuid and assignment_id=ids.assignment and sender_id='jordan' and body like 'PUBLIC_RESEARCH_V1%'),'source report appears as an actual team message');
 perform pg_temp.web_assert((select phase='drafting' and active_run is null and pending_research_query='' from public.agent_project_sessions where assignment_id=ids.assignment),'research does not falsely complete the project');
 update public.agent_role_research set started_at=now()-interval '2 hours' where id=j;
end $$;

-- Pause rejects a response that was already in flight.
do $$ declare ids record;r jsonb;j uuid;new_run uuid:=gen_random_uuid();begin
 select * into ids from web_ids;
 insert into public.agent_worker_runs(id,owner_id,assignment_id,employee_id,status,provider,model) values(new_run,ids.owner,ids.assignment,'jordan','running','groq','synthetic-no-provider');
 update public.agent_project_sessions set active_run=new_run,active_worker='jordan',lease_until=now()+interval '90 seconds' where assignment_id=ids.assignment;
 r:=public.begin_agent_role_research(ids.owner,'jordan','Landscape photography sources','Creative specialist','Evidence',jsonb_build_object('assignment_id',ids.assignment,'revision',1,'run_id',new_run,'request_key','stopped:'||new_run));j:=(r->>'job_id')::uuid;insert into web_fixture_jobs values(j);
 perform public.control_agent_project(ids.owner,ids.assignment,'pause');
 begin perform public.finish_agent_role_research(ids.owner,j,'This result arrived after the owner paused the project.','[{"url":"https://example.com/late"}]','Late result');raise exception 'paused result accepted';exception when raise_exception then if sqlerrm='paused result accepted' then raise;end if;end;
 perform pg_temp.web_assert((select status<>'completed' from public.agent_role_research where id=j),'paused search never claims completion');
 update public.agent_role_research set status='failed',started_at=now()-interval '2 hours' where id=j;
 perform public.control_agent_project(ids.owner,ids.assignment,'resume');
end $$;

-- Both the new and legacy endpoints see the same eight-report hourly allowance.
insert into public.agent_role_research(owner_id,employee_id,role_title,query,purpose,conversation_id,origin_message_id,request_key,status)
 select owner,'hq','Project coordinator','Project management guidance','Evidence',cid,original,'budget-fixture:'||gen_random_uuid(),'failed' from web_ids cross join generate_series(1,8) returning id;
do $$ declare ids record;r jsonb;legacy uuid;begin
 select * into ids from web_ids;
 r:=public.begin_agent_role_research(ids.owner,'hq','Project coordination guidance','Coordinator','Evidence',jsonb_build_object('conversation_id',ids.cid,'message_id',ids.original,'request_key','budget-check:'||gen_random_uuid()));
 perform pg_temp.web_assert(r->>'state'='budget','new endpoint stops at shared free allowance');
 insert into public.agent_research_jobs(owner_id,employee_id,conversation_id,query,status,approved_at) values(ids.owner,'hq',ids.cid,'Synthetic legacy query','approved',now()) returning id into legacy;
 begin perform public.claim_agent_research(ids.owner,'hq',legacy);raise exception 'legacy bypassed cap';exception when raise_exception then if sqlerrm='legacy bypassed cap' then raise;end if;end;
end $$;

select set_config('request.jwt.claim.sub',(select other_owner::text from web_ids),true);
set local role authenticated;
select pg_temp.web_assert((select count(*)=0 from public.agent_role_research),'another owner cannot read reports');
select pg_temp.web_assert(not has_function_privilege('authenticated','public.begin_agent_role_research(uuid,text,text,text,text,jsonb)','execute'),'browser cannot grant itself a research run');
select pg_temp.web_assert(not has_function_privilege('anon','public.finish_agent_role_research(uuid,uuid,text,jsonb,text)','execute'),'anonymous users cannot forge sources');
reset role;
select 'role research identity, public scope, team continuation, replay, pause, quota and RLS checks passed' as validation;
rollback;
