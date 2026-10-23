-- Count only employee-authored replies, not automatic system handoff messages.
create or replace function public.get_agent_unread_counts()
returns table(employee_id text, unread_count bigint)
language sql stable security invoker set search_path = ''
as $$
 select c.employee_id, count(m.id)::bigint
 from public.agent_conversations as c
 join public.agent_messages as m
   on m.conversation_id = c.id and m.owner_id = c.owner_id
 where c.owner_id = (select auth.uid())
   and m.sender = 'employee'
   and m.created_at > c.last_read_at
 group by c.employee_id;
$$;
revoke all on function public.get_agent_unread_counts() from public, anon;
grant execute on function public.get_agent_unread_counts() to authenticated;
