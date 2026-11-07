-- Owners may pause/dismiss their own ideas and disable remembered topics.
-- Model-generated titles, citations and project IDs remain server-only.
grant update(status,updated_at) on public.agent_hq_autonomy_ideas to authenticated;
grant update(disabled) on public.agent_hq_worker_patterns to authenticated;
