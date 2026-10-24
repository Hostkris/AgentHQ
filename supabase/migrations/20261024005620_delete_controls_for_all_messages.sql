-- Presentation tombstones preserve permission/assignment audit records while
-- making X dismissals durable on every signed-in device.
create table public.agent_chat_dismissals (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('message','social','approval','team','bot','work','connector','welcome')),
 item_key text not null check(length(item_key) between 1 and 200),
 created_at timestamptz not null default now(),
 primary key(owner_id,kind,item_key)
);
alter table public.agent_chat_dismissals enable row level security;
revoke all on public.agent_chat_dismissals from public,anon,authenticated;
grant select on public.agent_chat_dismissals to authenticated;
grant all on public.agent_chat_dismissals to service_role;
create policy owner_reads_chat_dismissals on public.agent_chat_dismissals
 for select to authenticated using ((select auth.uid())=owner_id);

-- Definer is necessary because clients cannot edit worker messages or the
-- service-only permission ledger. Every target is checked against auth.uid();
-- callers cannot supply an owner, insert approval records, or execute work.
create schema if not exists agent_hq_private;
revoke all on schema agent_hq_private from public,anon;
grant usage on schema agent_hq_private to authenticated;
create function agent_hq_private.dismiss_chat_item(p_kind text,p_key text)
returns boolean language plpgsql security definer set search_path='' as $$
declare o uuid:=(select auth.uid()); target uuid; r record; prompt uuid;
begin
 if o is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('message','social','approval','team','bot','work','connector','welcome') or p_key is null or length(p_key) not between 1 and 200 then
  raise exception 'Invalid message target' using errcode='22023';
 end if;
 -- Serialize with approve/claim/finish so a deleted request cannot be claimed
 -- or have a completed report committed after cancellation.
 perform pg_advisory_xact_lock(hashtextextended('social-read:'||o::text,0));
 if exists(select 1 from public.agent_chat_dismissals where owner_id=o and kind=p_kind and item_key=p_key) then return true;end if;
 if p_kind='connector' then
  if p_key !~ '^(alex|maya|jordan|riley|taylor|casey|morgan|avery|jamie|quinn|hq):[a-zA-Z0-9_.:+-]+$' then raise exception 'Invalid connection message';end if;
 else
  target:=p_key::uuid;
  if p_kind='message' and not exists(select 1 from public.agent_messages where owner_id=o and id=target) or
     p_kind='social' and not exists(select 1 from public.agent_social_read_requests where owner_id=o and id=target) or
     p_kind='approval' and not exists(select 1 from public.agent_permission_requests where owner_id=o and id=target) or
     p_kind='team' and not exists(select 1 from public.agent_team_messages where owner_id=o and id=target) or
     p_kind='bot' and not exists(select 1 from public.agent_custom_bot_messages where owner_id=o and id=target) or
     p_kind='work' and not exists(select 1 from public.agent_team_assignments where owner_id=o and id=target) or
     p_kind='welcome' and not exists(select 1 from public.agent_custom_bots where owner_id=o and id=target) then
   raise exception 'Message not found or not authorized' using errcode='42501';
  end if;
 end if;
 if p_kind in ('social','message') then
  for r in select id,prompt_message_id from public.agent_social_read_requests
    where owner_id=o and (p_kind='social' and id=target or p_kind='message' and prompt_message_id=target) for update
  loop
   insert into public.agent_chat_dismissals(owner_id,kind,item_key) values(o,'social',r.id::text) on conflict do nothing;
   update public.agent_social_read_requests set
    status=case when status='pending' then 'denied' when status in ('approved','analyzing') then 'revoked' else status end,
    expires_at=case when status in ('pending','approved','analyzing') then least(expires_at,now()) else expires_at end,
    decided_at=coalesce(decided_at,now()),
    finished_at=case when status in ('pending','approved','analyzing') then now() else finished_at end
    where owner_id=o and id=r.id;
   delete from public.agent_social_read_handoffs where request_id=r.id;
   delete from public.agent_social_read_chat_state where owner_id=o and
    (prompt_message_id=r.prompt_message_id or options @> jsonb_build_array(jsonb_build_object('id',r.id)));
   if r.prompt_message_id is not null then
    insert into public.agent_chat_dismissals(owner_id,kind,item_key) values(o,'message',r.prompt_message_id::text) on conflict do nothing;
    delete from public.agent_messages where owner_id=o and id=r.prompt_message_id;
   end if;
  end loop;
  if p_kind='message' then delete from public.agent_messages where owner_id=o and id=target;end if;
 elsif p_kind='bot' then
  delete from public.agent_custom_bot_messages where owner_id=o and id=target;
 elsif p_kind='approval' then
  update public.agent_permission_requests set status='denied',decided_at=now() where owner_id=o and id=target and status='pending';
 end if;
 -- Team notes and work orders may contain approval audit records. Only their
 -- message presentation is dismissed; X never edits that history or runs work.
 insert into public.agent_chat_dismissals(owner_id,kind,item_key) values(o,p_kind,p_key) on conflict do nothing;
 return true;
end $$;
revoke all on function agent_hq_private.dismiss_chat_item(text,text) from public,anon,authenticated;
grant execute on function agent_hq_private.dismiss_chat_item(text,text) to authenticated;
create function public.dismiss_agent_chat_item(p_kind text,p_key text)
returns boolean language sql security invoker set search_path='' as $$
 select agent_hq_private.dismiss_chat_item(p_kind,p_key);
$$;
revoke all on function public.dismiss_agent_chat_item(text,text) from public,anon,authenticated;
grant execute on function public.dismiss_agent_chat_item(text,text) to authenticated;

-- Retain the existing API while closing the prompt-deletion resurrection path.
create or replace function public.delete_agent_chat_message(p_message_id uuid)
returns boolean language sql security invoker set search_path='' as $$
 select public.dismiss_agent_chat_item('message',p_message_id::text);
$$;
revoke all on function public.delete_agent_chat_message(uuid) from public,anon;
grant execute on function public.delete_agent_chat_message(uuid) to authenticated;
