-- Agent HQ: persist an owner-authored message in a single database transaction.
-- This only records text. It does not deliver a message to an AI employee.
create or replace function public.send_agent_owner_message(p_employee_id text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_employee text := btrim(p_employee_id);
  v_body text := btrim(p_body);
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if v_owner is null then
    raise exception 'Sign in is required to save messages' using errcode = '42501';
  end if;
  if v_employee is null or v_employee not in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq') then
    raise exception 'Invalid employee conversation' using errcode = '22023';
  end if;
  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 20000 then
    raise exception 'Message must contain 1 to 20000 characters' using errcode = '22023';
  end if;
  insert into public.agent_conversations (owner_id, employee_id)
  values (v_owner, v_employee)
  on conflict (owner_id, employee_id) do update
    set employee_id = excluded.employee_id
  returning id into v_conversation_id;

  insert into public.agent_messages (conversation_id, owner_id, sender, body)
  values (v_conversation_id, v_owner, 'owner', v_body)
  returning id into v_message_id;

  return v_message_id;
end;
$$;
revoke all on function public.send_agent_owner_message(text,text) from public, anon;
grant execute on function public.send_agent_owner_message(text,text) to authenticated;
