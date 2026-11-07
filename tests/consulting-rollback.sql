-- Real project, final-file gate, Eleanor relay and privacy checks; no data survives.
begin;
do $$
declare own uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); secretary uuid; project uuid; custom uuid; research uuid; cid uuid;
 claim jsonb; run uuid; result jsonb; version_id uuid; rejected boolean; copied text; count_before integer;
 guide text:=E'Goal: Create a business pitch.\nMaterials: service sheet and examples.\nSteps: 1. Choose a business. 2. Review public needs. 3. Prepare an honest pitch.\nExample: Here is a service we can offer.\nChecks: Verify every claim.\nNext action: prepare the first draft.\n'||repeat('Additional complete instructions 👩 — preserve every step. ',190);
 work text:=repeat('The complete editable pitch uses verified owner facts and clearly labelled placeholders. ',4);
begin
 insert into auth.users(id,email) values(own,own::text||'@example.invalid'),(other_owner,other_owner::text||'@example.invalid');
 secretary:=public.ensure_agent_secretary(own,jsonb_build_object('name','Eleanor','role','Executive Secretary','mission','Deliver the owner private consulting guides and verified records.','tone','Professional','instructions','Preserve complete owner instructions and verified specialist results.','skills','[]'::jsonb,'anti_jobs','[]'::jsonb,'avatar_emoji','E','starting_message','Your secretary records are ready.'),false);
 result:=public.create_agent_workspace_project(own,'casey','Create a business pitch and explain how to use it.',jsonb_build_object('output_format','markdown','project_kind','general'));
 project:=(result->>'id')::uuid;
 claim:=public.claim_agent_project_turn(own,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
 if not (select consulting_guide_required from public.agent_project_sessions where assignment_id=project) then raise exception 'New project did not require a guide';end if;
 perform public.commit_agent_project_turn(own,project,run,1,jsonb_build_object('kind','plan','text','Casey prepares the useful pitch; Jordan checks clarity.','lead_worker','casey','routes',jsonb_build_array(jsonb_build_object('worker','casey','title','Pitch and practical method','instructions','Create the full pitch and teach the owner the steps.'),jsonb_build_object('worker','jordan','title','Pitch review','instructions','Review the supplied pitch and practical instructions.'))));
 for n in 1..2 loop
  update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
  claim:=public.claim_agent_project_turn(own,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
  perform public.commit_agent_project_turn(own,project,run,1,jsonb_build_object('kind','contribute','text',work));
 end loop;
 update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
 claim:=public.claim_agent_project_turn(own,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
 perform public.commit_agent_project_turn(own,project,run,1,jsonb_build_object('kind','draft','text',work));
 update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
 claim:=public.claim_agent_project_turn(own,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
 perform public.commit_agent_project_turn(own,project,run,1,jsonb_build_object('kind','check','text','Casey, the actual draft is complete; keep its concrete examples and explain the steps.'));
 update public.agent_project_sessions set next_run_at=now() where assignment_id=project;
 claim:=public.claim_agent_project_turn(own,project,'groq','fixture');run:=(claim->>'run_id')::uuid;
 insert into public.agent_role_research(owner_id,employee_id,role_title,query,purpose,assignment_id,project_revision,project_run,request_key,status,report,sources,finished_at)
 values(own,'casey','Social Media Director','public business pitch examples','Evidence for this pitch',project,1,run,'consulting-fixture-source','completed','Fixture evidence only.',jsonb_build_array(jsonb_build_object('title','Observed official example','url','https://example.com/official')),now());
 rejected:=false;
 begin perform public.commit_agent_project_turn(own,project,run,1,jsonb_build_object('kind','final','text',work));exception when others then if sqlerrm like '%consulting guide%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'Finalized without the required guide';end if;
 if exists(select 1 from public.agent_custom_bot_messages where owner_id=own and consultation_project_id=project) then raise exception 'An unfinished guide was delivered';end if;
 insert into public.agent_project_artifacts(owner_id,assignment_id,revision,run_id,employee_id,artifact_kind,filename,mime_type,object_path,sha256,source_sha256,size_bytes)
 values(own,project,1,run,'casey','final','fixture.md','text/markdown',own::text||'/'||project::text||'/fixture.md',repeat('a',64),repeat('b',64),100);
 perform public.commit_agent_project_turn(own,project,run,1,jsonb_build_object('kind','final','text',work,'guide',guide));
 select output_version into version_id from public.agent_project_sessions where assignment_id=project;
 if (select consulting_guide from public.agent_project_sessions where assignment_id=project)<>guide then raise exception 'Saved guide changed';end if;
 select string_agg(substring(body from position(E'\n\n' in body)+2),'' order by consultation_part) into copied from public.agent_custom_bot_messages where owner_id=own and bot_id=secretary and consultation_project_id=project;
 if position(guide in copied)=0 or position(btrim(work) in copied)=0 or position('https://example.com/official' in copied)=0 then raise exception 'Incomplete Eleanor delivery: guide %, work %, sources %, size %',position(guide in copied),position(btrim(work) in copied),position('https://example.com/official' in copied),char_length(copied);end if;
 if exists(select 1 from public.agent_custom_bot_messages where owner_id=own and char_length(body)>6000) then raise exception 'Guide part exceeded the message limit';end if;
 if (select phase from public.agent_project_sessions where assignment_id=project)<>'review' or (select review_status from public.agent_project_sessions where assignment_id=project)<>'pending' then raise exception 'Guide delivery approved the work';end if;
 select count(*) into count_before from public.agent_custom_bot_messages where owner_id=own and consultation_project_id=project;
 result:=public.deliver_agent_consultation(own,'project:'||project::text||':'||version_id::text,'casey',copied,project,1,version_id);
 if result->>'state'<>'already_delivered' or (select count(*) from public.agent_custom_bot_messages where owner_id=own and consultation_project_id=project)<>count_before then raise exception 'Retry duplicated the guide';end if;
 rejected:=false;
 begin perform public.deliver_agent_consultation(other_owner,'project:'||project::text||':'||version_id::text,'casey',copied,project,1,version_id);exception when others then rejected:=true;end;
 if not rejected then raise exception 'Cross-owner guide delivery accepted';end if;
 perform set_config('request.jwt.claim.sub',other_owner::text,true);execute 'set local role authenticated';
 if (select count(*) from public.agent_custom_bot_messages where owner_id=own)<>0 then raise exception 'Other owner read Eleanor guides';end if;execute 'reset role';
 if has_function_privilege('authenticated','public.deliver_agent_consultation(uuid,text,text,text,uuid,integer,uuid)','execute') then raise exception 'Client can forge specialist delivery';end if;
 delete from public.agent_custom_bot_messages where owner_id=own and consultation_project_id=project;
 perform public.deliver_agent_consultation(own,'project:'||project::text||':'||version_id::text,'casey',copied,project,1,version_id);
 if exists(select 1 from public.agent_custom_bot_messages where owner_id=own and consultation_project_id=project) then raise exception 'Retry resurrected a deleted guide';end if;
 insert into public.agent_custom_bots(owner_id,name,role,mission,tone,instructions,status) values(own,'Fixture specialist','Design consultant','Teach the owner to make a useful design.','Clear','Preserve the owner brief and provide complete practical instructions.','active') returning id into custom;
 insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body,consultation_requested) values(own,custom,'worker',left(guide,5000),true);
 if not exists(select 1 from public.agent_custom_bot_messages where owner_id=own and bot_id=secretary and body like '%From: Fixture specialist%') then raise exception 'Custom consultant did not deliver through Eleanor';end if;
 insert into public.agent_conversations(owner_id,employee_id) values(own,'riley') returning id into cid;
 insert into public.agent_role_research(owner_id,employee_id,role_title,query,purpose,request_key,conversation_id) values(own,'riley','Market Research Analyst','public media pitch examples','Inform the owner guide','consulting-direct-fixture',cid) returning id into research;
 update public.agent_role_research set status='completed',report=work||E'\nhttps://example.com/observed',sources=jsonb_build_array(jsonb_build_object('title','Observed source','url','https://example.com/observed')),finished_at=now() where id=research;
 if not exists(select 1 from public.agent_custom_bot_messages where owner_id=own and bot_id=secretary and body like '%From: Riley%' and body like '%https://example.com/observed%') then raise exception 'Direct research was not delivered through Eleanor';end if;
end $$;
rollback;
