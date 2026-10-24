-- Public-only research for every built-in and active custom worker. Existing history stays intact.
create table public.agent_role_research (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null,
 role_title text not null check(char_length(role_title) between 3 and 180),
 query text not null check(char_length(query) between 5 and 1000),
 purpose text not null check(char_length(purpose) between 1 and 600),
 conversation_id uuid references public.agent_conversations(id) on delete cascade,
 bot_id uuid references public.agent_custom_bots(id) on delete cascade,
 assignment_id uuid references public.agent_team_assignments(id) on delete cascade,
 project_revision integer,
 project_run uuid,
 origin_message_id uuid references public.agent_messages(id) on delete cascade,
 origin_bot_message_id uuid references public.agent_custom_bot_messages(id) on delete cascade,
 request_key text not null check(char_length(request_key) between 5 and 180),
 status text not null default 'running' check(status in ('running','completed','failed','denied')),
 report text not null default '' check(char_length(report)<=10000),
 sources jsonb not null default '[]' check(jsonb_typeof(sources)='array'),
 delivered_message_id uuid,
 error text not null default '' check(char_length(error)<=300),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 provider text not null default 'groq_browser_search' check(provider='groq_browser_search'),
 unique(owner_id,request_key),
 check(num_nonnulls(conversation_id,bot_id,assignment_id)=1),
 check((assignment_id is null and project_revision is null and project_run is null) or (assignment_id is not null and project_revision>0 and project_run is not null)),
 check((bot_id is null and employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq')) or (bot_id is not null and employee_id=bot_id::text))
);
create index agent_role_research_owner_time on public.agent_role_research(owner_id,started_at desc);
create index agent_role_research_project on public.agent_role_research(owner_id,assignment_id,project_revision,employee_id);
create index agent_role_research_bot on public.agent_role_research(owner_id,bot_id,started_at desc) where bot_id is not null;
create unique index agent_role_research_one_running on public.agent_role_research(owner_id) where status='running';
alter table public.agent_role_research enable row level security;
alter table public.agent_role_research force row level security;
revoke all on public.agent_role_research from public,anon,authenticated;
grant select on public.agent_role_research to authenticated;
grant all on public.agent_role_research to service_role;
create policy "owner reads role research" on public.agent_role_research for select to authenticated using(owner_id=(select auth.uid()));
alter table public.agent_project_sessions add column pending_research_query text not null default '' check(char_length(pending_research_query)<=1000),add column pending_research_purpose text not null default '' check(char_length(pending_research_purpose)<=600);

create function public.begin_agent_role_research(p_owner uuid,p_worker text,p_query text,p_role text,p_purpose text,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 cid uuid:=(p_context->>'conversation_id')::uuid; bid uuid:=(p_context->>'bot_id')::uuid;
 aid uuid:=(p_context->>'assignment_id')::uuid; rev int:=(p_context->>'revision')::int;
 run uuid:=(p_context->>'run_id')::uuid; original uuid:=(p_context->>'message_id')::uuid;
 key text:=p_context->>'request_key'; s public.agent_project_sessions; a public.agent_team_assignments;
 prior public.agent_role_research; total int; reset_at timestamptz; job uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('research:'||p_owner::text,0));
 if char_length(btrim(p_query)) not between 5 and 1000 or char_length(btrim(p_role)) not between 3 and 180 or char_length(btrim(p_purpose)) not between 1 and 600 or key is null then raise exception 'Invalid scoped research request'; end if;
 if num_nonnulls(cid,bid,aid)<>1 then raise exception 'Choose exactly one research destination'; end if;
 if aid is not null then
  select * into a from public.agent_team_assignments where id=aid and owner_id=p_owner for update;
  select * into s from public.agent_project_sessions where assignment_id=aid and owner_id=p_owner for update;
  if not found or a.owner_paused or s.active_run is distinct from run or s.revision<>rev or s.active_worker<>p_worker or s.lease_until<clock_timestamp() then raise exception 'Project research is stopped, expired or superseded'; end if;
  if (select count(*) from public.agent_role_research where owner_id=p_owner and assignment_id=aid and project_revision=rev and employee_id=p_worker and status='completed')>=2 then return jsonb_build_object('state','limit','message','Use this worker’s saved evidence; two searches per project revision have already completed.'); end if;
 elsif bid is not null then
  if bid::text<>p_worker or not exists(select 1 from public.agent_custom_bots where id=bid and owner_id=p_owner and status='active') or not exists(select 1 from public.agent_custom_bot_messages where id=original and owner_id=p_owner and bot_id=bid and sender='owner') then raise exception 'No owned active worker task authorizes this research'; end if;
 else
  if not exists(select 1 from public.agent_conversations where id=cid and owner_id=p_owner and employee_id=p_worker) or not exists(select 1 from public.agent_messages where id=original and owner_id=p_owner and conversation_id=cid and sender='owner') then raise exception 'No matching owner request authorizes this research'; end if;
 end if;
 select * into prior from public.agent_role_research where owner_id=p_owner and request_key=key;
 if found then return jsonb_build_object('state',prior.status,'job_id',prior.id,'message','This research request was already reserved.'); end if;
 update public.agent_role_research set status='failed',error='Research turn interrupted; retry the request.',finished_at=now() where owner_id=p_owner and status='running' and started_at<now()-interval '2 minutes';
 if exists(select 1 from public.agent_role_research where owner_id=p_owner and status='running') or exists(select 1 from public.agent_research_jobs where owner_id=p_owner and status='running' and started_at>now()-interval '3 minutes') then return jsonb_build_object('state','busy','retry_at',now()+interval '30 seconds','message','Another public research request is running.'); end if;
 select count(*),min(t)+interval '1 hour' into total,reset_at from (
  select started_at t from public.agent_role_research where owner_id=p_owner and started_at>now()-interval '1 hour'
  union all select started_at from public.agent_research_jobs where owner_id=p_owner and started_at>now()-interval '1 hour'
 ) usage;
 if total>=8 then return jsonb_build_object('state','budget','retry_at',reset_at,'message','The free research allowance has been reached: eight reports per hour. Saved project work will resume after it resets.'); end if;
 insert into public.agent_role_research(owner_id,employee_id,role_title,query,purpose,conversation_id,bot_id,assignment_id,project_revision,project_run,origin_message_id,origin_bot_message_id,request_key)
 values(p_owner,p_worker,btrim(p_role),btrim(p_query),btrim(p_purpose),cid,bid,aid,rev,run,case when cid is not null then original else null end,case when bid is not null then original else null end,key) returning id into job;
 if aid is not null then update public.agent_project_sessions set pending_research_query=p_query,pending_research_purpose=p_purpose,updated_at=now() where assignment_id=aid; end if;
 return jsonb_build_object('state','claimed','job_id',job);
end; $$;

create function public.finish_agent_role_research(p_owner uuid,p_job uuid,p_report text,p_sources jsonb,p_summary text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.agent_role_research; s public.agent_project_sessions; paused boolean; mid uuid;
begin
 -- Match project control's lock order, so pause/revision and research finish cannot deadlock.
 select * into j from public.agent_role_research where id=p_job and owner_id=p_owner;
 if not found then raise exception 'Research request was removed'; end if;
 if j.assignment_id is not null then
  select owner_paused into paused from public.agent_team_assignments where id=j.assignment_id and owner_id=p_owner for update;
  select * into s from public.agent_project_sessions where assignment_id=j.assignment_id and owner_id=p_owner for update;
  if not found or paused or s.active_run is distinct from j.project_run or s.revision<>j.project_revision or s.active_worker<>j.employee_id or s.lease_until<clock_timestamp() then raise exception 'Project research no longer matches an active task'; end if;
 elsif j.bot_id is not null then
  perform 1 from public.agent_custom_bots where id=j.bot_id and owner_id=p_owner and status='active' for update;
  if not found then raise exception 'Worker was archived or removed'; end if;
 end if;
 select * into j from public.agent_role_research where id=p_job and owner_id=p_owner and status='running' for update;
 if not found then raise exception 'Research already finished or unavailable'; end if;
 if p_report is null or char_length(p_report) not between 30 and 10000 or p_summary is null or char_length(p_summary) not between 1 and 1400 or jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 12 then raise exception 'A complete source-backed report is required'; end if;
 if exists(select 1 from jsonb_array_elements(p_sources) x where coalesce(x->>'url','') !~ '^https?://[^ /?#@]+\.[^ /?#@]+') then raise exception 'Invalid public source'; end if;
 if j.assignment_id is not null then
  insert into public.agent_team_messages(owner_id,assignment_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
   values(p_owner,j.assignment_id,'agent',j.employee_id,'reply',E'PUBLIC_RESEARCH_V1\n'||left(p_report,9980),j.project_revision,'discussion') returning id into mid;
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,turn_count=turn_count+1,pending_research_query='',pending_research_purpose='',last_error='',next_run_at=now()+interval '4 seconds',updated_at=now() where assignment_id=j.assignment_id;
  update public.agent_worker_runs set status='completed',result_preview=left(p_summary,4000),finished_at=now() where id=j.project_run and owner_id=p_owner and status='running';
  update public.agent_team_assignments set coordination_status='ready',updated_at=now() where id=j.assignment_id and owner_id=p_owner;
 elsif j.bot_id is not null then
  insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body) values(p_owner,j.bot_id,'worker',p_summary) returning id into mid;
 else
  if not exists(select 1 from public.agent_conversations where id=j.conversation_id and owner_id=p_owner and employee_id=j.employee_id) then raise exception 'Conversation no longer matches'; end if;
  insert into public.agent_messages(owner_id,conversation_id,sender,body) values(p_owner,j.conversation_id,'employee',p_summary) returning id into mid;
 end if;
 update public.agent_role_research set status='completed',report=p_report,sources=p_sources,delivered_message_id=mid,finished_at=now() where id=p_job and owner_id=p_owner;
 return jsonb_build_object('state',case when j.assignment_id is not null then 'ready' else 'completed' end,'job_id',p_job,'message_id',mid);
end; $$;

create function public.defer_agent_project_research(p_owner uuid,p_assignment uuid,p_run uuid,p_query text,p_purpose text,p_until timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.agent_team_assignments where id=p_assignment and owner_id=p_owner and not owner_paused for update;
 if not found then raise exception 'Project stopped'; end if;
 update public.agent_project_sessions set pending_research_query=p_query,pending_research_purpose=p_purpose,active_run=null,active_worker=null,lease_until=null,next_run_at=greatest(now()+interval '15 seconds',p_until),updated_at=now()
  where assignment_id=p_assignment and owner_id=p_owner and active_run=p_run;
 if not found then raise exception 'Project turn changed'; end if;
 update public.agent_worker_runs set status='completed',result_preview='Public research queued within the free allowance.',finished_at=now() where id=p_run and owner_id=p_owner and status='running';
 return true;
end; $$;

revoke all on function public.begin_agent_role_research(uuid,text,text,text,text,jsonb),public.finish_agent_role_research(uuid,uuid,text,jsonb,text),public.defer_agent_project_research(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.begin_agent_role_research(uuid,text,text,text,text,jsonb),public.finish_agent_role_research(uuid,uuid,text,jsonb,text),public.defer_agent_project_research(uuid,uuid,uuid,text,text,timestamptz) to service_role;

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_role_research') then alter publication supabase_realtime add table public.agent_role_research; end if;
end $$;

-- Older pending confirmations share the same research allowance and owner-wide lock.
create or replace function public.claim_agent_research(p_owner uuid,p_worker text,p_job uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.agent_research_jobs; used int;
begin
 perform pg_advisory_xact_lock(hashtextextended('research:'||p_owner::text,0));
 update public.agent_research_jobs set status='failed',finished_at=now(),error='Research timed out. Ask for a new report to try again.' where owner_id=p_owner and status='running' and started_at<now()-interval '3 minutes';
 if exists(select 1 from public.agent_research_jobs where owner_id=p_owner and status='running') or exists(select 1 from public.agent_role_research where owner_id=p_owner and status='running' and started_at>now()-interval '2 minutes') then raise exception 'Another research report is running. Wait for it to finish.'; end if;
 select count(*) into used from (
  select started_at from public.agent_research_jobs where owner_id=p_owner and started_at>now()-interval '1 hour'
  union all select started_at from public.agent_role_research where owner_id=p_owner and started_at>now()-interval '1 hour'
 ) usage;
 if used>=8 then raise exception 'Research limit reached: eight reports per hour. Try again later.'; end if;
 update public.agent_research_jobs set status='running',started_at=now() where id=p_job and owner_id=p_owner and employee_id=p_worker and status='approved' and approved_at is not null and expires_at>now() returning * into job;
 if job.id is null then raise exception 'Research approval is expired, already used, or unavailable.'; end if;
 return to_jsonb(job);
end $$;
revoke all on function public.claim_agent_research(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_agent_research(uuid,text,uuid) to service_role;
