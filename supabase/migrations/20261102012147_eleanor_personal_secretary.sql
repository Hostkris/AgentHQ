-- Eleanor: durable owner-private registers, a real scheduler and opt-in Web Push.
create table public.agent_secretary_settings(
 owner_id uuid primary key references auth.users(id) on delete cascade,bot_id uuid not null,
 timezone text not null default 'America/New_York',brief_time time not null default '07:00',brief_enabled boolean not null default false,
 next_brief_at timestamptz,email_for_meetings boolean not null default false,version integer not null default 1,
 last_scheduler_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(owner_id,bot_id) references public.agent_custom_bots(owner_id,id) on delete cascade
);
create table public.agent_secretary_items(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.agent_secretary_settings(owner_id) on delete cascade,
 kind text not null check(kind in ('reminder','task','workout','meeting')),title text not null check(char_length(btrim(title)) between 1 and 180),
 details text not null default '' check(char_length(details)<=4000),status text not null default 'active' check(status in ('active','paused','stopped','completed')),
 timezone text not null,local_time time,weekdays integer[] not null default array[0,1,2,3,4,5,6] check(weekdays<@array[0,1,2,3,4,5,6] and cardinality(weekdays)>0),
 scheduled_at timestamptz,due_at timestamptz,next_due_at timestamptz,data jsonb not null default '{}',version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id),
 check(jsonb_typeof(data)='object' and octet_length(data::text)<=10000),check(status<>'completed' or kind in ('task','meeting')),
 check(kind<>'reminder' or local_time is not null),check(kind<>'meeting' or scheduled_at is not null)
);
create index on public.agent_secretary_items(owner_id,status,next_due_at);
create table public.agent_secretary_deliveries(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.agent_secretary_settings(owner_id) on delete cascade,
 item_id uuid,item_version integer,kind text not null check(kind in ('reminder','followup','brief','meeting','task')),
 occurrence_key text not null,scheduled_at timestamptz not null,status text not null default 'queued' check(status in ('queued','processing','saved','cancelled')),
 action_state text not null default 'open' check(action_state in ('open','done','skipped','snoozed')),parent_id uuid references public.agent_secretary_deliveries(id),
 body text not null default '',message_id uuid references public.agent_custom_bot_messages(id),lease_id uuid,lease_until timestamptz,
 attempts integer not null default 0,last_error text not null default '',push_state text not null default 'pending' check(push_state in ('pending','not_enabled','accepted','failed','unknown')),
 push_attempts integer not null default 0,next_push_at timestamptz not null default now(),created_at timestamptz not null default now(),saved_at timestamptz,
 foreign key(owner_id,item_id) references public.agent_secretary_items(owner_id,id) on delete cascade,unique(owner_id,occurrence_key)
);
create index on public.agent_secretary_deliveries(owner_id,status,scheduled_at);
create table public.agent_secretary_workout_log(
 owner_id uuid not null references public.agent_secretary_settings(owner_id) on delete cascade,item_id uuid not null,local_date date not null,
 status text not null check(status in ('completed','skipped')),notes text not null default '' check(char_length(notes)<=2000),recorded_at timestamptz not null default now(),
 primary key(owner_id,item_id,local_date),foreign key(owner_id,item_id) references public.agent_secretary_items(owner_id,id) on delete cascade
);
create table public.agent_secretary_commands(
 id uuid primary key,owner_id uuid not null references public.agent_secretary_settings(owner_id) on delete cascade,
 input_hash text not null,status text not null default 'reserved' check(status in ('reserved','completed','failed')),result jsonb,ai_attempts integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index on public.agent_secretary_commands(owner_id,created_at);
create table public.agent_secretary_push_keys(singleton boolean primary key default true check(singleton),public_key text not null,private_key text not null);
create table public.agent_secretary_push_subscriptions(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.agent_secretary_settings(owner_id) on delete cascade,
 endpoint text not null unique,p256dh text not null,auth_key text not null,active boolean not null default true,
 label text not null default 'My device' check(char_length(label)<=100),created_at timestamptz not null default now(),last_success_at timestamptz,last_error text
);
do $$ declare t text;begin
 foreach t in array array['agent_secretary_settings','agent_secretary_items','agent_secretary_deliveries','agent_secretary_workout_log','agent_secretary_commands','agent_secretary_push_keys','agent_secretary_push_subscriptions'] loop
  execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
  execute format('create policy service_access on public.%I to service_role using(true) with check(true)',t);
  if t in ('agent_secretary_settings','agent_secretary_items','agent_secretary_deliveries','agent_secretary_workout_log') then
   execute format('grant select on public.%I to authenticated',t);execute format('create policy owner_reads on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
  end if;
 end loop;
end $$;
create unique index agent_one_eleanor_per_owner on public.agent_custom_bots(owner_id,template_key) where template_key='eleanor-secretary-v1';
create function public.next_secretary_local(p_after timestamptz,p_zone text,p_time time,p_days integer[])
returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare d date;candidate timestamptz;begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) or p_days is null or cardinality(p_days)=0 then raise exception 'Choose a valid timezone and weekdays';end if;
 for n in 0..8 loop
  d:=(p_after at time zone p_zone)::date+n;
  if extract(dow from d)::integer=any(p_days) then candidate:=(d+p_time) at time zone p_zone;if candidate>p_after then return candidate;end if;end if;
 end loop;raise exception 'Could not find the next local reminder time';
end $$;
create function public.ensure_agent_secretary(p_owner uuid,p_spec jsonb,p_enable_brief boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('secretary:'||p_owner::text,0));
 select id into b from public.agent_custom_bots where owner_id=p_owner and template_key='eleanor-secretary-v1';
 if b is null then
  insert into public.agent_custom_bots(owner_id,name,role,mission,tone,instructions,skills,anti_jobs,category,avatar_emoji,starting_message,template_key,status)
  values(p_owner,p_spec->>'name',p_spec->>'role',p_spec->>'mission',p_spec->>'tone',p_spec->>'instructions',array(select jsonb_array_elements_text(p_spec->'skills')),array(select jsonb_array_elements_text(p_spec->'anti_jobs')),'personal',p_spec->>'avatar_emoji',p_spec->>'starting_message','eleanor-secretary-v1','active') returning id into b;
  insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body) values(p_owner,b,'worker',p_spec->>'starting_message');
 end if;
 insert into public.agent_secretary_settings(owner_id,bot_id,brief_enabled,next_brief_at)
 values(p_owner,b,p_enable_brief,case when p_enable_brief then public.next_secretary_local(clock_timestamp(),'America/New_York','07:00',array[0,1,2,3,4,5,6]) else null end) on conflict(owner_id) do nothing;
 return b;
