-- Owner-scoped updates for messages, access requests and business work.
-- Existing RLS policies restrict incoming records to the signed-in owner.
do $$
declare source_table text;
begin
 for source_table in
  select unnest(array[
   'agent_messages',
   'agent_permission_requests',
   'agent_team_assignments',
   'agent_task_steps',
   'agent_action_proposals'
  ])
 loop
  if not exists (
   select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename=source_table
  ) then
   execute format('alter publication supabase_realtime add table public.%I',source_table);
  end if;
 end loop;
end $$;
