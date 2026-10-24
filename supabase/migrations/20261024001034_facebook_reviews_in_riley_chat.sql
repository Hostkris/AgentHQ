alter table public.agent_social_read_requests add column prompt_message_id uuid references public.agent_messages(id) on delete set null;
-- Bind legacy requests only where their original scope message is unique.
update public.agent_social_read_requests r set prompt_message_id=(
 select m.id from public.agent_messages m where m.owner_id=r.owner_id and m.conversation_id=r.conversation_id and m.sender='employee' and m.created_at=r.created_at and position(r.source_url in m.body)>0 limit 1
) where (select count(*) from public.agent_messages m where m.owner_id=r.owner_id and m.conversation_id=r.conversation_id and m.sender='employee' and m.created_at=r.created_at and position(r.source_url in m.body)>0)=1;

create table public.agent_social_read_chat_state (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 stage text not null check(stage in ('profile','url','decision','approved')),
 purpose text not null check(length(purpose) between 1 and 1000),
 account_id uuid,
 options jsonb not null default '[]'::jsonb check(jsonb_typeof(options)='array' and jsonb_array_length(options)<=20),
 prompt_message_id uuid references public.agent_messages(id) on delete set null,
 expires_at timestamptz not null default now()+interval '15 minutes',
 foreign key(owner_id,account_id) references public.agent_personal_accounts(owner_id,id) on delete cascade
);
alter table public.agent_social_read_chat_state enable row level security;
revoke all on public.agent_social_read_chat_state from public,anon,authenticated;
grant all on public.agent_social_read_chat_state to service_role;
create policy "Service only social chat state" on public.agent_social_read_chat_state for all to service_role using(true) with check(true);

