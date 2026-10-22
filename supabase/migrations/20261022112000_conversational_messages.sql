
-- iPhone-style conversational AI threads: owner-readable state, server-only updates.
create table public.agent_chat_states (
 owner_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq')),
 stage text not null default 'idle' check(stage in ('idle','confirm_task','confirm_resume','confirm_permission')),
 pending_text text not null default '' check(char_length(pending_text)<=10000),
 assignment_id uuid references public.agent_team_assignments(id) on delete set null,
 permission_request_id uuid references public.agent_permission_requests(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(owner_id,employee_id)
);
create index agent_chat_states_owner on public.agent_chat_states(owner_id);
alter table public.agent_chat_states enable row level security;
alter table public.agent_chat_states force row level security;
revoke all on public.agent_chat_states from public,anon,authenticated;
grant select on public.agent_chat_states to authenticated;
create policy "owner reads conversational state" on public.agent_chat_states
for select to authenticated using(owner_id=(select auth.uid()));
create table public.agent_chat_ai_turns (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq')),
 created_at timestamptz not null default now()
);
create index agent_chat_ai_turns_owner_time on public.agent_chat_ai_turns(owner_id,created_at desc);
alter table public.agent_chat_ai_turns enable row level security;
alter table public.agent_chat_ai_turns force row level security;
revoke all on public.agent_chat_ai_turns from public,anon,authenticated;
grant select on public.agent_chat_ai_turns to authenticated;
create policy "owner sees chat ai usage" on public.agent_chat_ai_turns for select to authenticated using(owner_id=(select auth.uid()));

-- Deletion is an explicit, owner-initiated action, never a background AI operation.
create function public.delete_agent_chat_message(p_message_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_deleted uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
 delete from public.agent_messages
 where id=p_message_id and owner_id=(select auth.uid())
 returning id into v_deleted;
 if v_deleted is null then raise exception 'Message not found or not authorized' using errcode='42501'; end if;
 return true;
end $$;
create function public.delete_agent_assignment(p_assignment_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_deleted uuid;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required' using errcode='42501'; end if;
 delete from public.agent_team_assignments
 where id=p_assignment_id and owner_id=(select auth.uid())
 returning id into v_deleted;
 if v_deleted is null then raise exception 'Assignment not found or not authorized' using errcode='42501'; end if;
 return true;
end $$;
revoke all on function public.delete_agent_chat_message(uuid) from public,anon;
revoke all on function public.delete_agent_assignment(uuid) from public,anon;
grant execute on function public.delete_agent_chat_message(uuid) to authenticated;
grant execute on function public.delete_agent_assignment(uuid) to authenticated;
