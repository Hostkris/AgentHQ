-- User-controlled deletion of one worker's text conversation.
-- Existing research and assignment audit history deliberately remain intact.
alter table public.agent_conversations
 add column if not exists cleared_at timestamptz;

do $$ begin
 if not exists (
  select 1 from pg_policies where schemaname='public' and tablename='agent_messages'
    and policyname='owner_delete_own_chat_messages'
 ) then
  create policy owner_delete_own_chat_messages on public.agent_messages
   for delete to authenticated
   using (
    owner_id=(select auth.uid())
    and exists (select 1 from public.agent_conversations c
      where c.id=conversation_id and c.owner_id=(select auth.uid()))
   );
 end if;
end $$;

create or replace function public.clear_agent_conversation(p_employee_id text)
returns bigint language plpgsql volatile security invoker set search_path = ''
as $$
declare
  chat_id uuid;
  removed bigint=0;
begin
 if (select auth.uid()) is null then
  raise exception 'Sign in required' using errcode='42501';
 end if;
 select c.id into chat_id
 from public.agent_conversations c
 where c.owner_id=(select auth.uid()) and c.employee_id=p_employee_id
 for update;
 if chat_id is null then return 0; end if;
 delete from public.agent_messages m
 where m.owner_id=(select auth.uid()) and m.conversation_id=chat_id;
 get diagnostics removed = row_count;
 update public.agent_conversations c
 set cleared_at=clock_timestamp(),last_read_at=clock_timestamp()
 where c.id=chat_id and c.owner_id=(select auth.uid());
 return removed;
end
$$;
revoke all on function public.clear_agent_conversation(text) from public, anon;
grant execute on function public.clear_agent_conversation(text) to authenticated;
