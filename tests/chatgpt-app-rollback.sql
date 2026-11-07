-- Real request, financial gate, handoff, answer return and final approval. All rows roll back.
begin;
do $$
declare own uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); bot uuid; r jsonb; financial jsonb; retry jsonb; h jsonb; conn jsonb; result jsonb;
 lease uuid:=gen_random_uuid(); files jsonb; worker text; sample text; count_before integer; rejected boolean; version_id uuid;
begin
 insert into auth.users(id,email) values(own,own::text||'@example.invalid'),(other_owner,other_owner::text||'@example.invalid');
 bot:=public.ensure_agent_secretary(own,jsonb_build_object('name','Eleanor','role','Executive Secretary','mission','Coordinate owner private ChatGPT requests and verified results.','tone','Professional','instructions','Preserve owner scope, hold financial topics and verify actual handoffs.','skills','[]'::jsonb,'anti_jobs','[]'::jsonb,'avatar_emoji','E','starting_message','Your secretary is ready.'),false);
 update public.agent_secretary_settings set chatgpt_delegate_nonfinancial=true where owner_id=own;
 foreach sample in array array['Pay the invoice','Set the advertising budget','Change product prices','Review profit margins','Explain tax payments','Open a subscription','Spend $25','Help with credit card billing','What is ROI?','Buy the software','Charge my card','Increase sales','Review cash expenses','Check bank fees','Discuss cryptocurrency investing'] loop
  if not agent_hq_private.chatgpt_money_related('casey',sample) then raise exception 'Money topic bypassed the gate: %',sample;end if;
 end loop;
 foreach worker in array array['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','eleanor'] loop
  r:=public.request_agent_chatgpt_help(own,worker,'Create a visual media kit using the supplied references.','The requested artwork needs ChatGPT creation tools.','fixture:'||worker);
  if worker='avery' then
   if r->>'status'<>'owner_required' or r->>'handoff_id' is not null then raise exception 'Financial specialist bypassed owner approval';end if;
  elsif r->>'status'<>'ready' or r->>'approved_by'<>'eleanor' or r->>'handoff_id' is null then raise exception 'Worker % could not request approved help: %',worker,r;end if;
 end loop;
 select count(*) into count_before from public.agent_custom_bot_messages where owner_id=own;
 retry:=public.request_agent_chatgpt_help(own,'eleanor','Create a visual media kit using the supplied references.','The requested artwork needs ChatGPT creation tools.','fixture:eleanor');
 if retry->>'id'<>r->>'id' or (select count(*) from public.agent_custom_bot_messages where owner_id=own)<>count_before then raise exception 'Retry duplicated the request or notice';end if;
 financial:=public.request_agent_chatgpt_help(own,'casey','Help me create the advertising budget for this launch.','The calculation needs additional analysis.','fixture:financial');
 if financial->>'status'<>'owner_required' or financial->>'handoff_id' is not null then raise exception 'Financial work was exposed before owner approval';end if;
 rejected:=false;begin perform public.decide_agent_chatgpt_request(other_owner,(financial->>'id')::uuid,'approve',(financial->>'project_revision')::integer);exception when others then rejected:=true;end;
 if not rejected then raise exception 'Other owner approved a request';end if;
 financial:=public.decide_agent_chatgpt_request(own,(financial->>'id')::uuid,'approve',(financial->>'project_revision')::integer);
 if financial->>'status'<>'ready' or financial->>'approved_by'<>'owner' or financial->>'owner_approved_at' is null then raise exception 'Owner approval was not verified';end if;
 -- Use an authorized nonfinancial request for the full return path.
 h:=public.claim_agent_chatgpt_handoff(own,(r->>'handoff_id')::uuid);
 if (select status from public.agent_chatgpt_requests where id=(r->>'id')::uuid)<>'in_progress' then raise exception 'Opened status was not based on an actual claim';end if;
 insert into public.agent_chatgpt_authorizations(client_id,redirect_uri,state,challenge,resource,scopes,owner_id,code_hash,approved_at)
 values('chatgpt-desk-fixture','https://chatgpt.com/connector_platform_oauth_redirect','fixture-state',repeat('P',43),'https://test.invalid/mcp','projects:read deliverables:write',own,repeat('a',64),now());
 conn:=public.exchange_agent_chatgpt_code(repeat('a',64),'chatgpt-desk-fixture','https://chatgpt.com/connector_platform_oauth_redirect',repeat('P',43),'https://test.invalid/mcp',repeat('b',64),repeat('c',64));
 perform public.begin_agent_chatgpt_return(own,(h->>'id')::uuid,(h->>'claim_id')::uuid,(r->>'project_revision')::integer,lease);
 files:=jsonb_build_array(jsonb_build_object('filename','Answer.md','mime_type','text/markdown','path',own::text||'/'||(r->>'project_id')||'/chatgpt/'||(h->>'id')||'/answer.md','sha256',repeat('a',64),'size_bytes',100));
 sample:='Here is the complete answer: prepare a service sheet, choose the relevant public examples, and assemble the media kit. The actual editable answer file is ready for owner review.';
 result:=public.finish_agent_chatgpt_handoff(own,(conn->>'connection_id')::uuid,(h->>'id')::uuid,(h->>'claim_id')::uuid,(r->>'project_revision')::integer,sample,repeat('d',64),files,lease);
 select output_version into version_id from public.agent_chatgpt_requests where id=(r->>'id')::uuid;
 if (select status from public.agent_chatgpt_requests where id=(r->>'id')::uuid)<>'review' or (select response_summary from public.agent_chatgpt_requests where id=(r->>'id')::uuid)<>sample then raise exception 'ChatGPT answer did not return for review';end if;
 if not exists(select 1 from public.agent_custom_bot_messages where owner_id=own and bot_id=bot and body like '%'||sample||'%') then raise exception 'Eleanor did not receive the readable answer';end if;
 if (select review_status from public.agent_project_sessions where assignment_id=(r->>'project_id')::uuid)<>'pending' then raise exception 'The result approved itself';end if;
 perform public.review_agent_project(own,(r->>'project_id')::uuid,version_id,'approve','');
 if (select status from public.agent_chatgpt_requests where id=(r->>'id')::uuid)<>'approved' then raise exception 'Final approval was not recorded';end if;
 update public.agent_secretary_settings set chatgpt_delegate_nonfinancial=false where owner_id=own;
 result:=public.request_agent_chatgpt_help(own,'maya','Prepare a creative visual outline for this project.','A second set of creation tools is needed.','fixture:disabled');
 if result->>'status'<>'owner_required' then raise exception 'Disabled delegation still approved work';end if;
 perform set_config('request.jwt.claim.sub',other_owner::text,true);execute 'set local role authenticated';
 if (select count(*) from public.agent_chatgpt_requests where owner_id=own)<>0 then raise exception 'Other owner read the request queue';end if;execute 'reset role';
 if has_table_privilege('authenticated','public.agent_chatgpt_requests','update') or has_function_privilege('authenticated','public.request_agent_chatgpt_help(uuid,text,text,text,text,uuid,integer,uuid)','execute') then raise exception 'A client can bypass Eleanor or forge approval';end if;
end $$;
rollback;
