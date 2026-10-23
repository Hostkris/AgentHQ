-- Persistent unread counts for signed-in Agent HQ conversations.
-- Existing history is initially treated as read to avoid false badge floods.
alter table public.agent_conversations
 add column if not exists last_read_at timestamptz not null default now();

create index if not exists agent_messages_unread_lookup
 on public.agent_messages(conversation_id, created_at desc)
 where sender in ('employee', 'system');

create or replace function public.get_agent_unread_counts()
returns table(employee_id text, unread_count bigint)
language sql stable security invoker set search_path = ''
as $$
 select c.employee_id, count(m.id)::bigint
 from public.agent_conversations as c
 join public.agent_messages as m
   on m.conversation_id = c.id and m.owner_id = c.owner_id
 where c.owner_id = (select auth.uid())
   and m.sender in ('employee', 'system')
   and m.created_at > c.last_read_at
 group by c.employee_id;
$$;

create or replace function public.mark_agent_conversation_read(p_employee_id text)
returns boolean
language plpgsql volatile security invoker set search_path = ''
as $$
declare changed integer;
begin
 if (select auth.uid()) is null then
   raise exception 'Sign in is required' using errcode='42501';
 end if;
 update public.agent_conversations
 set last_read_at = greatest(last_read_at, now())
 where owner_id = (select auth.uid())
   and employee_id = p_employee_id;
 get diagnostics changed = row_count;
 return changed > 0;
end;
$$;

revoke all on function public.get_agent_unread_counts() from public, anon;
revoke all on function public.mark_agent_conversation_read(text) from public, anon;
grant execute on function public.get_agent_unread_counts() to authenticated;
grant execute on function public.mark_agent_conversation_read(text) to authenticated;