end $$;
create function public.apply_agent_secretary_ops(p_owner uuid,p_request uuid,p_ops jsonb,p_expected_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.agent_secretary_settings;existing public.agent_secretary_commands;o jsonb;i public.agent_secretary_items;op text;ident uuid;labels jsonb:='[]';payload jsonb;v_time time;v_zone text;v_days integer[];due timestamptz;project_id uuid;result jsonb;fingerprint text;d public.agent_secretary_deliveries;begin
 select * into s from public.agent_secretary_settings where owner_id=p_owner for update;if not found then raise exception 'Secretary profile not found';end if;
 fingerprint:=encode(extensions.digest(p_ops::text,'sha256'),'hex');
 select * into existing from public.agent_secretary_commands where id=p_request;
 if found and (existing.owner_id<>p_owner or existing.input_hash<>fingerprint) then raise exception 'This request already belongs to different content';end if;
 if found and existing.status='completed' then return existing.result;end if;
 if p_expected_version<>s.version then raise exception 'The secretary records changed. Refresh before applying this update';end if;
 if jsonb_typeof(p_ops)<>'array' or jsonb_array_length(p_ops) not between 1 and 6 then raise exception 'Use one to six administrative updates';end if;
 for o in select * from jsonb_array_elements(p_ops) loop
  op:=o->>'op';
  if op='save_item' then
   payload:=o->'item';ident:=nullif(o->>'id','')::uuid;
   if coalesce(payload->>'kind','') not in ('reminder','task','workout','meeting') then raise exception 'Choose a supported secretary register';end if;
   v_zone:=coalesce(payload->>'timezone',s.timezone);if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone) then raise exception 'Invalid timezone';end if;
   v_time:=nullif(payload->>'local_time','')::time;v_days:=coalesce(array(select jsonb_array_elements_text(payload->'weekdays'))::integer[],array[0,1,2,3,4,5,6]);if cardinality(v_days)=0 then v_days:=array[0,1,2,3,4,5,6];end if;
   if ident is not null then select * into i from public.agent_secretary_items where id=ident and owner_id=p_owner for update;if not found then raise exception 'Item not found';end if;
   else
    select * into i from public.agent_secretary_items where owner_id=p_owner and status='active' and kind=payload->>'kind' and lower(title)=lower(btrim(payload->>'title')) and timezone=v_zone and local_time is not distinct from v_time and weekdays=v_days and kind in ('reminder','workout') limit 1;ident:=i.id;
   end if;
   if ident is null and (select count(*) from public.agent_secretary_items where owner_id=p_owner and status='active')>=200 then raise exception 'The active secretary register is full; close completed work first';end if;
   due:=case when payload->>'kind'='reminder' then public.next_secretary_local(clock_timestamp(),v_zone,v_time,v_days)
    when payload->>'kind'='task' then case when nullif(payload->>'local_due','') is not null then (payload->>'local_due')::timestamp at time zone v_zone else null end
    when payload->>'kind'='meeting' then ((payload->>'local_start')::timestamp at time zone v_zone)-interval '30 minutes' else null end;
   if ident is null then
    insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,scheduled_at,due_at,next_due_at,data)
    values(p_owner,payload->>'kind',btrim(payload->>'title'),coalesce(payload->>'details',''),v_zone,v_time,v_days,
     case when payload->>'kind'='meeting' then due+interval '30 minutes' else null end,case when payload->>'kind'='task' then due else null end,due,coalesce(payload->'data','{}')) returning * into i;
   else
    update public.agent_secretary_items set kind=payload->>'kind',title=btrim(payload->>'title'),details=coalesce(payload->>'details',''),timezone=v_zone,local_time=v_time,weekdays=v_days,
     scheduled_at=case when payload->>'kind'='meeting' then due+interval '30 minutes' else null end,due_at=case when payload->>'kind'='task' then due else null end,next_due_at=due,data=coalesce(payload->'data','{}'),status='active',version=version+1,updated_at=now() where id=ident and owner_id=p_owner returning * into i;
    update public.agent_secretary_deliveries set status='cancelled' where owner_id=p_owner and item_id=i.id and status in ('queued','processing');
   end if;labels:=labels||jsonb_build_array(jsonb_build_object('id',i.id,'action','saved','title',i.title,'next_due_at',i.next_due_at));
  elsif op='control_item' then
   ident:=(o->>'id')::uuid;select * into i from public.agent_secretary_items where id=ident and owner_id=p_owner for update;if not found then raise exception 'Item not found';end if;
   if o->>'status' not in ('active','paused','stopped','completed') or o->>'status'='completed' and i.kind not in ('task','meeting') then raise exception 'A recurring routine is acknowledged by occurrence, not permanently completed';end if;
   due:=case when o->>'status'='active' and i.kind='reminder' then public.next_secretary_local(clock_timestamp(),i.timezone,i.local_time,i.weekdays) when o->>'status'='active' and i.kind='task' then i.due_at when o->>'status'='active' and i.kind='meeting' then i.scheduled_at-interval '30 minutes' else null end;
   update public.agent_secretary_items set status=o->>'status',version=version+1,next_due_at=due,updated_at=now() where id=i.id and owner_id=p_owner;
   update public.agent_secretary_deliveries set status='cancelled' where owner_id=p_owner and item_id=i.id and status in ('queued','processing');
   labels:=labels||jsonb_build_array(jsonb_build_object('id',i.id,'action',o->>'status','title',i.title));
  elsif op='ack_item_today' then
   select * into i from public.agent_secretary_items where id=(o->>'id')::uuid and owner_id=p_owner and kind='reminder' and status='active' for update;if not found or o->>'choice' not in ('done','skipped') then raise exception 'Choose an active reminder and reported outcome';end if;
   due:=(((clock_timestamp() at time zone i.timezone)::date)+i.local_time) at time zone i.timezone;
   insert into public.agent_secretary_deliveries(owner_id,item_id,item_version,kind,occurrence_key,scheduled_at,status,action_state,body,push_state,saved_at)
   values(p_owner,i.id,i.version,'reminder',i.id::text||':v'||i.version::text||':'||extract(epoch from due)::bigint::text,due,'saved',o->>'choice','The owner reported this occurrence '||(o->>'choice')||'. No completion was inferred.','not_enabled',now())
   on conflict(owner_id,occurrence_key) do update set action_state=excluded.action_state,status='saved',lease_id=null,lease_until=null,push_state='not_enabled';
   update public.agent_secretary_deliveries set action_state=o->>'choice',status=case when status in ('queued','processing') then 'cancelled' else status end where owner_id=p_owner and item_id=i.id and item_version=i.version and (scheduled_at at time zone i.timezone)::date=(due at time zone i.timezone)::date;
   update public.agent_secretary_items set next_due_at=public.next_secretary_local(greatest(clock_timestamp(),due),i.timezone,i.local_time,i.weekdays) where id=i.id;
   labels:=labels||jsonb_build_array(jsonb_build_object('id',i.id,'action','occurrence_'||(o->>'choice'),'title',i.title));
  elsif op='ack_delivery' then
   result:=public.act_agent_secretary_delivery(p_owner,(o->>'id')::uuid,o->>'choice',p_request);
   labels:=labels||jsonb_build_array(jsonb_build_object('id',o->>'id','action','occurrence_'||(result->>'state')));
  elsif op='workout_log' then
   select * into i from public.agent_secretary_items where id=(o->>'id')::uuid and owner_id=p_owner and kind='workout';if not found then raise exception 'Workout not found';end if;
   if (o->>'local_date')::date not between (now() at time zone i.timezone)::date-30 and (now() at time zone i.timezone)::date then raise exception 'Choose today or one of the last thirty days';end if;
   insert into public.agent_secretary_workout_log(owner_id,item_id,local_date,status,notes) values(p_owner,i.id,(o->>'local_date')::date,o->>'status',left(coalesce(o->>'notes',''),2000))
   on conflict(owner_id,item_id,local_date) do update set status=excluded.status,notes=excluded.notes,recorded_at=now();
   labels:=labels||jsonb_build_array(jsonb_build_object('id',i.id,'action','workout_logged','title',i.title));
  elsif op='settings' then
   v_zone:=coalesce(o->>'timezone',s.timezone);if not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone) then raise exception 'Invalid timezone';end if;
   update public.agent_secretary_settings set timezone=v_zone,brief_time=coalesce((o->>'brief_time')::time,brief_time),brief_enabled=coalesce((o->>'brief_enabled')::boolean,brief_enabled),email_for_meetings=coalesce((o->>'email_for_meetings')::boolean,email_for_meetings),updated_at=now() where owner_id=p_owner returning * into s;
   update public.agent_secretary_settings set next_brief_at=case when s.brief_enabled then public.next_secretary_local(clock_timestamp(),v_zone,s.brief_time,array[0,1,2,3,4,5,6]) else null end where owner_id=p_owner;
   update public.agent_secretary_deliveries set status='cancelled' where owner_id=p_owner and kind='brief' and status in ('queued','processing');
   labels:=labels||jsonb_build_array(jsonb_build_object('action','settings_saved'));
  elsif op='create_project' then
   result:=public.create_agent_workspace_project(p_owner,'alex',o->>'brief',coalesce(o->'metadata','{}'));project_id:=(result->>'id')::uuid;
   insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,data) values(p_owner,'task',left(o->>'title',180),o->>'brief',s.timezone,jsonb_build_object('project_id',project_id,'next_action','Alex and the assigned workers complete the saved project.')) returning * into i;
   labels:=labels||jsonb_build_array(jsonb_build_object('id',i.id,'action','project_created','project_id',project_id,'title',i.title));
  else raise exception 'Unsupported secretary operation';end if;
 end loop;
 update public.agent_secretary_settings set version=version+1,updated_at=now() where owner_id=p_owner returning * into s;
 result:=jsonb_build_object('saved',true,'version',s.version,'changes',labels);
 insert into public.agent_secretary_commands(id,owner_id,input_hash,status,result) values(p_request,p_owner,fingerprint,'completed',result)
 on conflict(id) do update set status='completed',result=excluded.result,updated_at=now();return result;
