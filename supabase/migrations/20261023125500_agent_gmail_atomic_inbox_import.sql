-- Store Gmail inbox metadata atomically without pre-reading rows through PostgREST.
-- Both functions are SECURITY INVOKER, executable only with the server's service_role.
-- Owner-facing Data API remains protected by existing read-only RLS policies.

create or replace function public.agent_gmail_ingest_item(p_owner_id uuid, p_item jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_priority text;
  saved_needs_reply boolean;
  saved_draft_state text;
begin
  if p_owner_id is null or p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'Invalid Gmail inbox item';
  end if;
  if length(coalesce(p_item->>'gmail_message_id','')) not between 5 and 100
    or length(coalesce(p_item->>'thread_id','')) not between 5 and 100
    or length(coalesce(p_item->>'from_email','')) not between 3 and 320 then
    raise exception 'Invalid Gmail message metadata';
  end if;

  insert into public.agent_email_items (
    owner_id, gmail_message_id, thread_id, from_name, from_email, reply_to,
    subject, snippet, received_at, is_unread, priority, priority_reason,
    needs_reply, draft_state, draft_body, last_checked_at, updated_at
  )
  values (
    p_owner_id,
    p_item->>'gmail_message_id',
    p_item->>'thread_id',
    left(coalesce(p_item->>'from_name',''),200),
    p_item->>'from_email',
    left(coalesce(p_item->>'reply_to',''),320),
    left(coalesce(p_item->>'subject',''),500),
    left(coalesce(p_item->>'snippet',''),1600),
    (p_item->>'received_at')::timestamptz,
    coalesce((p_item->>'is_unread')::boolean,false),
    case when p_item->>'priority' in ('urgent','high','medium','low') then p_item->>'priority' else 'low' end,
    left(coalesce(p_item->>'priority_reason',''),500),
    coalesce((p_item->>'needs_reply')::boolean,false),
    'none', '', now(), now()
  )
  on conflict (owner_id, gmail_message_id) do update
  set thread_id = excluded.thread_id,
      from_name = excluded.from_name,
      from_email = excluded.from_email,
      reply_to = excluded.reply_to,
      subject = excluded.subject,
      snippet = excluded.snippet,
      received_at = excluded.received_at,
      is_unread = excluded.is_unread,
      priority = case when public.agent_email_items.priority_manual
        then public.agent_email_items.priority else excluded.priority end,
      priority_reason = case when public.agent_email_items.priority_manual
        then public.agent_email_items.priority_reason else excluded.priority_reason end,
      needs_reply = case when public.agent_email_items.priority_manual
        then public.agent_email_items.needs_reply else excluded.needs_reply end,
      last_checked_at = now(),
      updated_at = now()
  returning priority, needs_reply, draft_state
    into saved_priority, saved_needs_reply, saved_draft_state;

  return jsonb_build_object(
    'priority',saved_priority,
    'needs_reply',saved_needs_reply,
    'draft_state',saved_draft_state
  );
end;
$$;

revoke all on function public.agent_gmail_ingest_item(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.agent_gmail_ingest_item(uuid,jsonb) to service_role;

create or replace function public.agent_gmail_store_generated_draft(
  p_owner_id uuid,
  p_message_id text,
  p_draft text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare saved boolean;
begin
  if p_owner_id is null or length(coalesce(p_message_id,'')) not between 5 and 100
     or length(coalesce(p_draft,'')) not between 1 and 8000 then
    raise exception 'Invalid generated email draft';
  end if;
  update public.agent_email_items e
  set draft_body = p_draft, draft_state='ready', updated_at=now()
  where e.owner_id = p_owner_id
    and e.gmail_message_id = p_message_id
    and e.needs_reply = true
    and e.draft_state = 'none'
    and exists (
      select 1 from public.agent_gmail_connections c
      where c.owner_id=p_owner_id and c.ai_drafting_enabled=true and c.status='active'
    )
  returning true into saved;
  return coalesce(saved,false);
end;
$$;

revoke all on function public.agent_gmail_store_generated_draft(uuid,text,text) from public, anon, authenticated;
grant execute on function public.agent_gmail_store_generated_draft(uuid,text,text) to service_role;
