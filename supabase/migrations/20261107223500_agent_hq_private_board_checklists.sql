-- Owner-private daily completion checkboxes for the supplied cleaning and weekly organization boards.
create table public.agent_hq_board_checks(
 owner_id uuid not null references auth.users(id) on delete cascade,
 board_key text not null check(board_key in ('cleaning','weekly')),
 local_date date not null,
 checklist_key text not null check(char_length(checklist_key) between 3 and 160),
 checked boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(owner_id,board_key,local_date,checklist_key)
);
alter table public.agent_hq_board_checks enable row level security;
alter table public.agent_hq_board_checks force row level security;
revoke all on public.agent_hq_board_checks from public,anon,authenticated;
grant select,insert,update,delete on public.agent_hq_board_checks to authenticated;
grant all on public.agent_hq_board_checks to service_role;
create policy agent_hq_board_checks_read on public.agent_hq_board_checks for select to authenticated
 using(owner_id=(select auth.uid()));
create policy agent_hq_board_checks_insert on public.agent_hq_board_checks for insert to authenticated
 with check(owner_id=(select auth.uid()));
create policy agent_hq_board_checks_update on public.agent_hq_board_checks for update to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy agent_hq_board_checks_delete on public.agent_hq_board_checks for delete to authenticated
 using(owner_id=(select auth.uid()));
create policy agent_hq_board_checks_service on public.agent_hq_board_checks to service_role using(true) with check(true);
