-- Append-only, owner-scoped evidence of actions performed by the real backend.
-- Source rows (worker runs, project state changes and team messages) produce the
-- records; the browser and model have no permission to fabricate them.
create table public.agent_execution_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 assignment_id uuid not null references public.agent_team_assignments(id) on delete cascade,
 employee_id text,
 event_type text not null check(event_type in
  ('worker_started','worker_completed','worker_failed','team_message_sent',
   'phase_changed','recovery_started','owner_action_required',
   'deliverable_ready','project_approved')),
 state text not null default '',
 summary text not null check(char_length(summary) between 1 and 240),
 source_id uuid,
 occurred_at timestamptz not null default now()
);
create index agent_execution_events_owner_clock
 on public.agent_execution_events(owner_id,occurred_at desc,id);
create index agent_execution_events_assignment_clock
 on public.agent_execution_events(assignment_id,occurred_at desc,id);
alter table public.agent_execution_events enable row level security;
alter table public.agent_execution_events force row level security;
revoke all on public.agent_execution_events from public,anon,authenticated;
grant select on public.agent_execution_events to authenticated;
grant all on public.agent_execution_events to service_role;
create policy "owner reads authentic execution events"
 on public.agent_execution_events for select to authenticated
 using (owner_id=(select auth.uid()) and exists (
  select 1 from public.agent_team_assignments a
  where a.id=assignment_id and a.owner_id=(select auth.uid())
 ));

-- Only trusted changes to existing source tables may append an event.
-- Do not include prompts, source excerpts, secrets, email content or model reasoning.
create function agent_hq_private.capture_execution_event()
 returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; label text; stage text; worker text; src uuid;
begin
 if tg_table_name='agent_worker_runs' then
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status='running' then kind:='worker_started'; label:=' started an assigned turn';
  elsif new.status='completed' then kind:='worker_completed'; label:=' completed an assigned turn';
  elsif new.status='failed' then kind:='worker_failed'; label:=' encountered a recorded execution failure';
  else return new; end if;
  worker:=new.employee_id;stage:=new.status;src:=new.id;
 elsif tg_table_name='agent_team_messages' then
  if new.sender_kind<>'agent' then return new; end if;
  kind:='team_message_sent';worker:=new.sender_id;
  stage:=coalesce(new.project_kind,'discussion');src:=new.id;
  label:=case when nullif(new.recipient_id,'') is not null
   then ' sent an assignment message to '||left(new.recipient_id,40)
   else ' posted a team update' end;
 elsif tg_table_name='agent_project_sessions' then
  worker:=coalesce(new.active_worker,new.next_worker,'alex');src:=new.assignment_id;
  stage:=new.phase;
  if new.phase is distinct from old.phase then
   kind:=case new.phase
    when 'waiting_owner' then 'owner_action_required'
    when 'waiting_permission' then 'owner_action_required'
    when 'review' then 'deliverable_ready'
    when 'approved' then 'project_approved'
    else 'phase_changed' end;
   label:=case new.phase
    when 'waiting_owner' then ' requested an essential owner answer'
    when 'waiting_permission' then ' requested scoped authorization'
    when 'review' then ' submitted work for owner review'
    when 'approved' then ' reached owner-approved status'
    else ' moved the project to '||left(new.phase,40) end;
  elsif new.recovery_state is distinct from old.recovery_state
      and new.recovery_state in ('diagnosing','correcting','reconnecting') then
   kind:='recovery_started';stage:=new.recovery_state;
   label:=' entered '||left(new.recovery_state,40)||' recovery';
  else return new;
  end if;
 else return new;
 end if;
 insert into public.agent_execution_events
  (owner_id,assignment_id,employee_id,event_type,state,summary,source_id)
 values(new.owner_id,new.assignment_id,worker,kind,stage,
  left(initcap(coalesce(worker,'Agent'))||label,240),src);
 return new;
end;
$$;
revoke all on function agent_hq_private.capture_execution_event()
 from public,anon,authenticated,service_role;
create trigger agent_worker_execution_journal
 after insert or update of status on public.agent_worker_runs
 for each row execute function agent_hq_private.capture_execution_event();
create trigger agent_team_execution_journal
 after insert on public.agent_team_messages
 for each row execute function agent_hq_private.capture_execution_event();
create trigger agent_project_execution_journal
 after update of phase,recovery_state on public.agent_project_sessions
 for each row execute function agent_hq_private.capture_execution_event();

-- Realtime delivers only authenticated rows allowed by RLS; polling remains
-- the fallback when subscriptions disconnect.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public' and tablename='agent_execution_events') then
  alter publication supabase_realtime add table public.agent_execution_events;
 end if;
end $$;
