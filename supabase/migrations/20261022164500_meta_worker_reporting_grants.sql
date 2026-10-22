create table public.agent_meta_worker_grants (
 owner_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 account_id text not null,
 permission text not null default 'read_meta_ads_insights' check(permission='read_meta_ads_insights'),
 granted_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '24 hours'),
 revoked_at timestamptz,
 primary key(owner_id,employee_id,account_id),
 foreign key(owner_id,account_id) references public.agent_meta_ad_accounts(owner_id,account_id) on delete cascade
);
create index agent_meta_worker_grants_owner on public.agent_meta_worker_grants(owner_id,expires_at);
alter table public.agent_meta_worker_grants enable row level security;
alter table public.agent_meta_worker_grants force row level security;
revoke all on public.agent_meta_worker_grants from public,anon,authenticated;
grant select on public.agent_meta_worker_grants to authenticated;
create policy "Meta access is visible only to owner" on public.agent_meta_worker_grants
 for select to authenticated using(owner_id=(select auth.uid()));

create function public.grant_agent_meta_worker_read(p_employee_id text,p_account_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_employee_id not in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')
 then raise exception 'Invalid worker'; end if;
 if p_account_id is null or p_account_id !~ '^act_[0-9]{1,32}$'
 then raise exception 'Invalid account'; end if;
 if not exists(select 1 from public.agent_meta_ads_connections
    where owner_id=v_owner and status='active' and token_expires_at>now())
 then raise exception 'Connect Meta Ads first'; end if;
 if not exists(select 1 from public.agent_meta_ad_accounts
    where owner_id=v_owner and account_id=p_account_id)
 then raise exception 'This advertising account is not yours to authorize'; end if;
 insert into public.agent_meta_worker_grants
  (owner_id,employee_id,account_id,permission,granted_at,expires_at,revoked_at)
 values(v_owner,p_employee_id,p_account_id,'read_meta_ads_insights',now(),now()+interval '24 hours',null)
 on conflict(owner_id,employee_id,account_id) do update set
  granted_at=excluded.granted_at,expires_at=excluded.expires_at,revoked_at=null;
 return true;
end $$;

create function public.revoke_agent_meta_worker_read(p_employee_id text,p_account_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid()); v_changed int;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501'; end if;
 update public.agent_meta_worker_grants
 set revoked_at=now(),expires_at=least(expires_at,now())
 where owner_id=v_owner and employee_id=p_employee_id and account_id=p_account_id
  and revoked_at is null;
 get diagnostics v_changed=row_count;
 return v_changed>0;
end $$;
revoke all on function public.grant_agent_meta_worker_read(text,text) from public,anon;
revoke all on function public.revoke_agent_meta_worker_read(text,text) from public,anon;
grant execute on function public.grant_agent_meta_worker_read(text,text) to authenticated;
grant execute on function public.revoke_agent_meta_worker_read(text,text) to authenticated;
