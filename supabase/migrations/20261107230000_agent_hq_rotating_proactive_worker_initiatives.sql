-- Owner-private self-directed internal agent initiatives. User explicitly opted in on 2026-11-07.
-- Read-only observation + approved internal project drafting. No outside-account or spending authority.
create table if not exists public.agent_hq_autonomy_settings(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 max_new_projects_week smallint not null default 2 check(max_new_projects_week between 0 and 3),
 max_active_initiatives smallint not null default 2 check(max_active_initiatives between 0 and 3),
 worker_cursor smallint not null default 0 check(worker_cursor between 0 and 9),
 last_evaluated_on date,
 last_worker text,
 last_outcome text not null default 'not_started' check(length(last_outcome)<=80),
 last_error text not null default '' check(length(last_error)<=450),
 updated_at timestamptz not null default now()
);
create table if not exists public.agent_hq_autonomy_ideas(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 worker text not null check(worker in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 focus_ref text not null check(length(focus_ref) between 5 and 110),
 title text not null check(length(title) between 12 and 180),
 rationale text not null check(length(rationale) between 40 and 1500),
 deliverable text not null check(length(deliverable) between 60 and 2400),
 evidence_refs jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_refs)='array'),
 research_questions jsonb not null default '[]'::jsonb check(jsonb_typeof(research_questions)='array'),
 observed_need text not null default '' check(length(observed_need)<=800),
 pattern_kind text not null default 'standing_goal' check(pattern_kind in ('standing_goal','repeated_work','scheduled_routine','prior_project')),
 project_id uuid,
 calendar_task_id uuid,
 status text not null default 'working' check(status in ('working','review','dismissed','paused','blocked')),
 created_on date not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists agent_hq_autonomy_ideas_owner_date on public.agent_hq_autonomy_ideas(owner_id,created_at desc);
create index if not exists agent_hq_autonomy_ideas_owner_project on public.agent_hq_autonomy_ideas(owner_id,project_id);
create table if not exists public.agent_hq_worker_patterns(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 worker text not null check(worker in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn')),
 focus_ref text not null check(length(focus_ref) between 5 and 110),
 pattern_kind text not null check(pattern_kind in ('standing_goal','repeated_work','scheduled_routine','prior_project')),
 summary text not null check(length(summary) between 15 and 800),
 evidence_refs jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_refs)='array'),
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 disabled boolean not null default false,
 unique(owner_id,worker,focus_ref)
);
alter table public.agent_hq_autonomy_settings enable row level security;
alter table public.agent_hq_autonomy_settings force row level security;
alter table public.agent_hq_autonomy_ideas enable row level security;
alter table public.agent_hq_autonomy_ideas force row level security;
alter table public.agent_hq_worker_patterns enable row level security;
alter table public.agent_hq_worker_patterns force row level security;
revoke all on public.agent_hq_autonomy_settings,public.agent_hq_autonomy_ideas,public.agent_hq_worker_patterns from public,anon,authenticated;
grant select,update on public.agent_hq_autonomy_settings to authenticated;
grant select,update on public.agent_hq_autonomy_ideas to authenticated;
grant select,update on public.agent_hq_worker_patterns to authenticated;
grant all on public.agent_hq_autonomy_settings,public.agent_hq_autonomy_ideas,public.agent_hq_worker_patterns to service_role;
create policy autonomy_settings_read on public.agent_hq_autonomy_settings for select to authenticated using(owner_id=(select auth.uid()));
create policy autonomy_settings_edit on public.agent_hq_autonomy_settings for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy autonomy_ideas_read on public.agent_hq_autonomy_ideas for select to authenticated using(owner_id=(select auth.uid()));
create policy autonomy_ideas_edit on public.agent_hq_autonomy_ideas for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy autonomy_patterns_read on public.agent_hq_worker_patterns for select to authenticated using(owner_id=(select auth.uid()));
create policy autonomy_patterns_edit on public.agent_hq_worker_patterns for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy autonomy_settings_service on public.agent_hq_autonomy_settings to service_role using(true) with check(true);
create policy autonomy_ideas_service on public.agent_hq_autonomy_ideas to service_role using(true) with check(true);
create policy autonomy_patterns_service on public.agent_hq_worker_patterns to service_role using(true) with check(true);

