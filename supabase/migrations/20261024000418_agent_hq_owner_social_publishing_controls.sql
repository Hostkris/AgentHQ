-- Production migration applied to Agent-HQ Supabase 2026-10-24 00:04 UTC.
-- Owner preference is an opt-in for REQUESTS only, never permission to execute.
create table if not exists public.agent_publishing_controls (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 publish_requests_enabled boolean not null default false,
 per_post_approval_required boolean not null default true check(per_post_approval_required is true),
 updated_at timestamptz not null default now()
);
alter table public.agent_publishing_controls enable row level security;
alter table public.agent_publishing_controls force row level security;
revoke all on public.agent_publishing_controls from public, anon, authenticated;
grant select, insert, update on public.agent_publishing_controls to authenticated;
create policy "owner reads publishing controls" on public.agent_publishing_controls
 for select to authenticated using(owner_id=(select auth.uid()));
create policy "owner inserts publishing controls" on public.agent_publishing_controls
 for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "owner updates publishing controls" on public.agent_publishing_controls
 for update to authenticated using(owner_id=(select auth.uid()))
 with check(owner_id=(select auth.uid()));
comment on table public.agent_publishing_controls is
 'Owner opt-in to requesting future social publishing; does not grant OAuth access or permit a post. Individual post owner approval is always required; no publisher is currently connected.';