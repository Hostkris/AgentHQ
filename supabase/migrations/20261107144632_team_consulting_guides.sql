-- Keep existing projects compatible; every new project requires a practical guide.
alter table public.agent_project_sessions
 add column consulting_guide text not null default '' check(char_length(consulting_guide)<=16000),
 add column consulting_guide_required boolean not null default false;
alter table public.agent_project_sessions alter column consulting_guide_required set default true;

alter table public.agent_custom_bot_messages
 add column consultation_project_id uuid references public.agent_team_assignments(id) on delete set null,
 add column consultation_revision integer,
 add column consultation_version uuid,
 add column consultation_part integer;
create index agent_bot_consultation_project on public.agent_custom_bot_messages(consultation_project_id) where consultation_project_id is not null;

-- This ledger survives message deletion, so retries never resurrect deleted guides.
create table agent_hq_private.consulting_deliveries(
 owner_id uuid not null references auth.users(id) on delete cascade,
 delivery_key text not null check(char_length(delivery_key) between 5 and 200),
 created_at timestamptz not null default now(),
 primary key(owner_id,delivery_key)
);
alter table agent_hq_private.consulting_deliveries enable row level security;
alter table agent_hq_private.consulting_deliveries force row level security;
revoke all on agent_hq_private.consulting_deliveries from public,anon,authenticated;
grant usage on schema agent_hq_private to service_role;
grant all on agent_hq_private.consulting_deliveries to service_role;

create function public.deliver_agent_consultation(p_owner uuid,p_key text,p_actor text,p_body text,
 p_project uuid default null,p_revision integer default null,p_version uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare bot uuid; actor_label text; project_title text; s public.agent_project_sessions;
 piece text; heading text; total integer; n integer;
begin
 if coalesce(char_length(p_key),0) not between 5 and 200 or coalesce(char_length(btrim(p_body)),0) not between 40 and 80000 then raise exception 'Invalid consultation delivery';end if;
 if p_project is not null then
  select * into s from public.agent_project_sessions where assignment_id=p_project and owner_id=p_owner;
  if not found or s.phase not in ('review','approved') or s.revision is distinct from p_revision or s.output_version is distinct from p_version or s.lead_worker is distinct from p_actor or p_key is distinct from 'project:'||p_project::text||':'||p_version::text then raise exception 'Consulting project or version changed';end if;
  select title into project_title from public.agent_team_assignments where id=p_project and owner_id=p_owner;
  if not found then raise exception 'Consulting project not owned';end if;
 end if;
 if p_actor=any(array['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq']) then actor_label:=initcap(p_actor);
 else
  select name into actor_label from public.agent_custom_bots where owner_id=p_owner and id::text=p_actor and status='active';
  if not found then raise exception 'Unknown consulting worker';end if;
 end if;
 select id into bot from public.agent_custom_bots where owner_id=p_owner and template_key='eleanor-secretary-v1' and status='active';
 if not found then return jsonb_build_object('state','secretary_unavailable');end if;
 insert into agent_hq_private.consulting_deliveries(owner_id,delivery_key) values(p_owner,p_key) on conflict do nothing;
 if not found then return jsonb_build_object('state','already_delivered');end if;
 total:=ceil(char_length(p_body)/5000.0);
 for n in 1..total loop
  heading:='Eleanor — consulting guide'||E'\nFrom: '||actor_label||
   case when p_project is not null then E'\nProject: '||project_title||' · version '||p_revision::text else '' end||
   case when total>1 then E'\nPart '||n::text||' of '||total::text else '' end||
   E'\nRead the steps below. Project review and outside actions keep their existing approval controls.\n\n';
  piece:=substring(p_body from (n-1)*5000+1 for 5000);
  insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body,consultation_project_id,consultation_revision,consultation_version,consultation_part,created_at)
   values(p_owner,bot,'handoff',heading||piece,p_project,p_revision,p_version,n,clock_timestamp());
 end loop;
 return jsonb_build_object('state','delivered','parts',total,'bot_id',bot);
