-- Owner-approved draft examples, scoped to the signed-in account.
create table if not exists public.agent_approved_knowledge (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 assignment_id uuid not null references public.agent_team_assignments(id) on delete cascade,
 review_version text not null check (review_version ~ '^[0-9a-f]{8}$'),
 topic text not null check (char_length(topic) between 3 and 600),
 approved_excerpt text not null check (char_length(approved_excerpt) between 20 and 3000),
 source_worker text not null check (char_length(source_worker) between 2 and 40),
 created_at timestamptz not null default now(),
 unique(owner_id, assignment_id, review_version)
);
create index if not exists agent_approved_knowledge_owner_time
 on public.agent_approved_knowledge(owner_id, created_at desc);
alter table public.agent_approved_knowledge enable row level security;
alter table public.agent_approved_knowledge force row level security;
revoke all on public.agent_approved_knowledge from public, anon, authenticated;
grant select, insert, delete on public.agent_approved_knowledge to authenticated;
grant all on public.agent_approved_knowledge to service_role;
create policy "owner can read approved examples" on public.agent_approved_knowledge
 for select to authenticated using ((select auth.uid())=owner_id);
create policy "owner can save approved examples" on public.agent_approved_knowledge
 for insert to authenticated with check (
 (select auth.uid())=owner_id and exists(select 1 from public.agent_team_assignments a
 where a.id=assignment_id and a.owner_id=(select auth.uid()))
 );
create policy "owner can forget approved examples" on public.agent_approved_knowledge
 for delete to authenticated using ((select auth.uid())=owner_id);
comment on table public.agent_approved_knowledge is
 'Opt-in-to-feedback private owner-approved draft examples for retrieval, not model training or account authorization. Deleting an assignment removes its examples.';
