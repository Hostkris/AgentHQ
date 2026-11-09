-- Phase changes reset recovery fields; save the scoped correction afterwards.
-- Only untouched workflow-repair records and the exact routine competitor question qualify.
do $$
declare s record; next_phase text;
begin
 for s in select p.*,a.owner_paused from public.agent_project_sessions p
  join public.agent_team_assignments a on a.id=p.assignment_id and a.owner_id=p.owner_id
  where not a.owner_paused and p.active_run is null and p.pending_request_id is null
   and p.recovery_state<>'needs_authorization' and p.last_error=''
   and ((p.phase='waiting_owner' and p.pending_question='Which two competitor skincare brands should be included in the competitor case studies for pricing and margin analysis?')
    or (p.phase='discussion' and p.recovery_state='idle' and p.recovery_attempts=0 and exists(
     select 1 from public.agent_team_messages m where m.assignment_id=p.assignment_id and m.owner_id=p.owner_id
      and m.sender_id='alex' and m.project_revision=p.revision
      and not exists(select 1 from public.agent_worker_runs r where r.owner_id=p.owner_id and r.assignment_id=p.assignment_id and r.created_at>m.created_at)
      and not exists(select 1 from public.agent_team_messages o where o.owner_id=p.owner_id and o.assignment_id=p.assignment_id and o.sender_kind='owner' and o.created_at>m.created_at)
      and m.body like 'Workflow correction: the brief requests a comparison before the owner chooses.%')))
  for update of p,a
 loop
  next_phase:=case when s.phase='discussion' then 'discussion' when s.resume_phase in ('discussion','drafting','checking','polishing') then s.resume_phase else 'discussion' end;
  if s.phase='waiting_owner' then
   update public.agent_project_sessions set phase=next_phase,resume_phase=null,waiting_worker=null,question_message_id=null,pending_question='',updated_at=now()
    where assignment_id=s.assignment_id and owner_id=s.owner_id;
   update public.agent_team_assignments set status='in_progress',coordination_status='working',updated_at=now() where id=s.assignment_id and owner_id=s.owner_id;
   insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
    values(s.assignment_id,s.owner_id,'agent','alex','reply','Workflow correction: choose a small set of relevant competitors using public evidence before asking the owner for final preferences. Return the comparison and its sources to Eleanor. No owner preference, budget or account authorization is implied.',s.revision,'discussion');
  end if;
  update public.agent_project_sessions set recovery_state='correcting',recovery_attempts=0,
   recovery_error='Response correction [nonessential_question/'||next_phase||'/'||s.next_worker||'/'||s.revision||'/ask_owner]. Compare public options before asking the owner to choose.',
   recovery_guidance='Compare sourced marketplace, category or competitor options and label assumptions. Ask only for essential actual private facts. Preserve all owner decision gates; no spending or account authority is granted.',
   next_run_at=now(),updated_at=now() where assignment_id=s.assignment_id and owner_id=s.owner_id;
 end loop;
end $$;
