-- Personal account directory and consent plans. Profile labels are NOT logins
-- and personal-worker permissions never grant external website/API execution.
create table public.agent_personal_accounts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 platform text not null check(platform in (
   'instagram','facebook','tiktok','youtube','threads','pinterest',
   'x','snapchat','google_ads','tiktok_ads','pinterest_ads'
 )),
 label text not null check(char_length(btrim(label)) between 1 and 80),
 handle text not null check(char_length(btrim(handle)) between 2 and 120),
 integration_status text not null default 'not_connected'
   check(integration_status='not_connected'),
 created_at timestamptz not null default now(),
 unique(owner_id,id)
);
create index agent_personal_accounts_owner on public.agent_personal_accounts(owner_id,created_at desc);
alter table public.agent_personal_accounts enable row level security;
alter table public.agent_personal_accounts force row level security;
revoke all on public.agent_personal_accounts from public,anon,authenticated;
grant select on public.agent_personal_accounts to authenticated;
create policy "read only my account labels" on public.agent_personal_accounts
 for select to authenticated using(owner_id=(select auth.uid()));

create table public.agent_personal_permission_plans (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null,
 employee_id text not null check(employee_id in
  ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 capability text not null check(capability in
  ('draft_posts','draft_replies','plan_content','read_account_data',
   'publish_content','manage_messages')),
 purpose text not null check(char_length(btrim(purpose)) between 5 and 500),
 status text not null default 'requested' check(status in
  ('requested','approved','denied','revoked')),
 expires_at timestamptz not null default (now()+interval '7 days'),
 requested_at timestamptz not null default now(),
 decided_at timestamptz,
 revoked_at timestamptz,
 external_execution_enabled boolean not null default false check(external_execution_enabled=false),
 unique(owner_id,account_id,employee_id,capability),
 foreign key(owner_id,account_id) references public.agent_personal_accounts(owner_id,id)
  on delete cascade
);
create index agent_personal_permission_owner on
 public.agent_personal_permission_plans(owner_id,status,requested_at desc);
alter table public.agent_personal_permission_plans enable row level security;
alter table public.agent_personal_permission_plans force row level security;
revoke all on public.agent_personal_permission_plans from public,anon,authenticated;
grant select on public.agent_personal_permission_plans to authenticated;
create policy "read only my worker permission plans" on public.agent_personal_permission_plans
 for select to authenticated using(owner_id=(select auth.uid()));

create function public.register_agent_personal_account(
 p_platform text,p_label text,p_handle text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_id uuid;
begin
 if v_owner is null then raise exception 'Sign in before adding an account' using errcode='42501';end if;
 if p_platform is null or p_platform not in
 ('instagram','facebook','tiktok','youtube','threads','pinterest','x','snapchat',
  'google_ads','tiktok_ads','pinterest_ads')
 then raise exception 'Unsupported platform';end if;
 if p_label is null or char_length(btrim(p_label)) not between 1 and 80
 then raise exception 'Enter a name (1–80 characters)';end if;
 if p_handle is null or char_length(btrim(p_handle)) not between 2 and 120
 then raise exception 'Enter a profile handle or account label (2–120 characters)';end if;
 if (select count(*) from public.agent_personal_accounts where owner_id=v_owner)>=50
 then raise exception 'Maximum of 50 saved personal accounts';end if;
 insert into public.agent_personal_accounts(owner_id,platform,label,handle)
 values(v_owner,p_platform,btrim(p_label),btrim(p_handle))
 returning id into v_id;
 return v_id;
end $$;

create function public.remove_agent_personal_account(p_account_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_count integer;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501';end if;
 delete from public.agent_personal_accounts where id=p_account_id and owner_id=v_owner;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Account not found under your sign-in' using errcode='42501';end if;
 return true;
end $$;

create function public.request_agent_personal_permission(
 p_account_id uuid,p_employee_id text,p_capability text,p_purpose text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_id uuid;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501';end if;
 if not exists(select 1 from public.agent_personal_accounts
  where owner_id=v_owner and id=p_account_id)
 then raise exception 'Select one of your saved profiles' using errcode='42501';end if;
 if p_employee_id is null or p_employee_id not in
 ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')
 then raise exception 'Choose a valid worker';end if;
 if p_capability is null or p_capability not in
 ('draft_posts','draft_replies','plan_content','read_account_data','publish_content','manage_messages')
 then raise exception 'Choose a valid scope';end if;
 if p_purpose is null or char_length(btrim(p_purpose)) not between 5 and 500
 then raise exception 'Explain the assignment and purpose in 5–500 characters';end if;
 if (select count(*) from public.agent_personal_permission_plans
  where owner_id=v_owner)>=300 then
   if not exists(select 1 from public.agent_personal_permission_plans
   where owner_id=v_owner and account_id=p_account_id
   and employee_id=p_employee_id and capability=p_capability)
   then raise exception 'Maximum of 300 permission plans';end if;
 end if;
 insert into public.agent_personal_permission_plans
 (owner_id,account_id,employee_id,capability,purpose,status,
  requested_at,expires_at,decided_at,revoked_at)
 values(v_owner,p_account_id,p_employee_id,p_capability,btrim(p_purpose),
 'requested',now(),now()+interval '7 days',null,null)
 on conflict(owner_id,account_id,employee_id,capability) do update set
  purpose=excluded.purpose,status='requested',requested_at=now(),
  expires_at=now()+interval '7 days',decided_at=null,revoked_at=null
 returning id into v_id;
 return v_id;
end $$;

create function public.decide_agent_personal_permission(
 p_permission_id uuid,p_approve boolean
) returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_count integer;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_approve is null then raise exception 'Choose approve or deny';end if;
 update public.agent_personal_permission_plans set
  status=case when p_approve then 'approved' else 'denied' end,
  decided_at=now(),expires_at=case when p_approve then now()+interval '24 hours' else now() end
 where id=p_permission_id and owner_id=v_owner
  and status='requested' and expires_at>now();
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Request expired, already decided or not yours' using errcode='42501';end if;
 return true;
end $$;

create function public.revoke_agent_personal_permission(p_permission_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_count integer;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501';end if;
 update public.agent_personal_permission_plans set
  status='revoked',revoked_at=now(),expires_at=least(expires_at,now())
 where id=p_permission_id and owner_id=v_owner and status='approved';
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Permission not active or not yours' using errcode='42501';end if;
 return true;
end $$;

revoke all on function public.register_agent_personal_account(text,text,text) from public,anon;
revoke all on function public.remove_agent_personal_account(uuid) from public,anon;
revoke all on function public.request_agent_personal_permission(uuid,text,text,text) from public,anon;
revoke all on function public.decide_agent_personal_permission(uuid,boolean) from public,anon;
revoke all on function public.revoke_agent_personal_permission(uuid) from public,anon;
grant execute on function public.register_agent_personal_account(text,text,text) to authenticated;
grant execute on function public.remove_agent_personal_account(uuid) to authenticated;
grant execute on function public.request_agent_personal_permission(uuid,text,text,text) to authenticated;
grant execute on function public.decide_agent_personal_permission(uuid,boolean) to authenticated;
grant execute on function public.revoke_agent_personal_permission(uuid) to authenticated;

comment on table public.agent_personal_accounts is
 'User-entered labels only; not proof of external authentication and never contains credentials.';
comment on table public.agent_personal_permission_plans is
 'Owner-specified scoped planning approval. Does NOT authorize website sessions or API execution; external_execution_enabled is always false.';
