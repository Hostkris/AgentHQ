-- Owner-private progress thermometers for Agent HQ household and business goals.
-- The bars measure verified-in-app milestone completion, not predicted revenue or spend.
create table public.agent_hq_goals (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 slug text not null check (char_length(slug) between 3 and 100),
 kind text not null check (kind in ('home','arbitrage','skincare','other')),
 title text not null check (char_length(title) between 3 and 180),
 description text not null default '' check (char_length(description)<=4000),
 target_outcome text not null default '' check (char_length(target_outcome)<=1200),
 budget_cap_cents bigint check (budget_cap_cents is null or budget_cap_cents between 0 and 100000000000),
 spent_cents bigint not null default 0 check (spent_cents between 0 and 100000000000),
 status text not null default 'active' check (status in ('active','paused','archived')),
 project_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,slug),unique(owner_id,id)
);
create table public.agent_hq_goal_milestones (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 goal_id uuid not null,
 position integer not null check (position between 1 and 200),
 title text not null check (char_length(title) between 3 and 240),
 details text not null default '' check (char_length(details)<=4000),
 weight integer not null default 1 check (weight between 1 and 20),
 status text not null default 'pending' check (status in ('pending','done')),
 requires_evidence boolean not null default false,
 evidence text not null default '' check (char_length(evidence)<=1200),
 due_at timestamptz,
 calendar_task_id uuid,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,goal_id,position),
 foreign key(owner_id,goal_id) references public.agent_hq_goals(owner_id,id) on delete cascade,
 constraint milestone_evidence_gate check (status<>'done' or not requires_evidence or length(btrim(evidence))>3)
);
create index agent_hq_goals_owner_active on public.agent_hq_goals(owner_id,updated_at desc);
create index agent_hq_goal_milestones_owner_goal on public.agent_hq_goal_milestones(owner_id,goal_id,position);
create unique index agent_hq_goal_milestones_link_once on public.agent_hq_goal_milestones(owner_id,calendar_task_id) where calendar_task_id is not null;
alter table public.agent_hq_goals enable row level security;
alter table public.agent_hq_goals force row level security;
alter table public.agent_hq_goal_milestones enable row level security;
alter table public.agent_hq_goal_milestones force row level security;
revoke all on public.agent_hq_goals,public.agent_hq_goal_milestones from public,anon,authenticated;
grant select,insert,update,delete on public.agent_hq_goals,public.agent_hq_goal_milestones to authenticated;
grant all on public.agent_hq_goals,public.agent_hq_goal_milestones to service_role;
create policy hq_goal_read on public.agent_hq_goals for select to authenticated using(owner_id=(select auth.uid()));
create policy hq_goal_insert on public.agent_hq_goals for insert to authenticated with check(owner_id=(select auth.uid()));
create policy hq_goal_update on public.agent_hq_goals for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy hq_goal_delete on public.agent_hq_goals for delete to authenticated using(owner_id=(select auth.uid()));
create policy hq_goal_service on public.agent_hq_goals to service_role using(true) with check(true);
create policy hq_step_read on public.agent_hq_goal_milestones for select to authenticated using(owner_id=(select auth.uid()));
create policy hq_step_insert on public.agent_hq_goal_milestones for insert to authenticated
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.agent_hq_goals g where g.id=goal_id and g.owner_id=(select auth.uid())));
create policy hq_step_update on public.agent_hq_goal_milestones for update to authenticated
 using(owner_id=(select auth.uid()))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.agent_hq_goals g where g.id=goal_id and g.owner_id=(select auth.uid())));
create policy hq_step_delete on public.agent_hq_goal_milestones for delete to authenticated using(owner_id=(select auth.uid()));
create policy hq_step_service on public.agent_hq_goal_milestones to service_role using(true) with check(true);

-- A task marked complete on Eleanor's Agent HQ Calendar advances its own linked goal once.
create or replace function public.agent_hq_goal_calendar_completion() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='task' and new.status='completed' then
  update public.agent_hq_goal_milestones
   set status='done',completed_at=now(),updated_at=now(),
    evidence=case when requires_evidence then evidence else coalesce(nullif(evidence,''),'Marked completed in Agent HQ Calendar') end
  where owner_id=new.owner_id and calendar_task_id=new.id and status<>'done'
   and (not requires_evidence or length(btrim(evidence))>3);
 end if;
 return new;
