-- Visual project library and owner-supplied reference photos. No public uploads.
update storage.buckets set allowed_mime_types=array['text/markdown','text/plain','application/pdf','text/csv','application/json','text/html','text/calendar','image/jpeg','image/png','image/webp'] where id='agent-project-files';
create table public.agent_project_photos(
 id uuid primary key,owner_id uuid not null,assignment_id uuid not null,
 filename text not null check(char_length(filename) between 1 and 180),
 object_path text not null unique,mime_type text not null default 'image/jpeg' check(mime_type='image/jpeg'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),size_bytes integer not null check(size_bytes between 100 and 3145728),
 width integer not null check(width between 1 and 1600),height integer not null check(height between 1 and 1600),
 caption text not null default '' check(char_length(caption)<=3000),added_revision integer not null default 1 check(added_revision>0),
 analysis_status text not null default 'pending' check(analysis_status in ('pending','completed')),
 analysis text not null default '' check(char_length(analysis)<=5000),
 created_at timestamptz not null default now(),
 foreign key(assignment_id,owner_id) references public.agent_team_assignments(id,owner_id) on delete cascade
);
create index on public.agent_project_photos(owner_id,assignment_id,created_at);
alter table public.agent_project_photos enable row level security;
alter table public.agent_project_photos force row level security;
revoke all on public.agent_project_photos from public,anon,authenticated;
grant select on public.agent_project_photos to authenticated;
grant all on public.agent_project_photos to service_role;
create policy owner_reads on public.agent_project_photos for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_reads_project_photos on storage.objects for select to authenticated using(
 bucket_id='agent-project-files' and (storage.foldername(name))[1]=(select auth.uid())::text and
 exists(select 1 from public.agent_project_photos p where p.object_path=name and p.owner_id=(select auth.uid()))
);

create function public.add_agent_project_photo(p_owner uuid,p_assignment uuid,p_photo uuid,p_filename text,p_path text,p_sha text,p_size integer,p_width integer,p_height integer,p_caption text,p_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.agent_project_photos; result jsonb;begin
 perform 1 from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found then raise exception 'Project not found';end if;
 select * into existing from public.agent_project_photos where id=p_photo;
 if found then
  if existing.owner_id<>p_owner or existing.assignment_id<>p_assignment or existing.sha256<>p_sha or existing.caption<>coalesce(p_caption,'') then raise exception 'This photo request already belongs to different content';end if;
  return jsonb_build_object('state','saved','photo_id',p_photo,'revision',existing.added_revision);
 end if;
 if (select count(*) from public.agent_project_photos where owner_id=p_owner and assignment_id=p_assignment)>=12 then raise exception 'Use at most twelve reference photos per project';end if;
 if p_path<>p_owner::text||'/'||p_assignment::text||'/references/'||p_photo::text||'.jpg' then raise exception 'Invalid private photo path';end if;
 insert into public.agent_project_photos(id,owner_id,assignment_id,filename,object_path,sha256,size_bytes,width,height,caption)
 values(p_photo,p_owner,p_assignment,p_filename,p_path,p_sha,p_size,p_width,p_height,coalesce(p_caption,''));
 result:=public.update_agent_project_context(p_owner,p_assignment,'Reference photo added: '||p_filename||case when coalesce(p_caption,'')<>'' then E'\nOwner direction: '||p_caption else '' end,null,p_revision);
 update public.agent_project_photos set added_revision=(result->>'revision')::integer where id=p_photo and owner_id=p_owner;
 update public.agent_project_sessions set next_run_at=now()+interval '12 seconds' where assignment_id=p_assignment and owner_id=p_owner;
 return result||jsonb_build_object('photo_id',p_photo);
end $$;

create function public.complete_agent_project_photo_analysis(p_owner uuid,p_assignment uuid,p_run uuid,p_revision integer,p_photo uuid,p_analysis text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.agent_project_sessions; a public.agent_team_assignments;begin
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if not found or a.owner_paused or s.revision<>p_revision or s.active_run is distinct from p_run or s.lease_until<clock_timestamp() then raise exception 'Photo analysis was stopped or superseded';end if;
 if coalesce(char_length(btrim(p_analysis)),0) not between 40 and 5000 then raise exception 'No usable image observations were returned';end if;
 update public.agent_project_photos set analysis_status='completed',analysis=btrim(p_analysis) where id=p_photo and owner_id=p_owner and assignment_id=p_assignment and analysis_status='pending';
 if not found then raise exception 'Reference photo was removed or already analyzed';end if;
 update public.agent_worker_runs set status='completed',result_preview='Reference photo observations saved for the team.',finished_at=now() where id=p_run and owner_id=p_owner and status='running';
 update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null,turn_count=turn_count+1,last_error='',next_run_at=now()+interval '4 seconds',updated_at=now() where assignment_id=p_assignment;
 insert into public.agent_team_messages(assignment_id,owner_id,sender_kind,sender_id,message_type,body,project_revision,project_kind)
 values(p_assignment,p_owner,'agent',s.active_worker,'reply','I reviewed a reference photo and saved its visible style details for the team. The photo and the owner’s direction are available in Projects.',s.revision,'discussion');
 return jsonb_build_object('state','ready','worker_id',s.active_worker,'photo_id',p_photo);
end $$;
revoke all on function public.add_agent_project_photo(uuid,uuid,uuid,text,text,text,integer,integer,integer,text,integer),public.complete_agent_project_photo_analysis(uuid,uuid,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.add_agent_project_photo(uuid,uuid,uuid,text,text,text,integer,integer,integer,text,integer),public.complete_agent_project_photo_analysis(uuid,uuid,uuid,integer,uuid,text) to service_role;

create or replace function public.create_agent_workspace_project(p_owner uuid,p_source text,p_brief text,p_meta jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare aid uuid; book_key text;begin
 if p_source is null or not p_source=any(array['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']) or coalesce(char_length(btrim(p_brief)),0) not between 5 and 10000 then raise exception 'Invalid project';end if;
 insert into public.agent_project_handbooks(owner_id,handbook_key,title,scope,content,approved)
 values(p_owner,'working-agreements','Shared working agreements','general',
 'Identify the project and use its approved requirements and references. Business information is optional. Stay in your assigned role; Alex coordinates. Save real work products before handing off and verify the result against the goal. Continue authorized internal work and safe retries within existing usage limits. Ask only for essential missing facts or specific protected-action authorization. A handbook, saved profile or draft approval grants no account access, spending or sending permissions. Keep projects and businesses separate.',true)
 on conflict(owner_id,handbook_key) do nothing;
 insert into public.agent_team_assignments(owner_id,title,instructions,employee_ids,source_employee_id,coordination_status,workflow_version)
 values(p_owner,left(split_part(btrim(p_brief),E'\n',1),120),btrim(p_brief),array[p_source],p_source,'planning',2) returning id into aid;
 select min(handbook_key) into book_key from public.agent_project_handbooks
  where owner_id=p_owner and approved and scope='business' and position(lower(title) in lower(p_brief))>0 having count(*)=1;
 insert into public.agent_project_workspaces(assignment_id,owner_id,goal,project_kind,requirements,output_format,completion_criteria,business_key)
 values(aid,p_owner,btrim(p_brief),coalesce(p_meta->>'project_kind','general'),coalesce(p_meta->'requirements','[]'),coalesce(p_meta->>'output_format','markdown'),left(coalesce(p_meta->>'completion_criteria',''),3000),coalesce(book_key,''));
 insert into public.agent_project_sessions(assignment_id,owner_id) values(aid,p_owner) on conflict do nothing;
 return jsonb_build_object('id',aid);
end $$;
