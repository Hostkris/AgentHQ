CREATE OR REPLACE FUNCTION public.request_agent_personal_permission(p_account_id uuid, p_employee_id text, p_capability text, p_purpose text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if exists(select 1 from public.agent_personal_permission_plans
  where owner_id=v_owner and account_id=p_account_id
    and employee_id=p_employee_id and capability=p_capability
    and status='approved' and expires_at>now() and revoked_at is null)
 then raise exception 'This worker already has an active approval for this scope. Revoke it first.';end if;
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
end $function$