end $$;
revoke all on function public.deliver_agent_consultation(uuid,text,text,text,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.deliver_agent_consultation(uuid,text,text,text,uuid,integer,uuid) to service_role;

create function agent_hq_private.deliver_consulting_project()
returns trigger language plpgsql security invoker set search_path='' as $$
declare sources text; content text;
begin
 if new.phase<>'review' or new.output_version is null or new.output_version is not distinct from old.output_version then return new;end if;
 select string_agg(source_line,E'\n') into sources from (
  select distinct 'Retrieved '||to_char(r.finished_at at time zone 'UTC','YYYY-MM-DD')||': '||left(coalesce(v->>'title','Source'),180)||E'\n'||(v->>'url') as source_line
  from public.agent_role_research r cross join lateral jsonb_array_elements(r.sources) v
  where r.owner_id=new.owner_id and r.assignment_id=new.assignment_id and r.project_revision=new.revision and r.status='completed'
   and v->>'url' like 'https://%' limit 20
 ) observed;
 content:=case when new.consulting_guide<>'' then E'PRACTICAL GUIDE\n'||new.consulting_guide||E'\n\n' else '' end||
  E'COMPLETED WORK\n'||new.final_output||
  case when sources is not null then E'\n\nOBSERVED RESEARCH SOURCES\n'||sources else E'\n\nResearch: no current public source links were recorded for this version. Treat current factual claims as unverified.' end;
 perform public.deliver_agent_consultation(new.owner_id,'project:'||new.assignment_id::text||':'||new.output_version::text,new.lead_worker,content,new.assignment_id,new.revision,new.output_version);
 return new;
end $$;
revoke all on function agent_hq_private.deliver_consulting_project() from public,anon,authenticated;
grant execute on function agent_hq_private.deliver_consulting_project() to service_role;
create trigger agent_project_consulting_delivery after update of phase,output_version on public.agent_project_sessions
 for each row execute function agent_hq_private.deliver_consulting_project();

CREATE OR REPLACE FUNCTION public.commit_agent_project_turn(p_owner uuid, p_assignment uuid, p_run uuid, p_revision integer, p_decision jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 a public.agent_team_assignments; s public.agent_project_sessions; k text:=p_decision->>'kind';
 body text:=btrim(coalesce(p_decision->>'text','')); question text:=btrim(coalesce(p_decision->>'question',''));
 target text:=p_decision->>'recipient'; worker text; cid uuid; mid uuid; perm uuid; routes jsonb; item jsonb; members text[]:='{}'; i int:=0; chosen text; version uuid;
begin
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found then raise exception 'Project removed'; end if;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if not found or s.active_run is distinct from p_run or s.revision<>p_revision or s.lease_until<clock_timestamp() or a.owner_paused then raise exception 'Turn expired, stopped or superseded'; end if;
 worker:=s.active_worker;
 if char_length(body) not between 1 and 16000 then raise exception 'Empty or oversized team response'; end if;
 if k='plan' then
  if s.phase<>'planning' or worker<>'alex' then raise exception 'Not a manager planning turn'; end if;
  routes:=p_decision->'routes';
  if jsonb_typeof(routes)<>'array' or jsonb_array_length(routes) not between 2 and 9 then raise exception 'Choose two to nine accountable specialists'; end if;
  for item in select value from jsonb_array_elements(routes) loop
   chosen:=item->>'worker'; i:=i+1;
   if chosen is null or chosen='alex' or not chosen=any(array['maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']) or chosen=any(members) then raise exception 'Invalid specialist'; end if;
   insert into public.agent_task_steps(owner_id,assignment_id,step_number,employee_id,title,instructions,handoff_from)
   values(p_owner,p_assignment,i,chosen,left(item->>'title',180),left(item->>'instructions',3000),case when i=1 then null else members[i-1] end);
   update public.agent_task_steps set depends_on=members,acceptance_criteria=left(coalesce(item->>'acceptance_criteria',item->>'instructions'),3000)
    where assignment_id=p_assignment and owner_id=p_owner and employee_id=chosen;
   members:=array_append(members,chosen);
  end loop;
  update public.agent_project_sessions set team_order=members,lead_worker=case when (p_decision->>'lead_worker')=any(members) then p_decision->>'lead_worker' else members[1] end,next_worker=members[1],phase='discussion' where assignment_id=p_assignment;
  update public.agent_team_assignments set employee_ids=members,manager_summary=left(body,3000) where id=p_assignment;
  -- The direct owner assignment authorizes this bounded internal collaboration only.
  insert into public.agent_alex_plan_decisions(owner_id,assignment_id,status,decided_at) values(p_owner,p_assignment,'approved',now()) on conflict(owner_id,assignment_id) do update set status='approved',decided_at=now();
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(p_assignment,p_owner,'agent','alex','reply',left(body,1600),s.revision,'discussion');
 elsif k='ask_owner' or k='permission' then
  if worker='alex' or char_length(question) not between 1 and 1500 then raise exception 'Invalid owner blocker'; end if;
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,worker) on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
  if k='permission' then
   if coalesce(p_decision->>'url','') !~ '^https://[^ /?#@]+' or char_length(p_decision->>'url')>2048 then raise exception 'Invalid requested URL'; end if;
   insert into public.agent_permission_requests(owner_id,employee_id,target_url,reason,request_kind,action_kind,status)
    values(p_owner,worker,p_decision->>'url',left(question,1000),'agent','research_visit','pending') returning id into perm;
  end if;
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
   values(cid,p_owner,'employee',left('For “'||a.title||'”: '||question||case when k='permission' then E'\nRequested site: '||(p_decision->>'url')||E'\nApprove or deny this request here. Approval records this scope; it does not connect a browser or publish anything.' else '' end,9500)) returning id into mid;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(p_assignment,p_owner,'agent',worker,'reply','I need a detail from the owner before I can finish this part. I’ve asked in my private conversation and will bring the answer back to the team.',s.revision,'discussion');
  update public.agent_project_sessions set phase=case when k='permission' then 'waiting_permission' else 'waiting_owner' end,resume_phase=s.phase,waiting_worker=worker,question_message_id=mid,pending_question=question,pending_request_id=perm where assignment_id=p_assignment;
  update public.agent_chat_states set assignment_id=p_assignment,updated_at=now() where owner_id=p_owner and employee_id=worker and stage='idle';
 elsif k='ask_team' then
  if s.phase not in ('discussion','drafting','checking','polishing') or s.peer_target is not null or s.peer_exchanges>=3 or target is null or target=worker or not target=any(s.team_order) or char_length(body)>1600 then raise exception 'Invalid teammate question'; end if;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind,recipient_id)
   values(p_assignment,p_owner,'agent',worker,'question',body,s.revision,'team_question',target) returning id into mid;
  update public.agent_project_sessions set peer_target=target,peer_question=mid,peer_return_worker=worker,peer_return_phase=s.phase,peer_exchanges=peer_exchanges+1,next_worker=target where assignment_id=p_assignment;
 elsif k='answer' then
  if s.peer_target is distinct from worker or char_length(body)>1600 then raise exception 'No teammate question for this worker'; end if;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind,recipient_id)
   values(p_assignment,p_owner,'agent',worker,'reply',body,s.revision,'team_answer',s.peer_return_worker);
  update public.agent_project_sessions set next_worker=s.peer_return_worker,phase=s.peer_return_phase,peer_target=null,peer_question=null,peer_return_worker=null,peer_return_phase=null where assignment_id=p_assignment;
 elsif k='contribute' then
  if s.phase<>'discussion' or s.peer_target is not null or not worker=any(s.team_order) or worker=any(s.discussion_done) or char_length(body)>16000 then raise exception 'Invalid discussion turn'; end if;
  if exists(select 1 from public.agent_task_steps st cross join lateral unnest(st.depends_on) dep where st.assignment_id=p_assignment and st.owner_id=p_owner and st.employee_id=worker
   and not exists(select 1 from public.agent_task_steps ready where ready.assignment_id=p_assignment and ready.owner_id=p_owner and ready.employee_id=dep and ready.status='completed' and ready.output_revision=s.revision)) then raise exception 'Upstream work is not complete';end if;
  if char_length(body)<40 then raise exception 'Hand off a usable work product';end if;
  update public.agent_task_steps set status='completed',output=left(body,4000),work_product=body,output_revision=s.revision,updated_at=now()
   where assignment_id=p_assignment and owner_id=p_owner and employee_id=worker;
  members:=array_append(s.discussion_done,worker);
  select value into chosen from unnest(s.team_order) value where not value=any(members) limit 1;
  update public.agent_project_sessions set discussion_done=members,phase=case when chosen is null then 'drafting' else 'discussion' end,next_worker=coalesce(chosen,s.lead_worker) where assignment_id=p_assignment;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(p_assignment,p_owner,'agent',worker,'reply',body,s.revision,'discussion');
 elsif k='draft' then
  if s.phase<>'drafting' or worker<>s.lead_worker or s.peer_target is not null or char_length(body)<80 then raise exception 'Not a drafting turn'; end if;
  select value into chosen from unnest(s.team_order) value where value<>s.lead_worker limit 1;
  update public.agent_project_sessions set shared_draft=body,phase='checking',next_worker=chosen where assignment_id=p_assignment;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(p_assignment,p_owner,'agent',worker,'reply',left(coalesce(nullif(p_decision->>'message',''),'I’ve put the shared draft together. Please check it against the brief, call out weak sections, and tell me what needs changing.'),1600),s.revision,'discussion');
 elsif k='check' then
  if s.phase<>'checking' or worker=s.lead_worker or not worker=any(s.team_order) or s.peer_target is not null or char_length(body)>2000 then raise exception 'Not a peer review turn'; end if;
  members:=array_append(s.check_done,worker);
  select value into chosen from unnest(s.team_order) value where value<>s.lead_worker and not value=any(members) limit 1;
  update public.agent_project_sessions set check_done=members,phase=case when chosen is null then 'polishing' else 'checking' end,next_worker=coalesce(chosen,s.lead_worker) where assignment_id=p_assignment;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind,recipient_id)
   values(p_assignment,p_owner,'agent',worker,'reply',body,s.revision,'check',s.lead_worker);
 elsif k='final' then
  if s.consulting_guide_required and coalesce(char_length(btrim(p_decision->>'guide')),0)<120 then raise exception 'The complete consulting guide is missing';end if;
  if coalesce(char_length(p_decision->>'guide'),0)>16000 then raise exception 'The consulting guide exceeds its storage limit';end if;
  if s.phase<>'polishing' or worker<>s.lead_worker or s.peer_target is not null or char_length(body)<80 or cardinality(s.check_done)<>cardinality(s.team_order)-1 then raise exception 'Team review is not finished'; end if;
  if exists(select 1 from public.agent_project_workspaces where assignment_id=p_assignment and owner_id=p_owner) and not exists(
   select 1 from public.agent_project_artifacts where owner_id=p_owner and assignment_id=p_assignment and revision=s.revision and run_id=p_run and artifact_kind='final' and status='staged'
  ) then raise exception 'The requested output file has not been verified';end if;
  version:=gen_random_uuid();
  update public.agent_project_sessions set consulting_guide=coalesce(p_decision->>'guide',''),shared_draft=body,final_output=body,output_version=version,phase='review',review_status='pending' where assignment_id=p_assignment;
  update public.agent_task_steps set status='completed',output=case when employee_id=s.lead_worker then left(body,4000) else output end,output_revision=s.revision,question='',updated_at=now() where assignment_id=p_assignment and owner_id=p_owner;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(p_assignment,p_owner,'agent',worker,'reply',left(coalesce(nullif(p_decision->>'message',''),'I’ve addressed the team’s feedback. The finished version is ready for the owner’s review below.'),1600),s.revision,'discussion');
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,'alex') on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
   values(cid,p_owner,'employee','The team has finished “'||a.title||'” (version '||s.revision||'). The combined work is ready in Company HQ. Open the project below to approve it or request changes. Nothing has been published or sent outside Agent HQ.');
 else raise exception 'Unknown project turn';
 end if;
 update public.agent_project_artifacts set status='ready' where owner_id=p_owner and assignment_id=p_assignment and revision=s.revision and run_id=p_run and status='staged';
 update public.agent_worker_runs set status='completed',result_preview=left(body,4000),finished_at=now() where id=p_run and owner_id=p_owner and status='running';
 update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,turn_count=turn_count+1,last_error='',next_run_at=now()+interval '4 seconds',updated_at=now() where assignment_id=p_assignment returning * into s;
 update public.agent_team_assignments set coordination_status=case when s.phase in ('review','approved') then 'completed' when s.phase='waiting_owner' then 'waiting_for_owner' when s.phase='waiting_permission' then 'waiting_for_permission' else 'ready' end,
  status=case when s.phase='approved' then 'completed' when s.phase in ('waiting_owner','waiting_permission') then 'blocked' else 'in_progress' end,updated_at=now() where id=p_assignment;
 return jsonb_build_object('state',case when s.phase in ('review','approved','waiting_owner','waiting_permission') then s.phase else 'ready' end,'worker_id',worker,'next_worker',s.next_worker,'retry_at',s.next_run_at,'output_version',s.output_version);
