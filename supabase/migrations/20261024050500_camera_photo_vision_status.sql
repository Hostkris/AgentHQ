alter table public.agent_message_photos
 add column if not exists analysis_status text not null default 'pending'
 check (analysis_status in ('pending','processing','completed','failed'));
alter table public.agent_message_photos
 add column if not exists analyzed_at timestamptz;
