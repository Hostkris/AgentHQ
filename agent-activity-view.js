// Activity describes observable requests and saved run state, never hidden reasoning.
import {projectResponseRecovery} from './agent-project-recovery.js?v=20261024-autonomy-1';
import {autonomousRecoveryStatus} from './agent-project-autonomy.js?v=20261024-autonomy-1';
const LABELS={alex:'Alex',maya:'Maya',jordan:'Jordan',riley:'Riley',taylor:'Taylor',casey:'Casey',morgan:'Morgan',avery:'Avery',jamie:'Jamie',quinn:'Quinn',hq:'Company HQ'};
export const activityName=(id,labels={})=>labels[id]||LABELS[id]||'Your worker';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LIVE_PHASES=['planning','discussion','drafting','checking','polishing'];
export function projectActivity(s,now=Date.now(),labels={},research=[]){
 const name=id=>activityName(id,labels),title=s.assignment?.title||'Team project';
 const base={key:'project:'+s.assignment_id,projectId:s.assignment_id,title,actor:s.active_worker||s.next_worker||'alex',active:false,state:'queued'};
 if(s.assignment?.owner_paused)return {...base,state:'paused',text:'Project paused by you'};
 const recovery=autonomousRecoveryStatus(s,now);
 if(recovery)return {...base,actor:s.active_worker||(recovery.state==='diagnosing'?'alex':base.actor),active:!!s.active_run&&Date.parse(s.lease_until)>now,state:recovery.state,text:recovery.text+(recovery.queued?' · Continuing automatically shortly':' · No action needed')};
 if(s.last_error){
  const recovery=projectResponseRecovery(s);
  return {...base,state:'error',text:recovery?.code?name(base.actor)+' needs to correct '+(['self_address','invalid_recipient','recipient_mismatch'].includes(recovery.code)?'a teammate reply':'the current response')+' · Open the team to retry':'Project needs attention — '+(recovery?.summary||'Refresh this project')};
 }
 if(s.phase==='waiting_owner'||s.phase==='waiting_permission')return {...base,state:'waiting',text:name(s.waiting_worker)+' is waiting for your '+(s.phase==='waiting_permission'?'approval':'answer')};
 if(s.phase==='review')return {...base,state:'review',text:'The team’s finished work is ready for your review'};
 if(s.phase==='approved')return null;
 if(!LIVE_PHASES.includes(s.phase))return null;
 if(s.active_run&&s.active_worker&&Date.parse(s.lease_until)>now){
  const actor=s.active_worker||s.next_worker;
  const finding=s.pending_research_query||research.some(r=>r.assignment_id===s.assignment_id&&r.employee_id===actor&&r.status==='running'&&now-Date.parse(r.started_at)<120000);
  const detail=finding?'researching public sources':s.phase==='planning'?'planning the team’s work':s.phase==='drafting'?'writing the shared draft':s.phase==='checking'?'reviewing '+name(s.lead_worker)+'’s draft':s.phase==='polishing'?'applying the team’s feedback':s.peer_target?'answering '+name(s.peer_return_worker):'preparing a team response';
  return {...base,actor,active:true,state:'working',text:name(actor)+' is '+detail};
 }
 if(s.active_run)return {...base,state:'interrupted',text:'Checking an interrupted worker response — work is saved'};
 if(Date.parse(s.next_run_at)>now+15000)return {...base,state:'queued',text:'Saved work is queued until '+new Date(s.next_run_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})};
 const next=name(s.next_worker||'alex');
 const text=s.phase==='checking'?name(s.lead_worker)+' → '+next+' · Peer review is next':s.phase==='polishing'?'Team review → '+next+' · Final corrections are next':'Next: '+next+' · '+(s.phase==='planning'?'team planning':s.phase==='drafting'?'shared draft':'team conversation');
 return {...base,text};
}
export function threadActivities(worker,{projects=[],selected,local=[],workerRuns=[],research=[],legacyResearch=[],labels={},fresh=true,online=true,now=Date.now()}={}){
 const name=id=>activityName(id,labels),out=[];
 const activeLocal=local.filter(r=>(r.worker===worker||worker==='hq')&&r.startedAt<=now);
 for(const r of activeLocal)out.push({key:r.id,actor:r.worker,active:online&&now-r.startedAt<150000,state:online?'working':'offline',text:!online?'Connection interrupted — waiting to reconnect':now-r.startedAt>=150000?'This response is taking longer than expected':name(r.worker)+' · '+r.stage,title:r.title||(worker==='hq'&&r.worker!=='hq'?'Direct conversation':'Your message')});
 const matching=projects.filter(s=>worker==='hq'||worker==='alex'||s.team_order?.includes(worker)||s.assignment?.source_employee_id===worker);
 matching.sort((a,b)=>(a.assignment_id===selected?-1:b.assignment_id===selected?1:0));
 for(const s of matching){const a=projectActivity(s,now,labels,research);if(a)out.push(a);}
 for(const r of workerRuns){
  const age=now-Date.parse(r.created_at);
  if(r.status!=='running'||!Number.isFinite(age)||age<0||age>120000||r.assignment?.owner_paused||projects.some(s=>s.assignment_id===r.assignment_id))continue;
  if(worker!=='hq'&&worker!=='alex'&&worker!==r.employee_id&&!r.assignment?.employee_ids?.includes(worker))continue;
  out.push({key:'run:'+r.id,projectId:r.assignment_id,actor:r.employee_id,active:true,state:'working',text:name(r.employee_id)+' is '+(r.employee_id==='alex'?'planning specialist handoffs':'preparing the assigned work'),title:r.assignment?.title||'Assignment in progress'});
 }
 for(const r of [...research,...legacyResearch]){
  const actor=r.bot_id||r.employee_id;
  const age=now-Date.parse(r.started_at);
  if(r.status!=='running'||!Number.isFinite(age)||age<0||age>120000||projects.some(s=>s.assignment_id===r.assignment_id))continue;
  if(worker!==actor&&!(worker==='hq'&&r.assignment_id))continue;
  const localRow=out.find(a=>!a.projectId&&a.actor===actor);
  if(localRow){localRow.text=name(actor)+' is researching public sources';localRow.state='research';continue;}
  out.push({key:'research:'+r.id,actor,active:true,state:'research',text:name(actor)+' is researching public sources',title:r.assignment_id?'Team research':'Your research request'});
 }
 if(!fresh||!online){
  for(const a of out)if(!activeLocal.some(r=>r.id===a.key)||!online){a.active=false;a.state='offline';a.text=online?'Reconnecting to live activity — work is saved':'Connection interrupted — waiting to reconnect';}
 }
 // Show current work first while keeping an explicit selected HQ project visible.
 out.sort((a,b)=>(b.active?1:0)-(a.active?1:0));
 const keys=new Set();return out.filter(a=>{if(keys.has(a.key))return false;keys.add(a.key);return true;}).slice(0,3);
}
export function activityHTML(activities,{hq=false}={}){
 return activities.map(a=>'<div class="agent-activity-row'+(hq&&a.active?' hq-team-typing':'')+'" data-activity-state="'+esc(a.state)+'" data-activity-actor="'+esc(a.actor||'')+'"'+(a.active?' data-activity-running="true"':'')+' aria-label="'+esc(a.text)+'">'+
  '<div class="agent-typing-dots ios-typing" aria-hidden="true"><span></span><span></span><span></span></div>'+
  '<div class="agent-activity-copy"><strong>'+esc(a.text)+'</strong><small>'+esc(a.title||'')+'</small></div>'+
  (a.projectId?'<button type="button" class="agent-activity-open" data-project-open="'+esc(a.projectId)+'" aria-label="Open '+esc(a.title||'team project')+'">View team <span aria-hidden="true">›</span></button>':'')+'</div>').join('');
}