end; $function$;


-- Direct specialist research and custom-worker tutorials use the same durable delivery.
create function agent_hq_private.deliver_consulting_research()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' and new.assignment_id is null then
  perform public.deliver_agent_consultation(new.owner_id,'research:'||new.id::text,new.employee_id,E'PUBLIC RESEARCH\n'||new.report);
 end if;
 return new;
end $$;
revoke all on function agent_hq_private.deliver_consulting_research() from public,anon,authenticated;
grant execute on function agent_hq_private.deliver_consulting_research() to service_role;
create trigger agent_consulting_research_delivery after update of status on public.agent_role_research
 for each row execute function agent_hq_private.deliver_consulting_research();

alter table public.agent_custom_bot_messages add column consultation_requested boolean not null default false;
create function agent_hq_private.deliver_custom_consulting_reply()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.sender='worker' and new.consultation_requested and exists(
  select 1 from public.agent_custom_bots where id=new.bot_id and owner_id=new.owner_id and template_key<>'eleanor-secretary-v1' and status='active'
 ) then
  perform public.deliver_agent_consultation(new.owner_id,'reply:'||new.id::text,new.bot_id::text,new.body);
 end if;
 return new;
end $$;
revoke all on function agent_hq_private.deliver_custom_consulting_reply() from public,anon,authenticated;
grant execute on function agent_hq_private.deliver_custom_consulting_reply() to service_role;
create trigger agent_custom_consulting_reply after insert on public.agent_custom_bot_messages
 for each row execute function agent_hq_private.deliver_custom_consulting_reply();