end $$;

create function public.prepare_agent_secretary_deliveries(p_owners uuid[],p_clock timestamptz default now())
returns integer language plpgsql security invoker set search_path='' as $$
declare s public.agent_secretary_settings;i public.agent_secretary_items;d public.agent_secretary_deliveries;total integer:=0;key text;begin
 for s in select p.* from public.agent_secretary_settings p where p.owner_id=any(p_owners) and exists(select 1 from public.agent_custom_bots b where b.id=p.bot_id and b.owner_id=p.owner_id and b.status='active') for update skip locked loop
  if s.brief_enabled and s.next_brief_at<=p_clock then
   key:='brief:'||((p_clock at time zone s.timezone)::date)::text;
   insert into public.agent_secretary_deliveries(owner_id,kind,occurrence_key,scheduled_at) values(s.owner_id,'brief',key,s.next_brief_at) on conflict(owner_id,occurrence_key) do nothing;
   update public.agent_secretary_settings set next_brief_at=public.next_secretary_local(p_clock,s.timezone,s.brief_time,array[0,1,2,3,4,5,6]) where owner_id=s.owner_id;total:=total+1;
  end if;
  for i in select * from public.agent_secretary_items where owner_id=s.owner_id and status='active' and next_due_at<=p_clock and kind<>'workout' for update skip locked loop
   key:=i.id::text||':v'||i.version::text||':'||extract(epoch from i.next_due_at)::bigint::text;
   insert into public.agent_secretary_deliveries(owner_id,item_id,item_version,kind,occurrence_key,scheduled_at)
    values(s.owner_id,i.id,i.version,i.kind,key,i.next_due_at) on conflict(owner_id,occurrence_key) do nothing;
   update public.agent_secretary_items set next_due_at=case when i.kind='reminder' then public.next_secretary_local(p_clock,i.timezone,i.local_time,i.weekdays) else null end where id=i.id;
   total:=total+1;
  end loop;
  for d in select x.* from public.agent_secretary_deliveries x join public.agent_secretary_items z on z.id=x.item_id and z.owner_id=x.owner_id
   where x.owner_id=s.owner_id and x.kind='reminder' and x.status='saved' and x.action_state='open' and x.scheduled_at<=p_clock-interval '1 hour' and x.scheduled_at>p_clock-interval '20 hours' and z.status='active' and z.version=x.item_version
   and not exists(select 1 from public.agent_secretary_deliveries f where f.owner_id=x.owner_id and f.item_id=x.item_id and f.kind='followup' and (f.scheduled_at at time zone z.timezone)::date=(x.scheduled_at at time zone z.timezone)::date) loop
   insert into public.agent_secretary_deliveries(owner_id,item_id,item_version,kind,occurrence_key,scheduled_at,parent_id)
    values(d.owner_id,d.item_id,d.item_version,'followup','follow:'||d.id::text,d.scheduled_at+interval '1 hour',d.id) on conflict(owner_id,occurrence_key) do nothing;
  end loop;
 end loop;return total;
