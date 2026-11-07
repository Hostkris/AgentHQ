-- Seed time-blocked, Sunday-Friday Agent HQ reminders from the owner's private
-- source-of-truth planning boards. Private income, savings and work schedules remain
-- in RLS-protected rows; none are hardcoded in this migration.
do $$
declare s record; w jsonb; c jsonb; row jsonb; slot jsonb; iday integer;
        d text; t text; part text; task text; v_details text; tag text; first_day date;
        task_time time; weekly_days integer[]=array[1,2,3,4,5];
begin
 for s in select owner_id,timezone from public.agent_secretary_settings loop
  select payload into w from public.agent_hq_board_snapshots where owner_id=s.owner_id and board_key='weekly';
  select payload into c from public.agent_hq_board_snapshots where owner_id=s.owner_id and board_key='cleaning';
  if w is null or c is null then continue;end if;
  -- The late board shows reading at 7:40 PM. Preserve its earlier chosen book and cadence.
  update public.agent_secretary_items
   set local_time='19:40',next_due_at=public.next_secretary_local(now(),timezone,'19:40',array[0,1,2,3,4,5]),
       details=left(public.agent_secretary_items.details||' User board: weekday 7:40–8:05 PM reading, four actual pages on the selected cadence; Saturday free.',4000),
       data=data||jsonb_build_object('source_board','weekly','reference_time','19:40','reference_end','20:05'),
       version=version+1,updated_at=now()
   where owner_id=s.owner_id and kind='reminder' and status='active' and data ? 'reading_goal'
    and (data->>'source_board') is distinct from 'weekly';

  -- Repeatable rhythm blocks not covered by a specific business, cleaning or gym rotation.
  for slot in select value from jsonb_array_elements(w->'rhythm') loop
   t:=slot->>0;d:=slot->>1;task:=slot->>2;
   if t not in ('06:30','08:15','14:30','18:30','19:20','20:05','20:20') then continue;end if;
   tag:='rhythm-'||t;
   if exists(select 1 from public.agent_secretary_items where owner_id=s.owner_id and data->>'board_tag'=tag) then continue;end if;
   v_details:=task||coalesce(' · Scheduled end: '||d,'')||'. Saved from the uploaded Weekly Organization Board.';
   if t='18:30' then
    v_details:=v_details||' IMPORTANT: This board lists dinner after 6:30 PM but the earlier 5 PM eating-cutoff preference remains active. Ask the owner which to follow; do not infer a clinical eating plan.';
   end if;
   if t='14:30' then
    v_details:=v_details||' If work extends until 3 PM, keep recovery time and shorten the next business block. Do not claim the work shift ended on time.';
   end if;
   insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,next_due_at,data)
    values(s.owner_id,'reminder',left(task,180),left(details,4000),s.timezone,t::time,weekly_days,
     public.next_secretary_local(now(),s.timezone,t::time,weekly_days),
     jsonb_build_object('source_board','weekly','board_tag',tag,'end',d,'optional',coalesce((slot->>3)::boolean,false)));
  end loop;

  -- Exact weekday sales-first business rotation, 3:00–4:00 PM.
  for row in select value from jsonb_array_elements(w->'business_days') loop
   iday:=(row->>'dow')::integer;
   tag:='business-'||iday::text;
   if exists(select 1 from public.agent_secretary_items where owner_id=s.owner_id and data->>'board_tag'=tag) then continue;end if;
   insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,next_due_at,data)
    values(s.owner_id,'reminder','Business 3–4 PM · '||left(row->>'title',140),
      left(row->>'description'||'. Sales-first focus, 3–4 PM (if work lasts until 3, use a shorter 15–25 minute focus). Draft/research is allowed; publishing, messaging others and spending still require owner approval.',4000),
      s.timezone,'15:00',array[iday],public.next_secretary_local(now(),s.timezone,'15:00',array[iday]),
      jsonb_build_object('source_board','weekly','board_tag',tag,'autocatchup',true,'goal_kind',case when iday in (1,4) then 'arbitrage' when iday in (2,5) then 'skincare' else 'content' end,'end','16:00'));
  end loop;

  -- User's 20-minute cleaning reset at 4–4:20 PM, using the supplied daily and day-focus checklists.
  for row in select value from jsonb_array_elements(c->'days') loop
   iday:=(row->>'dow')::integer;
   if iday=6 then continue;end if;
   tag:='cleaning-'||iday::text;
   if exists(select 1 from public.agent_secretary_items where owner_id=s.owner_id and data->>'board_tag'=tag) then continue;end if;
   v_details:='Daily 20-minute reset: '||(select string_agg(value#>>'{}','; ') from jsonb_array_elements(c->'daily_reset'))||
     '. '||row->>'day'||' focus ('||row->>'title'||'): '||
     (select string_agg(value#>>'{}','; ') from jsonb_array_elements(row->'items'))||
     '. Only do what can reasonably fit; record remaining work. No Saturday cleaning.';
   insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,next_due_at,data)
    values(s.owner_id,'reminder',left('Home reset · '||(row->>'title'),180),left(details,4000),s.timezone,
      case when iday=0 then '13:00'::time else '16:00'::time end,array[iday],
      public.next_secretary_local(now(),s.timezone,case when iday=0 then '13:00'::time else '16:00'::time end,array[iday]),
      jsonb_build_object('source_board','cleaning','board_tag',tag,'autocatchup',iday between 1 and 5,'end',case when iday=0 then '13:30' else '16:20' end));
  end loop;

  -- Exact five-day 5–6:30 PM workout rotation, both editable plan and a reminder.
  for row in select value from jsonb_array_elements(w->'gym_days') loop
   iday:=(row->>'dow')::integer;tag:='gym-'||iday::text;
   v_details:=(row->>'details')||'. 5:00–6:30 PM LA Fitness (90 minutes). Warm up and cool down. Sauna optional 10 minutes 2–3 sessions per week. Do not infer completion, sets or performance.';
   if not exists(select 1 from public.agent_secretary_items where owner_id=s.owner_id and data->>'board_tag'=tag||'-plan') then
    insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,data)
     values(s.owner_id,'workout','LA Fitness · '||row->>'day',v_details,s.timezone,'17:00',array[iday],
      jsonb_build_object('source_board','weekly','board_tag',tag||'-plan'));
   end if;
   if not exists(select 1 from public.agent_secretary_items where owner_id=s.owner_id and data->>'board_tag'=tag) then
    insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,next_due_at,data)
     values(s.owner_id,'reminder','LA Fitness 5–6:30 · '||row->>'day',v_details,s.timezone,'17:00',array[iday],
      public.next_secretary_local(now(),s.timezone,'17:00',array[iday]),
      jsonb_build_object('source_board','weekly','board_tag',tag,'end','18:30'));
   end if;
  end loop;

  -- Sunday remains light and Saturday completely free.
  for slot in select value from jsonb_array_elements(w->'weekend'->'sunday') with ordinality as t(value,ordinality) loop
    part:=slot#>>'{}';
    if position('weekly planning' in lower(part))>0 then
      tag:='sunday-weekly-planning';task_time:='11:00';
    elsif position('tiktok live' in lower(part))>0 then
      tag:='sunday-tiktok-optional';task_time:='12:00';
    else continue;end if;
    if exists(select 1 from public.agent_secretary_items where owner_id=s.owner_id and data->>'board_tag'=tag) then continue;end if;
    insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,next_due_at,data)
     values(s.owner_id,'reminder',left('Sunday · '||part,180),
      'Owner board: '||part||'. Optional items are not mandatory; Saturday remains off.',s.timezone,task_time,array[0],
      public.next_secretary_local(now(),s.timezone,task_time,array[0]),
      jsonb_build_object('source_board','weekly','board_tag',tag,'optional',true));
  end loop;

  -- First eligible day of month financial board review: check real bills and cash rather than declaring the pictured snapshot current.
  if not exists(select 1 from public.agent_secretary_items where owner_id=s.owner_id and data->>'board_tag'='monthly-financial-review') then
    insert into public.agent_secretary_items(owner_id,kind,title,details,timezone,local_time,weekdays,next_due_at,data)
     values(s.owner_id,'reminder','Review Monthly Financial Board',
      'Review income, bill amounts, food, savings and actual available cash. Figures in the uploaded boards are historic planning snapshots. Preserve a liquid $1,000 floor as a user goal, confirm unpaid bills, and do not allocate the same overflow to both flipping and investments. No financial transaction is authorized.',s.timezone,'10:30',array[0,1,2,3,4,5],
      public.next_secretary_local(now(),s.timezone,'10:30',array[0,1,2,3,4,5]),
      '{"source_board":"financial","board_tag":"monthly-financial-review","monthly_review":true,"intake_type":"routine"}'::jsonb);
  end if;
  -- Previously set reminders to check notifications are also covered by the Saturday-off instruction.
  update public.agent_secretary_items set weekdays=array_remove(weekdays,6),
    next_due_at=case when local_time is not null then public.next_secretary_local(now(),timezone,local_time,array_remove(weekdays,6)) else next_due_at end,
    version=version+1,updated_at=now()
   where owner_id=s.owner_id and status='active' and kind='reminder' and 6=any(weekdays)
    and lower(title)='look at my notifications' and coalesce(data->>'repeat','daily')<>'none';
 end loop;
end $$;