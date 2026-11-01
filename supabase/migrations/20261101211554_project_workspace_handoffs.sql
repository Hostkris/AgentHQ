-- Additive project workspace support. Existing projects and permissions are retained.
alter table public.agent_task_steps drop constraint agent_task_steps_step_number_check;
alter table public.agent_task_steps add constraint agent_task_steps_step_number_check check(step_number between 1 and 9);
alter table public.agent_task_steps
 add column if not exists work_product text not null default '' check(char_length(work_product)<=16000),
 add column if not exists depends_on text[] not null default '{}',
 add column if not exists output_revision integer,
 add column if not exists acceptance_criteria text not null default '';
create unique index if not exists agent_assignment_owner_pair on public.agent_team_assignments(id,owner_id);
create table public.agent_project_workspaces(
 assignment_id uuid primary key,owner_id uuid not null,
 project_kind text not null default 'general' check(project_kind in ('general','personal','business','education','creative','household')),
 goal text not null check(char_length(goal) between 5 and 10000),
 requirements jsonb not null default '[]' check(jsonb_typeof(requirements)='array' and pg_column_size(requirements)<20000),
 output_format text not null default 'markdown' check(output_format in ('markdown','text','pdf','csv','json','html','ics')),
 completion_criteria text not null default '' check(char_length(completion_criteria)<=3000),
 business_key text not null default '' check(char_length(business_key)<=120),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(assignment_id,owner_id) references public.agent_team_assignments(id,owner_id) on delete cascade
);
create table public.agent_project_handbooks(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 handbook_key text not null check(handbook_key ~ '^[a-z0-9_-]{1,120}$'),title text not null check(char_length(title) between 1 and 180),
 scope text not null default 'business' check(scope in ('general','business')),
 content text not null check(char_length(content) between 10 and 24000),
 approved boolean not null default false,version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,handbook_key)
);
create table public.agent_project_references(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,assignment_id uuid not null,
 filename text not null check(char_length(filename) between 1 and 180),content text not null check(octet_length(content) between 1 and 524288),
 created_at timestamptz not null default now(),
 foreign key(assignment_id,owner_id) references public.agent_team_assignments(id,owner_id) on delete cascade
);
create table public.agent_project_step_history(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,assignment_id uuid not null,employee_id text not null,
 revision integer not null,output text not null,created_at timestamptz not null default now(),
 foreign key(assignment_id,owner_id) references public.agent_team_assignments(id,owner_id) on delete cascade,
 unique(assignment_id,employee_id,revision)
);
create table public.agent_project_artifacts(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,assignment_id uuid not null,
 revision integer not null,run_id uuid not null references public.agent_worker_runs(id) on delete cascade,
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 artifact_kind text not null check(artifact_kind in ('step','final','original')),
 filename text not null,mime_type text not null,object_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),size_bytes integer not null check(size_bytes between 1 and 5242880),
 status text not null default 'staged' check(status in ('staged','ready')),note text not null default '',
 created_at timestamptz not null default now(),
 foreign key(assignment_id,owner_id) references public.agent_team_assignments(id,owner_id) on delete cascade,
 unique(assignment_id,revision,run_id,artifact_kind)
);
create index on public.agent_project_workspaces(owner_id,business_key);
create index on public.agent_project_handbooks(owner_id,scope,approved);
create index on public.agent_project_references(owner_id,assignment_id,created_at);
create index on public.agent_project_step_history(owner_id,assignment_id,revision);
create index on public.agent_project_artifacts(owner_id,assignment_id,revision,status);
do $$ declare t text;begin
 foreach t in array array['agent_project_workspaces','agent_project_handbooks','agent_project_references','agent_project_step_history','agent_project_artifacts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy owner_reads on public.%I for select to authenticated using (owner_id=(select auth.uid())%s)',t,
   case when t='agent_project_artifacts' then ' and status=''ready''' else '' end);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('agent-project-files','agent-project-files',false,5242880,
 array['text/markdown','text/plain','application/pdf','text/csv','application/json','text/html','text/calendar'])
 on conflict(id) do nothing;
create policy owner_downloads_project_artifacts on storage.objects for select to authenticated
 using(bucket_id='agent-project-files' and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.agent_project_artifacts a where a.object_path=name and a.owner_id=(select auth.uid()) and a.status='ready'));

