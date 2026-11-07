-- Applied migration creates a catch-up task only when a scheduled four-page reading session was neither acknowledged nor reported complete.
-- Agent-HQ server function; service_role-only invocation from authenticated scheduler.
CREATE OR REPLACE FUNCTION public.agent_hq_capture_unfinished_reading(p_owners uuid[], p_clock timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d record; report public.agent_hq_daily_checkins; read_count integer; remaining integer; n integer:=0; source_day date; title_text text;
begin
 for d in
  select notice.id as delivery_id,notice.owner_id,notice.scheduled_at,
   item.timezone,item.data,item.title,notice.action_state
  from public.agent_secretary_deliveries notice
  join public.agent_secretary_items item on item.id=notice.item_id and item.owner_id=notice.owner_id
  where notice.owner_id=any(p_owners) and notice.kind='reminder'
   and notice.status='saved' and notice.action_state='open'
   and item.status='active' and item.kind='reminder'
   and (item.data->>'reading_goal') ~ '^[1-9][0-9]?$'
   and btrim(coalesce(item.data->>'book_title',''))<>''
   and notice.scheduled_at>p_clock-interval '8 days'
   and (notice.scheduled_at at time zone item.timezone)::date<(p_clock at time zone item.timezone)::date
   and not exists(
     select 1 from public.agent_secretary_items existing
     where existing.owner_id=notice.owner_id and existing.data->>'source_reading_delivery_id'=notice.id::text)
  order by notice.scheduled_at limit 30
 loop
  source_day:=(d.scheduled_at at time zone d.timezone)::date;
  select * into report from public.agent_hq_daily_checkins
   where owner_id=d.owner_id and local_date=source_day and submitted_at is not null;
  read_count:=case
   when report.fields->>'reading'='yes' then greatest(4,case when coalesce(report.fields->>'pages_read','') ~ '^[0-9]{1,3}$' then (report.fields->>'pages_read')::integer else 0 end)
   when coalesce(report.fields->>'pages_read','') ~ '^[0-9]{1,3}$' then (report.fields->>'pages_read')::integer
   else 0 end;
  remaining:=greatest(0,least(99,(d.data->>'reading_goal')::integer)-read_count);
  if remaining=0 then continue;end if;
  title_text:='Read '||remaining||' unfinished page'||case when remaining=1 then '' else 's' end||' · '||left(d.data->>'book_title',105);
  insert into public.agent_secretary_items(owner_id,kind,title,details,status,timezone,weekdays,due_at,next_due_at,data)
  values(d.owner_id,'task',title_text,
    'Unfinished four-page reading session from '||source_day::text||'. Book: '||left(d.data->>'book_title',180)||
    '. Report pages actually completed. Eleanor will move this task to the next available non-Saturday opening.',
    'active',d.timezone,array[0,1,2,3,4,5],d.scheduled_at,d.scheduled_at,
    jsonb_build_object('source_reading_delivery_id',d.delivery_id::text,'source_reading_date',source_day::text,
      'auto_rollover',true,'reading_catchup_pages',remaining,'book_title',left(d.data->>'book_title',180)));
  n:=n+1;
 end loop;
 return n;
end $function$
;
revoke all on function public.agent_hq_capture_unfinished_reading(uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.agent_hq_capture_unfinished_reading(uuid[],timestamptz) to service_role;
