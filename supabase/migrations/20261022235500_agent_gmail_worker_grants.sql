-- Named-worker Gmail access. Google OAuth authorization is a separate prerequisite.
-- A grant permits read-only priority summaries from the owner's cached inbox;
-- it never permits sending, deleting, or reading message bodies or attachments.
create table if not exists public.agent_gmail_worker_grants (
 owner_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check (employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 scope text not null default 'priority_summaries' check (scope='priority_summaries'),
 granted_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '24 hours'),
 revoked_at timestamptz,
 primary key (owner_id,employee_id)
);
alter table public.agent_gmail_worker_grants enable row level security;
alter table public.agent_gmail_worker_grants force row level security;
revoke all on public.agent_gmail_worker_grants from public,anon,authenticated;
grant select on public.agent_gmail_worker_grants to authenticated;
create policy "owner sees own limited gmail worker grants"
 on public.agent_gmail_worker_grants for select to authenticated
 using (owner_id=(select auth.uid()));

create or replace function public.grant_agent_gmail_worker_read(p_employee_id text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'Sign in to authorize a worker'; end if;
 if p_employee_id not in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn') then
   raise exception 'Choose one named worker';
 end if;
 if not exists (
  select 1 from public.agent_gmail_connections
  where owner_id=u and status='active'
    and scopes @> array['https://www.googleapis.com/auth/gmail.readonly']::text[]
 ) then raise exception 'Connect Gmail and approve read access first'; end if;
 insert into public.agent_gmail_worker_grants(owner_id,employee_id,scope,granted_at,expires_at,revoked_at)
 values(u,p_employee_id,'priority_summaries',now(),now()+interval '24 hours',null)
 on conflict(owner_id,employee_id) do update
  set granted_at=excluded.granted_at,expires_at=excluded.expires_at,revoked_at=null;
 return true;
end;
$$;
revoke all on function public.grant_agent_gmail_worker_read(text) from public,anon;
grant execute on function public.grant_agent_gmail_worker_read(text) to authenticated;

create or replace function public.revoke_agent_gmail_worker_read(p_employee_id text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'Sign in to revoke a worker'; end if;
 update public.agent_gmail_worker_grants set revoked_at=now()
 where owner_id=u and employee_id=p_employee_id and revoked_at is null;
 return true;
end;
$$;
revoke all on function public.revoke_agent_gmail_worker_read(text) from public,anon;
grant execute on function public.revoke_agent_gmail_worker_read(text) to authenticated;
comment on table public.agent_gmail_worker_grants is
 'Owner-approved 24-hour per-worker access to cached email priority summaries only; no sending or background polling.';