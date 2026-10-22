-- Explicit owner-initiated written handoffs between private custom bots.
-- A handoff moves saved conversation context only; it never starts external work.
alter table public.agent_custom_bot_messages
 drop constraint if exists agent_custom_bot_messages_sender_check;
alter table public.agent_custom_bot_messages
 add constraint agent_custom_bot_messages_sender_check check(sender in ('owner','worker','handoff'));
create table public.agent_custom_bot_handoffs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 source_bot_id uuid not null,
 target_bot_id uuid not null,
 brief text not null check(char_length(btrim(brief)) between 15 and 2500),
 created_at timestamptz not null default now(),
 foreign key(owner_id,source_bot_id) references public.agent_custom_bots(owner_id,id) on delete cascade,
 foreign key(owner_id,target_bot_id) references public.agent_custom_bots(owner_id,id) on delete cascade,
 check(source_bot_id<>target_bot_id)
);
create index agent_custom_bot_handoffs_owner on public.agent_custom_bot_handoffs(owner_id,created_at desc);
alter table public.agent_custom_bot_handoffs enable row level security;
alter table public.agent_custom_bot_handoffs force row level security;
revoke all on public.agent_custom_bot_handoffs from public,anon,authenticated;
grant select on public.agent_custom_bot_handoffs to authenticated;
create policy "owners see their handoffs" on public.agent_custom_bot_handoffs
 for select to authenticated using(owner_id=(select auth.uid()));

create function public.record_agent_custom_bot_handoff(
 p_owner uuid,p_source uuid,p_target uuid,p_brief text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_source_name text;v_target_name text;v_id uuid;
begin
 if p_owner is null or p_source=p_target or p_source is null or p_target is null
 then raise exception 'Select two different workers';end if;
 if p_brief is null or char_length(btrim(p_brief)) not between 15 and 2500
 then raise exception 'A brief of 15–2500 characters is required';end if;
 select name into v_source_name from public.agent_custom_bots
  where owner_id=p_owner and id=p_source and status='active' for update;
 select name into v_target_name from public.agent_custom_bots
  where owner_id=p_owner and id=p_target and status='active' for update;
 if v_source_name is null or v_target_name is null
 then raise exception 'Both workers must be active and belong to this owner';end if;
 insert into public.agent_custom_bot_handoffs(owner_id,source_bot_id,target_bot_id,brief)
 values(p_owner,p_source,p_target,btrim(p_brief)) returning id into v_id;
 insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body)
 values
 (p_owner,p_source,'handoff','📄 Handed off to '||v_target_name||': '||btrim(p_brief)),
 (p_owner,p_target,'handoff','📄 Handoff from '||v_source_name||': '||btrim(p_brief));
 return v_id;
end $$;
revoke all on function public.record_agent_custom_bot_handoff(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_agent_custom_bot_handoff(uuid,uuid,uuid,text) to service_role;
comment on table public.agent_custom_bot_handoffs is
 'Atomic owner-triggered, human-approved text-only worker handoffs; not background execution.';
