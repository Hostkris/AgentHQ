// Owner-scoped first-party Agent HQ goals. No outside commerce accounts or financial records are read.
import {agentCloud} from './agent-cloud-auth.js';
import {HOME_STEPS,toCents} from './agent-goal-math.js?v=20261107-goal-1';
let owner=null,epoch=0,loaded=false,goals=[],milestones=[],pending=null;
const notify=()=>window.dispatchEvent(new CustomEvent('agenthq-goals-changed',{detail:{owner_id:owner}}));
function requireOwner(){if(!owner)throw Error('Sign in to Agent HQ to view your private goals.');return owner;}
function checkItem(goal){if(!goal||goal.owner_id!==owner||!goals.some(g=>g.id===goal.id))throw Error('This goal is no longer available under this account.');return goal;}
function getGoal(id){return checkItem(goals.find(g=>g.id===id))}
function getStep(id){const step=milestones.find(m=>m.id===id&&m.owner_id===owner);if(!step)throw Error('This milestone is no longer available.');getGoal(step.goal_id);return step;}
async function refresh(){
 const id=requireOwner(),ticket=epoch;
 if(pending)return pending;
 const work=(async()=>{
  const [a,b]=await Promise.all([
   agentCloud.from('agent_hq_goals').select('*').eq('owner_id',id).order('updated_at',{ascending:false}).limit(100),
   agentCloud.from('agent_hq_goal_milestones').select('*').eq('owner_id',id).order('position',{ascending:true}).limit(1000)
  ]);
  if(a.error||b.error)throw Error('The Agent HQ Goals register could not load: '+(a.error?.message||b.error?.message));
  if(ticket!==epoch||owner!==id)return;
  goals=a.data||[];milestones=b.data||[];loaded=true;notify();
 })().finally(()=>{if(pending===work)pending=null});
 pending=work;return work;
}
async function createHome({title,description,budget}){
 const id=requireOwner(),name=String(title||'').trim(),text=String(description||'').trim();
 if(name.length<3||name.length>180)throw Error('Describe which home project needs doing in 3–180 characters.');
 if(text.length>4000)throw Error('Keep the work description under 4,000 characters.');
 const cap=toCents(budget);
 const goal={owner_id:id,slug:'home-'+crypto.randomUUID(),kind:'home',title:name,
  description:text,target_outcome:'Complete and inspect the specified household project within the owner-approved work and budget scope.',
  budget_cap_cents:cap,spent_cents:0};
 const {data:saved,error}=await agentCloud.from('agent_hq_goals').insert(goal).select('*').single();
 if(error||!saved)throw Error('Could not create this private household goal: '+(error?.message||'unknown error'));
 const steps=HOME_STEPS.map((m,i)=>({owner_id:id,goal_id:saved.id,position:i+1,
  title:m.title,details:m.details,weight:1,status:'pending'}));
 const result=await agentCloud.from('agent_hq_goal_milestones').insert(steps);
 await refresh();
 if(result.error)throw Error('Household goal was created, but its checklist was not fully saved. Open Goals to add the remaining steps; no money was spent.');
 return saved;
}
async function updateGoal(id,fields){
 const goal=getGoal(id),patch={updated_at:new Date().toISOString()};
 if(Object.prototype.hasOwnProperty.call(fields,'budget'))patch.budget_cap_cents=toCents(fields.budget);
 if(Object.prototype.hasOwnProperty.call(fields,'spent')){
  const amount=toCents(fields.spent);if(amount===null)throw Error('Enter your actual reported spending, or zero.');
  patch.spent_cents=amount;
 }
 if(fields.project_id!==undefined)patch.project_id=fields.project_id;
 if(fields.title!==undefined){
  const title=String(fields.title||'').trim();if(title.length<3||title.length>180)throw Error('Choose a goal title of 3–180 characters.');
  patch.title=title;
 }
 if(fields.description!==undefined){
  const description=String(fields.description||'').trim();if(description.length>4000)throw Error('The goal description is too long.');
  patch.description=description;
 }
 const {data,error}=await agentCloud.from('agent_hq_goals').update(patch)
  .eq('owner_id',goal.owner_id).eq('id',goal.id).select('*').single();
 if(error||!data)throw Error('Could not save the goal: '+(error?.message||'unknown error'));
 goals=goals.map(g=>g.id===id?data:g);notify();return data;
}
async function createStep(goalId,title,details){
 const goal=getGoal(goalId),name=String(title||'').trim(),description=String(details||'').trim();
 if(name.length<3||name.length>240||description.length>4000)throw Error('Give the milestone a clear name and shorter instructions.');
 const existing=milestones.filter(m=>m.goal_id===goal.id),position=Math.max(0,...existing.map(m=>m.position))+1;
 if(position>200)throw Error('This goal already has the maximum number of milestones.');
 const {data,error}=await agentCloud.from('agent_hq_goal_milestones').insert({
  owner_id:owner,goal_id:goal.id,position,title:name,details:description,weight:1,status:'pending'
 }).select('*').single();
 if(error||!data)throw Error('Could not add this milestone: '+(error?.message||'unknown error'));
 milestones=[...milestones,data];notify();return data;
}
async function markStep(stepId,completed,evidence=''){
 const step=getStep(stepId);
 const note=String(evidence||'').trim();
 if(completed&&step.requires_evidence&&note.length<4)throw Error('This last business stage requires a real owner-reported sale or order reference before progress can reach 100%.');
 const patch={status:completed?'done':'pending',evidence:completed?note:'',completed_at:completed?new Date().toISOString():null,updated_at:new Date().toISOString()};
 const {data,error}=await agentCloud.from('agent_hq_goal_milestones').update(patch)
  .eq('owner_id',owner).eq('id',step.id).select('*').single();
 if(error||!data)throw Error('Could not record milestone completion: '+(error?.message||'unknown error'));
 milestones=milestones.map(m=>m.id===step.id?data:m);notify();return data;
}
async function linkStep(stepId,taskId,dueAt){
 const step=getStep(stepId),patch={calendar_task_id:taskId,due_at:dueAt,updated_at:new Date().toISOString()};
 const {data,error}=await agentCloud.from('agent_hq_goal_milestones').update(patch)
  .eq('owner_id',owner).eq('id',step.id).select('*').single();
 if(error||!data)throw Error('The Calendar task was saved, but its milestone link could not be confirmed. Refresh Goals before retrying; the Calendar task was not deleted.');
 milestones=milestones.map(m=>m.id===step.id?data:m);notify();return data;
}
async function signedIn(next){
 if(next===owner&&loaded)return;
 owner=next||null;epoch++;loaded=false;goals=[];milestones=[];pending=null;notify();
 if(!owner)return;
 try{await refresh()}catch(e){window.dispatchEvent(new CustomEvent('agenthq-goals-error',{detail:{message:String(e.message||e)}}))}
}
window.agentHQGoalsCloud={owner:()=>owner,loaded:()=>loaded,all:()=>goals.slice(),steps:()=>milestones.slice(),
 getGoal,getStep,refresh,createHome,updateGoal,createStep,markStep,linkStep};
agentCloud.auth.onAuthStateChange((_event,session)=>{void signedIn(session?.user?.id||null)});
agentCloud.auth.getUser().then(({data})=>signedIn(data?.user?.id||null)).catch(()=>{});
window.addEventListener('focus',()=>{if(owner)void refresh().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(owner&&!document.hidden)void refresh().catch(()=>{})});
