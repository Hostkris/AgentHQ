CREATE OR REPLACE FUNCTION public.commit_agent_coordination_step(p_owner_id uuid, p_step_id uuid, p_outcome text, p_body text, p_question text DEFAULT ''::text, p_target_url text DEFAULT ''::text, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_step record;
 v_next record;
 v_next_worker text := null;
 v_message text;
 v_conversation uuid;
 v_target_conversation uuid;
 v_permission uuid;
 v_status text;
 v_next_status text;
 v_url text;
begin
 select s.*,a.title as assignment_title into v_step
 from public.agent_task_steps s
 join public.agent_team_assignments a on a.id=s.assignment_id and a.owner_id=s.owner_id
 where s.id=p_step_id and s.owner_id=p_owner_id and s.status='running'
 for update of s;
 if not found then raise exception 'Step is no longer running'; end if;
 if p_outcome not in ('deliverable','question','permission') then raise exception 'Invalid worker outcome'; end if;
 if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then raise exception 'Worker reply length invalid'; end if;
 insert into public.agent_conversations(owner_id,employee_id)
 values(p_owner_id,v_step.employee_id)
 on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id
 returning id into v_conversation;
 if p_outcome='deliverable' then
  update public.agent_task_steps set status='completed',output=btrim(p_body),question='',updated_at=now()
   where id=p_step_id and owner_id=p_owner_id;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body)
  values(v_step.assignment_id,p_owner_id,'agent',v_step.employee_id,'reply',btrim(p_body));
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
  values(v_conversation,p_owner_id,'employee',btrim(p_body));
  select * into v_next from public.agent_task_steps
    where assignment_id=v_step.assignment_id and owner_id=p_owner_id and status='queued'
    order by step_number limit 1;
  if found then
   v_next_worker:=v_next.employee_id;
   v_next_status:='ready';
   v_message:=left('AI handoff: '||v_step.employee_id||' → '||v_next.employee_id||
     '. Completed: '||v_step.title||'. Next: '||v_next.title||'.',10000);
   insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body)
   values(v_step.assignment_id,p_owner_id,'system','system','status',v_message);
   insert into public.agent_conversations(owner_id,employee_id)
   values(p_owner_id,v_next.employee_id)
   on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id
   returning id into v_target_conversation;
   insert into public.agent_messages(conversation_id,owner_id,sender,body)
   values(v_target_conversation,p_owner_id,'system',v_message);
   update public.agent_team_assignments set coordination_status='ready',
      status='in_progress',updated_at=now()
   where id=v_step.assignment_id and owner_id=p_owner_id;
  else
   v_next_status:='completed';
   update public.agent_team_assignments set coordination_status='completed',
     status='completed',updated_at=now()
   where id=v_step.assignment_id and owner_id=p_owner_id;
   insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body)
   values(v_step.assignment_id,p_owner_id,'system','system','status',
   'AI drafting steps completed. Review the work. No website visits, account actions, publishing, or external delivery occurred.');
  end if;
 elsif p_outcome='question' then
  if p_question is null or char_length(btrim(p_question)) not between 1 and 1500 then
   raise exception 'Missing worker question'; end if;
  update public.agent_task_steps set status='waiting_for_owner',question=btrim(p_question),updated_at=now()
  where id=p_step_id and owner_id=p_owner_id;
  v_message:=left('Question about task "'||v_step.assignment_title||'": '||btrim(p_question),20000);
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body)
  values(v_step.assignment_id,p_owner_id,'agent',v_step.employee_id,'question',v_message);
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
  values(v_conversation,p_owner_id,'employee',v_message);
  update public.agent_team_assignments set coordination_status='waiting_for_owner',
    status='blocked',updated_at=now()
  where id=v_step.assignment_id and owner_id=p_owner_id;
  v_next_status:='waiting_for_owner';
 elsif p_outcome='permission' then
  v_url:=btrim(p_target_url);
  if v_url is null or char_length(v_url) not between 8 and 2048 or v_url !~* '^https://[^ /?#@]+'
   or v_url ~* '(localhost|127\.0\.0\.1|192\.168\.|169\.254\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
  then raise exception 'Unsafe permission request URL'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
   raise exception 'Permission reason is required'; end if;
  insert into public.agent_permission_requests
  (owner_id,employee_id,target_url,reason,request_kind,action_kind,status)
  values(p_owner_id,v_step.employee_id,v_url,btrim(p_reason),'agent','research_visit','pending')
  returning id into v_permission;
  update public.agent_task_steps set status='waiting_for_permission',
  question=left('Website approval requested: '||v_url||'. No web access has been started. After approving, supply the required information in Messages to resume.',1500),
  updated_at=now() where id=p_step_id and owner_id=p_owner_id;
  v_message:=left('Access request for "'||v_step.assignment_title||'": '||v_url||
    '. Reason: '||p_reason||'. Waiting for your permission and source information. Approval does not start browsing.',20000);
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body)
  values(v_step.assignment_id,p_owner_id,'agent',v_step.employee_id,'question',left(v_message,10000));
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
  values(v_conversation,p_owner_id,'employee',v_message);
  update public.agent_team_assignments set coordination_status='waiting_for_permission',
    status='blocked',updated_at=now()
  where id=v_step.assignment_id and owner_id=p_owner_id;
  v_next_status:='waiting_for_permission';
 end if;
 return jsonb_build_object('state',v_next_status,'assignment_id',v_step.assignment_id,
  'worker_id',v_step.employee_id,'next_worker',v_next_worker,
  'permission_request_id',v_permission);
end; $function$
