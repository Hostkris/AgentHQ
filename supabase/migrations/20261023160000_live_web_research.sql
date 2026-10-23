-- One-use, owner-approved public web research. No client write grants or account access.
create table public.agent_research_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq')),
 conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
 query text not null check(char_length(query) between 5 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','running','completed','failed','denied','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '15 minutes'),
 approved_at timestamptz,
 started_at timestamptz,
 finished_at timestamptz,
 report text check(char_length(report)<=10000),
 sources jsonb not null default '[]'::jsonb check(jsonb_typeof(sources)='array'),
 error text check(char_length(error)<=300),
 provider text not null default 'groq_browser_search'
);
create index agent_research_owner_recent on public.agent_research_jobs(owner_id,created_at desc);
create unique index agent_research_one_pending on public.agent_research_jobs(owner_id,employee_id) where status='pending';
alter table public.agent_research_jobs enable row level security;
alter table public.agent_research_jobs force row level security;
revoke all on public.agent_research_jobs from public,anon,authenticated;
grant select on public.agent_research_jobs to authenticated;
grant all on public.agent_research_jobs to service_role;
create policy "owner reads research history" on public.agent_research_jobs for select to authenticated using(owner_id=(select auth.uid()));
alter table public.agent_chat_states add column research_job_id uuid references public.agent_research_jobs(id) on delete set null;
alter table public.agent_chat_states drop constraint agent_chat_states_stage_check;
alter table public.agent_chat_states add constraint agent_chat_states_stage_check check(stage in ('idle','collecting_task','confirm_task','confirm_resume','confirm_permission','confirm_action','confirm_research'));

-- Serialize claims per owner: duplicate approvals cannot execute the same search twice.
create function public.claim_agent_research(p_owner uuid,p_worker text,p_job uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.agent_research_jobs; used integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('research:'||p_owner::text,0));
 update public.agent_research_jobs set status='failed',finished_at=now(),error='Research timed out. Ask for a new report to try again.'
 where owner_id=p_owner and status='running' and started_at<now()-interval '3 minutes';
 if exists(select 1 from public.agent_research_jobs where owner_id=p_owner and status='running') then
  raise exception 'Another research report is running. Wait for it to finish.';
 end if;
 select count(*) into used from public.agent_research_jobs where owner_id=p_owner and started_at>now()-interval '1 hour';
 if used>=8 then raise exception 'Research limit reached: eight reports per hour. Try again later.'; end if;
 update public.agent_research_jobs set status='running',started_at=now()
 where id=p_job and owner_id=p_owner and employee_id=p_worker and status='approved'
 and approved_at is not null and expires_at>now() returning * into job;
 if job.id is null then raise exception 'Research approval is expired, already used, or unavailable.'; end if;
 return to_jsonb(job);
end $$;

-- Save the report and chat message together, with an owner/worker/conversation match.
create function public.finish_agent_research(p_owner uuid,p_worker text,p_job uuid,p_report text,p_sources jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare job public.agent_research_jobs;
begin
 if p_report is null or p_sources is null or char_length(p_report) not between 1 and 10000 or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources)<1 then
  raise exception 'A report with verified source links is required.';
 end if;
 select * into job from public.agent_research_jobs where id=p_job and owner_id=p_owner and employee_id=p_worker and status='running' for update;
 if job.id is null then raise exception 'Research run is unavailable.'; end if;
 if not exists(select 1 from public.agent_conversations where id=job.conversation_id and owner_id=p_owner and employee_id=p_worker) then
  raise exception 'Conversation does not belong to this worker.';
 end if;
 insert into public.agent_messages(owner_id,conversation_id,sender,body) values(p_owner,job.conversation_id,'employee',p_report);
 update public.agent_research_jobs set status='completed',report=p_report,sources=p_sources,finished_at=now() where id=job.id;
 return true;
end $$;
revoke all on function public.claim_agent_research(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finish_agent_research(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_agent_research(uuid,text,uuid) to service_role;
grant execute on function public.finish_agent_research(uuid,text,uuid,text,jsonb) to service_role;
