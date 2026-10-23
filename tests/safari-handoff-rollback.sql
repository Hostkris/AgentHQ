begin;
do $$
declare o uuid; a uuid; req jsonb; rid uuid; blocked boolean; result jsonb;
begin
 select owner_id,id into o,a from public.agent_personal_accounts where platform='facebook' limit 1;
 if o is null then raise exception 'Saved Facebook profile required for rollback-only tests'; end if;
 req:=public.agent_social_read_transition(o,'request',jsonb_build_object('account_id',a,'source_url','https://www.facebook.com/example','purpose','Rollback-only Safari handoff test'));rid:=(req->>'id')::uuid;
 blocked:=false;begin perform public.agent_social_read_handoff('issue',o,rid,repeat('a',64));exception when others then blocked:=true;end;if not blocked then raise exception 'Pending request got a handoff';end if;
 perform public.agent_social_read_transition(o,'approve',jsonb_build_object('id',rid));
 blocked:=false;begin perform public.agent_social_read_handoff('issue',gen_random_uuid(),rid,repeat('a',64));exception when others then blocked:=true;end;if not blocked then raise exception 'Cross-owner handoff accepted';end if;
 perform public.agent_social_read_handoff('issue',o,rid,repeat('a',64));
 result:=public.agent_social_read_handoff('resolve',null,null,repeat('a',64));
 if result->>'owner_id'<>o::text or result->>'id'<>rid::text then raise exception 'Wrong owner or request resolved';end if;
 perform public.agent_social_read_handoff('issue',o,rid,repeat('b',64));
 if public.agent_social_read_handoff('resolve',null,null,repeat('a',64)) is not null then raise exception 'Rotated token still works';end if;
 if public.agent_social_read_handoff('resolve',null,null,repeat('c',64)) is not null then raise exception 'Unknown token accepted';end if;
 perform public.agent_social_read_transition(o,'claim',jsonb_build_object('id',rid,'source_url','https://www.facebook.com/example','captured_at',now()));
 if public.agent_social_read_handoff('resolve',null,null,repeat('b',64)) is not null then raise exception 'Consumed token accepted';end if;
 perform public.agent_social_read_transition(o,'revoke',jsonb_build_object('id',rid));
 if public.agent_social_read_handoff('resolve',null,null,repeat('b',64)) is not null then raise exception 'Revoked token accepted';end if;
 req:=public.agent_social_read_transition(o,'request',jsonb_build_object('account_id',a,'source_url','https://www.facebook.com/example','purpose','Rollback-only expired Safari handoff test'));rid:=(req->>'id')::uuid;
 perform public.agent_social_read_transition(o,'approve',jsonb_build_object('id',rid));
 perform public.agent_social_read_handoff('issue',o,rid,repeat('d',64));
 update public.agent_social_read_requests set expires_at=now()-interval '1 second' where id=rid;
 if public.agent_social_read_handoff('resolve',null,null,repeat('d',64)) is not null then raise exception 'Expired token accepted';end if;
 if has_table_privilege('anon','public.agent_social_read_handoffs','select') or has_table_privilege('authenticated','public.agent_social_read_handoffs','select') or has_table_privilege('authenticated','public.agent_social_read_handoffs','insert') or has_function_privilege('anon','public.agent_social_read_handoff(text,uuid,uuid,text)','execute') or has_function_privilege('authenticated','public.agent_social_read_handoff(text,uuid,uuid,text)','execute') then raise exception 'Unexpected handoff client privilege';end if;
end $$;
rollback;
select 'PASS: approval, owner binding, rotation, unknown, one-use, expiry, revocation and server-only capability access; all test writes rolled back' as result;
