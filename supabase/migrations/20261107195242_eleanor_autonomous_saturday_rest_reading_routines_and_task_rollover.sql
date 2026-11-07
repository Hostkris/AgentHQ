-- Applied migration also seeded owner-requested reminders (7:45 multivitamin, 8:00 vinegar, 16:45 eating cutoff, 19:00 four-page reading, 09:00 monthly weigh-in) and removed Saturday from existing daily reminders and briefings.
-- Agent-HQ server function; service_role-only invocation from authenticated scheduler.
CREATE OR REPLACE FUNCTION public.agent_hq_rollover_missed_tasks(p_owners uuid[], p_clock timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare i public.agent_secretary_items; s public.agent_secretary_settings; 
  day_offset integer; candidate_day date; slot time; proposed timestamptz;
  chosen timestamptz; prior_due timestamptz; rolled integer:=0; k text;
begin
 for i in
  select x.* from public.agent_secretary_items x
  where x.owner_id=any(p_owners) and x.kind='task' and x.status='active'
   and x.due_at is not null and (x.due_at at time zone x.timezone)::date < (p_clock at time zone x.timezone)::date
   and coalesce(x.data->>'auto_rollover','true')='true'
   and coalesce(x.data->>'fixed_due','false')<>'true'
   and coalesce(x.data->>'external_commitment','false')<>'true'
  order by x.due_at limit 60 for update skip locked
 loop
  chosen:=null;prior_due:=i.due_at;
  for day_offset in 0..21 loop
   candidate_day:=(p_clock at time zone i.timezone)::date + day_offset;
   if extract(dow from candidate_day)=6 then continue;end if;
   foreach slot in array array['15:30'::time,'16:30'::time,'18:00'::time,'19:00'::time,'20:00'::time,'10:00'::time,'11:00'::time,'13:00'::time] loop
    proposed:=(candidate_day+slot) at time zone i.timezone;
    if proposed<=p_clock+interval '20 minutes' then continue;end if;
    if exists(select 1 from public.agent_secretary_items busy
       where busy.owner_id=i.owner_id and busy.id<>i.id and busy.status='active'
        and ((busy.kind='meeting' and busy.scheduled_at between proposed-interval '55 minutes' and proposed+interval '55 minutes')
          or (busy.kind='task' and busy.due_at between proposed-interval '55 minutes' and proposed+interval '55 minutes')))
    then continue;end if;
    chosen:=proposed;exit;
   end loop;
   if chosen is not null then exit;end if;
  end loop;
  if chosen is null then continue;end if;
  update public.agent_secretary_items set due_at=chosen,next_due_at=chosen,version=version+1,
   data=jsonb_set(jsonb_set(data,'{previous_due_at}',to_jsonb(prior_due::text),true),
     '{rollover_count}',to_jsonb(least(10000,coalesce((data->>'rollover_count')::integer,0)+1)),true),
   updated_at=p_clock
   where id=i.id and owner_id=i.owner_id;
  update public.agent_secretary_deliveries set status='cancelled'
   where owner_id=i.owner_id and item_id=i.id and status in ('queued','processing');
  k:='auto-rollover:'||i.id::text||':'||((prior_due at time zone i.timezone)::date)::text;
  insert into public.agent_secretary_deliveries(owner_id,kind,occurrence_key,scheduled_at,status,body,saved_at,push_state)
   values(i.owner_id,'task',k,p_clock,'saved',
    'Eleanor · missed Agent HQ workflow: '||i.title||
    '. It was not marked complete on '||to_char(prior_due at time zone i.timezone,'Mon DD')||
    ', so I moved its internal task due time to '||to_char(chosen at time zone i.timezone,'Dy Mon DD, HH12:MI AM')||
    '. Saturday was excluded. Review the Calendar to change or complete the task.',p_clock,'pending')
  on conflict(owner_id,occurrence_key) do nothing;
  select bot_id into s.bot_id from public.agent_secretary_settings where owner_id=i.owner_id;
  if s.bot_id is not null then
   insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body)
    values(i.owner_id,s.bot_id,'worker','Eleanor — missed workflow moved inside Agent HQ'||chr(10)||
      i.title||chr(10)||'Originally due: '||to_char(prior_due at time zone i.timezone,'Dy Mon DD, HH12:MI AM')||
      chr(10)||'New opening: '||to_char(chosen at time zone i.timezone,'Dy Mon DD, HH12:MI AM')||
      chr(10)||'I left Saturday free and avoided other saved appointments and tasks. Edit the time in Calendar or mark complete after you finish.');
  end if;
  rolled:=rolled+1;
 end loop;
 return rolled;
end $function$
;
revoke all on function public.agent_hq_rollover_missed_tasks(uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.agent_hq_rollover_missed_tasks(uuid[],timestamptz) to service_role;
