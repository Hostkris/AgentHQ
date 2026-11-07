-- Private owner-supplied boards, including potentially sensitive income, savings and household schedules.
-- Screenshots are transcribed into rows through an authenticated data migration separately;
-- raw financial figures are deliberately not committed to the public web application.
create table public.agent_hq_board_snapshots (
 owner_id uuid not null references auth.users(id) on delete cascade,
 board_key text not null check(board_key in ('financial','flip','investment','cleaning','weekly')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=60000),
 source_label text not null default 'Owner-provided November 2026 board' check(char_length(source_label)<=180),
 updated_at timestamptz not null default now(),
 primary key(owner_id,board_key)
);
alter table public.agent_hq_board_snapshots enable row level security;
alter table public.agent_hq_board_snapshots force row level security;
revoke all on public.agent_hq_board_snapshots from public,anon,authenticated;
grant select,update on public.agent_hq_board_snapshots to authenticated;
grant all on public.agent_hq_board_snapshots to service_role;
create policy hq_board_read on public.agent_hq_board_snapshots for select to authenticated using(owner_id=(select auth.uid()));
create policy hq_board_update on public.agent_hq_board_snapshots for update to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy hq_board_service on public.agent_hq_board_snapshots to service_role using(true) with check(true);
comment on table public.agent_hq_board_snapshots is
 'Owner-private plan images transcribed to structured data. Financial values are dated and user-reported, not bank-verified or authorization for transactions.';
