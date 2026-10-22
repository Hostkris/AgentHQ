alter table public.agent_meta_ads_connections
 add column preferred_account_id text
 check(preferred_account_id is null or preferred_account_id ~ '^act_[0-9]{1,32}$');
comment on column public.agent_meta_ads_connections.preferred_account_id is
 'Owner-selected Meta ad account for natural-language read-only reporting; set only by the authenticated server.';
