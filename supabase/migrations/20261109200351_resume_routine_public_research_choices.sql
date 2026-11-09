-- An option comparison precedes the owner's final commercial decision.
-- Restore only routine public-research questions, never a real private fact or approval.
do $$
declare s record; next_phase text;
begin
 for s in select p.*,a.owner_paused,a.instructions from public.agent_project_sessions p
  join public.agent_team_assignments a on a.id=p.assignment_id and a.owner_id=p.owner_id
  where p.phase='waiting_owner' and p.pending_request_id is null and not a.owner_paused
   and p.recovery_state<>'needs_authorization' and p.active_run is null
   and a.instructions ~* '(compar|research)'
   and p.pending_question in (
    'Which online marketplaces should be considered in the arbitrage model and product‑category research?',
    'Which product category or categories should the pilot arbitrage focus on?')
  for update of p,a
 loop
  next_phase:=case when s.resume_phase in ('discussion','drafting','checking','polishing') then s.resume_phase else 'discussion' end;
  update public.agent_project_sessions set phase=next_phase,resume_phase=null,waiting_worker=null,question_message_id=null,pending_question='',
   recovery_state='correcting',recovery_attempts=0,
   recovery_error='Response correction [nonessential_question/'||next_phase||'/'||s.next_worker||'/'||s.revision||'/ask_owner]. Compare public options before asking the owner for a final category or marketplace decision.',
   recovery_guidance='Compare a small set of sourced marketplace or category options and label assumptions. Preserve the owner decision gates and ask for actual private budget, inventory or account facts only if essential. No purchase, account change or final owner preference is implied.',
   last_error='',next_run_at=now(),updated_at=now() where assignment_id=s.assignment_id and owner_id=s.owner_id;
  update public.agent_team_assignments set status='in_progress',coordination_status='working',updated_at=now() where id=s.assignment_id and owner_id=s.owner_id;
  insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(s.assignment_id,s.owner_id,'agent','alex','reply','Workflow correction: the brief requests a comparison before the owner chooses. Research a small set of relevant public options, show sources and labelled assumptions, and return decision points to Eleanor. No owner preference, purchase or account authorization has been invented.',s.revision,'discussion');
 end loop;
end $$;