create function public.create_agent_workspace_project(p_owner uuid,p_source text,p_brief text,p_meta jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare aid uuid; book_key text;begin
 if p_source is null or not p_source=any(array['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']) or coalesce(char_length(btrim(p_brief)),0) not between 5 and 10000 then raise exception 'Invalid project';end if;
 insert into public.agent_project_handbooks(owner_id,handbook_key,title,scope,content,approved)
 values(p_owner,'working-agreements','Shared working agreements','general',
 'Identify the project and use its approved requirements and references. Business information is optional. Stay in your assigned role; Alex coordinates. Save real work products before handing off and verify the result against the goal. Continue authorized internal work and safe retries within existing usage limits. Ask only for essential missing facts or specific protected-action authorization. A handbook, saved profile or draft approval grants no account access, spending or sending permissions. Keep projects and businesses separate.',true)
 on conflict(owner_id,handbook_key) do nothing;
 insert into public.agent_team_assignments(owner_id,title,instructions,employee_ids,source_employee_id,coordination_status,workflow_version)
 values(p_owner,left(split_part(btrim(p_brief),E'\n',1),120),btrim(p_brief),array[p_source],p_source,'planning',2) returning id into aid;
 select min(handbook_key) into book_key from public.agent_project_handbooks
  where owner_id=p_owner and approved and scope='business' and position(lower(title) in lower(p_brief))>0 having count(*)=1;
 insert into public.agent_project_workspaces(assignment_id,owner_id,goal,project_kind,requirements,output_format,completion_criteria,business_key)
 values(aid,p_owner,btrim(p_brief),coalesce(p_meta->>'project_kind','general'),coalesce(p_meta->'requirements','[]'),coalesce(p_meta->>'output_format','markdown'),left(coalesce(p_meta->>'completion_criteria',''),3000),coalesce(book_key,''));
 return jsonb_build_object('id',aid);
end $$;

create function public.update_agent_project_context(p_owner uuid,p_assignment uuid,p_note text,p_from_worker text default null,p_expected_revision integer default null,p_business_key text default null,p_output_format text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.agent_team_assignments;s public.agent_project_sessions; first_step int; first_worker text; rev int;begin
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found then raise exception 'Project not found';end if;
 insert into public.agent_project_sessions(assignment_id,owner_id) values(p_assignment,p_owner) on conflict do nothing;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if p_expected_revision is not null and s.revision<>p_expected_revision then raise exception 'Project changed; refresh before applying the update';end if;
 if s.phase='waiting_permission' then raise exception 'Resolve the exact pending authorization before changing project scope';end if;
 if coalesce(char_length(btrim(p_note)),0) not between 5 and 10000 then raise exception 'Describe the project update';end if;
 if p_business_key is not null and p_business_key<>'' and not exists(select 1 from public.agent_project_handbooks where owner_id=p_owner and handbook_key=p_business_key and approved and scope='business') then raise exception 'Choose an approved business handbook';end if;
 if p_from_worker is not null and p_from_worker<>'alex' and not p_from_worker=any(s.team_order) then raise exception 'The affected worker is not assigned to this project';end if;
 insert into public.agent_project_workspaces(assignment_id,owner_id,goal,requirements,completion_criteria)
 values(p_assignment,p_owner,left(coalesce(nullif(a.instructions,''),a.title)||case when char_length(coalesce(nullif(a.instructions,''),a.title))<5 then ' project' else '' end,10000),'[]','Deliver the requested usable output and verify the saved requirements.') on conflict(assignment_id) do nothing;
 select step_number,employee_id into first_step,first_worker from public.agent_task_steps where owner_id=p_owner and assignment_id=p_assignment and (p_from_worker is null or employee_id=p_from_worker) order by step_number limit 1;
 rev:=s.revision+1;
 insert into public.agent_project_step_history(owner_id,assignment_id,employee_id,revision,output)
 select owner_id,assignment_id,employee_id,coalesce(output_revision,s.revision),coalesce(nullif(work_product,''),output) from public.agent_task_steps where assignment_id=p_assignment and owner_id=p_owner and output<>''
 on conflict(assignment_id,employee_id,revision) do nothing;
 update public.agent_worker_runs set status='failed',error_summary='Superseded by project update',finished_at=now() where id=s.active_run and owner_id=p_owner and status='running';
 if p_from_worker='alex' then
  delete from public.agent_task_steps where owner_id=p_owner and assignment_id=p_assignment;
  first_worker:=null;
 else
  update public.agent_task_steps set status=case when step_number<coalesce(first_step,0) and status='completed' then 'completed' else 'queued' end,
   output=case when step_number<coalesce(first_step,0) and status='completed' then output else '' end,
   work_product=case when step_number<coalesce(first_step,0) and status='completed' then work_product else '' end,
   output_revision=case when step_number<coalesce(first_step,0) and status='completed' then rev else null end,question='',updated_at=now()
   where owner_id=p_owner and assignment_id=p_assignment;
 end if;
 update public.agent_project_sessions set revision=rev,turn_count=0,phase=case when first_worker is null then 'planning' else 'discussion' end,
  discussion_done=coalesce((select array_agg(employee_id order by step_number) from public.agent_task_steps where assignment_id=p_assignment and owner_id=p_owner and status='completed'),'{}'),
  check_done='{}',next_worker=coalesce(first_worker,'alex'),active_run=null,active_worker=null,lease_until=null,
  peer_target=null,peer_question=null,peer_return_worker=null,peer_return_phase=null,peer_exchanges=0,
  waiting_worker=null,question_message_id=null,pending_question='',pending_request_id=null,resume_phase=null,
  feedback=left(p_note,10000),output_version=null,review_status='pending',last_error='',recovery_state='idle',recovery_error='',recovery_guidance='',recovery_attempts=0,next_run_at=now(),updated_at=now()
 where assignment_id=p_assignment;
 update public.agent_project_workspaces set requirements=(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(requirements||jsonb_build_array(left(p_note,4000))) with ordinality r(value,n) order by n desc limit 25) q),
  business_key=coalesce(p_business_key,business_key),output_format=coalesce(p_output_format,output_format),updated_at=now()
 where owner_id=p_owner and assignment_id=p_assignment;
 update public.agent_team_assignments set status='in_progress',coordination_status='ready',updated_at=now() where id=p_assignment;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
 values(p_assignment,p_owner,'owner','owner','note',p_note,rev,'owner_context');
 return jsonb_build_object('state',case when a.owner_paused then 'paused' else 'ready' end,'assignment_id',p_assignment,'revision',rev);
end $$;

create function public.add_agent_project_reference(p_owner uuid,p_assignment uuid,p_name text,p_content text,p_from_worker text default null,p_expected_revision integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 if not exists(select 1 from public.agent_team_assignments where id=p_assignment and owner_id=p_owner) then raise exception 'Project not found';end if;
 if (select count(*) from public.agent_project_references where owner_id=p_owner and assignment_id=p_assignment)>=50 then raise exception 'Project reference limit reached';end if;
 insert into public.agent_project_references(owner_id,assignment_id,filename,content) values(p_owner,p_assignment,p_name,p_content);
 result:=public.update_agent_project_context(p_owner,p_assignment,'Reference added: '||p_name,p_from_worker,p_expected_revision);
 return result;
end $$;

create function public.save_agent_project_handbook(p_owner uuid,p_key text,p_title text,p_scope text,p_content text,p_approved boolean,p_expected_version integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare h public.agent_project_handbooks; row record; old_scope text;begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_key,712));
 select * into h from public.agent_project_handbooks where owner_id=p_owner and handbook_key=p_key for update;
 if h.id is not null and p_expected_version is null then raise exception 'Open the existing handbook before editing it';end if;
 if p_expected_version is not null and (h.id is null or h.version<>p_expected_version) then raise exception 'Handbook changed; refresh before saving';end if;
 old_scope:=h.scope;
 insert into public.agent_project_handbooks(owner_id,handbook_key,title,scope,content,approved)
 values(p_owner,p_key,p_title,p_scope,p_content,p_approved)
 on conflict(owner_id,handbook_key) do update set title=excluded.title,scope=excluded.scope,content=excluded.content,approved=excluded.approved,version=agent_project_handbooks.version+1,updated_at=now()
 returning * into h;
 for row in select w.assignment_id from public.agent_project_workspaces w join public.agent_project_sessions s using(assignment_id,owner_id)
  where w.owner_id=p_owner and (h.scope='general' or old_scope='general' or w.business_key=h.handbook_key) and s.phase<>'approved' loop
  perform public.update_agent_project_context(p_owner,row.assignment_id,'Handbook updated: '||h.title||' (version '||h.version||')');
 end loop;
 return to_jsonb(h);
end $$;

revoke all on function public.create_agent_workspace_project(uuid,text,text,jsonb),public.update_agent_project_context(uuid,uuid,text,text,integer,text,text),public.add_agent_project_reference(uuid,uuid,text,text,text,integer),public.save_agent_project_handbook(uuid,text,text,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.create_agent_workspace_project(uuid,text,text,jsonb),public.update_agent_project_context(uuid,uuid,text,text,integer,text,text),public.add_agent_project_reference(uuid,uuid,text,text,text,integer),public.save_agent_project_handbook(uuid,text,text,text,text,boolean,integer) to service_role;

-- Install the shared enrollment handbook for existing Agent HQ owners as well.
insert into public.agent_project_handbooks(owner_id,handbook_key,title,scope,content,approved)
select id,'working-agreements','Shared working agreements','general',
 'Identify the project and use its approved requirements and references. Business information is optional. Stay in your assigned role; Alex coordinates. Save real work products before handing off and verify the result against the goal. Continue authorized internal work and safe retries within existing usage limits. Ask only for essential missing facts or specific protected-action authorization. A handbook, saved profile or draft approval grants no account access, spending or sending permissions. Keep projects and businesses separate.',true
from auth.users where id in (select owner_id from public.agent_conversations union select owner_id from public.agent_team_assignments)
on conflict(owner_id,handbook_key) do nothing;

-- Extended worker handoffs and artifact verification, retaining the current project protocol.
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
  if s.phase<>'polishing' or worker<>s.lead_worker or s.peer_target is not null or char_length(body)<80 or cardinality(s.check_done)<>cardinality(s.team_order)-1 then raise exception 'Team review is not finished'; end if;
  if exists(select 1 from public.agent_project_workspaces where assignment_id=p_assignment and owner_id=p_owner) and not exists(
   select 1 from public.agent_project_artifacts where owner_id=p_owner and assignment_id=p_assignment and revision=s.revision and run_id=p_run and artifact_kind='final' and status='staged'
  ) then raise exception 'The requested output file has not been verified';end if;
  version:=gen_random_uuid();
  update public.agent_project_sessions set shared_draft=body,final_output=body,output_version=version,phase='review',review_status='pending' where assignment_id=p_assignment;
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
