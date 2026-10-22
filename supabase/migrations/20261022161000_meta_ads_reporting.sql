-- Meta Ads reporting Phase A: OAuth state, encrypted credentials, account metadata.
-- Tokens never available to authenticated/anon web clients.
create table public.agent_meta_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index agent_meta_oauth_owner on public.agent_meta_oauth_states(owner_id,expires_at);
alter table public.agent_meta_oauth_states enable row level security;
alter table public.agent_meta_oauth_states force row level security;
revoke all on public.agent_meta_oauth_states from public,anon,authenticated;

create table public.agent_meta_ads_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  meta_user_id text not null check(char_length(meta_user_id) between 1 and 128),
  encrypted_access_token text not null check(char_length(encrypted_access_token) between 16 and 16384),
  token_iv text not null check(char_length(token_iv) between 12 and 128),
  token_expires_at timestamptz not null,
  granted_scopes text[] not null default array['ads_read']::text[],
  status text not null default 'active' check(status in ('active','reconnect_required')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_meta_ads_connections enable row level security;
alter table public.agent_meta_ads_connections force row level security;
revoke all on public.agent_meta_ads_connections from public,anon,authenticated;

create table public.agent_meta_ad_accounts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null check(account_id ~ '^act_[0-9]{1,32}$'),
  name text not null check(char_length(name) between 1 and 220),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  timezone_name text not null default '',
  account_status integer,
  last_seen_at timestamptz not null default now(),
  primary key(owner_id,account_id)
);
create index agent_meta_ads_accounts_owner on public.agent_meta_ad_accounts(owner_id);
alter table public.agent_meta_ad_accounts enable row level security;
alter table public.agent_meta_ad_accounts force row level security;
revoke all on public.agent_meta_ad_accounts from public,anon,authenticated;

-- Atomic one-time OAuth exchange: only server service_role can consume a challenge.
create function public.consume_agent_meta_oauth_state(p_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  delete from public.agent_meta_oauth_states where state_hash=p_hash and expires_at>now()
    returning owner_id into v_owner;
  return v_owner;
end $$;
revoke all on function public.consume_agent_meta_oauth_state(text) from public,anon,authenticated;
grant execute on function public.consume_agent_meta_oauth_state(text) to service_role;

comment on table public.agent_meta_ads_connections is
  'AES-GCM encrypted Meta read-only user tokens; Edge Functions service role access only.';
