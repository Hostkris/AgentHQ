import {agentCloud} from './agent-cloud-auth.js';
import {goalProgress,budgetStatus,dollars,nextWorkSlot} from './agent-goal-math.js?v=20261107-goal-1';

const icon={home:'🏠',arbitrage:'📦',skincare:'🧴',other:'🎯'};
const safe=v=>String(v??'').slice(0,9000);
const formatted=(value,zone)=>{
 if(!value)return 'Not on Calendar';
 try{return new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))}
 catch{return 'Calendar time not verified'}
};
function cloudRows(){
 const cloud=window.agentHQGoalsCloud;
 return {ready:Boolean(cloud?.loaded?.()),goals:cloud?.all?.()||[],steps:cloud?.steps?.()||[]};
}
function perGoal(goal,steps,items,E,zone){
 const own=steps.filter(s=>s.goal_id===goal.id).sort((a,b)=>a.position-b.position);
 const progress=goalProgress(goal,own),money=budgetStatus(goal),color=goal.kind||'other';
 const cap=money.cap===null?'No spending limit recorded':dollars(money.cap)+' budget ceiling';
 const balance=money.cap===null?'Set a ceiling before buying anything':money.over?dollars(-money.remaining)+' above your ceiling':dollars(money.remaining)+' remaining within ceiling';
 const due=step=>{
  const task=items.find(i=>i.id===step.calendar_task_id);
  return task?.due_at||step.due_at;
 };
 return '<article class="hq-goal-card" data-goal="'+E(goal.id)+'">'+
  '<header><div><small>'+E(icon[color]||'🎯')+' '+E(color==='home'?'Home project':color==='skincare'?'Skincare business':color==='arbitrage'?'Arbitrage business':'Personal goal')+'</small>'+
  '<h3>'+E(goal.title)+'</h3><p>'+E(goal.target_outcome)+'</p></div><span class="hq-goal-ratio">'+progress.completedSteps+' / '+progress.totalSteps+' stages</span></header>'+
  '<div class="hq-goal-visual"><div class="hq-goal-thermometer" role="progressbar" aria-label="'+E(goal.title)+' completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress.percent+'">'+
   '<div class="hq-thermometer-shaft"><span class="hq-thermometer-fill" style="height:'+progress.percent+'%"></span></div><span class="hq-thermometer-bulb"></span></div>'+
   '<div class="hq-goal-progress"><strong>'+progress.percent+'%</strong><span>Completed work only</span><div class="hq-goal-track"><span style="width:'+progress.percent+'%"></span></div>'+
   '<p><strong>Next step:</strong> '+E(progress.next?.title||'All stages recorded; review the evidence before declaring success.')+'</p>'+
   '<p><strong>Budget:</strong> '+E(cap)+' · '+E(balance)+'</p><p><strong>Owner-reported spending:</strong> '+E(dollars(money.spent))+'</p>'+
   (money.over?'<p role="status" class="hq-goal-budget-warning">Reported spending exceeds this goal’s chosen ceiling. No new spending is approved.</p>':'')+
   '</div></div>'+
  '<div class="secretary-actions hq-goal-actions"><button type="button" data-goal-next="'+E(goal.id)+'">Schedule next step</button>'+
   '<button type="button" data-goal-delegate="'+E(goal.id)+'">'+(goal.project_id?'Open Alex’s project':'Delegate planning to Alex + team')+'</button>'+
   '<button type="button" data-goal-chatgpt="'+E(goal.id)+'">Ask ChatGPT for a cost-conscious plan</button></div>'+
  '<details class="hq-goal-details"><summary>Milestones and work history · '+progress.completedSteps+' complete</summary>'+
   '<ol class="hq-goal-milestone-list">'+own.map(step=>{
    const current=items.find(i=>i.id===step.calendar_task_id);
    const done=step.status==='done'||current?.status==='completed';
    return '<li class="'+(done?'hq-goal-done':'')+'"><div><strong>'+E(step.title)+'</strong><p>'+E(step.details)+'</p>'+
     '<small>'+E(formatted(due(step),zone))+(step.requires_evidence?' · Evidence required for final revenue stage':'')+'</small>'+
     (step.evidence?'<small>Reported evidence: '+E(step.evidence)+'</small>':'')+'</div>'+
     '<div class="secretary-actions"><button type="button" data-goal-toggle="'+E(step.id)+'">'+(done?'Undo completion':'Mark genuinely completed')+'</button>'+
     (!step.calendar_task_id&&!done?'<button type="button" data-goal-schedule="'+E(step.id)+'">Add to Calendar</button>':'')+'</div></li>';
   }).join('')+'</ol>'+
   '<form data-goal-add-step="'+E(goal.id)+'"><h4>Add a milestone</h4><label>Next action<input name="title" maxlength="240" required placeholder="Describe the next measurable step"></label>'+
    '<label>Details<textarea name="details" rows="2" maxlength="4000" placeholder="What exactly must be done?"></textarea></label><button type="submit">Add milestone</button></form>'+
  '</details>'+
  '<details class="hq-goal-budget"><summary>Set budget ceiling and record actual spending</summary>'+
   '<form data-goal-budget="'+E(goal.id)+'"><p>Budgeting is for planning. Changing these numbers never authorizes a payment, order or new subscription.</p>'+
   '<label>Maximum budget (USD; leave blank if undecided)<input type="number" name="budget" min="0" step=".01" inputmode="decimal" value="'+E(goal.budget_cap_cents===null?'':(goal.budget_cap_cents/100).toFixed(2))+'"></label>'+
   '<label>Money actually spent so far (USD; owner reported)<input type="number" name="spent" min="0" step=".01" inputmode="decimal" required value="'+E((Number(goal.spent_cents)/100).toFixed(2))+'"></label>'+
   '<button type="submit">Save budget record</button></form></details>'+
  (goal.description?'<details><summary>Goal scope and assumptions</summary><p>'+E(goal.description)+'</p></details>':'')+
 '</article>';
}
export function renderEleanorGoals(state,E,compact=false){
 const {ready,goals,steps}=cloudRows(),items=state?.items||[],zone=state?.settings?.timezone||'America/New_York';
 if(!ready)return '<section class="secretary-card hq-goals-loading"><h3>Goals and progress</h3><p>Loading the private Agent HQ goal register…</p><button type="button" data-goal-refresh>Refresh Goals</button></section>';
 const active=goals.filter(g=>g.status!=='archived').sort((a,b)=>({skincare:0,arbitrage:1,home:2,other:3}[a.kind]??4)-({skincare:0,arbitrage:1,home:2,other:3}[b.kind]??4));
 if(compact){
  return '<section class="secretary-card hq-goals-compact"><h3>Goal thermometers</h3>'+
   (active.length?active.slice(0,4).map(g=>{
     const progress=goalProgress(g,steps);
     return '<div class="hq-goal-mini"><span>'+E(icon[g.kind]||'🎯')+' '+E(g.title)+'</span><strong>'+progress.percent+'%</strong>'+
      '<div class="hq-goal-track" role="progressbar" aria-label="'+E(g.title)+' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress.percent+'"><span style="width:'+progress.percent+'%"></span></div></div>';
    }).join(''):'<p>No goals yet.</p>')+
   '<button type="button" data-secretary-tab="goals">Open goal board and household projects</button></section>';
 }
 return '<section class="hq-goals-desk"><header class="secretary-card"><h3>Eleanor’s goal thermometers</h3>'+
  '<p>Every goal starts at 0%. The meter rises only when you or the confirmed Calendar records mark milestones complete. A draft, scheduled task or potential customer is not a sale.</p>'+
  '<p>Eleanor coordinates Alex, Avery, Riley, Maya, Taylor and other specialists through approved internal projects. Financial ChatGPT requests require your decision.</p>'+
  '<button type="button" data-goal-refresh>Refresh goals</button></header>'+
  '<section class="secretary-card hq-home-intake"><h3>🏠 What needs doing around your house?</h3>'+
   '<p>Tell Eleanor any repair, maintenance, cleaning, upgrade or household task. She will help break it into safe steps, ask for your spending ceiling and schedule the first step on an available Sunday–Friday. Saturdays remain completely off.</p>'+
   '<form data-goal-new-home>'+
   '<label>What work needs doing?<input name="title" minlength="3" maxlength="180" required placeholder="Example: Repair the living room ceiling"></label>'+
   '<label>What’s wrong, what needs buying, or what would finished look like?<textarea name="description" maxlength="3500" rows="3" placeholder="Include condition, dimensions or a constraint, if known"></textarea></label>'+
   '<label>Maximum I want to spend (USD; optional)<input type="number" name="budget" min="0" step=".01" inputmode="decimal" placeholder="Leave blank to decide later"></label>'+
   '<label>Priority<select name="priority"><option value="normal">Normal</option><option value="urgent">Urgent / safety-sensitive</option><option value="flexible">Flexible timing</option></select></label>'+
   '<label>Work approach<select name="approach"><option value="unsure">Ask Eleanor to compare DIY and professionals</option><option value="diy">Prefer DIY if safe and appropriate</option><option value="professional">Use a qualified professional</option></select></label>'+
   '<button type="submit">Create household goal and schedule first step</button></form></section>'+
   '<div class="hq-goals-grid">'+(active.length?active.map(g=>perGoal(g,steps,items,E,zone)).join(''):'<p>No saved goals were found for this account.</p>')+'</div>'+
   '<p class="secretary-subtle">Business profit, customer orders and home-project spending are owner-reported until actual connected records are verified. No purchases, advertising campaigns, social posts or external commitments are executed from these buttons.</p></section>';
}
function findGoal(id){const cloud=window.agentHQGoalsCloud,goal=cloud?.all?.().find(g=>g.id===id);if(!goal)throw Error('This goal has changed. Refresh the board.');return goal}
function findStep(id){const cloud=window.agentHQGoalsCloud,step=cloud?.steps?.().find(m=>m.id===id);if(!step)throw Error('This goal milestone has changed. Refresh.');return step}
async function scheduleStep(step,state,helpers){
 const cloud=window.agentHQGoalsCloud,goal=findGoal(step.goal_id);
 if(step.status==='done')throw Error('This milestone is already complete.');
 const existing=state.items.find(i=>i.id===step.calendar_task_id||
  i.data?.goal_milestone_id===step.id&&i.status==='active');
 if(existing?.status==='active'){
  if(!step.calendar_task_id)await cloud.linkStep(step.id,existing.id,existing.due_at);
  return {already:true,date:existing.due_at};
 }
 const slot=nextWorkSlot(state.items,state.settings.timezone);
 const saved=await helpers.apply([{op:'save_item',item:{
  kind:'task',title:(goal.title+' · '+step.title).slice(0,180),
  details:('Milestone '+step.position+' for '+goal.title+'. '+step.details).slice(0,3800),
  timezone:state.settings.timezone,weekdays:[0,1,2,3,4,5],local_due:slot,
  data:{goal_id:goal.id,goal_milestone_id:step.id,auto_rollover:true,plan_only:true,
   budget_guard:'The owner must approve all spending and external commitments.'}
 }}]);
 const change=saved?.changes?.find(c=>c.action==='saved'&&c.id);
 if(!change?.id)throw Error('The Calendar task was not confirmed. Refresh Eleanor’s Tasks before trying again.');
 await cloud.linkStep(step.id,change.id,change.next_due_at);
 return {already:false,date:change.next_due_at};
}
function goalPlanPrompt(goal,steps){
 const money=budgetStatus(goal),limit=money.cap===null?'No budget ceiling has been selected yet; ask before recommending purchases.':dollars(money.cap)+' maximum budget (not spending authorization).';
 const progress=goalProgress(goal,steps);
 const focus=goal.kind==='home'?'Safe DIY-versus-contractor comparison, measurement/material estimates, permits where relevant, staging and contingencies.':
 goal.kind==='skincare'?'A concrete, low-cost Elysian Noir customer-acquisition plan using actual Shopify/Selfnamed inventory, margins, compliant skincare claims, organic content, experiments and conversion measurement.':
 goal.kind==='arbitrage'?'A low-risk resale arbitrage launch plan with sourcing criteria, marketplace rules, fees, taxes, returns, pilot inventory and a true net-profit calculator.':
 'A measurable, practical implementation plan with dependencies, costs and evidence.';
 const list=steps.filter(s=>s.goal_id===goal.id).map(s=>String(s.position)+'. '+s.title+' — '+(s.status==='done'?'Owner marked done':'not completed')).join('\n');
 return 'Agent HQ project: '+goal.title+'.\nGoal: '+goal.target_outcome+'\nScope: '+goal.description+
  '\nBudget: '+limit+'\nOwner-reported spent so far: '+dollars(money.spent)+
  '\nCurrent milestone completion: '+progress.percent+'%.\n'+list+
  '\nPrepare a practical prioritized, cost-conscious execution plan. '+focus+
  '\nAssign the appropriate Agent HQ specialists (Alex coordinator; Riley research; Avery finance; Maya/Taylor marketing; Jamie scheduling as needed). Show assumptions, alternatives, dependency order, 30/60/90-day milestones where useful, conservative cost math, risks, verification sources, and exact next steps. Do not claim real earnings, contacts or purchases without proof. No payments, publishing or account changes. Owner review before external execution.';
}
async function requestChatGPT(goal,steps){
 const question=goalPlanPrompt(goal,steps).slice(0,3900);
 const reason='Eleanor needs a source-backed, efficient budget-and-execution plan for '+goal.kind+' work. This is money-related advice; request owner approval before any ChatGPT handoff. No payments, publishing or store edits.';
 const {data,error}=await agentCloud.functions.invoke('agent-chatgpt-bridge',{body:{
  action:'request_chatgpt',worker:'eleanor',project_id:null,question,reason,request_id:crypto.randomUUID()
 }});
 if(error||data?.error)throw Error(data?.error||error?.message||'The ChatGPT request could not be saved.');
 window.dispatchEvent(new CustomEvent('agenthq-chatgpt-requests-updated',{detail:{owner_id:goal.owner_id}}));
 return data;
}
async function delegateGoal(goal,steps,helpers){
 if(goal.project_id){window.agentHQOpenProjects?.(goal.project_id);return null;}
 const brief=goalPlanPrompt(goal,steps).slice(0,9500);
 const saved=await helpers.apply([{op:'create_project',title:('Plan: '+goal.title).slice(0,180),brief,output_format:'markdown'}]);
 const created=saved?.changes?.find(c=>c.action==='project_created'&&c.project_id);
 if(!created?.project_id)throw Error('Agent HQ did not confirm the project assignment; no progress was marked complete.');
 await window.agentHQGoalsCloud.updateGoal(goal.id,{project_id:created.project_id});
 return created.project_id;
}
export function bindEleanorGoals(root,state,helpers,E){
 const cloud=window.agentHQGoalsCloud;if(!cloud?.loaded?.())return;
 const notice=text=>helpers.message(String(text));
 const run=async(button,action)=>{
  if(button.disabled)return;button.disabled=true;
  try{await action()}catch(error){notice('Eleanor could not confirm the goal change: '+String(error?.message||error))}
  finally{button.disabled=false}
 };
 root.querySelectorAll('[data-goal-refresh]').forEach(button=>button.addEventListener('click',()=>void run(button,async()=>{await cloud.refresh();await helpers.load();notice('Goal stages and Calendar records refreshed.')})));
 const house=root.querySelector('[data-goal-new-home]');
 house?.addEventListener('submit',event=>{
  event.preventDefault();
  const button=house.querySelector('[type="submit"]');
  void run(button,async()=>{
   const form=new FormData(house),priority=String(form.get('priority')||'normal'),approach=String(form.get('approach')||'unsure');
   const details=String(form.get('description')||'').trim()+'\nOwner-stated priority: '+priority+'. Work approach: '+approach+
    '. Budget is a ceiling, not authorization to spend. Verify safety before doing electrical, structural, roof or gas work.';
   const goal=await cloud.createHome({title:form.get('title'),description:details,budget:form.get('budget')});
   const first=cloud.steps().find(s=>s.goal_id===goal.id&&s.position===1);
   if(!first)throw Error('Household goal saved, but the first checklist step was not confirmed.');
   const result=await scheduleStep(first,state,helpers);
   notice('Home goal saved. Eleanor added its first planning step to your internal Calendar for '+formatted(result.date,state.settings.timezone)+'.');
  });
 });
 root.querySelectorAll('[data-goal-budget]').forEach(form=>form.addEventListener('submit',event=>{
  event.preventDefault();const button=form.querySelector('[type="submit"]');
  void run(button,async()=>{const f=new FormData(form);await cloud.updateGoal(form.dataset.goalBudget,{budget:f.get('budget'),spent:f.get('spent')});
   notice('Budget ceiling and actual owner-reported spending saved. This does not approve or trigger a payment.');});
 }));
 root.querySelectorAll('[data-goal-add-step]').forEach(form=>form.addEventListener('submit',event=>{
  event.preventDefault();const button=form.querySelector('[type="submit"]');
  void run(button,async()=>{const f=new FormData(form);await cloud.createStep(form.dataset.goalAddStep,f.get('title'),f.get('details'));
   notice('Milestone added at 0% completion, ready for scheduling.');});
 }));
 root.querySelectorAll('[data-goal-next]').forEach(button=>button.addEventListener('click',()=>void run(button,async()=>{
  const goal=findGoal(button.dataset.goalNext);
  const eligible=cloud.steps().filter(s=>s.goal_id===goal.id&&s.status!=='done'&&!s.calendar_task_id).sort((a,b)=>a.position-b.position);
  if(!eligible.length){notice('All unfinished stages already have Calendar tasks. Open Tasks to review or reschedule them.');return;}
  const result=await scheduleStep(eligible[0],state,helpers);
  notice('Eleanor '+(result.already?'found the existing':'saved the next')+' Calendar step for '+formatted(result.date,state.settings.timezone)+'. Saturday is excluded.');
 })));
 root.querySelectorAll('[data-goal-schedule]').forEach(button=>button.addEventListener('click',()=>void run(button,async()=>{
  const step=findStep(button.dataset.goalSchedule),result=await scheduleStep(step,state,helpers);
  notice((result.already?'This step is already on':'Added to')+' the Agent HQ Calendar: '+formatted(result.date,state.settings.timezone)+'.');
 })));
 root.querySelectorAll('[data-goal-toggle]').forEach(button=>button.addEventListener('click',()=>void run(button,async()=>{
  const step=findStep(button.dataset.goalToggle),complete=step.status!=='done',task=state.items.find(i=>i.id===step.calendar_task_id);
  let evidence='';
  if(complete&&step.requires_evidence){
   const submitted=prompt('Enter an actual owner-reported paid-order or profitable-sale reference and how you verified it. No estimated or hoped-for income counts.');
   if(submitted===null)return;
   evidence=submitted.trim();if(evidence.length<4)throw Error('A real order or sale reference is required for this last milestone.');
  }
  if(!complete&&task?.status==='completed')await helpers.apply([{op:'control_item',id:task.id,status:'active'}]);
  if(complete&&step.requires_evidence)await cloud.markStep(step.id,true,evidence);
  if(complete&&task?.status==='active')await helpers.apply([{op:'control_item',id:task.id,status:'completed'}]);
  if(!complete||!step.requires_evidence)await cloud.markStep(step.id,complete,evidence);
  notice(complete?'Recorded completed work. This goal’s thermometer reflects the newly finished milestone.':'Reopened milestone. Its progress has been recalculated.');
 })));
 root.querySelectorAll('[data-goal-delegate]').forEach(button=>button.addEventListener('click',()=>void run(button,async()=>{
  const goal=findGoal(button.dataset.goalDelegate);
  const project=await delegateGoal(goal,cloud.steps(),helpers);
  if(project)notice('Alex’s internal project is saved with this goal’s budget limits and stage plan. The agents can draft and research without permission to spend or publish.');
 })));
 root.querySelectorAll('[data-goal-chatgpt]').forEach(button=>button.addEventListener('click',()=>void run(button,async()=>{
  const goal=findGoal(button.dataset.goalChatgpt);const result=await requestChatGPT(goal,cloud.steps());
  notice('Eleanor saved a money-related ChatGPT planning request for '+goal.title+'. Open the ChatGPT app or her pop-up to review and approve the request. No payment or external action was authorized.');
 })));
}
