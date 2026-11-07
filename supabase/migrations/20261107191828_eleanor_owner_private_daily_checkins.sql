-- Owner-private daily check-ins inside Agent HQ; not Apple Health, TikTok or an external app.
create table public.agent_hq_daily_checkins(
 owner_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null,
 fields jsonb not null default '{}'::jsonb check(jsonb_typeof(fields)='object' and octet_length(fields::text)<=7000),
 submitted_at timestamptz,
 sent_signature text check (char_length(sent_signature)<=7000),
 updated_at timestamptz not null default now(),
 primary key(owner_id,local_date)
);
create index agent_hq_daily_checkins_recent on public.agent_hq_daily_checkins(owner_id,local_date desc);
alter table public.agent_hq_daily_checkins enable row level security;
alter table public.agent_hq_daily_checkins force row level security;
revoke all on public.agent_hq_daily_checkins from public,anon,authenticated;
grant select,insert,update on public.agent_hq_daily_checkins to authenticated;
grant all on public.agent_hq_daily_checkins to service_role;
create policy agent_hq_checkins_select on public.agent_hq_daily_checkins
 for select to authenticated using(owner_id=(select auth.uid()));
create policy agent_hq_checkins_insert on public.agent_hq_daily_checkins
 for insert to authenticated with check(owner_id=(select auth.uid()));
create policy agent_hq_checkins_update on public.agent_hq_daily_checkins
 for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy agent_hq_checkins_service on public.agent_hq_daily_checkins
 to service_role using(true) with check(true);
comment on table public.agent_hq_daily_checkins is 'Owner-reported daily check-ins for Eleanor; no automatic biometric measurement or social-inbox access.';
