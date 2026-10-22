-- Private Gmail email triage and owner-approved sending.
-- Only Edge Functions can store Google OAuth credentials or perform Gmail sends.
create table public.agent_gmail_oauth_states (
 state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
 owner_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default(now()+interval '10 minutes')
);
alter table public.agent_gmail_oauth_states enable row level security;
alter table public.agent_gmail_oauth_states force row level security;
revoke all on public.agent_gmail_oauth_states from public,anon,authenticated;

create table public.agent_gmail_connections (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 gmail_address text not null check(char_length(gmail_address) between 5 and 255),
 encrypted_access_token text not null,
 access_iv text not null,
 encrypted_refresh_token text not null,
 refresh_iv text not null,
 scopes text[] not null default '{}'::text[],
 token_expires_at timestamptz not null,
 status text not null default 'active' check(status in ('active','reconnect_required')),
 ai_drafting_enabled boolean not null default false,
 connected_at timestamptz not null default now(),
 last_checked_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.agent_gmail_connections enable row level security;
alter table public.agent_gmail_connections force row level security;
revoke all on public.agent_gmail_connections from public,anon,authenticated;

create table public.agent_email_items (
 owner_id uuid not null references auth.users(id) on delete cascade,
 gmail_message_id text not null check(char_length(gmail_message_id) between 5 and 100),
 thread_id text not null check(char_length(thread_id) between 5 and 100),
 from_name text not null default '' check(char_length(from_name)<=200),
 from_email text not null check(char_length(from_email) between 3 and 320),
 reply_to text not null default '' check(char_length(reply_to)<=320),
 subject text not null default '' check(char_length(subject)<=500),
 snippet text not null default '' check(char_length(snippet)<=1600),
 original_message_id text not null default '' check(char_length(original_message_id)<=255),
 original_references text not null default '' check(char_length(original_references)<=1500),
 received_at timestamptz not null,
 is_unread boolean not null default true,
 priority text not null default 'low' check(priority in ('low','medium','high','urgent')),
 priority_reason text not null default '' check(char_length(priority_reason)<=500),
 priority_manual boolean not null default false,
 needs_reply boolean not null default false,
 draft_body text not null default '' check(char_length(draft_body)<=8000),
 draft_state text not null default 'none' check(draft_state in ('none','ready','sending','sent','unknown')),
 sent_gmail_id text,
 sent_at timestamptz,
 last_checked_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(owner_id,gmail_message_id),
 constraint sent_email_consistency check ((draft_state='sent' and sent_at is not null) or (draft_state<>'sent'))
);
create index agent_emails_by_priority on public.agent_email_items(owner_id,priority,received_at desc);
alter table public.agent_email_items enable row level security;
alter table public.agent_email_items force row level security;
revoke all on public.agent_email_items from public,anon,authenticated;
grant select on public.agent_email_items to authenticated;
create policy "owner can only read own email summaries" on public.agent_email_items
 for select to authenticated using(owner_id=(select auth.uid()));

create function public.consume_agent_gmail_oauth_state(p_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 delete from public.agent_gmail_oauth_states where state_hash=p_hash and expires_at>now()
 returning owner_id into v_owner;
 return v_owner;
end $$;
revoke all on function public.consume_agent_gmail_oauth_state(text) from public,anon,authenticated;
grant execute on function public.consume_agent_gmail_oauth_state(text) to service_role;

create function public.set_agent_email_priority(p_message_id text,p_priority text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_count integer;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_priority not in ('low','medium','high','urgent') or p_priority is null
 then raise exception 'Invalid email priority';end if;
 update public.agent_email_items set priority=p_priority,priority_manual=true,
  priority_reason='Priority changed by owner',updated_at=now()
 where owner_id=v_owner and gmail_message_id=p_message_id;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Email not found in this account' using errcode='42501';end if;
 return true;
end $$;

create function public.save_agent_email_reply(p_message_id text,p_body text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_count integer;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 8000
 then raise exception 'Reply must be between 1 and 8000 characters';end if;
 update public.agent_email_items set draft_body=btrim(p_body),
  draft_state='ready',updated_at=now()
 where owner_id=v_owner and gmail_message_id=p_message_id
 and draft_state in ('none','ready');
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'This message was sent, is sending, or is not yours' using errcode='42501';end if;
 return true;
end $$;

create function public.set_agent_gmail_ai_drafts(p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=(select auth.uid());v_count integer;
begin
 if v_owner is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_enabled is null then raise exception 'Choose whether AI drafting is enabled';end if;
 update public.agent_gmail_connections set ai_drafting_enabled=p_enabled,
  updated_at=now() where owner_id=v_owner and status='active';
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'Connect Gmail before changing drafting preferences' using errcode='42501';end if;
 return true;
end $$;

revoke all on function public.set_agent_email_priority(text,text) from public,anon;
revoke all on function public.save_agent_email_reply(text,text) from public,anon;
revoke all on function public.set_agent_gmail_ai_drafts(boolean) from public,anon;
grant execute on function public.set_agent_email_priority(text,text) to authenticated;
grant execute on function public.save_agent_email_reply(text,text) to authenticated;
grant execute on function public.set_agent_gmail_ai_drafts(boolean) to authenticated;

comment on table public.agent_email_items is
 'Owner-only Gmail sender/subject/snippet priority and drafted replies; full message bodies and attachments not cached.';
comment on table public.agent_gmail_connections is
 'Service-only AES-256-GCM encrypted OAuth access/refresh tokens. Read and send authorization does not imply automatic sending.';
