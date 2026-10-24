begin;
-- Execute after the migration, or inside the same outer rollback transaction.
do $$
declare o uuid; a uuid; b uuid; result jsonb; rid uuid; second_id uuid; ctx public.agent_social_read_chat_state%rowtype; chosen integer; blocked boolean;
begin
 select id into o from auth.users where id in (select owner_id from public.agent_personal_accounts where platform='facebook') limit 1;
 if o is null then raise exception 'A saved Facebook profile owner is required for rollback-only tests';end if;
 insert into public.agent_personal_accounts(owner_id,platform,label,handle) values(o,'facebook','RileyUnitAlpha','riley.unit.alpha') returning id into a;
 insert into public.agent_personal_accounts(owner_id,platform,label,handle) values(o,'facebook','RileyUnitBeta','riley.unit.beta') returning id into b;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','Check my Facebook profile RileyUnitAlpha','intent','request'));
 rid:=(result->>'request_id')::uuid;
 if rid is null or not exists(select 1 from public.agent_social_read_requests where id=rid and account_id=a and status='pending' and prompt_message_id is not null) then raise exception 'Chat did not create an exact pending profile review';end if;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','approved','intent','approve'));
 if (result->>'start_read_id') is distinct from rid::text then raise exception 'Typed approval did not bind the current request';end if;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','approved','intent','approve'));
 if result->>'start_read_id' is not null then raise exception 'Repeated approval started another handoff';end if;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','continue','intent','continue'));
 if (result->>'start_read_id') is distinct from rid::text then raise exception 'Explicit continue did not retry the same approved request';end if;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','stop','intent','deny'));
 if (select status from public.agent_social_read_requests where id=rid)<>'revoked' then raise exception 'Typed stop did not revoke';end if;
 blocked:=false;begin perform public.agent_social_read_transition(gen_random_uuid(),'approve',jsonb_build_object('id',rid));exception when others then blocked:=true;end;if not blocked then raise exception 'Cross-owner decision accepted';end if;

 result:=public.agent_social_read_chat(o,jsonb_build_object('text','Check my Facebook profile RileyUnitAlpha again','intent','request'));rid:=(result->>'request_id')::uuid;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','Check my Facebook profile RileyUnitBeta','intent','request'));second_id:=(result->>'request_id')::uuid;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','approved','intent','approve'));
 if result->>'start_read_id' is not null or exists(select 1 from public.agent_social_read_requests where id in (rid,second_id) and status<>'pending') then raise exception 'Ambiguous approval was executed';end if;
 select * into ctx from public.agent_social_read_chat_state where owner_id=o;
 select ordinality::integer into chosen from jsonb_array_elements(ctx.options) with ordinality where value->>'id'=second_id::text;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','approve '||chosen,'intent','approve','choice',chosen));
 if (result->>'start_read_id') is distinct from second_id::text or (select status from public.agent_social_read_requests where id=rid)<>'pending' then raise exception 'Numbered decision approved the wrong request';end if;
 perform public.agent_social_read_transition(o,'revoke',jsonb_build_object('id',second_id));
 perform public.agent_social_read_transition(o,'deny',jsonb_build_object('id',rid));

 result:=public.agent_social_read_chat(o,jsonb_build_object('text','Check my Facebook profile','intent','request'));
 select * into ctx from public.agent_social_read_chat_state where owner_id=o;
 if ctx.stage is distinct from 'profile' then raise exception 'Multiple profiles did not prompt inside chat';end if;
 select ordinality::integer into chosen from jsonb_array_elements(ctx.options) with ordinality where value->>'id'=a::text;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text',chosen::text,'intent','other','choice',chosen));rid:=(result->>'request_id')::uuid;
 if rid is null or (select account_id from public.agent_social_read_requests where id=rid)<>a then raise exception 'Chat profile selection failed';end if;
 update public.agent_social_read_requests set expires_at=now()-interval '1 second' where id=rid;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','approved','intent','approve'));
 if result->>'start_read_id' is not null or (select status from public.agent_social_read_requests where id=rid)<>'pending' then raise exception 'Expired text approval was accepted';end if;

 update public.agent_personal_accounts set handle='Missing profile URL' where id=b;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','Review Facebook RileyUnitBeta','intent','request'));
 select * into ctx from public.agent_social_read_chat_state where owner_id=o;
 if ctx.stage is distinct from 'url' then raise exception 'Missing URL did not ask inside the thread';end if;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','https://www.facebook.com/riley.unit.beta','intent','other','source_url','https://www.facebook.com/riley.unit.beta'));rid:=(result->>'request_id')::uuid;
 if rid is null then raise exception 'A link reply did not finish request preparation';end if;
 insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) select o,conversation_id,'employee','An unrelated question for a controlled test',clock_timestamp() from public.agent_social_read_requests where id=rid;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','approved','intent','approve'));
 if (result->>'handled') is distinct from 'false' or (select status from public.agent_social_read_requests where id=rid)<>'pending' then raise exception 'Stale or unrelated question authorized a Facebook read';end if;

 -- No-account setup is completed in text; these temporary fixture changes are
 -- uncommitted and fully rolled back by the enclosing transaction.
 update public.agent_personal_accounts set platform='instagram' where owner_id=o and platform='facebook';
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','Check my Facebook profile','intent','request'));
 select * into ctx from public.agent_social_read_chat_state where owner_id=o;
 if ctx.stage is distinct from 'url' then raise exception 'No-profile setup required an Accounts detour';end if;
 result:=public.agent_social_read_chat(o,jsonb_build_object('text','https://www.facebook.com/riley.new.profile','intent','other','source_url','https://www.facebook.com/riley.new.profile'));rid:=(result->>'request_id')::uuid;
 if rid is null then raise exception 'Profile link could not be supplied in chat';end if;
 if has_table_privilege('authenticated','public.agent_social_read_chat_state','select') or has_table_privilege('anon','public.agent_social_read_chat_state','select') or has_function_privilege('authenticated','public.agent_social_read_chat(uuid,jsonb)','execute') or has_function_privilege('anon','public.agent_social_read_chat_notice(uuid,uuid)','execute') then raise exception 'Unexpected public chat-state access';end if;
end $$;

rollback;
select 'PASS: conversational Facebook decisions, choices, expiry and owner isolation; all test changes rolled back' as result;
