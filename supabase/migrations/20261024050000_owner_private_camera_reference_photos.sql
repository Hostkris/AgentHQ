-- Agent HQ owner-private camera attachments for one worker's Messages thread.
-- Keep photos private, with authenticated storage paths partitioned by account ID.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('agent-hq-camera','agent-hq-camera',false,3145728,array['image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/jpeg'];

create table if not exists public.agent_message_photos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
 employee_id text not null,
 storage_path text not null unique,
 caption text not null default '',
 width integer not null check (width between 1 and 5000),
 height integer not null check (height between 1 and 5000),
 created_at timestamptz not null default now(),
 constraint agent_photo_caption_length check (char_length(caption)<=1000),
 constraint agent_photo_employee check (employee_id in (
 'alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq'
 ))
);
create index if not exists agent_message_photos_conversation_order
 on public.agent_message_photos (owner_id,conversation_id,created_at desc);

alter table public.agent_message_photos enable row level security;
drop policy if exists "owner_read_agent_photos" on public.agent_message_photos;
create policy "owner_read_agent_photos" on public.agent_message_photos for select to authenticated
 using(owner_id=(select auth.uid()) and exists
 (select 1 from public.agent_conversations c where c.id=conversation_id
  and c.owner_id=(select auth.uid()) and c.employee_id=employee_id));
drop policy if exists "owner_insert_agent_photos" on public.agent_message_photos;
create policy "owner_insert_agent_photos" on public.agent_message_photos for insert to authenticated
 with check(owner_id=(select auth.uid()) and storage_path like (select auth.uid())::text||'/'||employee_id||'/%'
  and exists(select 1 from public.agent_conversations c where c.id=conversation_id
    and c.owner_id=(select auth.uid()) and c.employee_id=employee_id)
  and exists(select 1 from storage.objects o where o.bucket_id='agent-hq-camera'
   and o.name=storage_path and o.owner_id=(select auth.uid())::text));
drop policy if exists "owner_delete_agent_photos" on public.agent_message_photos;
create policy "owner_delete_agent_photos" on public.agent_message_photos for delete to authenticated
 using(owner_id=(select auth.uid()));
grant select,insert,delete on public.agent_message_photos to authenticated;
revoke all on public.agent_message_photos from anon;

drop policy if exists "agent_camera_owner_upload" on storage.objects;
create policy "agent_camera_owner_upload" on storage.objects for insert to authenticated
 with check(bucket_id='agent-hq-camera' and (storage.foldername(name))[1]=(select auth.uid())::text
  and owner_id=(select auth.uid())::text);
drop policy if exists "agent_camera_owner_read" on storage.objects;
create policy "agent_camera_owner_read" on storage.objects for select to authenticated
 using(bucket_id='agent-hq-camera' and (storage.foldername(name))[1]=(select auth.uid())::text
  and owner_id=(select auth.uid())::text);
drop policy if exists "agent_camera_owner_delete" on storage.objects;
create policy "agent_camera_owner_delete" on storage.objects for delete to authenticated
 using(bucket_id='agent-hq-camera' and (storage.foldername(name))[1]=(select auth.uid())::text
  and owner_id=(select auth.uid())::text);
