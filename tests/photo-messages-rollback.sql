begin;
-- Fixture-only tests: all writes, replies and deletions are rolled back.
do $$
declare o uuid; other uuid:=gen_random_uuid(); bot uuid; c uuid; photo uuid; deleted_photo uuid; path text; blocked boolean; n bigint;
begin
 select id into o from auth.users limit 1;
 if o is null then raise exception 'An existing owner is required for rollback tests';end if;
 insert into public.agent_custom_bots(owner_id,name,role,mission,tone,instructions,status)
 values(o,'Photo fixture','Photo tester','Only a rollback photo fixture','Brief','This is a rollback photo fixture only.','active') returning id into bot;
 insert into public.agent_conversations(owner_id,employee_id) values(o,'riley') on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into c;
 photo:=gen_random_uuid();path:=o::text||'/'||bot::text||'/'||photo::text||'.jpg';
 insert into storage.objects(bucket_id,name,owner_id) values('agent-hq-camera',path,o::text);
 perform set_config('request.jwt.claim.sub',o::text,true);
 execute 'set local role authenticated';
 insert into public.agent_custom_message_photos(id,owner_id,bot_id,employee_id,storage_path,width,height)
 values(photo,o,bot,bot::text,path,100,100);
 if not exists(select 1 from public.agent_custom_message_photos where id=photo) then raise exception 'Owner cannot read own photo';end if;
 blocked:=false;begin perform public.finish_agent_photo_review(o,photo,'Must not be client-writable',true);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Client can create an AI photo reply';end if;
 perform set_config('request.jwt.claim.sub',other::text,true);
 if exists(select 1 from public.agent_custom_message_photos where id=photo) then raise exception 'Cross-owner photo readable';end if;
 delete from public.agent_custom_message_photos where id=photo;
 get diagnostics n=row_count;if n<>0 then raise exception 'Cross-owner photo deletable';end if;
 blocked:=false;begin insert into public.agent_custom_message_photos(owner_id,bot_id,employee_id,storage_path,width,height) values(o,bot,bot::text,path||'.bad',100,100);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-owner insert accepted';end if;
 execute 'reset role';
 update public.agent_custom_message_photos set analysis_status='processing' where id=photo;
 perform public.finish_agent_photo_review(o,photo,'Photo fixture completed',true);
 if not exists(select 1 from public.agent_custom_bot_messages where owner_id=o and bot_id=bot and body='Photo fixture completed') then raise exception 'Custom reply did not reach the selected worker';end if;
 blocked:=false;begin perform public.finish_agent_photo_review(o,photo,'Duplicate reply',true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Duplicate completion accepted';end if;
 -- A second, deleted photo must never receive a late response.
 deleted_photo:=gen_random_uuid();path:=o::text||'/'||bot::text||'/'||deleted_photo::text||'.jpg';
 insert into public.agent_custom_message_photos(id,owner_id,bot_id,employee_id,storage_path,width,height,analysis_status) values(deleted_photo,o,bot,bot::text,path,100,100,'processing');
 perform set_config('request.jwt.claim.sub',o::text,true);execute 'set local role authenticated';
 delete from public.agent_custom_message_photos where id=deleted_photo;
 execute 'reset role';
 blocked:=false;begin perform public.finish_agent_photo_review(o,deleted_photo,'Late reply',true);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Deleted photo received a late reply';end if;
 -- Built-in delivery uses the original photo table and exact conversation.
 photo:=gen_random_uuid();path:=o::text||'/riley/'||photo::text||'.jpg';
 insert into public.agent_message_photos(id,owner_id,conversation_id,employee_id,storage_path,width,height,analysis_status) values(photo,o,c,'riley',path,100,100,'processing');
 perform public.finish_agent_photo_review(o,photo,'Built-in photo fixture completed',false);
 if not exists(select 1 from public.agent_messages where owner_id=o and conversation_id=c and body='Built-in photo fixture completed') then raise exception 'Built-in reply lost';end if;
 blocked:=false;begin perform public.finish_agent_photo_review(other,photo,'Wrong owner',false);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Wrong-owner completion accepted';end if;
 -- Archived workers cannot receive new attachments.
 update public.agent_custom_bots set status='archived' where id=bot;
 photo:=gen_random_uuid();path:=o::text||'/'||bot::text||'/'||photo::text||'.jpg';
 insert into storage.objects(bucket_id,name,owner_id) values('agent-hq-camera',path,o::text);
 execute 'set local role authenticated';
 blocked:=false;begin insert into public.agent_custom_message_photos(owner_id,bot_id,employee_id,storage_path,width,height) values(o,bot,bot::text,path,100,100);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Archived worker accepted a photo';end if;
 execute 'reset role';
 if has_function_privilege('anon','public.finish_agent_photo_review(uuid,uuid,text,boolean)','EXECUTE') or has_function_privilege('authenticated','public.finish_agent_photo_review(uuid,uuid,text,boolean)','EXECUTE') then raise exception 'Overbroad photo completion grant';end if;
end $$;
rollback;
