-- Persist an owner's red-light stop across model worker handoffs.
alter table public.agent_team_assignments
 add column if not exists owner_paused boolean not null default false;
create index if not exists agent_team_assignments_owner_paused
 on public.agent_team_assignments(owner_id,updated_at desc) where owner_paused=true;
