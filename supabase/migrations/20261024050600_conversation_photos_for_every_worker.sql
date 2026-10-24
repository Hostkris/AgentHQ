-- CLI-created migration, ordered after the existing 050500 camera migration.
-- Additive: existing built-in photos and their access rules are unchanged.
create table public.agent_custom_message_photos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 bot_id uuid not null references public.agent_custom_bots(id) on delete cascade,
 employee_id text not null check(employee_id=bot_id::text),
 storage_path text not null unique,
 caption text not null default '' check(length(caption)<=1000),
 width integer not null check(width between 1 and 5000),
 height integer not null check(height between 1 and 5000),
 created_at timestamptz not null default now(),
 analysis_status text not null default 'pending' check(analysis_status in ('pending','processing','completed','failed')),
 analyzed_at timestamptz
);
create index agent_custom_photos_owner_order on public.agent_custom_message_photos(owner_id,created_at desc);
create index agent_custom_photos_bot_order on public.agent_custom_message_photos(bot_id,created_at desc);
alter table public.agent_custom_message_photos enable row level security;
revoke all on public.agent_custom_message_photos from public,anon,authenticated;
grant select,insert,delete on public.agent_custom_message_photos to authenticated;
grant all on public.agent_custom_message_photos to service_role;
create policy owner_read_custom_photos on public.agent_custom_message_photos for select to authenticated using (
 owner_id=(select auth.uid()) and exists(select 1 from public.agent_custom_bots b where b.id=agent_custom_message_photos.bot_id and b.owner_id=(select auth.uid())));
create policy owner_delete_custom_photos on public.agent_custom_message_photos for delete to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert_custom_photos on public.agent_custom_message_photos for insert to authenticated with check (
 owner_id=(select auth.uid()) and storage_path like (select auth.uid())::text||'/'||bot_id::text||'/%'
 and exists(select 1 from public.agent_custom_bots b where b.id=agent_custom_message_photos.bot_id and b.owner_id=(select auth.uid()) and b.status='active')
 and exists(select 1 from storage.objects o where o.bucket_id='agent-hq-camera' and o.name=agent_custom_message_photos.storage_path and o.owner_id=(select auth.uid())::text));

-- A deleted photo or archived custom worker cannot receive a late model reply.
create function public.finish_agent_photo_review(p_owner uuid,p_attachment uuid,p_body text,p_custom boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare p record;
begin
 if p_owner is null or length(btrim(coalesce(p_body,''))) not between 1 and 1500 then raise exception 'Invalid photo review';end if;
 if p_custom then
  select * into p from public.agent_custom_message_photos where owner_id=p_owner and id=p_attachment for update;
  if not found or p.analysis_status<>'processing' then raise exception 'Photo review no longer active';end if;
  if not exists(select 1 from public.agent_custom_bots b where b.owner_id=p_owner and b.id=p.bot_id and b.status='active') then raise exception 'Worker no longer active';end if;
  insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body) values(p_owner,p.bot_id,'worker',p_body);
  update public.agent_custom_message_photos set analysis_status='completed',analyzed_at=now() where owner_id=p_owner and id=p_attachment;
 else
  select * into p from public.agent_message_photos where owner_id=p_owner and id=p_attachment for update;
  if not found or p.analysis_status<>'processing' then raise exception 'Photo review no longer active';end if;
  if not exists(select 1 from public.agent_conversations c where c.owner_id=p_owner and c.id=p.conversation_id and c.employee_id=p.employee_id) then raise exception 'Conversation not found';end if;
  insert into public.agent_messages(owner_id,conversation_id,sender,body) values(p_owner,p.conversation_id,'employee',p_body);
  update public.agent_message_photos set analysis_status='completed',analyzed_at=now() where owner_id=p_owner and id=p_attachment;
 end if;
 return true;
end $$;
revoke all on function public.finish_agent_photo_review(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_agent_photo_review(uuid,uuid,text,boolean) to service_role;