end $$;
revoke all on function public.agent_hq_goal_calendar_completion() from public,anon,authenticated;
grant execute on function public.agent_hq_goal_calendar_completion() to service_role;
create trigger agent_hq_goal_calendar_completed
 after update of status on public.agent_secretary_items
 for each row when (old.status is distinct from new.status and new.status='completed')
 execute function public.agent_hq_goal_calendar_completion();

-- Seed meaningful zero-completion roadmaps. An unverified sale never starts at 100%.
do $$
declare o record; g uuid; m uuid; task uuid; steps jsonb; rec record; target_time time; due timestamptz;
begin
 for o in select owner_id,timezone,bot_id from public.agent_secretary_settings loop
  for rec in select * from (values
    ('elysian-noir-customers','skincare','Elysian Noir · customer growth',
     'Build the first repeatable, sustainable customer-acquisition process for the existing skincare store. Verify everything against actual Shopify/Selfnamed records; do not assume traffic, margins, purchases or sales.',
     'Record a real paid customer order and a measurable plan for acquiring the next customer.'),
    ('arbitrage-business-launch','arbitrage','Arbitrage · launch to first profitable sale',
     'Explore a lawful online or retail resale arbitrage model. Confirm what products to source, actual starting capital, marketplace fees, returns, tax and fulfillment requirements before any purchase.',
     'Record a first real sale with positive net profit after product, platform, shipping and other costs.')
   ) as seed(slug,kind,title,description,target_outcome)
  loop
   insert into public.agent_hq_goals(owner_id,slug,kind,title,description,target_outcome)
    values(o.owner_id,rec.slug,rec.kind,rec.title,rec.description,rec.target_outcome)
    on conflict(owner_id,slug) do nothing;
   select id into g from public.agent_hq_goals where owner_id=o.owner_id and slug=rec.slug;
   if rec.kind='skincare' then
    steps:=jsonb_build_array(
     jsonb_build_object('title','Audit live Shopify store and checkout','details','Check mobile storefront, product pages, navigation, working checkout and shipping claims with actual access. Do not invent analytics.'),
     jsonb_build_object('title','Confirm supplier costs and sustainable product margins','details','Use actual Selfnamed costs, shipping and fees to verify pricing and the target approximate 30–35% product margin; do not change store prices without approval.'),
     jsonb_build_object('title','Select customer segment and 3 hero products','details','Document customer needs, brand voice, differentiated product offers and which SKUs to feature based on verified listings.'),
     jsonb_build_object('title','Prepare a safe and credible product-content library','details','Draft approved descriptions, compliant cosmetic claims, high-quality imagery, FAQs and FAQ objections; no unsupported medical promises.'),
     jsonb_build_object('title','Build an organic content and customer-outreach calendar','details','Maya and Taylor draft posts, short videos and permission-based outreach for owner review; no automatic posting or unsolicited messaging.'),
     jsonb_build_object('title','Configure trustworthy acquisition and order metrics','details','Track real store visitors, product page views, checkout attempts, conversions and gross margin only after analytics are actually connected.'),
     jsonb_build_object('title','Launch owner-approved customer acquisition pilot','details','Use approved creative, small experiments and customer feedback; spend zero until a specific budget and approval are confirmed.'),
     jsonb_build_object('title','Record first verified paid order and repeatable next action','details','Attach owner-reported Shopify order evidence, review actual costs, and identify the highest-return next acquisition step.','requires_evidence',true)
    );
    target_time:='15:30';
   else
    steps:=jsonb_build_array(
     jsonb_build_object('title','Choose the specific arbitrage model and product categories','details','Compare retail versus online resale and choose permissible product categories. Do not buy stock yet.'),
     jsonb_build_object('title','Set starting cash budget and minimum net-margin rule','details','Ask the owner for a hard spending cap. Factor purchase cost, taxes, marketplace fees, shipping, returns and unsold inventory risk; research without spending.'),
     jsonb_build_object('title','Verify marketplace rules, resale and tax requirements','details','Research applicable current seller policies, sales-tax and business-registration requirements for intended location and products; seek professional verification when necessary.'),
     jsonb_build_object('title','Build a product-level arbitrage profitability calculator','details','Use sourced prices and real platform fees, not optimistic estimates. Show per-unit landed cost, net profit, break-even and downside.'),
     jsonb_build_object('title','Vet sourcing methods and fulfillment/return process','details','Compare sources, restrictions, packaging, shipping and refund process; reject counterfeit, prohibited and high-risk listings.'),
     jsonb_build_object('title','Review the first low-risk sourcing shortlist','details','Have Riley and Avery verify listings, fees and margin assumptions. Owner must approve any money or account commitments.'),
     jsonb_build_object('title','Complete the owner-approved pilot listing or purchase','details','Only after spending approval, permitted supplier sourcing and marketplace authorization. Save an itemized cost record and actual listing.'),
     jsonb_build_object('title','Document first verified profitable sale','details','Enter an actual sale and net positive profit after costs. A listing or planned sale does not count as income.','requires_evidence',true)
    );
    target_time:='16:30';
   end if;
   for m in select null::uuid loop exit;end loop;
   for rec in select value,ordinality from jsonb_array_elements(steps) with ordinality loop
    insert into public.agent_hq_goal_milestones(owner_id,goal_id,position,title,details,requires_evidence)
     values(o.owner_id,g,rec.ordinality,rec.value->>'title',rec.value->>'details',coalesce((rec.value->>'requires_evidence')::boolean,false))
     on conflict(owner_id,goal_id,position) do nothing;
   end loop;
   select id into m from public.agent_hq_goal_milestones where owner_id=o.owner_id and goal_id=g and position=1;
   select id into task from public.agent_secretary_items where owner_id=o.owner_id and data->>'goal_milestone_id'=m::text limit 1;
   if task is null then
    due:=public.next_secretary_local(now(),o.timezone,target_time,array[0,1,2,3,4,5]);
    insert into public.agent_secretary_items(owner_id,kind,title,details,status,timezone,weekdays,due_at,next_due_at,data)
     select o.owner_id,'task',left(rec.title||' · '||s.title,180),s.details,'active',o.timezone,array[0,1,2,3,4,5],due,due,
      jsonb_build_object('goal_id',g,'goal_milestone_id',m,'auto_rollover',true,'plan_only',true)
      from public.agent_hq_goal_milestones s where s.id=m returning id into task;
   end if;
   update public.agent_hq_goal_milestones set calendar_task_id=task,
    due_at=(select due_at from public.agent_secretary_items where id=task)
    where id=m and owner_id=o.owner_id and calendar_task_id is null;
  end loop;
  insert into public.agent_secretary_deliveries(owner_id,kind,occurrence_key,scheduled_at,status,action_state,body,saved_at,push_state)
   values(o.owner_id,'task','goal-thermometers-intake-20261107',now(),'saved','open',
     'Eleanor · Your Agent HQ goal board is ready: separate zero-start progress thermometers for Elysian Noir customer growth and arbitrage launch. The first planning step for each is on the internal Calendar. What household work needs doing, and what is the maximum amount you want to spend? I can create its budget and milestone plan. Money-related ChatGPT requests will need your approval.',now(),'pending')
   on conflict(owner_id,occurrence_key) do nothing;
  if o.bot_id is not null then
   insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body) values
    (o.owner_id,o.bot_id,'worker','Eleanor · Your goals dashboard is prepared. I have set up separate milestone trackers for Elysian Noir customer acquisition and starting an arbitrage business. Each begins at 0% until real stages are done. First planning steps are on the Agent HQ Calendar. What household repair, maintenance or improvement work do you need to do? Tell me your budget ceiling, urgency and whether you prefer DIY or a professional. I will help organize it. For budget analysis that needs ChatGPT, I will open a money-related request for your approval; I cannot spend or publish for you.');
  end if;
 end loop;
end $$;
comment on table public.agent_hq_goals is 'Private goal thermometers: reported milestone progress, budget caps, and owner-reported spending; no automatically verified sales.';
comment on table public.agent_hq_goal_milestones is 'Each milestone is an actual checked stage. Final revenue milestones require owner-supplied evidence and have no automatic financial confirmation.';
