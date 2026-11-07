-- Owner-scoped ChatGPT request desk. This schedules handoffs, never paid API calls.
alter table public.agent_secretary_settings
 add column chatgpt_delegate_nonfinancial boolean not null default false,
 add column chatgpt_notifications_enabled boolean not null default true;

create table public.agent_chatgpt_requests(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 worker_key text not null check(char_length(worker_key) between 3 and 80),
 requester_label text not null check(char_length(requester_label) between 2 and 120),
 question text not null check(char_length(btrim(question)) between 12 and 4000),
 reason text not null check(char_length(btrim(reason)) between 8 and 1000),
 request_key text not null check(char_length(request_key) between 5 and 160),
 project_id uuid not null references public.agent_team_assignments(id) on delete cascade,
 project_revision integer not null check(project_revision>0),
 handoff_id uuid references public.agent_chatgpt_handoffs(id) on delete set null,
 money_related boolean not null,
 approved_by text check(approved_by in ('eleanor','owner')),
 owner_approved_at timestamptz,
 was_paused boolean not null default false,
 status text not null check(status in ('owner_required','ready','in_progress','blocked','review','approved','changes_requested','cancelled')),
 revision_instructions text not null default '' check(char_length(revision_instructions)<=10000),
 response_summary text not null default '' check(char_length(response_summary)<=10000),
 output_version uuid,
 blocker text not null default '' check(char_length(blocker)<=1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,request_key),
 check(not money_related or status in ('owner_required','cancelled') or owner_approved_at is not null)
);
create index agent_chatgpt_requests_owner on public.agent_chatgpt_requests(owner_id,updated_at desc);
create index agent_chatgpt_requests_project on public.agent_chatgpt_requests(project_id);
create unique index agent_chatgpt_requests_handoff on public.agent_chatgpt_requests(handoff_id) where handoff_id is not null;
create unique index agent_chatgpt_one_pending_project on public.agent_chatgpt_requests(project_id) where status in ('owner_required','ready','in_progress','blocked');
alter table public.agent_chatgpt_requests enable row level security;
alter table public.agent_chatgpt_requests force row level security;
revoke all on public.agent_chatgpt_requests from public,anon,authenticated;
grant select on public.agent_chatgpt_requests to authenticated;
grant all on public.agent_chatgpt_requests to service_role;
create policy chatgpt_requests_owner_read on public.agent_chatgpt_requests for select to authenticated using((select auth.uid())=owner_id);

create function agent_hq_private.chatgpt_money_related(p_worker text,p_text text)
returns boolean language sql immutable set search_path='' as $$
 select p_worker='avery' or
  regexp_replace(lower(normalize(coalesce(p_text,''),NFKC)),'[​-‏⁠-⁯]','','g') ~
  '[$£€¥₹]|\m(usd|eur|gbp|cad|aud|dollars?|money|monetary|financial|finance|billing|bill|bills|invoice|invoices|payment|payments|pay|paid|purchase|purchases|buy|buying|spend|spending|budget|budgets|bank|banking|credit|debit|refund|refunds|subscription|subscriptions|price|prices|pricing|cost|costs|profit|profits|margin|margins|revenue|income|salary|wages|tax|taxes|loan|loans|debt|dividends?|investment|investing|invest|stocks?|trading|crypto|roi|roas|checkout|fees?|discounts?|commissions?)\M';
$$;
revoke all on function agent_hq_private.chatgpt_money_related(text,text) from public,anon,authenticated;
grant execute on function agent_hq_private.chatgpt_money_related(text,text) to service_role;