-- Constrain owner-side update permissions: ideas and remembered patterns are
-- generated by trusted workers; the owner can dismiss/disable but not forge research.
create or replace function public.agent_hq_owner_autonomy_idea_control(p_idea uuid,p_action text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_action not in ('dismiss','pause','resume') then raise exception 'Invalid idea control';end if;
 update public.agent_hq_autonomy_ideas i
 set status=case p_action when 'dismiss' then 'dismissed' when 'pause' then 'paused' else 'working' end,
 updated_at=now()
 where i.id=p_idea and i.owner_id=auth.uid()
 and ((p_action='resume' and i.status='paused') or
      (p_action='pause' and i.status in ('working','review')) or
      (p_action='dismiss' and i.status<>'dismissed'));
 return found;
end $$;
revoke all on function public.agent_hq_owner_autonomy_idea_control(uuid,text) from public,anon;
grant execute on function public.agent_hq_owner_autonomy_idea_control(uuid,text) to authenticated,service_role;
revoke update on public.agent_hq_autonomy_ideas from authenticated;
revoke update on public.agent_hq_worker_patterns from authenticated;

-- Safely grant a single daily opportunity to one rotating professional worker.
-- Every UTC minute scheduler tick can call this; owner-local Saturday stays free.
create or replace function public.agent_hq_claim_autonomy(p_owners uuid[],p_clock timestamptz default now())
returns jsonb language plpgsql set search_path='' as $$
declare o record; today date; daynumber integer;
 workers text[]:=array['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn'];
begin
 for o in select x.*,coalesce(s.timezone,'America/New_York') as zone
  from public.agent_hq_autonomy_settings x
  join public.agent_secretary_settings s on s.owner_id=x.owner_id
  where x.owner_id=any(p_owners) and x.enabled
  order by x.updated_at asc for update of x skip locked
 loop
  today:=(p_clock at time zone o.zone)::date;
  daynumber:=extract(dow from today);
  if daynumber=6 or o.last_evaluated_on=today then continue;end if;
  -- Active scopes cannot pile up forever.
  if (select count(*) from public.agent_hq_autonomy_ideas i
       left join public.agent_project_sessions ps on ps.assignment_id=i.project_id and ps.owner_id=i.owner_id
       where i.owner_id=o.owner_id and i.status='working'
       and coalesce(ps.phase,'planning') not in ('review','approved','cancelled'))>=o.max_active_initiatives then
    continue;
  end if;
  update public.agent_hq_autonomy_settings set
    last_evaluated_on=today,last_worker=workers[o.worker_cursor+1],
    worker_cursor=(o.worker_cursor+1)%10,
    last_outcome='evaluating',last_error='',updated_at=p_clock
  where owner_id=o.owner_id;
  return jsonb_build_object('owner_id',o.owner_id,'worker',workers[o.worker_cursor+1],
    'local_date',today,'timezone',o.zone);
 end loop;
 return null;
end $$;
revoke all on function public.agent_hq_claim_autonomy(uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.agent_hq_claim_autonomy(uuid[],timestamptz) to service_role;

-- Server-only, atomic proposal / project / Eleanor notice. Evidence and title are
-- independently checked by the trusted worker before invoking this transaction.
create or replace function public.agent_hq_launch_autonomy(
 p_owner uuid,p_worker text,p_date date,p_focus_ref text,p_title text,
 p_rationale text,p_deliverable text,p_evidence jsonb,p_questions jsonb,
 p_observation text,p_pattern_kind text)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.agent_hq_autonomy_settings; settings public.agent_secretary_settings;
 idea_id uuid; project_result jsonb; linked uuid; due timestamptz; brief text; weekly_count integer;
begin
 select * into cfg from public.agent_hq_autonomy_settings
 where owner_id=p_owner for update;
 select * into settings from public.agent_secretary_settings where owner_id=p_owner;
 if cfg.owner_id is null or not cfg.enabled or settings.owner_id is null or
    cfg.last_evaluated_on<>p_date or cfg.last_worker<>p_worker or
    (extract(dow from p_date))=6 then return jsonb_build_object('state','not_authorized');end if;
 if p_worker not in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn') or
   length(btrim(p_title)) not between 12 and 180 or length(btrim(p_rationale)) not between 40 and 1500 or
   length(btrim(p_deliverable)) not between 60 and 2400 or length(p_focus_ref) not between 5 and 110 or
   length(btrim(p_observation)) not between 15 and 800 or
   p_pattern_kind not in ('standing_goal','repeated_work','scheduled_routine','prior_project') or
   jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence) not between 1 and 8 or
   jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)>3 then
  raise exception 'Invalid proactive work proposal';
 end if;
 select count(*) into weekly_count from public.agent_hq_autonomy_ideas i
 where i.owner_id=p_owner and i.created_on>=date_trunc('week',p_date::timestamp)::date
 and i.created_on<date_trunc('week',p_date::timestamp)::date+7;
 if weekly_count>=cfg.max_new_projects_week then
  update public.agent_hq_autonomy_settings set last_outcome='weekly_limit',updated_at=now() where owner_id=p_owner;
  return jsonb_build_object('state','weekly_limit');
 end if;
 if exists(select 1 from public.agent_hq_autonomy_ideas i where i.owner_id=p_owner
    and i.worker=p_worker and i.focus_ref=p_focus_ref and i.created_at>now()-interval '30 days') then
  update public.agent_hq_autonomy_settings set last_outcome='repeat_suppressed',updated_at=now() where owner_id=p_owner;
  return jsonb_build_object('state','repeat_suppressed');
 end if;
 brief:='Autonomous INTERNAL research and drafting request from '||initcap(p_worker)||', under the owner''s existing Agent HQ standing authorization.'||chr(10)||
  'Initiative: '||btrim(p_title)||chr(10)||
  'Observed, grounded need: '||btrim(p_observation)||chr(10)||
  'Reason: '||btrim(p_rationale)||chr(10)||
  'Required deliverable: '||btrim(p_deliverable)||chr(10)||
  'Verified saved-source references: '||p_evidence::text||chr(10)||
  'Public questions to investigate through the existing authorized, role-scoped research tool, not from guesses: '||p_questions::text||chr(10)||
  'Alex coordinates relevant specialists. Save real source-dated public findings, comparisons, ideas, frameworks and an implementable plan. Ask teammates for ordinary answers. Avoid duplicates of existing projects; identify the smallest next work item and plausible Sunday–Friday schedule for Eleanor. Saturday is totally off. No spending, outreach, public publishing, purchases, accounts, paid services, private-data access, promises of future work, fabricated outcomes or claiming research without real source evidence. Deliver work and documented blockers to Eleanor for owner review.';
 if length(brief)>10000 then raise exception 'Project brief too long';end if;
 project_result:=public.create_agent_workspace_project(p_owner,p_worker,brief,
    jsonb_build_object('project_kind','internal_initiative','output_format','markdown',
     'completion_criteria','An actionable, sourced, specialist-reviewed plan, with verified constraints, calendar suggestions, risk notes, a concrete next step and honest outstanding owner decisions.'));
 linked:=(project_result->>'id')::uuid;
 if linked is null then raise exception 'Project could not be created';end if;
 insert into public.agent_hq_autonomy_ideas(owner_id,worker,focus_ref,title,rationale,deliverable,
   evidence_refs,research_questions,observed_need,pattern_kind,project_id,created_on)
 values(p_owner,p_worker,p_focus_ref,p_title,p_rationale,p_deliverable,p_evidence,p_questions,
   p_observation,p_pattern_kind,linked,p_date) returning id into idea_id;
 insert into public.agent_hq_worker_patterns(owner_id,worker,focus_ref,pattern_kind,summary,evidence_refs)
 values(p_owner,p_worker,p_focus_ref,p_pattern_kind,p_observation,p_evidence)
 on conflict(owner_id,worker,focus_ref) do update set
 last_seen_at=now(),summary=excluded.summary,evidence_refs=excluded.evidence_refs,
 pattern_kind=excluded.pattern_kind;
 -- One light-touch internal review task near the optional 8:05 PM wrap-up.
 -- Leave Saturday untouched and let the existing scheduler move flexible missed items.
 due:=public.next_secretary_local(now(),settings.timezone,'20:05'::time,array[0,1,2,3,4,5]);
 insert into public.agent_secretary_items(owner_id,kind,title,details,status,timezone,weekdays,
    due_at,next_due_at,data)
 values(p_owner,'task',left('Review '||initcap(p_worker)||'''s new research initiative',180),
   'Eleanor: '||left(p_title||'. The specialist and team are researching/drafting internally. Check their real project status and review work when available; no spending or outside action is approved.',1800),
   'active',settings.timezone,array[0,1,2,3,4,5],due,due,
   jsonb_build_object('auto_rollover',true,'proactive_idea_id',idea_id,'project_id',linked,
      'review_only',true))
 returning id into linked; -- linked here becomes calendar task after saved project ID is retained on idea row
 update public.agent_hq_autonomy_ideas set calendar_task_id=linked where id=idea_id and owner_id=p_owner;
 insert into public.agent_secretary_deliveries(owner_id,kind,occurrence_key,scheduled_at,
    status,action_state,body,saved_at,push_state)
 values(p_owner,'task','autonomous-initiative:'||idea_id::text,now(),'saved','open',
  'Eleanor · '||initcap(p_worker)||' initiated a grounded internal research and planning project: '||left(p_title,180)||
  '. The source evidence and questions are saved in Agent HQ Initiatives. Alex coordinates the work; review the plan when it is actually ready. No purchase, public post or external account action was authorized.',
  now(),'pending')
 on conflict(owner_id,occurrence_key) do nothing;
 if settings.bot_id is not null then
  insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body)
  values(p_owner,settings.bot_id,'worker','Eleanor — self-directed worker initiative'||chr(10)||
   'Worker: '||initcap(p_worker)||chr(10)||'Project: '||p_title||chr(10)||
   'Why now: '||left(p_rationale,650)||chr(10)||
   'Saved source references: '||p_evidence::text||chr(10)||
   'The worker has been given an actual internal team project and a flexible Calendar review task. Research and drafts must be completed and source-verified before claiming results. Nothing external has been authorized.');
 end if;
 update public.agent_hq_autonomy_settings set last_outcome='project_saved',updated_at=now()
 where owner_id=p_owner;
 return jsonb_build_object('state','project_saved','idea_id',idea_id,'project_id',project_result->>'id');
end $$;
revoke all on function public.agent_hq_launch_autonomy(uuid,text,date,text,text,text,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.agent_hq_launch_autonomy(uuid,text,date,text,text,text,text,jsonb,jsonb,text,text) to service_role;

-- One owner with explicitly requested continuous initiative, never enabled for others by default.
insert into public.agent_hq_autonomy_settings(owner_id,enabled,max_new_projects_week,max_active_initiatives)
select owner_id,true,2,2 from public.agent_secretary_settings
on conflict(owner_id) do update set enabled=true,updated_at=now();

comment on table public.agent_hq_worker_patterns is 'Source-grounded observations, not generalized recollections of unobserved personal behavior.';
comment on table public.agent_hq_autonomy_ideas is 'Capped, owner-private AI-originated internal project proposals. Research only counts when the project engine saves actual evidence.';
