-- Run only inside BEGIN/ROLLBACK. Every project and credential below is disposable test data.
do $$ declare own uuid:=gen_random_uuid(); other_own uuid:=gen_random_uuid(); aid uuid; c jsonb; q jsonb; h jsonb; result jsonb; lease uuid:=gen_random_uuid(); rejected boolean; files jsonb;begin
 insert into auth.users(id,email) values(own,'chatgpt-owner-fixture@example.invalid'),(other_own,'chatgpt-other-fixture@example.invalid');
 insert into public.agent_chatgpt_authorizations(client_id,redirect_uri,state,challenge,resource,scopes,owner_id,code_hash,approved_at)
 values('fixture-client','https://chatgpt.com/connector_platform_oauth_redirect','test-state',repeat('P',43),'https://test.invalid/mcp','projects:read deliverables:write',own,repeat('a',64),now());
 rejected:=false;begin perform public.exchange_agent_chatgpt_code(repeat('a',64),'fixture-client','https://chatgpt.com/connector_platform_oauth_redirect',repeat('X',43),'https://test.invalid/mcp',repeat('b',64),repeat('c',64));exception when others then rejected:=true;end;if not rejected then raise exception 'Wrong PKCE accepted';end if;
 c:=public.exchange_agent_chatgpt_code(repeat('a',64),'fixture-client','https://chatgpt.com/connector_platform_oauth_redirect',repeat('P',43),'https://test.invalid/mcp',repeat('b',64),repeat('c',64));
 rejected:=false;begin perform public.exchange_agent_chatgpt_code(repeat('a',64),'fixture-client','https://chatgpt.com/connector_platform_oauth_redirect',repeat('P',43),'https://test.invalid/mcp',repeat('d',64),repeat('e',64));exception when others then rejected:=true;end;if not rejected then raise exception 'Code replay accepted';end if;
 perform public.refresh_agent_chatgpt_connection(repeat('c',64),'fixture-client','https://test.invalid/mcp',repeat('f',64),repeat('0',64));
 rejected:=false;begin perform public.refresh_agent_chatgpt_connection(repeat('c',64),'fixture-client','https://test.invalid/mcp',repeat('d',64),repeat('e',64));exception when others then rejected:=true;end;if not rejected then raise exception 'Refresh token replay accepted';end if;
 result:=public.create_agent_workspace_project(own,'alex','ChatGPT handoff fixture: return a study plan PDF.',jsonb_build_object('project_kind','personal','output_format','pdf'));aid:=(result->>'id')::uuid;
 q:=public.queue_agent_chatgpt_handoff(own,aid,1,'Create the actual study plan PDF from this project.');
 if q->>'revision'<>'2' or not(select owner_paused from public.agent_team_assignments where id=aid) then raise exception 'Handoff did not isolate a new revision and hold internal work';end if;
 result:=public.queue_agent_chatgpt_handoff(own,aid,1,'Create the actual study plan PDF from this project.');if result->>'handoff_id'<>q->>'handoff_id' then raise exception 'Handoff retry duplicated work';end if;
 rejected:=false;begin perform public.claim_agent_chatgpt_handoff(other_own,(q->>'handoff_id')::uuid);exception when others then rejected:=true;end;if not rejected then raise exception 'Other owner claimed a project';end if;
 h:=public.claim_agent_chatgpt_handoff(own,(q->>'handoff_id')::uuid);
 perform public.begin_agent_chatgpt_return(own,(h->>'id')::uuid,(h->>'claim_id')::uuid,2,lease);
 rejected:=false;begin perform public.begin_agent_chatgpt_return(own,(h->>'id')::uuid,(h->>'claim_id')::uuid,2,gen_random_uuid());exception when others then rejected:=true;end;if not rejected then raise exception 'Concurrent file return accepted';end if;
 files:=jsonb_build_array(jsonb_build_object('filename','Study-plan.pdf','mime_type','application/pdf','path',own::text||'/'||aid::text||'/chatgpt/'||(h->>'id')||'/study-plan.pdf','sha256',repeat('a',64),'size_bytes',1024));
 update public.agent_chatgpt_connections set revoked_at=now() where id=(c->>'connection_id')::uuid;
 rejected:=false;begin perform public.finish_agent_chatgpt_handoff(own,(c->>'connection_id')::uuid,(h->>'id')::uuid,(h->>'claim_id')::uuid,2,'A real study plan PDF was returned for the owner to review.',repeat('b',64),files,lease);exception when others then rejected:=true;end;if not rejected then raise exception 'Revoked connection returned files';end if;
 update public.agent_chatgpt_connections set revoked_at=null where id=(c->>'connection_id')::uuid;
 result:=public.finish_agent_chatgpt_handoff(own,(c->>'connection_id')::uuid,(h->>'id')::uuid,(h->>'claim_id')::uuid,2,'A real study plan PDF was returned for the owner to review.',repeat('b',64),files,lease);
 if (select phase from public.agent_project_sessions where assignment_id=aid)<>'review' or (select owner_paused from public.agent_team_assignments where id=aid) or (select count(*) from public.agent_project_artifacts where assignment_id=aid and status='ready')<>1 then raise exception 'Files were not handed back for owner review';end if;
 if not exists(select 1 from public.agent_worker_runs where assignment_id=aid and provider='chatgpt_handoff') then raise exception 'False AI provenance';end if;
 perform public.finish_agent_chatgpt_handoff(own,(c->>'connection_id')::uuid,(h->>'id')::uuid,(h->>'claim_id')::uuid,2,'A real study plan PDF was returned for the owner to review.',repeat('b',64),files,lease);
 if (select count(*) from public.agent_project_artifacts where assignment_id=aid)<>1 then raise exception 'Retry created duplicate files';end if;
 perform public.review_agent_project(own,aid,(result->>'output_version')::uuid,'changes','Make section two shorter and keep the source notes.');
 if (select revision from public.agent_project_sessions where assignment_id=aid)<>3 or not exists(select 1 from public.agent_chatgpt_handoffs where assignment_id=aid and status='ready' and owner_feedback like 'Make section%') then raise exception 'Requested image/file revisions did not route back to ChatGPT';end if;
 h:=public.claim_agent_chatgpt_handoff(own,(select id from public.agent_chatgpt_handoffs where assignment_id=aid and status='ready'));
 update public.agent_project_sessions set revision=revision+1 where assignment_id=aid;
 rejected:=false;begin perform public.claim_agent_chatgpt_handoff(own,(h->>'id')::uuid);exception when others then rejected:=true;end;if not rejected then raise exception 'Stale project context accepted';end if;
 perform public.cancel_agent_chatgpt_handoff(own,(h->>'id')::uuid);
 if (select owner_paused from public.agent_team_assignments where id=aid) then raise exception 'Cancellation did not release internal work';end if;
 if has_function_privilege('authenticated','public.finish_agent_chatgpt_handoff(uuid,uuid,uuid,uuid,integer,text,text,jsonb,uuid)','execute') or has_table_privilege('authenticated','public.agent_chatgpt_connections','select') then raise exception 'Client can access connector credentials or bypass file verification';end if;
end $$;
