
-- Agent HQ Phase 4: signed-in, owner-scoped permission-request records.
-- Deliberately separate from agent_conversations / agent_messages.
-- Approval records are NOT execution tokens; no browsing engine is wired up here.
create table if not exists public.agent_permission_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null check (employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
  target_url text not null check (char_length(target_url) between 8 and 2048),
  reason text not null check (char_length(reason) between 1 and 1000),
  request_kind text not null default 'simulation' check (request_kind in ('simulation','agent')),
  action_kind text not null default 'research_visit' check (action_kind in ('research_visit')),
  status text not null default 'pending' check (status in ('pending','approved','denied','expired','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  decided_at timestamptz,
  constraint valid_approval_expiry check (expires_at > created_at)
);
create index if not exists agent_permission_owner_recent_idx
  on public.agent_permission_requests (owner_id, created_at desc);
alter table public.agent_permission_requests enable row level security;
alter table public.agent_permission_requests force row level security;
revoke all on public.agent_permission_requests from public, anon, authenticated;
grant select on public.agent_permission_requests to authenticated;
create policy "owner reads own permission requests"
  on public.agent_permission_requests
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- Only a signed-in owner may generate a SIMULATION request.
-- The future agent runner must generate its own real requests securely.
create or replace function public.create_agent_demo_permission_request(
  p_employee_id text, p_target_url text, p_reason text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_url text := btrim(p_target_url);
  v_reason text := btrim(p_reason);
begin
  if v_user is null then
    raise exception 'Sign in is required' using errcode = '42501';
  end if;
  if p_employee_id is null or p_employee_id not in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn') then
    raise exception 'Invalid employee';
  end if;
  if v_url is null or char_length(v_url) > 2048 or v_url !~* '^https?://[^[:space:]/@]+(/|$|[?#])' then
    raise exception 'Enter a valid HTTP or HTTPS website without credentials';
  end if;
  if v_reason is null or char_length(v_reason) not between 1 and 1000 then
    raise exception 'A short reason is required';
  end if;
  insert into public.agent_permission_requests
    (owner_id, employee_id, target_url, reason, request_kind, action_kind)
  values (v_user, p_employee_id, v_url, v_reason, 'simulation', 'research_visit')
  returning id into v_id;
  return v_id;
end;
$$;

-- Atomic one-time decision: only the authenticated owner can approve/deny.
-- Expired or already-decided requests cannot be approved.
create or replace function public.decide_agent_permission_request(
  p_request_id uuid, p_decision text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_changed uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in is required' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'denied') or p_decision is null then
    raise exception 'Decision must be approved or denied';
  end if;
  update public.agent_permission_requests
    set status = p_decision, decided_at = now()
  where id = p_request_id
    and owner_id = (select auth.uid())
    and status = 'pending'
    and expires_at > now()
  returning id into v_changed;
  if v_changed is null then
    raise exception 'Request is unavailable, expired, or already decided' using errcode = '42501';
  end if;
  return true;
end;
$$;

revoke all on function public.create_agent_demo_permission_request(text,text,text) from public, anon;
revoke all on function public.decide_agent_permission_request(uuid,text) from public, anon;
grant execute on function public.create_agent_demo_permission_request(text,text,text) to authenticated;
grant execute on function public.decide_agent_permission_request(uuid,text) to authenticated;
