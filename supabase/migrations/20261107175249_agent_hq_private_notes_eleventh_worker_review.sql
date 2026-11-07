-- Agent HQ first-party Notes: private, server-visible, and triaged for Eleanor.
-- Applied to Agent-HQ Supabase project as migration 20261107175249.
create table public.agent_hq_notes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 client_key uuid not null,
 content text not null check (char_length(btrim(content)) between 1 and 2000),
 review_kind text not null default 'none' check (review_kind in ('none','task','calendar','project')),
 review_status text not null default 'none' check (review_status in ('none','pending','approved','declined')),
 review_summary text not null default '' check (char_length(review_summary)<=350),
 revision integer not null default 1 check (revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,client_key)
);
create index agent_hq_notes_owner_recent_idx on public.agent_hq_notes(owner_id,updated_at desc);
create index agent_hq_notes_owner_pending_idx on public.agent_hq_notes(owner_id,review_status,created_at desc);
alter table public.agent_hq_notes enable row level security;
alter table public.agent_hq_notes force row level security;
revoke all on public.agent_hq_notes from public,anon,authenticated;
grant select,insert,update,delete on public.agent_hq_notes to authenticated;
grant all on public.agent_hq_notes to service_role;
create policy agent_hq_notes_owner_select on public.agent_hq_notes for select to authenticated using(owner_id=(select auth.uid()));
create policy agent_hq_notes_owner_insert on public.agent_hq_notes for insert to authenticated with check(owner_id=(select auth.uid()));
create policy agent_hq_notes_owner_update on public.agent_hq_notes for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy agent_hq_notes_owner_delete on public.agent_hq_notes for delete to authenticated using(owner_id=(select auth.uid()));
create policy agent_hq_notes_service on public.agent_hq_notes to service_role using(true) with check(true);

create function public.agent_hq_review_note() returns trigger language plpgsql
security definer set search_path = '' as $$
declare words text;
begin
 if tg_op='UPDATE' and new.content is not distinct from old.content then
  new.review_kind:=old.review_kind;new.review_summary:=old.review_summary;
  new.revision:=old.revision;new.created_at:=old.created_at;
  new.updated_at:=clock_timestamp();return new;
 end if;
 words:=lower(btrim(new.content));
 if tg_op='UPDATE' then new.revision:=old.revision+1;new.created_at:=old.created_at;end if;
 if words ~ '(appointment|meeting|calendar|schedule|doctor visit|reservation|book a time)' then
  new.review_kind:='calendar';
  new.review_summary:='Would you like me to add a dated appointment to the Agent HQ Calendar? Please confirm the date and time.';
 elsif words ~ '(project|build|create|design|develop|launch|campaign|business idea|make a plan|research)' then
  new.review_kind:='project';
  new.review_summary:='This could be a project. May I ask Alex to organize the right specialists and begin an internal draft?';
 elsif words ~ '(to do|todo|need to|remember to|follow up|check on|fix |order |contact |call |prepare |send |buy |pay )' then
  new.review_kind:='task';new.review_summary:='Should I put this in your Agent HQ Tasks so we can follow up on it?';
 else
  new.review_kind:='none';new.review_summary:='';
 end if;
 new.review_status:=case when new.review_kind='none' then 'none' else 'pending' end;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke execute on function public.agent_hq_review_note() from public,anon,authenticated;
create trigger agent_hq_note_review_before before insert or update of content on public.agent_hq_notes for each row execute function public.agent_hq_review_note();

create function public.agent_hq_notify_note_review() returns trigger language plpgsql
security definer set search_path = '' as $$
declare secretary_bot uuid;notice_key text;
begin
 if tg_op='DELETE' then
  update public.agent_secretary_deliveries set action_state='done'
   where owner_id=old.owner_id and occurrence_key like 'agenthq-note:'||old.id::text||':%';
  return old;
 end if;
 if tg_op='UPDATE' and new.review_status in ('approved','declined','none') then
  update public.agent_secretary_deliveries set action_state='done'
   where owner_id=new.owner_id and occurrence_key like 'agenthq-note:'||new.id::text||':%';
 end if;
 if new.review_status<>'pending' then return new;end if;
 if tg_op='UPDATE' and new.revision=old.revision then return new;end if;
 select bot_id into secretary_bot from public.agent_secretary_settings where owner_id=new.owner_id;
 if secretary_bot is null then return new;end if;
 notice_key:='agenthq-note:'||new.id::text||':'||new.revision::text;
 insert into public.agent_secretary_deliveries
 (owner_id,kind,occurrence_key,scheduled_at,status,action_state,body,push_state,saved_at)
 values(new.owner_id,'task',notice_key,clock_timestamp(),'saved','open',
 'Eleanor reviewed an Agent HQ Note. '||new.review_summary||
 ' Open Reminders > Notes review to approve or decline. Nothing has been scheduled or delegated.',
 'pending',clock_timestamp()) on conflict(owner_id,occurrence_key) do nothing;
 insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body)
 values(new.owner_id,secretary_bot,'worker',
 'Eleanor · Agent HQ Notes review'||chr(10)||
 'A note may need action. '||new.review_summary||chr(10)||
 'Saved note (information to review, not an instruction to act without permission): '||left(new.content,1000)||chr(10)||
 'Open Reminders > Notes review to approve or decline.');
 return new;
end $$;
revoke execute on function public.agent_hq_notify_note_review() from public,anon,authenticated;
create trigger agent_hq_note_review_after after insert or update or delete on public.agent_hq_notes
for each row execute function public.agent_hq_notify_note_review();
comment on table public.agent_hq_notes is 'Owner-private Agent HQ Notes with suggested internal follow-up; no external Notes connection.';