end $$;
create function public.claim_agent_secretary_delivery(p_owners uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.agent_secretary_deliveries;begin
 select * into d from public.agent_secretary_deliveries where owner_id=any(p_owners) and status in ('queued','processing') and scheduled_at<=now() and (lease_until is null or lease_until<now()) order by scheduled_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.agent_secretary_deliveries set status='processing',lease_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1 where id=d.id returning * into d;return to_jsonb(d);
end $$;
create function public.complete_agent_secretary_delivery(p_owner uuid,p_delivery uuid,p_lease uuid,p_body text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.agent_secretary_deliveries;i public.agent_secretary_items;s public.agent_secretary_settings;m uuid;begin
 select * into s from public.agent_secretary_settings where owner_id=p_owner for update;
 select * into d from public.agent_secretary_deliveries where id=p_delivery and owner_id=p_owner for update;
 if not found or d.status<>'processing' or d.lease_id is distinct from p_lease or d.lease_until<clock_timestamp() then raise exception 'Delivery was stopped or its lease expired';end if;
 if not exists(select 1 from public.agent_custom_bots where id=s.bot_id and owner_id=p_owner and status='active') then update public.agent_secretary_deliveries set status='cancelled' where id=d.id;return jsonb_build_object('state','cancelled');end if;
 if d.kind='brief' and not s.brief_enabled then update public.agent_secretary_deliveries set status='cancelled' where id=d.id;return jsonb_build_object('state','cancelled');end if;
 if d.item_id is not null then
  select * into i from public.agent_secretary_items where id=d.item_id and owner_id=p_owner;
  if not found or i.status<>'active' or i.version<>d.item_version then update public.agent_secretary_deliveries set status='cancelled' where id=d.id;return jsonb_build_object('state','cancelled');end if;
 end if;
 if d.parent_id is not null and exists(select 1 from public.agent_secretary_deliveries where id=d.parent_id and action_state in ('done','skipped')) then update public.agent_secretary_deliveries set status='cancelled' where id=d.id;return jsonb_build_object('state','cancelled');end if;
 if coalesce(char_length(btrim(p_body)),0) not between 10 and 6000 then raise exception 'A usable secretary notice is required';end if;
 insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body) values(p_owner,s.bot_id,'worker',btrim(p_body)) returning id into m;
 update public.agent_secretary_deliveries set status='saved',body=btrim(p_body),message_id=m,saved_at=now(),lease_id=null,lease_until=null,last_error='' where id=d.id;
 return jsonb_build_object('state','saved','message_id',m);
end $$;
create function public.act_agent_secretary_delivery(p_owner uuid,p_delivery uuid,p_action text,p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.agent_secretary_deliveries;i public.agent_secretary_items;begin
 perform 1 from public.agent_secretary_settings where owner_id=p_owner for update;
 select * into d from public.agent_secretary_deliveries where id=p_delivery and owner_id=p_owner for update;if not found or d.status<>'saved' then raise exception 'Reminder occurrence not found';end if;
 if p_action not in ('done','skipped','snooze') then raise exception 'Choose done, skip or snooze';end if;
 if d.action_state in ('done','skipped') then return jsonb_build_object('state',d.action_state);end if;
 if p_action='snooze' then
  select * into i from public.agent_secretary_items where id=d.item_id and owner_id=p_owner and status='active' and version=d.item_version;if not found or i.kind<>'reminder' then raise exception 'Only an active reminder can be snoozed';end if;
  insert into public.agent_secretary_deliveries(owner_id,item_id,item_version,kind,occurrence_key,scheduled_at,parent_id) values(p_owner,i.id,i.version,'reminder','snooze:'||p_request::text||':'||d.id::text,now()+interval '15 minutes',d.id) on conflict(owner_id,occurrence_key) do nothing;
  update public.agent_secretary_deliveries set action_state='snoozed' where id=d.id;
 else
  with recursive ancestors as (select id,parent_id from public.agent_secretary_deliveries where id=d.id and owner_id=p_owner union select p.id,p.parent_id from public.agent_secretary_deliveries p join ancestors c on p.id=c.parent_id where p.owner_id=p_owner), family as (select id from ancestors union select c.id from public.agent_secretary_deliveries c join family p on c.parent_id=p.id where c.owner_id=p_owner) update public.agent_secretary_deliveries set action_state=p_action where owner_id=p_owner and id in(select id from family);
  update public.agent_secretary_deliveries set status='cancelled' where owner_id=p_owner and parent_id=d.id and status in ('queued','processing');
 end if;
 return jsonb_build_object('state',case when p_action='snooze' then 'snoozed' else p_action end,'recurrence_unchanged',true);
end $$;

create table public.agent_secretary_ai_calls(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.agent_secretary_settings(owner_id) on delete cascade,created_at timestamptz not null default now());
create index on public.agent_secretary_ai_calls(owner_id,created_at);
alter table public.agent_secretary_ai_calls enable row level security;alter table public.agent_secretary_ai_calls force row level security;
revoke all on public.agent_secretary_ai_calls from public,anon,authenticated;grant all on public.agent_secretary_ai_calls to service_role;
create policy service_access on public.agent_secretary_ai_calls to service_role using(true) with check(true);
create function public.reserve_agent_secretary_ai(p_owner uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare used integer;begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,4271));
 select (select count(*) from public.agent_worker_runs where owner_id=p_owner and created_at>now()-interval '1 hour')+(select count(*) from public.agent_secretary_ai_calls where owner_id=p_owner and created_at>now()-interval '1 hour') into used;
 if used>=10 then return false;end if;insert into public.agent_secretary_ai_calls(owner_id) values(p_owner);return true;
end $$;
-- These are service entry points, not browser-callable mutation shortcuts.
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('next_secretary_local','ensure_agent_secretary','apply_agent_secretary_ops','prepare_agent_secretary_deliveries','claim_agent_secretary_delivery','complete_agent_secretary_delivery','act_agent_secretary_delivery','reserve_agent_secretary_ai') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
create function agent_hq_private.dispatch_secretary()
returns bigint language plpgsql security invoker set search_path='' as $$
declare token text;request_id bigint;begin
 if not exists(select 1 from agent_hq_private.runner_config where singleton and enabled) then return null;end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='agent_hq_project_runner_token';
 if token is null then return null;end if;
 select net.http_post(url:='https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-secretary?op=tick',headers:=jsonb_build_object('Content-Type','application/json','x-agent-hq-runner-token',token),body:='{}'::jsonb,timeout_milliseconds:=55000) into request_id;return request_id;
end $$;
revoke all on function agent_hq_private.dispatch_secretary() from public,anon,authenticated;
select cron.schedule('agent-hq-eleanor','* * * * *','select agent_hq_private.dispatch_secretary();');

CREATE OR REPLACE FUNCTION public.claim_agent_project_turn(p_owner uuid, p_assignment uuid, p_provider text, p_model text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.agent_team_assignments; s public.agent_project_sessions; r uuid; used int; retry timestamptz; who text; cid uuid; mid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,4271));
 select * into a from public.agent_team_assignments where id=p_assignment and owner_id=p_owner for update;
 if not found or a.workflow_version<>2 then raise exception 'Project not found'; end if;
 insert into public.agent_project_sessions(assignment_id,owner_id) values(p_assignment,p_owner) on conflict do nothing;
 select * into s from public.agent_project_sessions where assignment_id=p_assignment and owner_id=p_owner for update;
 if a.owner_paused then return jsonb_build_object('state','paused'); end if;
 if s.phase in ('waiting_owner','waiting_permission','review','approved') then return jsonb_build_object('state',s.phase); end if;
 if s.active_run is not null and s.lease_until>clock_timestamp() then return jsonb_build_object('state','working','worker_id',s.active_worker); end if;
 if s.active_run is not null then
  update public.agent_worker_runs set status='failed',error_summary='Interrupted turn; safe to retry',finished_at=now() where id=s.active_run and owner_id=p_owner and status='running';
  update public.agent_project_sessions set active_run=null,active_worker=null,lease_until=null where assignment_id=p_assignment;
 end if;
 if s.last_error<>'' then return jsonb_build_object('state','failed','message',s.last_error); end if;
 if s.turn_count>=18 then
  update public.agent_project_sessions set turn_count=0,execution_cycle=execution_cycle+1,
   recovery_state='diagnosing',recovery_error='Internal work-cycle checkpoint: coordinate the remaining saved work without asking the owner to restart or narrow an already clear assignment.',
   recovery_guidance='',last_error='',next_run_at=now()+interval '15 seconds',updated_at=now() where assignment_id=p_assignment and owner_id=p_owner;
  return jsonb_build_object('state','recovering','message','Alex is coordinating the next internal work cycle; the same project will continue within its existing allowance.');
 end if;
 if s.next_run_at>clock_timestamp() then return jsonb_build_object('state','ready','retry_at',s.next_run_at); end if;
 update public.agent_worker_runs set status='failed',error_summary='Interrupted worker',finished_at=now() where owner_id=p_owner and status='running' and created_at<now()-interval '2 minutes';
 if exists(select 1 from public.agent_worker_runs where owner_id=p_owner and status='running') then return jsonb_build_object('state','busy'); end if;
 select count(*),min(created_at)+interval '1 hour' into used,retry from (select created_at from public.agent_worker_runs where owner_id=p_owner and created_at>now()-interval '1 hour' union all select created_at from public.agent_secretary_ai_calls where owner_id=p_owner and created_at>now()-interval '1 hour') allowance;
 if used>=10 then
  update public.agent_project_sessions set next_run_at=retry,updated_at=now() where assignment_id=p_assignment;
  return jsonb_build_object('state','budget','retry_at',retry,'message','Free worker allowance reached. Saved work will resume when the allowance resets.');
 end if;
 who:=case when s.recovery_state='diagnosing' then 'alex' else coalesce(s.peer_target,s.next_worker) end;
 insert into public.agent_worker_runs(owner_id,assignment_id,employee_id,status,provider,model)
 values(p_owner,p_assignment,who,'running',p_provider,p_model) returning id into r;
 update public.agent_project_sessions set active_run=r,active_worker=who,lease_until=now()+interval '90 seconds',updated_at=now() where assignment_id=p_assignment returning * into s;
 update public.agent_team_assignments set coordination_status=case when s.phase='planning' then 'planning' else 'working' end,status='in_progress',updated_at=now() where id=p_assignment;
 return jsonb_build_object('state','claimed','run_id',r,'session',to_jsonb(s));
end; $function$

;