create function agent_hq_private.activate_chatgpt_request(p_owner uuid,p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_chatgpt_requests; h jsonb; brief text; rev integer;
begin
 select * into r from public.agent_chatgpt_requests where id=p_request and owner_id=p_owner for update;
 if not found then raise exception 'ChatGPT request not found';end if;
 if r.status<>'owner_required' then return to_jsonb(r);end if;
 if r.money_related and r.owner_approved_at is null then raise exception 'Money-related work needs the owner approval';end if;
 if r.approved_by is null then raise exception 'Eleanor or the owner must approve this request';end if;
 select revision into rev from public.agent_project_sessions where assignment_id=r.project_id and owner_id=p_owner for update;
 if rev is distinct from r.project_revision then raise exception 'The project changed. Prepare a new scoped request';end if;
 update public.agent_team_assignments set owner_paused=r.was_paused where id=r.project_id and owner_id=p_owner;
 brief:='Requested by '||r.requester_label||E'.\nQuestion/task: '||r.question||E'\nWhy ChatGPT is needed: '||r.reason||
  E'\nCreate the actual requested files. For a question, return a real Markdown answer file and put the readable answer/explanation in the return_project_files summary for Eleanor. Follow the current project context. Return work for owner review. No sending, publishing, spending or account changes.';
 h:=public.queue_agent_chatgpt_handoff(p_owner,r.project_id,rev,brief);
 update public.agent_chatgpt_requests set handoff_id=(h->>'handoff_id')::uuid,project_revision=(h->>'revision')::integer,status='ready',blocker='',updated_at=clock_timestamp() where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function agent_hq_private.activate_chatgpt_request(uuid,uuid) from public,anon,authenticated;
grant execute on function agent_hq_private.activate_chatgpt_request(uuid,uuid) to service_role;

create function public.request_agent_chatgpt_help(p_owner uuid,p_worker text,p_question text,p_reason text,p_key text,
 p_project uuid default null,p_revision integer default null,p_run uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_chatgpt_requests; s public.agent_project_sessions; a public.agent_team_assignments;
 label text; source text; project uuid; created jsonb; financial boolean; delegate boolean; approved text;
begin
 perform pg_advisory_xact_lock(hashtextextended('chatgpt-request:'||p_owner::text,0));
 if coalesce(char_length(btrim(p_question)),0) not between 12 and 4000 or coalesce(char_length(btrim(p_reason)),0) not between 8 and 1000 or coalesce(char_length(p_key),0) not between 5 and 160 then raise exception 'Provide a specific ChatGPT task and why it is needed';end if;
 select * into r from public.agent_chatgpt_requests where owner_id=p_owner and request_key=p_key;
 if found then
  if r.worker_key<>p_worker or r.question<>btrim(p_question) or r.reason<>btrim(p_reason) or p_project is not null and r.project_id<>p_project then raise exception 'This request key belongs to a different task';end if;
  return to_jsonb(r);
 end if;
 if p_worker=any(array['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']) then label:=initcap(p_worker);source:=p_worker;
 elsif p_worker='eleanor' then label:='Eleanor';source:='alex';
 else select name into label from public.agent_custom_bots where owner_id=p_owner and id::text=p_worker and status='active';source:='alex';end if;
 if label is null then raise exception 'Choose an active worker from your own team';end if;
 select chatgpt_delegate_nonfinancial into delegate from public.agent_secretary_settings where owner_id=p_owner and exists(select 1 from public.agent_custom_bots b where b.id=bot_id and b.owner_id=p_owner and b.status='active');
 if not found then raise exception 'Open Eleanor reminders to prepare the secretary first';end if;
 if (select count(*) from public.agent_chatgpt_requests where owner_id=p_owner and created_at>now()-interval '1 hour')>=30 then raise exception 'The ChatGPT request allowance is reached for this hour. Saved requests remain available';end if;
 project:=p_project;
 if project is null then
  created:=public.create_agent_workspace_project(p_owner,source,btrim(p_question),jsonb_build_object('project_kind','general','output_format','markdown','completion_criteria','Return the actual requested answer or files for owner review.'));
  project:=(created->>'id')::uuid;
  insert into public.agent_project_sessions(assignment_id,owner_id) values(project,p_owner) on conflict do nothing;
 end if;
 select * into a from public.agent_team_assignments where id=project and owner_id=p_owner for update;
 if not found then raise exception 'Project not found under your sign-in';end if;
 select * into s from public.agent_project_sessions where assignment_id=project and owner_id=p_owner for update;
 if not found or p_project is not null and s.revision is distinct from p_revision then raise exception 'The project changed. Refresh the request';end if;
 if s.phase='waiting_permission' then raise exception 'Resolve the existing project permission question first';end if;
 if exists(select 1 from public.agent_chatgpt_requests where project_id=project and status in ('owner_required','ready','in_progress','blocked')) then raise exception 'This project already has a ChatGPT request';end if;
 if s.active_run is not null then
  if p_run is distinct from s.active_run or s.active_worker is distinct from p_worker or a.owner_paused then raise exception 'Another worker is finishing this step';end if;
  update public.agent_worker_runs set status='completed',result_preview='Requested scoped ChatGPT help through Eleanor; no project work product claimed.',finished_at=now() where id=p_run and owner_id=p_owner and status='running';
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,updated_at=now() where assignment_id=project;
 elsif p_run is not null then raise exception 'This worker turn expired';end if;
 financial:=agent_hq_private.chatgpt_money_related(p_worker,p_question||E'\n'||p_reason||E'\n'||a.instructions);
 approved:=case when delegate and not financial then 'eleanor' else null end;
 insert into public.agent_chatgpt_requests(owner_id,worker_key,requester_label,question,reason,request_key,project_id,project_revision,money_related,approved_by,was_paused,status)
 values(p_owner,p_worker,label,btrim(p_question),btrim(p_reason),p_key,project,s.revision,financial,approved,a.owner_paused,'owner_required') returning * into r;
 update public.agent_team_assignments set owner_paused=true,updated_at=now() where id=project;
 if approved='eleanor' then return agent_hq_private.activate_chatgpt_request(p_owner,r.id);end if;
 return to_jsonb(r);
end $$;
revoke all on function public.request_agent_chatgpt_help(uuid,text,text,text,text,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.request_agent_chatgpt_help(uuid,text,text,text,text,uuid,integer,uuid) to service_role;

create function public.decide_agent_chatgpt_request(p_owner uuid,p_request uuid,p_decision text,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_chatgpt_requests;
begin
 select * into r from public.agent_chatgpt_requests where id=p_request and owner_id=p_owner;
 if not found then raise exception 'ChatGPT request not found';end if;
 perform 1 from public.agent_team_assignments where id=r.project_id and owner_id=p_owner for update;
 perform 1 from public.agent_project_sessions where assignment_id=r.project_id and owner_id=p_owner for update;
 select * into r from public.agent_chatgpt_requests where id=p_request and owner_id=p_owner for update;
 if not found or r.project_revision<>p_revision then raise exception 'The selected ChatGPT request changed';end if;
 if p_decision='approve' then
  if r.status<>'owner_required' then return to_jsonb(r);end if;
  update public.agent_chatgpt_requests set approved_by='owner',owner_approved_at=now(),updated_at=now() where id=r.id;
  return agent_hq_private.activate_chatgpt_request(p_owner,r.id);
 elsif p_decision='decline' or p_decision='cancel' then
  if r.status not in ('owner_required','ready','in_progress','blocked') then raise exception 'This request is no longer awaiting a decision';end if;
  if r.handoff_id is not null then perform public.cancel_agent_chatgpt_handoff(p_owner,r.handoff_id);end if;
  update public.agent_team_assignments set owner_paused=true,updated_at=now() where id=r.project_id;
  update public.agent_chatgpt_requests set status='cancelled',updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
 end if;
 raise exception 'Choose approve, decline or cancel';
end $$;
revoke all on function public.decide_agent_chatgpt_request(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.decide_agent_chatgpt_request(uuid,uuid,text,integer) to service_role;

create function agent_hq_private.chatgpt_request_message()
returns trigger language plpgsql security invoker set search_path='' as $$
declare bot uuid; note text;
begin
 if tg_op='UPDATE' and new.status=old.status then return new;end if;
 -- The initial placeholder state is not a separate approval request when Eleanor can clear it.
 if new.status='owner_required' and new.approved_by='eleanor' then return new;end if;
 select id into bot from public.agent_custom_bots where owner_id=new.owner_id and template_key='eleanor-secretary-v1' and status='active';
 if not found then return new;end if;
 note:='ChatGPT · '||new.requester_label||E'\nReason: '||new.reason||E'\nTask: '||new.question||E'\n\n'||
  case new.status
   when 'owner_required' then case when new.money_related then 'This involves money. Your approval is required before ChatGPT can read it.' else 'Your approval is required because automatic nonfinancial approval is disabled.' end
   when 'ready' then 'Approved by '||coalesce(initcap(new.approved_by),'Eleanor')||'. The handoff is saved. Open the ChatGPT app in Agent HQ and start ChatGPT to pick it up; it is not running unattended.'
   when 'in_progress' then 'ChatGPT opened this saved handoff. I will bring the returned answer and files back for your review.'
   when 'blocked' then 'ChatGPT reported a blocker: '||new.blocker
   when 'review' then 'ChatGPT returned an answer and actual files. Read the returned explanation in my conversation and inspect the files in the matching project before approving the result.'
   when 'approved' then 'You approved this final result. No sending, publishing or financial action was authorized.'
   when 'changes_requested' then 'Your revision request is saved. Check the ChatGPT app for the current scoped handoff.'
   else 'This ChatGPT request is cancelled. The project stays paused until you choose to resume it.'
  end;
 insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body,consultation_project_id,consultation_revision,consultation_version)
 values(new.owner_id,bot,'handoff',note,new.project_id,new.project_revision,new.output_version);
 return new;
end $$;
revoke all on function agent_hq_private.chatgpt_request_message() from public,anon,authenticated;
grant execute on function agent_hq_private.chatgpt_request_message() to service_role;
create trigger agent_chatgpt_request_messages after insert or update of status on public.agent_chatgpt_requests for each row execute function agent_hq_private.chatgpt_request_message();

create function agent_hq_private.sync_chatgpt_request_handoff()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.agent_chatgpt_requests; next_status text; financial boolean;
begin
 select * into r from public.agent_chatgpt_requests where handoff_id=new.id and owner_id=new.owner_id for update;
 if not found then return new;end if;
 financial:=r.money_related or agent_hq_private.chatgpt_money_related(r.worker_key,coalesce(new.owner_feedback,''));
 next_status:=case when new.status='returned' then 'review' when new.status in ('cancelled','superseded') then 'cancelled' when new.blocker<>'' then 'blocked' when new.status='in_progress' then 'in_progress' else 'ready' end;
 if new.status='ready' and old.status='returned' and financial then next_status:='owner_required';end if;
 update public.agent_chatgpt_requests set status=next_status,project_revision=new.revision,money_related=financial,
  owner_approved_at=case when next_status='owner_required' then null else owner_approved_at end,
  approved_by=case when next_status='owner_required' then null else approved_by end,
  response_summary=case when new.status='returned' then new.result_summary else response_summary end,
  output_version=case when new.status='returned' then new.output_version else output_version end,
  revision_instructions=coalesce(new.owner_feedback,''),blocker=new.blocker,updated_at=clock_timestamp() where id=r.id;
 return new;
end $$;
revoke all on function agent_hq_private.sync_chatgpt_request_handoff() from public,anon,authenticated;
grant execute on function agent_hq_private.sync_chatgpt_request_handoff() to service_role;
create trigger agent_chatgpt_request_handoff_state after update of status,blocker on public.agent_chatgpt_handoffs for each row execute function agent_hq_private.sync_chatgpt_request_handoff();

create function agent_hq_private.sync_chatgpt_request_review()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.phase='approved' and new.review_status='approved' then
  update public.agent_chatgpt_requests set status='approved',updated_at=clock_timestamp() where owner_id=new.owner_id and project_id=new.assignment_id and output_version=new.output_version and status='review';
 end if;
 return new;
end $$;
revoke all on function agent_hq_private.sync_chatgpt_request_review() from public,anon,authenticated;
grant execute on function agent_hq_private.sync_chatgpt_request_review() to service_role;
create trigger agent_chatgpt_request_review after update of phase,review_status on public.agent_project_sessions for each row execute function agent_hq_private.sync_chatgpt_request_review();

-- Clear old guide text when a new handoff replaces the final version.
CREATE OR REPLACE FUNCTION public.queue_agent_chatgpt_handoff(p_owner uuid, p_assignment uuid, p_revision integer, p_brief text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.agent_team_assignments; s public.agent_project_sessions; h public.agent_chatgpt_handoffs; hid uuid; paused boolean; rev integer;begin
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found or a.workflow_version<>2 then raise exception 'Project not found';end if;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if not found then raise exception 'Project session not found';end if;
 if s.active_run is not null and s.lease_until>clock_timestamp() then raise exception 'A worker is finishing a step. Try the handoff after that step saves';end if;
 if s.phase='waiting_permission' then raise exception 'Resolve the existing permission request before handing over this project';end if;
 if coalesce(char_length(btrim(p_brief)),0) not between 5 and 6000 then raise exception 'Describe what ChatGPT should make';end if;
 select * into h from public.agent_chatgpt_handoffs where assignment_id=p_assignment and status in ('ready','in_progress') for update;
 if found and h.revision=s.revision and p_revision in (h.revision,h.source_revision) then
  if h.brief<>btrim(p_brief) then raise exception 'Cancel the existing handoff before changing its instructions';end if;
  return jsonb_build_object('handoff_id',h.id,'state',h.status,'revision',h.revision);
 end if;
 if s.revision<>p_revision then raise exception 'The project changed; refresh before handing it over';end if;
 rev:=s.revision+1;
 paused:=case when h.id is not null then h.was_paused else a.owner_paused end;
 if h.id is not null then update public.agent_chatgpt_handoffs set status='superseded',updated_at=now() where id=h.id;end if;
 insert into public.agent_chatgpt_handoffs(owner_id,assignment_id,revision,source_revision,brief,was_paused,previous_phase)
 values(p_owner,p_assignment,rev,p_revision,btrim(p_brief),paused,s.phase) returning id into hid;
 update public.agent_team_assignments set owner_paused=true,updated_at=now() where id=p_assignment;
 if s.active_run is not null then
  update public.agent_worker_runs set status='failed',error_summary='Expired turn replaced by owner-requested ChatGPT handoff.',finished_at=now() where id=s.active_run and owner_id=p_owner and status='running';
 end if;
 update public.agent_project_sessions set revision=rev,phase=case when phase in ('approved','review') then 'drafting' else phase end,review_status='pending',output_version=null,final_output='',consulting_guide='',active_run=null,active_worker=null,lease_until=null,updated_at=now() where assignment_id=p_assignment;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
 values(p_assignment,p_owner,'agent','alex','reply','An authorized ChatGPT handoff was prepared. Internal work is held while ChatGPT makes the requested files. Start the handoff in ChatGPT, then review returned files in Projects.',rev,'discussion');
 return jsonb_build_object('handoff_id',hid,'state','ready','revision',rev);
end $function$;
