import {agentCloud} from './agent-cloud-auth.js';
import {threadActivities,activityHTML} from './agent-activity-view.js?v=20261024-execution-events-1';
let ownerId=null,generation=0,serial=0,pollTimer=null,polling=null,lastSync=0,labels={},workerRuns=[],research=[],legacyResearch=[],events=[],pollError=false,eventChannel=null;
const requests=new Map();
function projects(){return (window.agentHQProjects?.all?.()||[]).filter(s=>ownerId&&s.owner_id===ownerId);}
function snapshot(worker){return threadActivities(worker,{projects:projects(),selected:window.agentHQProjects?.context?.('hq')?.projectId,local:[...requests.values()],workerRuns,research,legacyResearch,events,labels,fresh:!pollError&&(!lastSync||Date.now()-lastSync<15000),online:navigator.onLine!==false});}
function render(worker){return activityHTML(snapshot(worker),{hq:worker==='hq'});}
function paint(){
 for(const root of document.querySelectorAll('[data-agent-activity-thread]')){
  const worker=root.dataset.agentActivityThread;if(root.dataset.agentActivityName)labels[worker]=root.dataset.agentActivityName;
  let html=render(worker);
  // The first frame can precede loading this module or reserving a server run.
  if(!html&&root.dataset.activityLocal==='true')html=activityHTML([{key:'sending',actor:worker,active:navigator.onLine!==false,state:navigator.onLine===false?'offline':'working',text:navigator.onLine===false?'Connection interrupted — waiting to reconnect':'Preparing a response…',title:'Your message'}]);
  if(root.innerHTML!==html)root.innerHTML=html;
  root.hidden=!html;
 }
}
function schedule(ms){clearTimeout(pollTimer);if(!document.hidden)pollTimer=setTimeout(tick,ms);}
function setOwner(id){
 if(id===ownerId)return;
 if(eventChannel){agentCloud.removeChannel(eventChannel);eventChannel=null;}
 generation++;ownerId=id;requests.clear();labels={};workerRuns=[];research=[];legacyResearch=[];events=[];lastSync=0;polling=null;pollError=false;paint();
 if(id)eventChannel=agentCloud.channel('hq-execution-'+id)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'agent_execution_events',filter:'owner_id=eq.'+id},()=>schedule(0)).subscribe();
}
async function refresh(){
 if(polling)return polling;
 const current=generation;
 const task=(async()=>{
  try{
   if(!ownerId){const {data,error}=await agentCloud.auth.getUser();if(current!==generation)return;if(error||!data?.user){pollError=true;paint();return;}setOwner(data.user.id);}
   const epoch=generation,id=ownerId;
   const results=await Promise.all([
    agentCloud.from('agent_worker_runs').select('id,assignment_id,employee_id,status,created_at,assignment:agent_team_assignments(title,employee_ids,owner_paused)').eq('owner_id',id).eq('status','running').order('created_at',{ascending:false}).limit(30),
    agentCloud.from('agent_role_research').select('id,employee_id,assignment_id,bot_id,status,started_at').eq('owner_id',id).eq('status','running').order('started_at',{ascending:false}).limit(30),
    agentCloud.from('agent_research_jobs').select('id,employee_id,status,started_at').eq('owner_id',id).eq('status','running').order('started_at',{ascending:false}).limit(30),
    agentCloud.from('agent_execution_events').select('id,assignment_id,employee_id,event_type,state,summary,occurred_at').eq('owner_id',id).order('occurred_at',{ascending:false}).limit(20)
   ]);
   if(epoch!==generation||id!==ownerId)return;
   // The event journal is additive. Older deployments must still show live
   // worker indicators until the database migration has been applied.
   if(results.slice(0,3).some(r=>r.error))throw Error('Live activity could not be refreshed');
   [workerRuns,research,legacyResearch]=results.slice(0,3).map(r=>r.data||[]);
   events=results[3]?.error?[]:results[3]?.data||[];lastSync=Date.now();pollError=false;
  }catch{pollError=true;}
  finally{paint();}
 })();polling=task;
 try{await task;}finally{if(polling===task)polling=null;}
}
async function tick(){
 if(document.hidden)return;
 // The project coordinator and Realtime already refresh project content. Keep
 // this frequent poll limited to small activity records on the free tier.
 await refresh();paint();
 const active=requests.size||workerRuns.length||research.length||legacyResearch.length||projects().some(s=>!['review','approved','waiting_owner','waiting_permission'].includes(s.phase)&&!s.assignment?.owner_paused&&!s.last_error);
 schedule(active?1800:document.querySelector('[data-agent-activity-thread]')?5000:15000);
}
function begin(worker,stage='Preparing a response',options={}){
 if(options.ownerId&&options.ownerId!==ownerId)setOwner(options.ownerId);
 const epoch=generation,id='local-'+(++serial);requests.set(id,{id,worker,stage,title:options.title||'',startedAt:Date.now()});paint();schedule(0);
 return {update(next){if(epoch===generation&&requests.has(id)){requests.get(id).stage=next;paint();}},end(){if(epoch===generation){requests.delete(id);paint();schedule(0);}}};
}
window.agentHQActivity={begin,refresh,paint,render,snapshot,rememberWorkers(workers){for(const w of workers||[])labels[w.id]=w.name;paint();}};
agentCloud.auth.onAuthStateChange((_event,session)=>{setOwner(session?.user?.id||null);schedule(0);});
document.addEventListener('agenthq-project-activity',paint);
window.addEventListener('online',()=>schedule(0));window.addEventListener('offline',paint);
window.addEventListener('focus',()=>schedule(0));
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(pollTimer);else schedule(0);});
const app=document.getElementById('app');if(app)new MutationObserver(paint).observe(app,{childList:true,subtree:true});
paint();schedule(0);
