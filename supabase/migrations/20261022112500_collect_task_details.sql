alter table public.agent_chat_states drop constraint if exists agent_chat_states_stage_check;
alter table public.agent_chat_states add constraint agent_chat_states_stage_check
check(stage in ('idle','collecting_task','confirm_task','confirm_resume','confirm_permission'));