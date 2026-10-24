-- New projects use a bounded shared conversation. Existing work and messages stay intact.
alter table public.agent_team_assignments add column workflow_version smallint not null default 1 check (workflow_version in (1,2));
alter table public.agent_team_assignments alter column workflow_version set default 2;
alter table public.agent_team_messages
 add column project_revision integer check (project_revision > 0),
 add column project_kind text check (project_kind in ('discussion','team_question','team_answer','draft','check','final','owner_context','revision','decision')),
 add column recipient_id text check (recipient_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn'));

create table public.agent_project_sessions (
 assignment_id uuid primary key references public.agent_team_assignments(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 phase text not null default 'planning' check (phase in ('planning','discussion','drafting','checking','polishing','waiting_owner','waiting_permission','review','approved')),
 revision integer not null default 1 check (revision > 0),
 turn_count integer not null default 0 check (turn_count between 0 and 18),
 team_order text[] not null default '{}',
 lead_worker text,
 discussion_done text[] not null default '{}',
 check_done text[] not null default '{}',
 next_worker text not null default 'alex',
 peer_target text,
 peer_question uuid,
 peer_return_worker text,
 peer_return_phase text,
 peer_exchanges integer not null default 0 check (peer_exchanges between 0 and 3),
 waiting_worker text,
 question_message_id uuid,
 pending_question text not null default '',
 pending_request_id uuid references public.agent_permission_requests(id) on delete set null,
 resume_phase text,
 shared_draft text not null default '' check (char_length(shared_draft)<=16000),
 final_output text not null default '' check (char_length(final_output)<=16000),
 output_version uuid,
 review_status text not null default 'pending' check (review_status in ('pending','approved','changes_requested')),
 feedback text not null default '' check (char_length(feedback)<=10000),
 active_run uuid,
 active_worker text,
 lease_until timestamptz,
 next_run_at timestamptz not null default now(),
 last_error text not null default '' check (char_length(last_error)<=400),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index agent_project_owner_updated on public.agent_project_sessions(owner_id,updated_at desc);
create index agent_team_project_timeline on public.agent_team_messages(owner_id,assignment_id,created_at,id);
alter table public.agent_project_sessions enable row level security;
alter table public.agent_project_sessions force row level security;
revoke all on public.agent_project_sessions from public,anon,authenticated;
grant select on public.agent_project_sessions to authenticated;
grant all on public.agent_project_sessions to service_role;
create policy "owner reads own project collaboration" on public.agent_project_sessions for select to authenticated
 using (owner_id=(select auth.uid()) and exists(select 1 from public.agent_team_assignments a where a.id=assignment_id and a.owner_id=(select auth.uid())));

-- All writers below are SECURITY INVOKER and executable ONLY by the trusted server.
-- The authenticated owner is derived from getUser(token), never from model/client JSON.
create function public.claim_agent_project_turn(p_owner uuid,p_assignment uuid,p_provider text,p_model text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.agent_team_assignments; s public.agent_project_sessions; r uuid; used int; retry timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,4271));
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found or a.workflow_version<>2 then raise exception 'Project not found'; end if;
 insert into public.agent_project_sessions(assignment_id,owner_id) values(p_assignment,p_owner) on conflict do nothing;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if a.owner_paused then return jsonb_build_object('state','paused'); end if;
 if s.phase in ('waiting_owner','waiting_permission','review','approved') then return jsonb_build_object('state',s.phase); end if;
 if s.active_run is not null and s.lease_until>clock_timestamp() then return jsonb_build_object('state','working','worker_id',s.active_worker); end if;
 if s.active_run is not null then
  update public.agent_worker_runs set status='failed',error_summary='Interrupted turn; safe to retry',finished_at=now() where id=s.active_run and owner_id=p_owner and status='running';
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null where assignment_id=p_assignment;
 end if;
 if s.last_error<>'' then return jsonb_build_object('state','failed','message',s.last_error); end if;
 if s.turn_count>=18 then
  update public.agent_project_sessions set last_error='This revision reached its bounded team-turn limit. Send Alex a narrower scope or revision instructions.',updated_at=now() where assignment_id=p_assignment;
  return jsonb_build_object('state','failed','message','Team-turn limit reached');
 end if;
 if s.next_run_at>clock_timestamp() then return jsonb_build_object('state','ready','retry_at',s.next_run_at); end if;
 update public.agent_worker_runs set status='failed',error_summary='Interrupted worker',finished_at=now() where owner_id=p_owner and status='running' and created_at<now()-interval '2 minutes';
 if exists(select 1 from public.agent_worker_runs where owner_id=p_owner and status='running') then return jsonb_build_object('state','busy'); end if;
 select count(*),min(created_at)+interval '1 hour' into used,retry from public.agent_worker_runs where owner_id=p_owner and created_at>now()-interval '1 hour';
 if used>=10 then
  update public.agent_project_sessions set next_run_at=retry,updated_at=now() where assignment_id=p_assignment;
  return jsonb_build_object('state','budget','retry_at',retry,'message','Free worker allowance reached. Saved work will resume when the allowance resets.');
 end if;
 insert into public.agent_worker_runs(owner_id,assignment_id,employee_id,status,provider,model)
 values(p_owner,p_assignment,s.next_worker,'running',p_provider,p_model) returning id into r;
 update public.agent_project_sessions set active_run=r,active_worker=s.next_worker,lease_until=now()+interval '90 seconds',updated_at=now() where assignment_id=p_assignment returning * into s;
 update public.agent_team_assignments set coordination_status=case when s.phase='planning' then 'planning' else 'working' end,status='in_progress',updated_at=now() where id=p_assignment;
 return jsonb_build_object('state','claimed','run_id',r,'session',to_jsonb(s));
end; $$;

create function public.commit_agent_project_turn(p_owner uuid,p_assignment uuid,p_run uuid,p_revision integer,p_decision jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
  if jsonb_typeof(routes)<>'array' or jsonb_array_length(routes) not between 2 and 3 then raise exception 'Choose two or three accountable specialists'; end if;
  for item in select value from jsonb_array_elements(routes) loop
   chosen:=item->>'worker'; i:=i+1;
   if chosen is null or chosen='alex' or not chosen=any(array['maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']) or chosen=any(members) then raise exception 'Invalid specialist'; end if;
   insert into public.agent_task_steps(owner_id,assignment_id,step_number,employee_id,title,instructions,handoff_from)
   values(p_owner,p_assignment,i,chosen,left(item->>'title',180),left(item->>'instructions',3000),case when i=1 then null else members[i-1] end);
   members:=array_append(members,chosen);
  end loop;
  update public.agent_project_sessions set team_order=members,lead_worker=members[1],next_worker=members[1],phase='discussion' where assignment_id=p_assignment;
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
  if s.phase<>'discussion' or s.peer_target is not null or not worker=any(s.team_order) or worker=any(s.discussion_done) or char_length(body)>1600 then raise exception 'Invalid discussion turn'; end if;
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
  version:=gen_random_uuid();
  update public.agent_project_sessions set shared_draft=body,final_output=body,output_version=version,phase='review',review_status='pending' where assignment_id=p_assignment;
  update public.agent_task_steps set status='completed',output=case when employee_id=s.lead_worker then left(body,4000) else 'Peer review completed. The combined final deliverable is saved in Company HQ.' end,question='',updated_at=now() where assignment_id=p_assignment and owner_id=p_owner;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(p_assignment,p_owner,'agent',worker,'reply',left(coalesce(nullif(p_decision->>'message',''),'I’ve addressed the team’s feedback. The finished version is ready for the owner’s review below.'),1600),s.revision,'discussion');
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,'alex') on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
  insert into public.agent_messages(conversation_id,owner_id,sender,body)
   values(cid,p_owner,'employee','The team has finished “'||a.title||'” (version '||s.revision||'). The combined work is ready in Company HQ. Open the project below to approve it or request changes. Nothing has been published or sent outside Agent HQ.');
 else raise exception 'Unknown project turn';
 end if;
 update public.agent_worker_runs set status='completed',result_preview=left(body,4000),finished_at=now() where id=p_run and owner_id=p_owner and status='running';
 update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,turn_count=turn_count+1,last_error='',next_run_at=now()+interval '4 seconds',updated_at=now() where assignment_id=p_assignment returning * into s;
 update public.agent_team_assignments set coordination_status=case when s.phase in ('review','approved') then 'completed' when s.phase='waiting_owner' then 'waiting_for_owner' when s.phase='waiting_permission' then 'waiting_for_permission' else 'ready' end,
  status=case when s.phase='approved' then 'completed' when s.phase in ('waiting_owner','waiting_permission') then 'blocked' else 'in_progress' end,updated_at=now() where id=p_assignment;
 return jsonb_build_object('state',case when s.phase in ('review','approved','waiting_owner','waiting_permission') then s.phase else 'ready' end,'worker_id',worker,'next_worker',s.next_worker,'retry_at',s.next_run_at,'output_version',s.output_version);
end; $$;

create function public.fail_agent_project_turn(p_owner uuid,p_assignment uuid,p_run uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,last_error=left(p_error,400),updated_at=now() where owner_id=p_owner and assignment_id=p_assignment and active_run=p_run;
 update public.agent_worker_runs set status='failed',error_summary=left(p_error,300),finished_at=now() where owner_id=p_owner and id=p_run and status='running';
 return true;
end; $$;

create function public.reply_agent_project_owner(p_owner uuid,p_assignment uuid,p_worker text,p_body text,p_decision text default null,p_expected_revision integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.agent_project_sessions; a public.agent_team_assignments; note text; cid uuid; request public.agent_permission_requests;
begin
 select * into a from public.agent_team_assignments where owner_id=p_owner and id=p_assignment for update;
 select * into s from public.agent_project_sessions where owner_id=p_owner and assignment_id=p_assignment for update;
 if not found or s.phase not in ('waiting_owner','waiting_permission') or s.waiting_worker is distinct from p_worker or (p_expected_revision is not null and s.revision<>p_expected_revision) then raise exception 'No matching private project question'; end if;
 if char_length(btrim(p_body)) not between 1 and 10000 then raise exception 'Enter an answer'; end if;
 note:=btrim(p_body);
 if s.phase='waiting_permission' then
  select * into request from public.agent_permission_requests where id=s.pending_request_id and owner_id=p_owner and employee_id=p_worker for update;
  if not found or request.status<>'pending' or request.expires_at<=now() then raise exception 'The scoped request expired or was already decided'; end if;
  if p_decision not in ('approved','denied') or p_decision is null then raise exception 'Choose approve or deny for the exact request'; end if;
  update public.agent_permission_requests set status=p_decision,decided_at=now() where id=request.id and owner_id=p_owner;
  note:='Owner '||p_decision||' the specific request for '||request.target_url||'. This records the requested scope only; no browser, publishing or outside execution capability was added. Continue using available evidence or ask for source material. Owner text: '||note;
 end if;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
  values(p_assignment,p_owner,'owner','owner','reply',left('Answer to '||s.pending_question||E'\n'||note,10000),s.revision,'owner_context');
 if s.review_status='changes_requested' and s.resume_phase='discussion' then
  update public.agent_project_sessions set revision=revision+1,turn_count=0,discussion_done='{}',check_done='{}',peer_exchanges=0,peer_target=null,peer_question=null,peer_return_worker=null,peer_return_phase=null,feedback=left(p_body,10000),next_worker=lead_worker,review_status='pending',output_version=null where assignment_id=p_assignment;
  update public.agent_task_steps set status='queued',output='',question='',updated_at=now() where assignment_id=p_assignment and owner_id=p_owner;
 end if;
 update public.agent_project_sessions set phase=coalesce(resume_phase,'discussion'),waiting_worker=null,question_message_id=null,pending_question='',pending_request_id=null,resume_phase=null,last_error='',next_run_at=now(),updated_at=now() where assignment_id=p_assignment returning * into s;
 update public.agent_team_assignments set status='in_progress',coordination_status='ready',updated_at=now() where id=p_assignment and owner_id=p_owner;
 return jsonb_build_object('state',case when a.owner_paused then 'paused' else 'ready' end,'assignment_id',p_assignment,'revision',s.revision);
end; $$;

create function public.review_agent_project(p_owner uuid,p_assignment uuid,p_version uuid,p_decision text,p_feedback text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.agent_project_sessions; a public.agent_team_assignments; cid uuid; label text;
begin
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if not found or s.phase<>'review' or s.output_version is distinct from p_version then raise exception 'This finished version changed or was already reviewed'; end if;
 if p_decision not in ('approve','changes') or p_decision is null then raise exception 'Invalid project decision'; end if;
 if char_length(coalesce(p_feedback,''))>10000 then raise exception 'Feedback too long'; end if;
 if p_decision='approve' then
  update public.agent_project_sessions set phase='approved',review_status='approved',updated_at=now() where assignment_id=p_assignment;
  update public.agent_team_assignments set status='completed',updated_at=now() where id=p_assignment;
  insert into public.agent_approved_knowledge(owner_id,assignment_id,review_version,topic,approved_excerpt,source_worker)
   values(p_owner,p_assignment,left(md5(s.final_output),8),left(a.title||E'\n'||a.instructions,600),left(s.final_output,3000),s.lead_worker) on conflict(owner_id,assignment_id,review_version) do nothing;
  label:='The owner approved the finished written work. No publishing, sending, spending or account access was authorized.';
 else
  update public.agent_project_sessions set review_status='changes_requested',phase='waiting_owner',resume_phase='discussion',waiting_worker=lead_worker,pending_question='What would you like the team to change in the finished work?',feedback=btrim(coalesce(p_feedback,'')),updated_at=now() where assignment_id=p_assignment;
  update public.agent_team_assignments set status='blocked',coordination_status='waiting_for_owner',updated_at=now() where id=p_assignment;
  if char_length(btrim(coalesce(p_feedback,'')))>0 then
   perform public.reply_agent_project_owner(p_owner,p_assignment,s.lead_worker,p_feedback,null,s.revision);
  else
   insert into public.agent_conversations(owner_id,employee_id) values(p_owner,s.lead_worker) on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into cid;
   insert into public.agent_messages(conversation_id,owner_id,sender,body) values(cid,p_owner,'employee','For “'||a.title||'”: what would you like us to change? Send the details here and I’ll bring them back to the team.') returning id into cid;
   update public.agent_project_sessions set question_message_id=cid where assignment_id=p_assignment;
  end if;
  label:='The owner requested changes. We’ll revise the same project and bring back a new version for review.';
 end if;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind) values(p_assignment,p_owner,'agent','alex','reply',label,s.revision,'decision');
 return jsonb_build_object('state',case when p_decision='approve' then 'approved' when char_length(btrim(coalesce(p_feedback,'')))>0 then 'ready' else 'waiting_owner' end,'assignment_id',p_assignment);
end; $$;

create function public.control_agent_project(p_owner uuid,p_assignment uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.agent_project_sessions;
begin
 perform 1 from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if not found or p_action not in ('pause','resume','retry') then raise exception 'Invalid project control'; end if;
 if p_action='pause' then
  update public.agent_team_assignments set owner_paused=true,updated_at=now() where id=p_assignment and owner_id=p_owner;
  update public.agent_worker_runs set status='failed',error_summary='Stopped by owner',finished_at=now() where id=s.active_run and owner_id=p_owner and status='running';
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,updated_at=now() where assignment_id=p_assignment;
 else
  if s.turn_count>=18 then raise exception 'Team-turn limit reached; send revision instructions'; end if;
  update public.agent_team_assignments set owner_paused=false,updated_at=now() where id=p_assignment and owner_id=p_owner;
  update public.agent_project_sessions set last_error='',updated_at=now() where assignment_id=p_assignment;
 end if;
 return jsonb_build_object('state',case when p_action='pause' then 'paused' else 'ready' end,'assignment_id',p_assignment);
end; $$;

revoke all on function public.claim_agent_project_turn(uuid,uuid,text,text), public.commit_agent_project_turn(uuid,uuid,uuid,integer,jsonb), public.fail_agent_project_turn(uuid,uuid,uuid,text), public.reply_agent_project_owner(uuid,uuid,text,text,text,integer), public.review_agent_project(uuid,uuid,uuid,text,text), public.control_agent_project(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_agent_project_turn(uuid,uuid,text,text), public.commit_agent_project_turn(uuid,uuid,uuid,integer,jsonb), public.fail_agent_project_turn(uuid,uuid,uuid,text), public.reply_agent_project_owner(uuid,uuid,text,text,text,integer), public.review_agent_project(uuid,uuid,uuid,text,text), public.control_agent_project(uuid,uuid,text) to service_role;

do $$ declare t text; begin
 foreach t in array array['agent_team_messages','agent_project_sessions'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop;
end $$;
