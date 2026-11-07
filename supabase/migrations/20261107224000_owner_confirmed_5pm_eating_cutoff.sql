-- User-confirmed schedule correction: no eating after 5:00 PM.
-- This updates private owner board snapshots and first-party reminders only.
-- Friday gym and all other unconfirmed scheduling preferences remain unchanged.
do $$
declare person record; weekly_clock text[]:=array['16:20','16:50'];
begin
 for person in
  select s.owner_id,s.timezone
  from public.agent_secretary_settings s
  where exists (
   select 1 from public.agent_hq_board_snapshots b
   cross join lateral jsonb_array_elements(b.payload->'rhythm') as entry(value)
   where b.owner_id=s.owner_id and b.board_key='weekly'
    and entry.value->>0='18:30'
    and entry.value->>2 ilike '%dinner%'
  )
 loop
  update public.agent_hq_board_snapshots b set
    payload=jsonb_set(b.payload,'{rhythm}',(
      select jsonb_agg(r.row_value order by r.position)
      from (
       select ordinality*10 as position,
        case when element->>0='18:30'
          then jsonb_build_array('18:30','19:20','Shower, sauna (optional), evening recovery — no food after 5 PM',true)
          else element end as row_value
       from jsonb_array_elements(b.payload->'rhythm') with ordinality as x(element,ordinality)
       union all
       select 51 as position,jsonb_build_array('16:20','16:50',
        'Dinner before 5 PM — finish eating by 5:00 PM',false) as row_value
       union all
       select 52 as position,jsonb_build_array('16:50','17:00',
        'Transition to LA Fitness; no food after 5 PM',true) as row_value
      ) r
    ),true),
    updated_at=now()
  where b.owner_id=person.owner_id and b.board_key='weekly';

  update public.agent_hq_board_snapshots b set
    payload=jsonb_set(b.payload,'{best_times}',(
      select jsonb_agg(
       case when element->>0 like 'After dinner%'
       then jsonb_build_array('After gym (no eating)',
        'Optional put-away/organizing only; dinner moved before 5 PM.')
       else element end
       order by ordinality)
      from jsonb_array_elements(b.payload->'best_times') with ordinality as x(element,ordinality)
    ),true),updated_at=now()
  where b.owner_id=person.owner_id and b.board_key='cleaning'
   and exists (
    select 1 from jsonb_array_elements(b.payload->'best_times') x(v)
    where x.v->>0 like 'After dinner%'
   );

  update public.agent_secretary_items i set
   title='After gym · shower, optional sauna and recovery',
   details='Evening recovery from 6:30–7:20 PM. Shower, optional sauna, and wind-down only. The owner confirmed no food after 5:00 PM; dinner is scheduled for 4:20–4:50 PM before the gym.',
   data=i.data||jsonb_build_object('eating_cutoff_confirmed','17:00','meal_phase','no_food','end','19:20'),
   version=version+1,updated_at=now()
  where i.owner_id=person.owner_id and i.kind='reminder' and i.status='active'
   and i.data->>'board_tag'='rhythm-18:30'
   and i.title ilike '%dinner%';

  insert into public.agent_secretary_items
   (owner_id,kind,title,details,status,timezone,local_time,weekdays,next_due_at,data)
  select person.owner_id,'reminder','Early dinner · finish eating before 5 PM',
   '4:20–4:50 PM is your preferred dinner window after the 4:00–4:20 cleaning reset. Finish eating before 5:00 PM; no food after 5. If work runs late, adjust other flexible blocks before moving the cutoff. This is an owner-selected routine, not medical instruction.',
   'active',person.timezone,'16:20'::time,array[1,2,3,4,5],
   public.next_secretary_local(now(),person.timezone,'16:20'::time,array[1,2,3,4,5]),
   jsonb_build_object('source_board','weekly','board_tag','meal-before-5pm',
    'end','16:50','owner_confirmed_cutoff','17:00')
  where not exists(
   select 1 from public.agent_secretary_items other
   where other.owner_id=person.owner_id and other.status='active'
    and other.data->>'board_tag'='meal-before-5pm');

  -- Preserve the already-active 4:45 PM cutoff alert and Sunday–Friday cadence.
  update public.agent_secretary_items i set
   details='Owner-confirmed boundary: finish all eating before 5:00 PM; nothing to eat after 5 PM. On weekdays, plan dinner for 4:20–4:50 PM before LA Fitness. This is a personal reminder, not a medical requirement.',
   data=i.data||jsonb_build_object('owner_confirmed_cutoff','17:00','confirmed_by_owner',true),
   version=version+1,updated_at=now()
  where i.owner_id=person.owner_id and i.kind='reminder' and i.status='active'
    and i.title='Eating cutoff — 5 PM';
 end loop;
end $$;