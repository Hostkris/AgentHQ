// Unattended, owner-scoped idea generation. The current project engine performs
// research and work; this module merely authorizes bounded project discovery.
import {savedSources,validateInitiative,initiativeSystemPrompt,WORKER_ROLES} from '../../../agent-initiative-core.js';
const clean=v=>String(v||'').slice(0,360);
export async function considerWorkerInitiative(db:any,owners:string[],deps:any){
 const {data:claim,error:claimError}=await db.rpc('agent_hq_claim_autonomy',
  {p_owners:owners,p_clock:new Date().toISOString()});
 if(claimError)return {state:'claim_unavailable'};
 if(!claim||!owners.includes(claim.owner_id))return {state:'not_due'};
 const owner=claim.owner_id,worker=claim.worker;
 const update=async(outcome:string,error='')=>{
  await db.from('agent_hq_autonomy_settings').update({last_outcome:outcome,last_error:clean(error),updated_at:new Date().toISOString()})
    .eq('owner_id',owner).eq('last_worker',worker).eq('last_evaluated_on',claim.local_date);
 };
 try{
  const [goals,steps,projects,tasks,boards,patterns]=await Promise.all([
   db.from('agent_hq_goals').select('id,title,status').eq('owner_id',owner).eq('status','active').limit(12),
   db.from('agent_hq_goal_milestones').select('goal_id,title,status,position').eq('owner_id',owner).limit(80),
   db.from('agent_team_assignments').select('id,title,status,updated_at').eq('owner_id',owner)
      .order('updated_at',{ascending:false}).limit(25),
   db.from('agent_secretary_items').select('id,title,kind,status,weekdays').eq('owner_id',owner)
      .in('status',['active','completed']).order('updated_at',{ascending:false}).limit(50),
   db.from('agent_hq_board_snapshots').select('board_key,payload').eq('owner_id',owner)
      .in('board_key',['weekly','cleaning']).limit(2),
   db.from('agent_hq_worker_patterns').select('focus_ref,summary,disabled').eq('owner_id',owner)
      .eq('worker',worker).limit(20)
  ]);
  if([goals,steps,projects,tasks,boards,patterns].some(x=>x.error))
    throw Error('Owner source register unavailable');
  const sources=savedSources({
   goals:goals.data||[],milestones:steps.data||[],projects:projects.data||[],
   tasks:tasks.data||[],boards:boards.data||[],patterns:patterns.data||[]
  });
  if(!sources.length){await update('no_recorded_needs');return {state:'no_recorded_needs',worker};}
  // Existing project engine uses a real configured Groq/OpenRouter model. No
  // inference or fake evidence is claimed when the provider is unavailable.
  const runtime=deps.makeRuntime(db,owner);
  const raw=await runtime.call(initiativeSystemPrompt(worker),{
   worker,job_scope:WORKER_ROLES[worker],owner_local_date:claim.local_date,
   saved_source_records:sources,
   currently_active_projects:(projects.data||[]).filter(p=>p.status==='in_progress').map(p=>({title:p.title,ref:'project:'+p.id})),
   instruction:'Choose no idea if new work would merely duplicate the current project backlog. The owner may stop the feature.'
  },1500);
  const proposed=validateInitiative(raw,worker,sources.map(x=>x.ref));
  if(proposed.kind==='none'){await update('no_new_idea');return {state:'no_new_idea',worker};}
  const {data:launched,error}=await db.rpc('agent_hq_launch_autonomy',{
   p_owner:owner,p_worker:worker,p_date:claim.local_date,p_focus_ref:proposed.focus_ref,
   p_title:proposed.title,p_rationale:proposed.rationale,p_deliverable:proposed.deliverable,
   p_evidence:proposed.evidence_refs,p_questions:proposed.research_questions,
   p_observation:proposed.observed_need,p_pattern_kind:proposed.pattern_kind
  });
  if(error)throw Error('Could not commit validated internal initiative');
  return {state:launched?.state||'not_committed',worker,project_saved:launched?.state==='project_saved'};
 }catch(e){
  const reason=String(e instanceof Error?e.message:'Provider or source unavailable').slice(0,200);
  await update('evaluation_failed',reason);
  return {state:'evaluation_failed',worker};
 }
}
