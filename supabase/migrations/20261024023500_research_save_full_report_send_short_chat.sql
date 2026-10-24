-- Keep complete source-backed research in research history, not a giant chat bubble.
-- This service-role-only function is invoked after the authenticated owner approves web search.
create or replace function public.finish_agent_research(
 p_owner uuid,p_worker text,p_job uuid,p_report text,p_sources jsonb
)
returns boolean language plpgsql security definer set search_path=''
as $function$
declare job public.agent_research_jobs;
begin
 if p_report is null or p_sources is null or char_length(p_report) not between 1 and 10000
  or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources)<1 then
  raise exception 'A report with verified source links is required.';
 end if;
 select * into job from public.agent_research_jobs
 where id=p_job and owner_id=p_owner and employee_id=p_worker and status='running'
 for update;
 if job.id is null then raise exception 'Research run is unavailable.'; end if;
 if not exists(select 1 from public.agent_conversations
  where id=job.conversation_id and owner_id=p_owner and employee_id=p_worker) then
  raise exception 'Conversation does not belong to this worker.';
 end if;
 insert into public.agent_messages(owner_id,conversation_id,sender,body)
 values(p_owner,job.conversation_id,'employee',
   'I finished checking public sources for “' ||
   left(regexp_replace(job.query,'[\n\r\t]+',' ','g'),100) ||
   '”. The full report, sources and limitations are saved in the attachment here. Want me to walk you through the main finding?');
 update public.agent_research_jobs
 set status='completed',report=p_report,sources=p_sources,finished_at=now()
 where id=job.id and owner_id=p_owner and employee_id=p_worker;
 return true;
end
$function$;
revoke all on function public.finish_agent_research(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_agent_research(uuid,text,uuid,text,jsonb) to service_role;
