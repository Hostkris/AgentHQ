-- Native Agent HQ Worker Studio. Owner-private bot profiles and conversations.
-- These agents never receive browser, filesystem, OAuth, email or publishing access by activation.
create table public.agent_custom_bots (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 2 and 60),
 role text not null check(char_length(btrim(role)) between 3 and 120),
 mission text not null check(char_length(btrim(mission)) between 10 and 1200),
 tone text not null check(char_length(btrim(tone)) between 2 and 200),
 instructions text not null check(char_length(btrim(instructions)) between 20 and 4500),
 skills text[] not null default '{}',
 anti_jobs text[] not null default '{}',
 starting_message text not null default 'How can I help?' check(char_length(starting_message) between 1 and 700),
 category text not null default 'personal' check(category in
 ('personal','research','marketing','productivity','writing','engineering','operations')),
 avatar_emoji text not null default '🤖' check(char_length(avatar_emoji) between 1 and 12),
 template_key text not null default '' check(char_length(template_key)<=80),
 status text not null default 'draft' check(status in ('draft','active','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint worker_skills_limit check(cardinality(skills)<=12),
 constraint worker_anti_jobs_limit check(cardinality(anti_jobs)<=12),
 unique(owner_id,id)
);
create index agent_custom_bots_owner on public.agent_custom_bots(owner_id,status,created_at desc);
alter table public.agent_custom_bots enable row level security;
alter table public.agent_custom_bots force row level security;
revoke all on public.agent_custom_bots from public,anon,authenticated;
grant select on public.agent_custom_bots to authenticated;
create policy "owners see their custom bots" on public.agent_custom_bots
 for select to authenticated using(owner_id=(select auth.uid()));

create table public.agent_custom_bot_messages (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 bot_id uuid not null,
 sender text not null check(sender in ('owner','worker')),
 body text not null check(char_length(btrim(body)) between 1 and 6000),
 created_at timestamptz not null default now(),
 foreign key(owner_id,bot_id) references public.agent_custom_bots(owner_id,id) on delete cascade
);
create index agent_custom_bot_messages_owner on public.agent_custom_bot_messages(owner_id,bot_id,created_at desc);
alter table public.agent_custom_bot_messages enable row level security;
alter table public.agent_custom_bot_messages force row level security;
revoke all on public.agent_custom_bot_messages from public,anon,authenticated;
grant select on public.agent_custom_bot_messages to authenticated;
create policy "owners read custom bot conversations" on public.agent_custom_bot_messages
 for select to authenticated using(owner_id=(select auth.uid()));

comment on table public.agent_custom_bots is
 'Owner-built AI specialist specifications inspired by public agent-design workflows; no implicit external permissions or continuous background runtime.';
comment on table public.agent_custom_bot_messages is
 'Private saved owner-to-custom-worker chat; replies are generated only on an explicit action, not continuous monitoring.';
