-- Owner-requested internal planning for the two seeded Agent HQ business goals.
-- Creates saved Alex-coordinated draft projects only. No spending, public release, or external account action.
do $$
declare g public.agent_hq_goals;result jsonb;brief text;workers text;
begin
 for g in select * from public.agent_hq_goals where kind in ('skincare','arbitrage') and project_id is null for update loop
  if g.kind='skincare' then
   brief:='Elysian Noir — customer-growth and first-sales working plan.'||chr(10)||
    'Owner goal: develop a sustainable, verifiable flow of customers for the existing skincare Shopify store, currently using Selfnamed products. Prioritize a quiet-luxury brand voice with approachable pricing. Verify all product, cost, shipping, margin, traffic and sales facts from authorized records; do not fabricate success.'||chr(10)||
    'Use Alex as coordinator, Maya/Taylor/Casey for customer and content strategy, Riley for current source-backed market/competitive research, Avery for unit economics and a conservative customer acquisition budget, and Jamie for an actionable Sunday-Friday calendar.'||chr(10)||
    'Deliver: a mobile-store audit checklist, pricing and margin audit plan, 3 hero-product selection criteria, buyer personas, objection-handling FAQ drafts, creative asset/organic post plan, 30/60/90-day customer acquisition milestones, weekly conversion metrics, and an immediate no-spend first-week plan. The owner previously preferred roughly 30–35% product margins; recheck against true supplier costs and transaction fees.'||chr(10)||
    'Only the owner may approve specific advertising spend, price changes, account connections, publication or outreach. Never claim a sale or revenue until an actual owner-confirmed Shopify record exists. Report blockers and the next smallest useful action to Eleanor for review.';
  else
   brief:='Arbitrage business — practical startup and first-positive-net-sale financial plan.'||chr(10)||
    'The owner wants a low-cost, well-researched resale arbitrage business but has not yet selected retail or online model, product categories, starting budget, marketplaces or sources. Ask only for the essential owner decisions after comparing options. No purchases or new paid connections are authorized.'||chr(10)||
    'Use Alex to coordinate, Riley for source-backed current platform/resale market research, Avery for the budget, break-even and fee-aware profitability calculator, Jamie for Sunday-Friday calendar staging, and any other existing qualified Agent HQ worker only within the approved planning scope.'||chr(10)||
    'Deliver: a comparison of legal/permitted arbitrage channels, current platform fee and restriction research, expense and inventory-risk breakdown, cash-conserving sourcing criteria, shipping/returns procedures, 30/60/90-day plan with milestones, a transparent purchase-versus-sale net-profit worksheet concept, and a pilot plan with firm budget decision gates. Clearly distinguish estimates from verified prices and explain tax/registration rules require local verification.'||chr(10)||
    'Stop before purchases, paid listings, store account changes, and other external commitments; return decision points to the owner through Eleanor. First profitable sale must be supported by an actual, owner-reported net-positive transaction.';
  end if;
  result:=public.create_agent_workspace_project(g.owner_id,'alex',brief,jsonb_build_object(
   'project_kind','business','output_format','markdown',
   'completion_criteria',case when g.kind='skincare'
     then 'Source-backed first-customer acquisition plan with real, measurable milestones and transparent costs; no assumed orders.'
     else 'Source-backed, budget-gated arbitrage startup plan and pilot net-profit worksheet; no money spent.' end));
  if result->>'id' is null then raise exception 'Could not create the goal project';end if;
  update public.agent_hq_goals set project_id=(result->>'id')::uuid,updated_at=now() where id=g.id and owner_id=g.owner_id;
  insert into public.agent_custom_bot_messages(owner_id,bot_id,sender,body)
   select g.owner_id,s.bot_id,'worker','Eleanor · Alex’s team now has an internal planning project linked to '||g.title||
    '. The goal thermometer remains at 0% until actual milestones are completed. The project is drafting only; spending, store edits, advertising, publishing and external commitments still need your approval. Open Eleanor’s Goals board or Projects to review.'
   from public.agent_secretary_settings s where s.owner_id=g.owner_id and s.bot_id is not null;
 end loop;
end $$;