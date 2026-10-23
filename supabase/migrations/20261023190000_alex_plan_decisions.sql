-- Owner-scoped approval record for Alex's proposed specialist routing plan.
-- Only a trusted Edge Function may insert or update this record after checking
-- the authenticated owner. Users can read their own decisions.
create table if not exists public.agent_alex_plan_decisions (
 owner_id uuid not null references auth.users(id) on delete cascade,
 assignment_id uuid not null references public.agent_team_assignments(id) on delete cascade,
 status text not null check (status in ('approved','rejected')),
 decided_at timestamptz not null default now(),
 primary key (owner_id,assignment_id)
);
alter table public.agent_alex_plan_decisions enable row level security;
create policy "Owner may read Alex plan decisions"
 on public.agent_alex_plan_decisions for select to authenticated
 using ((select auth.uid())=owner_id);
revoke all on table public.agent_alex_plan_decisions from anon, authenticated;
grant select on table public.agent_alex_plan_decisions to authenticated;
grant all on table public.agent_alex_plan_decisions to service_role;
comment on table public.agent_alex_plan_decisions is
 'Plan approval authorizes only internal specialist routing and text drafts; it never authorizes web visits or external account actions.';