create or replace function public.agent_social_read_transition(p_owner uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agent_social_read_requests%rowtype; c uuid; a public.agent_personal_accounts%rowtype; note text; prompt uuid;
begin
 if p_owner is null then raise exception 'Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('social-read:'||p_owner::text,0));
 if p_action='request' then
  select * into a from public.agent_personal_accounts where owner_id=p_owner and id=(p_data->>'account_id')::uuid and platform='facebook';
  if not found then raise exception 'Facebook profile not found'; end if;
  if (select count(*) from public.agent_social_read_requests where owner_id=p_owner and created_at>now()-interval '1 hour')>=8 then raise exception 'Reading request limit reached; try later'; end if;
  insert into public.agent_conversations(owner_id,employee_id) values(p_owner,'riley') on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into c;
  insert into public.agent_social_read_requests(owner_id,account_id,conversation_id,source_url,purpose) values(p_owner,a.id,c,p_data->>'source_url',p_data->>'purpose') returning * into r;
  if coalesce(p_data->>'skip_owner','false')<>'true' then
   insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values(p_owner,c,'owner',r.purpose,clock_timestamp());
  end if;
  insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values
   (p_owner,c,'employee','May I review '||a.label||'?'||chr(10)||'Page: '||r.source_url||chr(10)||'Task: '||r.purpose||chr(10)||'Reply approved or denied here. Approval permits one page analysis through Agent HQ’s Groq connection for 15 minutes. Safari will open the approved page while it reads it; keep it visible. The report returns here. No posting or sending permission.',clock_timestamp()) returning id into prompt;
  update public.agent_social_read_requests set prompt_message_id=prompt where id=r.id returning * into r;
  return to_jsonb(r)||jsonb_build_object('response_message_id',prompt);
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
  note:=case when p_action='approve' then 'Approved for one page. I’m asking the Safari reader to open it. Keep the page visible until it finishes; the report will return to this thread. If sign-in or the reader is unavailable, I’ll show the blocker here.' else 'Reading denied. I will not analyze this page.' end;
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
 insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values(p_owner,r.conversation_id,'employee',note,clock_timestamp()) returning id into prompt;
 return to_jsonb(r)||jsonb_build_object('response_message_id',prompt);
end $$;


create function public.agent_social_read_chat(p_owner uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 t text:=btrim(p_data->>'text'); intent text:=p_data->>'intent'; source text:=nullif(p_data->>'source_url','');
 choice integer:=nullif(p_data->>'choice','')::integer; c uuid; latest uuid; prompt uuid; selected uuid;
 ctx public.agent_social_read_chat_state%rowtype; a public.agent_personal_accounts%rowtype; r public.agent_social_read_requests%rowtype;
 options jsonb:='[]'; stage text; purpose text; question text; n integer; result jsonb; start_id uuid;
begin
 if p_owner is null or t is null or length(t) not between 1 and 1000 or intent not in ('request','approve','deny','revoke','continue','other') then raise exception 'Invalid research chat';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-read:'||p_owner::text,0));
 select id into c from public.agent_conversations where owner_id=p_owner and employee_id='riley';
 select id into latest from public.agent_messages where owner_id=p_owner and conversation_id=c and sender='employee' order by created_at desc,id desc limit 1;
 select * into ctx from public.agent_social_read_chat_state where owner_id=p_owner and expires_at>now();
 if ctx.prompt_message_id is distinct from latest then ctx.stage:=null;end if;

 -- A bare decision is routed here only while our exact prompt is the current
 -- Riley question. Other workers and unrelated approval systems keep their route.
 if intent in ('approve','deny','revoke','continue') and ctx.stage is null then
  select * into r from public.agent_social_read_requests where owner_id=p_owner and prompt_message_id=latest limit 1;
  if r.id is null then return jsonb_build_object('handled',false);end if;
 elsif intent<>'request' and ctx.stage is null then
  return jsonb_build_object('handled',false);
 end if;
 insert into public.agent_conversations(owner_id,employee_id) values(p_owner,'riley') on conflict(owner_id,employee_id) do update set employee_id=excluded.employee_id returning id into c;
 if (select count(*) from public.agent_messages where owner_id=p_owner and conversation_id=c and sender='owner' and created_at>now()-interval '1 hour')>=100 then raise exception 'Riley chat limit reached; try later';end if;
 if intent='other' and ctx.stage in ('approved','decision') and choice is null then return jsonb_build_object('handled',false);end if;
 purpose:=coalesce(ctx.purpose,t);

 <<flow>>
 begin
 if intent='request' then
  purpose:=t;ctx.stage:=null;
  if coalesce(p_data->>'needs_url','false')='true' then question:='Send one exact Facebook or Messenger content link here. I could not identify a single supported page in that message.';stage:='url';exit flow;end if;
 elsif ctx.stage='approved' then
  select * into r from public.agent_social_read_requests where owner_id=p_owner and id=(ctx.options->0->>'id')::uuid;
  if r.status='approved' and r.expires_at>now() and intent='continue' then start_id:=r.id;question:='I’m reconnecting the approved page reader. Keep Safari open; I’ll return the report here.';stage:='approved';options:=ctx.options;exit flow;
  elsif r.status in ('approved','analyzing') and intent in ('deny','revoke') then null;
  elsif r.status='approved' and intent='approve' then question:='That page is already approved. Reply continue to reconnect the Safari reader, or stop to revoke it.';stage:='approved';options:=ctx.options;exit flow;
  else question:='That reading request is already running, closed or expired. Ask me to check Facebook again for a new review.';exit flow;end if;
 elsif ctx.stage='decision' then
  if choice between 1 and jsonb_array_length(ctx.options) then
   select * into r from public.agent_social_read_requests where owner_id=p_owner and id=(ctx.options->(choice-1)->>'id')::uuid;
   if intent='other' then
    if r.status<>'pending' or r.expires_at<=now() then question:='That request is already decided or expired. Ask for a new review.';exit flow;end if;
    question:='Review this page: '||r.source_url||chr(10)||'Task: '||r.purpose||chr(10)||'Reply approved or denied. One read for 15 minutes through Groq; Safari opens the page and the report returns here.';
    update public.agent_social_read_requests set prompt_message_id=null where id=r.id;
    -- The new prompt is bound below after its message ID exists.
    selected:=r.id;exit flow;
   end if;
  else question:='Please identify the Facebook request: reply approve 1, deny 1, or the appropriate request number.';stage:='decision';options:=ctx.options;exit flow;end if;
 end if;

 if intent in ('approve','deny','revoke','continue') and ctx.stage not in ('profile','url') or intent in ('approve','deny','revoke','continue') and ctx.stage is null then
  if r.id is null then
   select count(*),jsonb_agg(jsonb_build_object('id',id,'source_url',source_url,'purpose',pending.purpose) order by created_at) into n,options
    from (select * from public.agent_social_read_requests where owner_id=p_owner and status in ('pending','approved','analyzing') and expires_at>now() order by created_at limit 20) pending;
   if n=1 then select * into r from public.agent_social_read_requests where owner_id=p_owner and id=(options->0->>'id')::uuid;
   elsif n>1 then
    question:='Which Facebook request do you mean?'||chr(10)||(select string_agg(ordinality::text||'. '||(value->>'source_url'),chr(10) order by ordinality) from jsonb_array_elements(options) with ordinality)||chr(10)||'Reply approve 1 or deny 1, using the request number. Nothing has started.';stage:='decision';exit flow;
   else question:='That Facebook permission is closed or expired. Ask me to check the profile again for a new review.';exit flow;end if;
  end if;
  -- Do not let an earlier row selected only to establish routing bypass ambiguity.
  if ctx.stage is null and (select count(*) from public.agent_social_read_requests where owner_id=p_owner and status in ('pending','approved','analyzing') and expires_at>now())>1 then
   select jsonb_agg(jsonb_build_object('id',id,'source_url',source_url,'purpose',pending.purpose) order by created_at) into options from (select * from public.agent_social_read_requests where owner_id=p_owner and status in ('pending','approved','analyzing') and expires_at>now() order by created_at limit 20) pending;
   question:='Which Facebook request do you mean?'||chr(10)||(select string_agg(ordinality::text||'. '||(value->>'source_url'),chr(10) order by ordinality) from jsonb_array_elements(options) with ordinality)||chr(10)||'Reply approve 1 or deny 1. Nothing has started.';stage:='decision';exit flow;
  end if;
  if r.expires_at<=now() or r.status not in ('pending','approved','analyzing') then question:='That permission is already closed or expired. Ask for a new review.';exit flow;end if;
  if intent='continue' then question:='Please approve this page first by replying approved.';selected:=r.id;exit flow;end if;
  if r.status<>'pending' and intent='approve' then question:='That page is already approved or running. I haven’t created a second approval.';exit flow;end if;
  insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values(p_owner,c,'owner',t,clock_timestamp());
  result:=public.agent_social_read_transition(p_owner,case when intent='approve' then 'approve' when r.status='pending' then 'deny' else 'revoke' end,jsonb_build_object('id',r.id));
  delete from public.agent_social_read_chat_state where owner_id=p_owner;
  if intent='approve' then
   insert into public.agent_social_read_chat_state(owner_id,stage,purpose,account_id,options,prompt_message_id,expires_at) values(p_owner,'approved',r.purpose,r.account_id,jsonb_build_array(jsonb_build_object('id',r.id)),(result->>'response_message_id')::uuid,(result->>'expires_at')::timestamptz);
  end if;
  return jsonb_build_object('handled',true,'start_read_id',case when intent='approve' then r.id else null end);
 end if;

 if ctx.stage in ('profile','url') and intent in ('approve','deny','revoke','continue') then
  if intent in ('deny','revoke') then question:='Cancelled. No Facebook read was approved.';
  else question:='I need the exact Facebook profile or page first. Send its link here; I’ll ask for approval after identifying it.';stage:='url';end if;exit flow;
 end if;
 if ctx.stage='profile' then
  if choice between 1 and jsonb_array_length(ctx.options) then selected:=(ctx.options->(choice-1)->>'id')::uuid;
  else
   select count(*) into n from jsonb_array_elements(ctx.options) where lower(t) in (lower(value->>'label'),lower(value->>'handle'));
   if n=1 then select (value->>'id')::uuid into selected from jsonb_array_elements(ctx.options) where lower(t) in (lower(value->>'label'),lower(value->>'handle')) limit 1;
   elsif n>1 then question:='More than one profile has that name. Reply with the profile number from my list.';stage:='profile';options:=ctx.options;exit flow;end if;
  end if;
  if selected is null and source is null then return jsonb_build_object('handled',false);end if;
 elsif ctx.stage='url' then selected:=ctx.account_id;
 end if;
 if selected is not null then select * into a from public.agent_personal_accounts where owner_id=p_owner and id=selected and platform='facebook';end if;
 if a.id is null and source is null then
  select count(*) into n from public.agent_personal_accounts where owner_id=p_owner and platform='facebook' and (position(lower(label) in lower(t))>0 or position(lower(handle) in lower(t))>0);
  if n=1 then select * into a from public.agent_personal_accounts where owner_id=p_owner and platform='facebook' and (position(lower(label) in lower(t))>0 or position(lower(handle) in lower(t))>0) limit 1;
  else
   select count(*) into n from public.agent_personal_accounts where owner_id=p_owner and platform='facebook';
   if n=1 then select * into a from public.agent_personal_accounts where owner_id=p_owner and platform='facebook' limit 1;
   elsif n>1 then
    select jsonb_agg(jsonb_build_object('id',id,'label',label,'handle',handle) order by created_at,id) into options from (select * from public.agent_personal_accounts where owner_id=p_owner and platform='facebook' order by created_at,id limit 20) accounts;
    question:='Which Facebook profile should I review?'||chr(10)||(select string_agg(ordinality::text||'. '||(value->>'label')||' — '||(value->>'handle'),chr(10) order by ordinality) from jsonb_array_elements(options) with ordinality)||chr(10)||'Reply with its number or name, or send the exact profile link here.';stage:='profile';exit flow;
   end if;
  end if;
 end if;
 if ctx.stage='url' and source is null then question:='Please send the exact Facebook or Messenger content link here before I prepare the review.';stage:='url';exit flow;end if;
 if source is null and a.id is not null and purpose !~* '\m(messages?|inbox|conversation)\M' then
  if a.handle ~ '^@?[A-Za-z0-9.]{2,100}$' and lower(a.handle) not in ('login','checkpoint','recover','oauth','dialog','reg','security','settings') then source:='https://www.facebook.com/'||ltrim(a.handle,'@');
  elsif a.handle ~ '^https://(www\.|m\.|web\.|mbasic\.)?facebook\.com/[A-Za-z0-9.]+/?([?#].*)?$' and a.handle !~* '/(login|checkpoint|recover|oauth|dialog|reg|security|settings)([/?#.]|$)' and a.handle !~ '/profile\.php' then source:='https://www.facebook.com/'||substring(a.handle from 'facebook\.com/([A-Za-z0-9.]+)');
  elsif a.handle ~ '^https://(www\.|m\.)?facebook\.com/profile\.php\?id=[0-9]+(&.*)?$' then source:='https://www.facebook.com/profile.php?id='||substring(a.handle from '[?]id=([0-9]+)');end if;
 end if;
 if source is null then question:='Send the exact Facebook profile, post or conversation link in this thread. I’ll show the page and task for approval here before reading anything.';stage:='url';exit flow;end if;
 if a.id is null then
  select * into a from public.agent_personal_accounts where owner_id=p_owner and platform='facebook' and handle=source limit 1;
  if a.id is null then insert into public.agent_personal_accounts(owner_id,platform,label,handle) values(p_owner,'facebook','Facebook link shared with Riley',case when length(source)<=120 then source else 'Link shared in Riley chat' end) returning * into a;end if;
 end if;
 insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values(p_owner,c,'owner',t,clock_timestamp());
 result:=public.agent_social_read_transition(p_owner,'request',jsonb_build_object('account_id',a.id,'source_url',source,'purpose',purpose,'skip_owner',true));
 delete from public.agent_social_read_chat_state where owner_id=p_owner;
 return jsonb_build_object('handled',true,'request_id',result->>'id');
 end flow;

 insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values(p_owner,c,'owner',t,clock_timestamp());
 insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values(p_owner,c,'employee',question,clock_timestamp()) returning id into prompt;
 delete from public.agent_social_read_chat_state where owner_id=p_owner;
 if selected is not null and stage is null and question like 'Review this page:%' or selected is not null and question like 'Please approve this page first%' then
  update public.agent_social_read_requests set prompt_message_id=prompt where owner_id=p_owner and id=selected;
 end if;
 if stage is not null then
  insert into public.agent_social_read_chat_state(owner_id,stage,purpose,account_id,options,prompt_message_id) values(p_owner,stage,purpose,coalesce(a.id,ctx.account_id),coalesce(options,'[]'),prompt);
 end if;
 return jsonb_build_object('handled',true,'start_read_id',start_id);
end $$;
revoke all on function public.agent_social_read_chat(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agent_social_read_chat(uuid,jsonb) to service_role;

create function public.agent_social_read_chat_notice(p_owner uuid,p_request uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.agent_social_read_requests%rowtype; prompt uuid;
begin
 if p_owner is null then raise exception 'Owner required';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-read:'||p_owner::text,0));
 select * into r from public.agent_social_read_requests where owner_id=p_owner and id=p_request and status='approved' and expires_at>now() for update;
 if not found then return;end if;
 insert into public.agent_messages(owner_id,conversation_id,sender,body,created_at) values(p_owner,r.conversation_id,'employee','Your read is approved, but the Safari reader did not confirm a connection. Open or refresh this thread in Safari with the Connected Safari reader enabled, then reply continue. I have not confirmed a Facebook read. You can say stop to revoke permission.',clock_timestamp()) returning id into prompt;
 insert into public.agent_social_read_chat_state(owner_id,stage,purpose,account_id,options,prompt_message_id,expires_at) values(p_owner,'approved',r.purpose,r.account_id,jsonb_build_array(jsonb_build_object('id',r.id)),prompt,r.expires_at)
 on conflict(owner_id) do update set stage=excluded.stage,purpose=excluded.purpose,account_id=excluded.account_id,options=excluded.options,prompt_message_id=excluded.prompt_message_id,expires_at=excluded.expires_at;
end $$;
revoke all on function public.agent_social_read_chat_notice(uuid,uuid) from public,anon,authenticated;
grant execute on function public.agent_social_read_chat_notice(uuid,uuid) to service_role;
