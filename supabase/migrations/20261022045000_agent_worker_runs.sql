-- AI worker run history. Only a trusted server may insert or update run records.
create table public.agent_worker_runs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 assignment_id uuid not null references public.agent_team_assignments(id) on delete cascade,
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 status text not null default 'running' check(status in ('running','completed','failed')),
 provider text not null check(provider in ('groq','openrouter')),
 model text not null check(char_length(model) between 1 and 160),
 result_preview text check(char_length(result_preview)<=4000),
 error_summary text check(char_length(error_summary)<=300),
 created_at timestamptz not null default now(),
 finished_at timestamptz
);
create index agent_worker_runs_owner_time on public.agent_worker_runs(owner_id,created_at desc);
create index agent_worker_runs_assignment_time on public.agent_worker_runs(assignment_id,created_at desc);
create unique index agent_worker_runs_unique_active on public.agent_worker_runs(owner_id)
where status='running';
alter table public.agent_worker_runs enable row level security;
alter table public.agent_worker_runs force row level security;
revoke all on public.agent_worker_runs from public, anon, authenticated;
grant select on public.agent_worker_runs to authenticated;
create policy "owner reads worker run history" on public.agent_worker_runs
for select to authenticated using (
 owner_id=(select auth.uid()) and
 exists(select 1 from public.agent_team_assignments a where a.id=assignment_id and a.owner_id=(select auth.uid()))
);
