-- Internal effort checkpoints are coordination work, never extra owner approvals.
alter table public.agent_project_sessions add column execution_cycle integer not null default 1 check(execution_cycle>0);

create or replace function public.claim_agent_project_turn(p_owner uuid,p_assignment uuid,p_provider text,p_model text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.agent_team_assignments; s public.agent_project_sessions; r uuid; used int; retry timestamptz; who text; cid uuid; mid uuid;
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
  update public.agent_project_sessions set turn_count=0,execution_cycle=execution_cycle+1,
   recovery_state='diagnosing',recovery_error='Internal work-cycle checkpoint: coordinate the remaining saved work without asking the owner to restart or narrow an already clear assignment.',
   recovery_guidance='',last_error='',next_run_at=now()+interval '15 seconds',updated_at=now() where assignment_id=p_assignment and owner_id=p_owner;
  return jsonb_build_object('state','recovering','message','Alex is coordinating the next internal work cycle; the same project will continue within its existing allowance.');
 end if;
 if s.next_run_at>clock_timestamp() then return jsonb_build_object('state','ready','retry_at',s.next_run_at); end if;
 update public.agent_worker_runs set status='failed',error_summary='Interrupted worker',finished_at=now() where owner_id=p_owner and status='running' and created_at<now()-interval '2 minutes';
 if exists(select 1 from public.agent_worker_runs where owner_id=p_owner and status='running') then return jsonb_build_object('state','busy'); end if;
 select count(*),min(created_at)+interval '1 hour' into used,retry from public.agent_worker_runs where owner_id=p_owner and created_at>now()-interval '1 hour';
 if used>=10 then
  update public.agent_project_sessions set next_run_at=retry,updated_at=now() where assignment_id=p_assignment;
  return jsonb_build_object('state','budget','retry_at',retry,'message','Free worker allowance reached. Saved work will resume when the allowance resets.');
 end if;
 who:=case when s.recovery_state='diagnosing' then 'alex' else coalesce(s.peer_target,s.next_worker) end;
 insert into public.agent_worker_runs(owner_id,assignment_id,employee_id,status,provider,model)
 values(p_owner,p_assignment,who,'running',p_provider,p_model) returning id into r;
 update public.agent_project_sessions set active_run=r,active_worker=who,lease_until=now()+interval '90 seconds',updated_at=now() where assignment_id=p_assignment returning * into s;
 update public.agent_team_assignments set coordination_status=case when s.phase='planning' then 'planning' else 'working' end,status='in_progress',updated_at=now() where id=p_assignment;
 return jsonb_build_object('state','claimed','run_id',r,'session',to_jsonb(s));
end; $$;

-- Reconsider old routine creative-choice questions internally. Never touch an
-- account, financial, authorization, owner-revision or essential private-data wait.
do $$ declare s public.agent_project_sessions; cid uuid; resume text; worker text; begin
 for s in select * from public.agent_project_sessions where phase='waiting_owner' and review_status='pending' and waiting_worker is not null and pending_request_id is null and recovery_state<>'needs_authorization'
  and pending_question ~* '(tone|writing style|success metrics|key metrics|primary content format)'
  and pending_question !~* '(actual|recorded|historical|previous|last|account|budget|balance|spend|payment|private|confidential|legal|deadline|consent|authorization)' for update loop
  resume:=coalesce(s.resume_phase,'discussion');worker:=s.waiting_worker;
  select conversation_id into cid from public.agent_messages where id=s.question_message_id and owner_id=s.owner_id;
  update public.agent_project_sessions set phase=resume,next_worker=worker,waiting_worker=null,question_message_id=null,pending_question='',pending_request_id=null,resume_phase=null,last_error='',next_run_at=now(),updated_at=now() where assignment_id=s.assignment_id and owner_id=s.owner_id;
  update public.agent_project_sessions set recovery_state='diagnosing',recovery_error='Routine creative-choice clarification: resolve tone, formatting and proposed metrics internally; ask only an essential owner-only fact if truly missing.',recovery_guidance='' where assignment_id=s.assignment_id and owner_id=s.owner_id;
  update public.agent_team_assignments set status='in_progress',coordination_status='ready',updated_at=now() where id=s.assignment_id and owner_id=s.owner_id;
  if cid is not null then insert into public.agent_messages(conversation_id,owner_id,sender,body) values(cid,s.owner_id,'employee','The team is reviewing this routine clarification internally. You do not need to reply unless we send a specific essential question. The saved project will continue automatically.');end if;
 end loop;
end; $$;
update public.agent_project_sessions set last_error='',recovery_state='diagnosing',recovery_error='Internal work-cycle checkpoint: continue the saved assignment.',next_run_at=now(),updated_at=now()
 where phase in ('planning','discussion','drafting','checking','polishing') and last_error like 'This revision reached its bounded team-turn limit%';
