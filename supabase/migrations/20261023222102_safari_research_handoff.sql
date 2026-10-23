-- Short-lived single-page capabilities; no owner JWT is given to Safari scripts.
create table public.agent_social_read_handoffs (
 request_id uuid primary key references public.agent_social_read_requests(id) on delete cascade,
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now()
);
alter table public.agent_social_read_handoffs enable row level security;
revoke all on public.agent_social_read_handoffs from public,anon,authenticated;
grant all on public.agent_social_read_handoffs to service_role;
create policy "Service only Safari handoffs" on public.agent_social_read_handoffs for all to service_role using (true) with check (true);

create function public.agent_social_read_handoff(p_action text,p_owner uuid,p_request uuid,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_social_read_requests%rowtype;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid handoff key'; end if;
 if p_action='issue' then
  if p_owner is null or p_request is null then raise exception 'Owner and request required'; end if;
  select * into r from public.agent_social_read_requests where id=p_request and owner_id=p_owner for update;
  if not found or r.status<>'approved' or r.expires_at<=now() then raise exception 'An active approval is required'; end if;
  insert into public.agent_social_read_handoffs(request_id,token_hash) values(r.id,p_hash)
   on conflict(request_id) do update set token_hash=excluded.token_hash,created_at=now();
  return jsonb_build_object('id',r.id,'source_url',r.source_url,'purpose',r.purpose,'expires_at',r.expires_at);
 elsif p_action='resolve' then
  if p_owner is not null or p_request is not null then raise exception 'Unsupported handoff lookup'; end if;
  select r0.* into r from public.agent_social_read_requests r0 join public.agent_social_read_handoffs h on h.request_id=r0.id
   where h.token_hash=p_hash and r0.status='approved' and r0.expires_at>now();
  if not found then return null; end if;
  return jsonb_build_object('id',r.id,'owner_id',r.owner_id,'source_url',r.source_url);
 end if;
 raise exception 'Unsupported handoff action';
end $$;
revoke all on function public.agent_social_read_handoff(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.agent_social_read_handoff(text,uuid,uuid,text) to service_role;

-- Keep the thread instructions aligned with both supported handoff methods.
create or replace function public.agent_social_read_transition(p_owner uuid,p_action text,p_data jsonb)
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
   (p_owner,c,'employee','May I read one Safari page you choose to share for '||a.label||'? Page: '||r.source_url||E'\nTask: '||r.purpose||E'\nUse Approve or Deny below. Approval lasts 15 minutes and permits one analysis using Agent HQ’s Groq connection. You can send the approved page through the Safari connector, or preview and paste the text. I cannot publish or reply. The report is saved in this private thread.');
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
  note:=case when p_action='approve' then 'Reading approved for one Safari page. Use Connect Safari and read below to send the loaded page text to Riley, or use the manual capture option. I have not accessed Facebook yet.' else 'Reading denied. I will not analyze this page.' end;
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
