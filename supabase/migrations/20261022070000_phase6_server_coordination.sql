
-- Only the authenticated, allowlisted AI Edge Function's service-role client
-- may commit manager-selected routes and worker handoff events. Browser roles
-- cannot forge worker progress, messages, or access requests.
create function public.commit_agent_coordination_plan(
 p_owner_id uuid, p_assignment_id uuid, p_summary text, p_steps jsonb
) returns integer language plpgsql security invoker set search_path='' as $$
declare
 v_total int;
 v_existing int;
 v_members text[];
 v_worker text;
 v_title text;
 v_instructions text;
 v_source text;
 v_headline text;
 v_index integer;
 item record;
begin
 if p_summary is null or char_length(btrim(p_summary)) not between 1 and 3000 then
  raise exception 'Invalid manager summary'; end if;
 if p_steps is null or jsonb_typeof(p_steps)<>'array' then raise exception 'Invalid manager plan'; end if;
 v_total:=jsonb_array_length(p_steps);
 if v_total not between 1 and 4 then raise exception 'Plan must contain 1–4 steps'; end if;
 if not exists(select 1 from public.agent_team_assignments
   where id=p_assignment_id and owner_id=p_owner_id
   and coordination_status in ('planning','failed')) then
   raise exception 'Assignment is not waiting for a plan'; end if;
 select count(*) into v_existing from public.agent_task_steps
  where owner_id=p_owner_id and assignment_id=p_assignment_id;
 if v_existing>0 then raise exception 'Plan already exists'; end if;
 v_members:=array[]::text[];
 for item in select value,ordinality from jsonb_array_elements(p_steps) with ordinality loop
  v_worker:=btrim(item.value->>'worker');
  v_title:=btrim(item.value->>'title');
  v_instructions:=btrim(item.value->>'instructions');
  if v_worker is null or v_worker not in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')
  then raise exception 'Invalid step worker'; end if;
  if v_worker=any(v_members) then raise exception 'Duplicate step worker'; end if;
  if v_title is null or char_length(v_title) not between 1 and 180 then raise exception 'Invalid step title'; end if;
  if v_instructions is null or char_length(v_instructions) not between 1 and 3000 then raise exception 'Invalid step instructions'; end if;
  v_index:=item.ordinality::integer;
  v_source:=case when v_index=1 then null else v_members[array_length(v_members,1)] end;
  insert into public.agent_task_steps(owner_id,assignment_id,step_number,employee_id,title,instructions,handoff_from)
  values(p_owner_id,p_assignment_id,v_index,v_worker,v_title,v_instructions,v_source);
  v_members:=array_append(v_members,v_worker);
 end loop;
 update public.agent_team_assignments
  set employee_ids=v_members,manager_summary=btrim(p_summary),
  coordination_status='ready',status='in_progress',updated_at=now()
 where id=p_assignment_id and owner_id=p_owner_id;
 insert into public.agent_team_messages
 (assignment_id,owner_id,sender_kind,sender_id,message_type,body)
 values(p_assignment_id,p_owner_id,'agent','alex','status',
   left('AI manager plan: '||btrim(p_summary),10000));
 return v_total;
end; $$;

create function public.commit_agent_coordination_step(
 p_owner_id uuid, p_step_id uuid, p_outcome text, p_body text,
 p_question text default '', p_target_url text default '', p_reason text default ''
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_step record;
 v_next record;
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
  'worker_id',v_step.employee_id,'next_worker',case when p_outcome='deliverable' and v_next_status='ready' then v_next.employee_id else null end,
  'permission_request_id',v_permission);
end; $$;

revoke all on function public.commit_agent_coordination_plan(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.commit_agent_coordination_step(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.commit_agent_coordination_plan(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.commit_agent_coordination_step(uuid,uuid,text,text,text,text,text) to service_role;
