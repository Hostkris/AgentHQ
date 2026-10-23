-- Existing live projects already have this constraint. Reapplication is harmless.
do $$
begin
 if not exists(
  select 1 from pg_constraint
  where conrelid='public.agent_task_steps'::regclass
    and conname='agent_task_steps_no_alex_execution'
 ) then
  alter table public.agent_task_steps
   add constraint agent_task_steps_no_alex_execution
   check (employee_id <> 'alex');
 end if;
end $$;
