-- Alex coordinates work but is never a specialist execution step.
alter table public.agent_task_steps
  add constraint agent_task_steps_no_alex_execution
  check (employee_id <> 'alex');
