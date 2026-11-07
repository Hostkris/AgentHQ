-- Run against the migrated schema; all fixture profiles, users and messages roll back.
begin;
do $$
declare own uuid:=gen_random_uuid(); bot uuid; ordinary uuid; spec jsonb;
 full_text text:=repeat('Keep complete secretary instructions. ',180);
 rejected text;
begin
 insert into auth.users(id,email) values(own,own::text||'@example.invalid');
 spec:=jsonb_build_object('name','Eleanor','role','Executive Secretary',
  'mission','Preserve complete owner instructions and verified administrative records.',
  'tone','Professional and precise','instructions',full_text,'skills','[]'::jsonb,
  'anti_jobs','[]'::jsonb,'avatar_emoji','👩','starting_message','Your secretary is ready.');
 bot:=public.ensure_agent_secretary(own,spec,false);
 if (select instructions from public.agent_custom_bots where id=bot)<>full_text then
  raise exception 'Secretary creation truncated the complete instructions';
 end if;
 if public.ensure_agent_secretary(own,spec,false)<>bot then raise exception 'Secretary creation duplicated the worker';end if;
 update public.agent_custom_bots set instructions=repeat('👩',8000) where id=bot;
 rejected:=null;
 begin
  update public.agent_custom_bots set instructions=repeat('👩',8001) where id=bot;
 exception when check_violation then get stacked diagnostics rejected=constraint_name;
 end;
 if rejected is distinct from 'agent_custom_bots_instructions_check' then raise exception 'Secretary overflow accepted';end if;
 if (select char_length(instructions) from public.agent_custom_bots where id=bot)<>8000 then raise exception 'Failed save changed the secretary profile';end if;
 insert into public.agent_custom_bots(owner_id,name,role,mission,tone,instructions,template_key)
 values(own,'Fixture worker','Research assistant','Complete the fixture research task.','Clear',repeat('👩',4500),'') returning id into ordinary;
 rejected:=null;
 begin
  update public.agent_custom_bots set instructions=repeat('👩',4501) where id=ordinary;
 exception when check_violation then get stacked diagnostics rejected=constraint_name;
 end;
 if rejected is distinct from 'agent_custom_bots_instructions_check' then raise exception 'Ordinary worker overflow accepted';end if;
 rejected:=null;
 begin
  update public.agent_custom_bots set instructions=repeat('👩',19) where id=bot;
 exception when check_violation then get stacked diagnostics rejected=constraint_name;
 end;
 if rejected is distinct from 'agent_custom_bots_instructions_check' then raise exception 'Minimum instruction length lost';end if;
 if has_function_privilege('authenticated','public.ensure_agent_secretary(uuid,jsonb,boolean)','execute') then raise exception 'Private secretary creation became client callable';end if;
 if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.agent_custom_bots'::regclass) then raise exception 'Worker privacy changed';end if;
end $$;
rollback;
