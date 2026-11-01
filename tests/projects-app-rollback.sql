-- Run inside BEGIN/ROLLBACK on the migrated schema. All fixture data rolls back.
do $$ declare own uuid:=gen_random_uuid(); other_own uuid:=gen_random_uuid(); a uuid; photo uuid:=gen_random_uuid(); result jsonb; c jsonb; rejected boolean;begin
 insert into auth.users(id,email) values(own,'project-photos-fixture@example.invalid'),(other_own,'project-photos-other@example.invalid');
 result:=public.create_agent_workspace_project(own,'alex','Create a study project with a reference photo.',jsonb_build_object('project_kind','personal','output_format','pdf'));a:=(result->>'id')::uuid;
 if not exists(select 1 from public.agent_project_sessions where assignment_id=a and revision=1) then raise exception 'New project is not immediately visible';end if;
 if has_function_privilege('authenticated','public.add_agent_project_photo(uuid,uuid,uuid,text,text,text,integer,integer,integer,text,integer)','execute') then raise exception 'Client can bypass photo authorization';end if;
 result:=public.add_agent_project_photo(own,a,photo,'style.jpg',own::text||'/'||a::text||'/references/'||photo::text||'.jpg',repeat('a',64),150,600,600,'Use the supplied palette and spacing.',1);
 if result->>'revision'<>'2' then raise exception 'Photo did not revise project context';end if;
 result:=public.add_agent_project_photo(own,a,photo,'style.jpg',own::text||'/'||a::text||'/references/'||photo::text||'.jpg',repeat('a',64),150,600,600,'Use the supplied palette and spacing.',1);
 if (select count(*) from public.agent_project_photos where assignment_id=a)<>1 or result->>'revision'<>'2' then raise exception 'Photo retry created duplicate work';end if;
 update public.agent_project_sessions set next_run_at=now() where assignment_id=a;
 c:=public.claim_agent_project_turn(own,a,'groq','fixture');
 perform public.complete_agent_project_photo_analysis(own,a,(c->>'run_id')::uuid,2,photo,'Visible reference observations: navy and ivory palette, clear serif typography and generous spacing.');
 if not exists(select 1 from public.agent_project_photos where id=photo and analysis_status='completed') then raise exception 'Photo observations did not save';end if;
 if exists(select 1 from public.agent_project_artifacts where assignment_id=a) or (select phase from public.agent_project_sessions where assignment_id=a)<>'planning' then raise exception 'Reference photo was mistaken for a finished deliverable';end if;
 rejected:=false;begin perform public.complete_agent_project_photo_analysis(own,a,(c->>'run_id')::uuid,2,photo,'A stale image analysis may not replace the saved observations.');exception when others then rejected:=true;end;if not rejected then raise exception 'Stale photo analysis accepted';end if;
 perform set_config('request.jwt.claim.sub',other_own::text,true);execute 'set local role authenticated';if (select count(*) from public.agent_project_photos where assignment_id=a)<>0 then raise exception 'Another owner read private reference photos';end if;execute 'reset role';
end $$;
