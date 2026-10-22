
-- Phase 6: owner-scoped message assignments, routed steps and resumable questions.
alter table public.agent_team_assignments
  add column if not exists source_employee_id text,
  add column if not exists manager_summary text not null default '',
  add column if not exists coordination_status text not null default 'manual';
alter table public.agent_team_assignments
  add constraint agent_assignment_source_worker_valid check (
    source_employee_id is null or source_employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq')
  ),
  add constraint agent_assignment_manager_summary_length check (char_length(manager_summary)<=3000),
  add constraint agent_assignment_coordination_status_valid check (
    coordination_status in ('manual','planning','ready','working','waiting_for_owner','waiting_for_permission','completed','failed')
  );
create table public.agent_task_steps (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 assignment_id uuid not null references public.agent_team_assignments(id) on delete cascade,
 step_number int not null check (step_number between 1 and 5),
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 title text not null check (char_length(title) between 1 and 180),
 instructions text not null check(char_length(instructions) between 1 and 3000),
 status text not null default 'queued' check(status in ('queued','running','completed','waiting_for_owner','waiting_for_permission','failed')),
 handoff_from text check(handoff_from is null or handoff_from in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 output text not null default '' check(char_length(output)<=4000),
 question text not null default '' check(char_length(question)<=1500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(assignment_id,step_number)
);
create index agent_task_steps_owner_assignment on public.agent_task_steps(owner_id,assignment_id,step_number);
alter table public.agent_task_steps enable row level security;
alter table public.agent_task_steps force row level security;
revoke all on public.agent_task_steps from public,anon,authenticated;
grant select on public.agent_task_steps to authenticated;
create policy "only assignment owner reads steps" on public.agent_task_steps
for select to authenticated using(
 owner_id=(select auth.uid()) and exists(
  select 1 from public.agent_team_assignments a where a.id=assignment_id and a.owner_id=(select auth.uid())
 )
);

-- One explicit "Assign Task" action from Messages creates an audit-safe assignment
-- and copies the owner's text into the private worker conversation.
create or replace function public.create_agent_assignment_from_chat(p_employee_id text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := (select auth.uid());
 v_worker text := btrim(p_employee_id);
 v_body text := btrim(p_body);
 v_title text;
 v_conversation uuid;
 v_assignment uuid;
begin
 if v_owner is null then raise exception 'Sign in under Settings before assigning work' using errcode='42501'; end if;
 if v_worker is null or v_worker not in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq')
 then raise exception 'Select a valid worker'; end if;
 if v_body is null or char_length(v_body) not between 5 and 10000 then
  raise exception 'Assignment must be 5–10,000 characters long'; end if;
 v_title := left(regexp_replace(v_body,'[\n\r\t]+',' ','g'),120);
 insert into public.agent_team_assignments(owner_id,title,instructions,employee_ids,source_employee_id,coordination_status)
 values(v_owner,v_title,v_body,array[case when v_worker='hq' then 'alex' else v_worker end],v_worker,'planning')
 returning id into v_assignment;
 insert into public.agent_conversations(owner_id,employee_id)
 values(v_owner,v_worker)
 on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id
 returning id into v_conversation;
 insert into public.agent_messages(conversation_id,owner_id,sender,body)
 values(v_conversation,v_owner,'owner',v_body);
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body)
 values(v_assignment,v_owner,'owner','owner','note',v_body);
 return v_assignment;
end;
$$;

-- A reply in the question card is bound to the specific assignment, not just
-- the worker name, preventing replies from resuming an unrelated task.
create or replace function public.answer_agent_assignment_question(p_assignment_id uuid,p_body text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid := (select auth.uid());
 v_body text := btrim(p_body);
 v_step uuid;
 v_worker text;
 v_conversation uuid;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if v_body is null or char_length(v_body) not between 1 and 10000 then raise exception 'Enter an answer under 10,000 characters'; end if;
 if not exists(select 1 from public.agent_team_assignments where id=p_assignment_id and owner_id=v_owner)
 then raise exception 'Assignment not found' using errcode='42501'; end if;
 select id,employee_id into v_step,v_worker from public.agent_task_steps
 where owner_id=v_owner and assignment_id=p_assignment_id and status in ('waiting_for_owner','waiting_for_permission')
 order by step_number limit 1 for update;
 if v_step is null then raise exception 'No waiting worker question on this assignment'; end if;
 insert into public.agent_conversations(owner_id,employee_id)
 values(v_owner,v_worker)
 on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id
 returning id into v_conversation;
 insert into public.agent_messages(conversation_id,owner_id,sender,body)
 values(v_conversation,v_owner,'owner',v_body);
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body)
 values(p_assignment_id,v_owner,'owner','owner','reply',v_body);
 update public.agent_task_steps set status='queued',updated_at=now()
 where id=v_step and owner_id=v_owner;
 update public.agent_team_assignments
 set coordination_status='ready',status='in_progress',updated_at=now()
 where id=p_assignment_id and owner_id=v_owner;
 return true;
end;
$$;
revoke all on function public.create_agent_assignment_from_chat(text,text) from public,anon;
revoke all on function public.answer_agent_assignment_question(uuid,text) from public,anon;
grant execute on function public.create_agent_assignment_from_chat(text,text) to authenticated;
grant execute on function public.answer_agent_assignment_question(uuid,text) to authenticated;
