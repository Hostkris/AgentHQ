-- Record only server-observed Activepieces webhook acceptance, not downstream execution.
create table if not exists public.agent_connector_delivery_checks (
  owner_id uuid not null references auth.users(id) on delete cascade,
  connector text not null check (connector = 'activepieces'),
  config_fingerprint text not null check (char_length(config_fingerprint) = 64),
  last_request_id uuid not null,
  last_delivered_at timestamptz not null,
  primary key (owner_id, connector)
);
alter table public.agent_connector_delivery_checks enable row level security;
revoke all on public.agent_connector_delivery_checks from anon, authenticated;
comment on table public.agent_connector_delivery_checks is 'Service-role-only evidence of an accepted connector test; never confirms downstream workflow execution or grants permissions.';
