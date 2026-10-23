create table public.agent_social_read_requests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null,
 employee_id text not null default 'riley' check (employee_id='riley'),
 conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
 source_url text not null check (length(source_url) between 15 and 1200),
 purpose text not null check (length(purpose) between 5 and 1000),
 status text not null default 'pending' check (status in ('pending','approved','denied','revoked','analyzing','completed','failed')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 decided_at timestamptz,
 started_at timestamptz,
 finished_at timestamptz,
 report text check (length(report)<=16000),
 error text check (length(error)<=300),
 foreign key(owner_id,account_id) references public.agent_personal_accounts(owner_id,id) on delete cascade
);
create index agent_social_read_owner_created on public.agent_social_read_requests(owner_id,created_at desc);
alter table public.agent_social_read_requests enable row level security;
revoke all on public.agent_social_read_requests from public,anon,authenticated;
grant select on public.agent_social_read_requests to authenticated;
grant all on public.agent_social_read_requests to service_role;
create policy owner_reads_social_requests on public.agent_social_read_requests for select to authenticated using ((select auth.uid())=owner_id);

-- Only the authenticated Edge Function can invoke transitions. Each transition,
-- quota check and accompanying chat message is one transaction.
create function public.agent_social_read_transition(p_owner uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_social_read_requests%rowtype; c uuid; a public.agent_personal_accounts%rowtype; note text;
begin
 if p_owner is null then raise exception 'Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('social-read:'||p_owner::text,0));
 if p_action='request' then
  select * into a from public.agent_personal_accounts where owner_id=p_owner and id=(p_data->>'account_id')::uuid and platform='facebook';
  if not found then raise exception 'Facebook profile not found'; end if;
  if (select count(*) from public.agent_social_read_requests where owner_id=p_owner and created_at>now()-interval '1 hour')>=8 then raise exception 'Reading request limit reached; try later'; end if;
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,'riley') on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into c;
  insert into public.agent_social_read_requests(owner_id,account_id,conversation_id,source_url,purpose) values(p_owner,a.id,c,p_data->>'source_url',p_data->>'purpose') returning * into r;
  insert into public.agent_messages(owner_id,conversation_id,sender,body) values
   (p_owner,c,'owner',r.purpose),
   (p_owner,c,'employee','May I read one Safari page you choose to share for '||a.label||'? Page: '||r.source_url||E'\nTask: '||r.purpose||E'\nUse Approve or Deny below. Approval lasts 15 minutes and permits one analysis using Agent HQ’s Groq connection. You preview and paste the page text; I cannot open your account, publish or reply. The report is saved in this private thread.');
  return to_jsonb(r);
 end if;
 select * into r from public.agent_social_read_requests where id=(p_data->>'id')::uuid and owner_id=p_owner for update;
 if not found then raise exception 'Reading request not found'; end if;
 if p_action='revoke' then
  if r.status not in ('pending','approved','analyzing') then raise exception 'This request is already closed'; end if;
  update public.agent_social_read_requests set status='revoked',finished_at=now() where id=r.id returning * into r;
  note:='Reading permission revoked. No further page analysis is authorized.';
 elsif p_action in ('approve','deny') then
  if r.status<>'pending' or r.expires_at<=now() then raise exception 'This request is already decided or expired'; end if;
  update public.agent_social_read_requests set status=case when p_action='approve' then 'approved' else 'denied' end,decided_at=now(),expires_at=case when p_action='approve' then now()+interval '15 minutes' else expires_at end where id=r.id returning * into r;
  note:=case when p_action='approve' then 'Reading approved for one shared Safari page. Open the approved page, use Read for Agent HQ, review the text, then paste the capture below. I have not accessed Facebook.' else 'Reading denied. I will not analyze this page.' end;
 elsif p_action='claim' then
  if r.status<>'approved' or r.expires_at<=now() then raise exception 'An active approval is required before sharing page text'; end if;
  if r.source_url<>p_data->>'source_url' then raise exception 'The captured page differs from the approved page'; end if;
  if (p_data->>'captured_at')::timestamptz<r.decided_at-interval '30 seconds' then raise exception 'Capture the page after approving this request'; end if;
  if exists(select 1 from public.agent_social_read_requests where owner_id=p_owner and status='analyzing' and started_at>now()-interval '2 minutes') then raise exception 'Another page analysis is running'; end if;
  if (select count(*) from public.agent_social_read_requests where owner_id=p_owner and started_at>now()-interval '1 hour')>=4 then raise exception 'Page analysis limit reached; try later'; end if;
  update public.agent_social_read_requests set status='analyzing',started_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
 elsif p_action='finish' then
  if r.status<>'analyzing' or r.expires_at<=now() then raise exception 'Permission expired or was revoked; result was not saved'; end if;
  if length(btrim(coalesce(p_data->>'report','')))=0 then raise exception 'Report required'; end if;
  update public.agent_social_read_requests set status='completed',finished_at=now(),report=p_data->>'report' where id=r.id returning * into r;
  note:=E'Safari page review — based only on the text you shared, not a live account audit.\nSource: '||r.source_url||E'\n\n'||r.report;
 elsif p_action='fail' then
  if r.status='analyzing' then update public.agent_social_read_requests set status='failed',finished_at=now(),error='Analysis could not finish. No automatic retry was made.' where id=r.id returning * into r; end if;
  return to_jsonb(r);
 else raise exception 'Unsupported reading action';
 end if;
 insert into public.agent_messages(owner_id,conversation_id,sender,body) values(p_owner,r.conversation_id,'employee',note);
 return to_jsonb(r);
end $$;
revoke all on function public.agent_social_read_transition(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.agent_social_read_transition(uuid,text,jsonb) to service_role;
