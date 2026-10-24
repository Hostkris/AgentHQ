-- Owner-private Camera roll. Captures are saved to Agent HQ; not sent to any worker.
create table if not exists public.agent_camera_photos (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null unique,
 width integer not null check(width between 1 and 5000),
 height integer not null check(height between 1 and 5000),
 created_at timestamptz not null default now(),
 constraint owner_camera_roll_path check(storage_path like owner_id::text||'/camera/%')
);
create index if not exists agent_camera_photos_owner_created on public.agent_camera_photos(owner_id,created_at desc);
alter table public.agent_camera_photos enable row level security;
drop policy if exists "owner_read_camera_roll" on public.agent_camera_photos;
create policy "owner_read_camera_roll" on public.agent_camera_photos for select to authenticated
 using(owner_id=(select auth.uid()));
drop policy if exists "owner_add_camera_roll" on public.agent_camera_photos;
create policy "owner_add_camera_roll" on public.agent_camera_photos for insert to authenticated
 with check(owner_id=(select auth.uid()) and storage_path like (select auth.uid())::text||'/camera/%'
  and exists(select 1 from storage.objects o where o.bucket_id='agent-hq-camera'
   and o.name=storage_path and o.owner_id=(select auth.uid())::text));
drop policy if exists "owner_delete_camera_roll" on public.agent_camera_photos;
create policy "owner_delete_camera_roll" on public.agent_camera_photos for delete to authenticated
 using(owner_id=(select auth.uid()));
grant select,insert,delete on public.agent_camera_photos to authenticated;
revoke all on public.agent_camera_photos from anon;
