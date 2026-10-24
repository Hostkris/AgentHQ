begin;
-- All fixtures and deletions are rolled back. Never delete existing messages.
do $$
declare o uuid; other uuid:=gen_random_uuid(); c uuid; a uuid; m uuid; rid uuid;
 b uuid; bid uuid; job uuid; note uuid; req uuid; phase text; blocked boolean;
begin
 select id into o from auth.users limit 1;
 if o is null then raise exception 'A signed-in owner is required for rollback tests';end if;
 perform set_config('request.jwt.claim.sub',o::text,true);
 insert into public.agent_conversations(owner_id,employee_id) values(o,'riley')
  on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into c;
 insert into public.agent_personal_accounts(owner_id,platform,label,handle) values(o,'facebook','Delete test fixture','delete.fixture') returning id into a;
 foreach phase in array array['pending','approved','analyzing','completed','failed','denied','revoked','expired'] loop
  insert into public.agent_messages(owner_id,conversation_id,sender,body) values(o,c,'employee','Delete test request') returning id into m;
  insert into public.agent_social_read_requests(owner_id,account_id,conversation_id,source_url,purpose,status,prompt_message_id,expires_at)
   values(o,a,c,'https://www.facebook.com/delete.fixture','Rollback deletion check',case when phase='expired' then 'pending' else phase end,m,case when phase='expired' then now()-interval '1 hour' else now()+interval '1 hour' end) returning id into rid;
  if phase='approved' then
   insert into public.agent_social_read_handoffs(request_id,token_hash) values(rid,repeat('a',64));
  end if;
  perform set_config('request.jwt.claim.sub',other::text,true);
  blocked:=false;begin perform public.dismiss_agent_chat_item('social',rid::text);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Cross-owner request deletion succeeded';end if;
  perform set_config('request.jwt.claim.sub',o::text,true);
  if phase='completed' then perform public.delete_agent_chat_message(m);else perform public.dismiss_agent_chat_item('social',rid::text);end if;
  perform public.dismiss_agent_chat_item('social',rid::text); -- repeat tap is harmless
  if exists(select 1 from public.agent_messages where id=m) then raise exception 'Request prompt survived deletion';end if;
  if not exists(select 1 from public.agent_chat_dismissals where owner_id=o and kind='social' and item_key=rid::text) then raise exception 'Request can reappear as unanchored card';end if;
  if exists(select 1 from public.agent_social_read_requests where id=rid and status in ('pending','approved','analyzing')) or exists(select 1 from public.agent_social_read_handoffs where request_id=rid) then raise exception 'Dismissed request retained live permission';end if;
 end loop;
 -- A legacy card with no prompt must also stay dismissed.
 insert into public.agent_social_read_requests(owner_id,account_id,conversation_id,source_url,purpose,status)
  values(o,a,c,'https://www.facebook.com/delete.fixture','Legacy card deletion check','completed') returning id into rid;
 perform public.dismiss_agent_chat_item('social',rid::text);
 if not exists(select 1 from public.agent_chat_dismissals where owner_id=o and kind='social' and item_key=rid::text) then raise exception 'Legacy card not dismissed';end if;
 insert into public.agent_messages(owner_id,conversation_id,sender,body) values(o,c,'owner','Delete only this fixture') returning id into m;
 perform set_config('request.jwt.claim.sub',other::text,true);
 blocked:=false;begin perform public.delete_agent_chat_message(m);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-owner message deletion succeeded';end if;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.delete_agent_chat_message(m);
 if exists(select 1 from public.agent_messages where id=m) then raise exception 'Text message not deleted';end if;
 insert into public.agent_custom_bots(owner_id,name,role,mission,tone,instructions)
  values(o,'Delete fixture','Fixture worker','Only for rollback tests','Brief','This worker is only a rollback test fixture.') returning id into b;
 insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body) values(o,b,'worker','Fixture worker text') returning id into bid;
 perform public.dismiss_agent_chat_item('bot',bid::text);
 perform public.dismiss_agent_chat_item('welcome',b::text);
 if exists(select 1 from public.agent_custom_bot_messages where id=bid) or not exists(select 1 from public.agent_custom_bots where id=b) then raise exception 'Custom worker deletion affected the wrong object';end if;
 insert into public.agent_team_assignments(owner_id,title,instructions,employee_ids) values(o,'Delete fixture','Rollback only',array['riley']) returning id into job;
 insert into public.agent_team_messages(owner_id,assignment_id,sender_kind,sender_id,body) values(o,job,'owner','owner','CREATIVE_REVIEW_V1|APPROVED|fixture') returning id into note;
 perform public.dismiss_agent_chat_item('team',note::text);
 perform public.dismiss_agent_chat_item('work',job::text);
 if not exists(select 1 from public.agent_team_messages where id=note) or not exists(select 1 from public.agent_team_assignments where id=job) then raise exception 'Message dismissal erased assignment/approval audit';end if;
 insert into public.agent_permission_requests(owner_id,employee_id,target_url,reason) values(o,'riley','https://example.com','Rollback only') returning id into req;
 perform public.dismiss_agent_chat_item('approval',req::text);
 if (select status from public.agent_permission_requests where id=req)<>'denied' then raise exception 'Deleted approval still pending';end if;
 perform public.dismiss_agent_chat_item('connector','riley:'||m::text);
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false;begin perform public.dismiss_agent_chat_item('work',job::text);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Unauthenticated dismissal accepted';end if;
 if has_function_privilege('anon','public.dismiss_agent_chat_item(text,text)','EXECUTE') or has_table_privilege('authenticated','public.agent_chat_dismissals','INSERT') then raise exception 'Overbroad client grants';end if;
 perform set_config('request.jwt.claim.sub',other::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.agent_chat_dismissals) then raise exception 'Cross-owner dismissal ledger readable';end if;
 execute 'reset role';
end $$;
rollback;
