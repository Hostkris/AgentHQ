-- Phase 7: audited action proposals. No provider API call is executed by these records.
create table public.agent_action_proposals (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 employee_id text not null check(employee_id in ('alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq')),
 provider text not null check(provider in ('meta_ads','facebook','instagram','tiktok','manychat','email','youtube','other')),
 action_kind text not null check(action_kind in ('read_metrics','change_ad_budget','create_content','publish_content','reply_to_comment','create_automation','send_email','other')),
 summary text not null check(char_length(summary) between 5 and 800),
 scope text not null check(char_length(scope) between 5 and 1200),
 detail jsonb not null default '{}'::jsonb check(jsonb_typeof(detail)='object' and pg_column_size(detail)<=4096),
 status text not null default 'pending' check(status in ('pending','approved','denied')),
 execution_status text not null default 'not_connected' check(execution_status='not_connected'),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 constraint agent_action_decided_check check (
   (status='pending' and decided_at is null) or
   (status in ('approved','denied') and decided_at is not null)
 )
);
create index agent_action_proposals_owner_created on public.agent_action_proposals(owner_id,created_at desc);
alter table public.agent_action_proposals enable row level security;
alter table public.agent_action_proposals force row level security;
revoke all on public.agent_action_proposals from public,anon,authenticated;
grant select on public.agent_action_proposals to authenticated;
create policy "owner views proposed actions" on public.agent_action_proposals
 for select to authenticated using(owner_id=(select auth.uid()));
alter table public.agent_chat_states add column action_proposal_id uuid
 references public.agent_action_proposals(id) on delete set null;
alter table public.agent_chat_states drop constraint if exists agent_chat_states_stage_check;
alter table public.agent_chat_states add constraint agent_chat_states_stage_check
 check(stage in ('idle','collecting_task','confirm_task','confirm_resume','confirm_permission','confirm_action'));
comment on table public.agent_action_proposals is
 'Owner-scoped action requests; approving authorizes a proposal record only. External execution is disabled until an explicitly scoped provider integration is developed.';
