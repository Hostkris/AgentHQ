import { agentCloud } from './agent-cloud-auth.js';
let generation=0, fingerprint='';
const running=new Set();
async function getUser(){
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw Error('Sign-in error: '+error.message);
 if(!data?.user)throw Error('Sign in under Settings to assign work.');
 return data.user;
}
async function refresh(){
 const serial=++generation;
 try{await getUser()}catch(error){if(serial===generation)window.agentHQCoordSync?.([],'Sign in to view worker handoffs.');return []}
 const {data,error}=await agentCloud.from('agent_task_steps')
 .select('id,assignment_id,step_number,employee_id,title,instructions,status,handoff_from,output,question,created_at,updated_at')
 .order('created_at',{ascending:false}).order('step_number',{ascending:true}).limit(400);
 if(serial!==generation)return [];
 if(error){window.agentHQCoordError?.(error.message);return []}
 const rows=data||[],serialized=JSON.stringify(rows);
 if(serialized!==fingerprint){fingerprint=serialized;window.agentHQCoordSync?.(rows,'Worker handoffs synced.')}
 return rows;
}
async function invoke(action,assignmentId){
 await getUser();
 const {data,error}=await agentCloud.functions.invoke('agent-hq-coordinate',
  {body:{action,assignment_id:assignmentId}});
 if(error){
  let message=data?.error;
  if(!message&&error.context?.clone){try{message=(await error.context.clone().json())?.error}catch{}}
  throw Error(message||error.message||'Coordinator did not respond');
 }
 if(data?.error)throw Error(data.error);
 if(!data||typeof data.state!=='string')throw Error('Coordinator did not confirm the action');
 return data;
}
async function assignFromChat(worker,body){
 await getUser();
 body=String(body||'').trim();
 if(body.length<5||body.length>10000)throw Error('An assignment needs 5–10,000 characters.');
 const {data,error}=await agentCloud.rpc('create_agent_assignment_from_chat',
 {p_employee_id:worker,p_body:body});
 if(error)throw Error('Assignment not saved: '+error.message);
 if(!data)throw Error('Supabase did not confirm your assignment');
 await syncAll();
 return data;
}
async function answer(assignmentId,text){
 await getUser();
 const {data,error}=await agentCloud.rpc('answer_agent_assignment_question',
  {p_assignment_id:assignmentId,p_body:String(text||'').trim()});
 if(error)throw Error('Answer not saved: '+error.message);
 if(data!==true)throw Error('The answer was not confirmed');
 await syncAll();
 return true;
}
async function syncAll(){
 await Promise.allSettled([
 refresh(),window.agentHQTeamCloud?.refresh(),window.agentHQChatCloud?.refresh(),
 window.agentHQCloudApprovals?.refresh(),window.agentHQWorkerCloud?.runs()
 ]);
}
function progress(id,stage,detail){
 window.agentHQCoordProgress?.({assignmentId:id,stage,detail,active:stage==='planning'||stage==='working'});
}
async function runTeam(id,{planFirst=false,maxSteps=3}={}){
 if(running.has(id))throw Error('This assignment is already running in this browser');
 await getUser();
 running.add(id);
 try{
  if(planFirst){
   progress(id,'planning','Alex is assigning the work to specialist employees…');
   const planned=await invoke('plan',id);
   await syncAll();
   if(planned.state!=='ready'){
    progress(id,planned.state,planned.message||'Manager plan needs attention');
    return planned;
   }
  }
  const budget=Math.max(1,Math.min(3,Number(maxSteps)||3));
  let response={state:'ready',message:''};
  for(let step=0;step<budget;step++){
   progress(id,'working','A specialist is drafting the next step and preparing the handoff…');
   response=await invoke('next',id);
   await syncAll();
   if(response.state!=='ready')break;
  }
  const state=response.state;
  const detail=state==='ready'
   ?'Handoff saved. More work is queued; tap Continue teamwork to run it.'
   :state==='completed'
   ?'AI text drafts are complete. Review before any external action.'
   :['waiting_for_owner','waiting_for_permission'].includes(state)
   ?'A worker needs your answer or approval in Messages.'
   :response.message||'The team paused';
  progress(id,state,detail);
  return response;
 }catch(error){
  progress(id,'failed','The coordinator paused safely: '+error.message);
  await syncAll();
  throw error;
 }finally{running.delete(id)}
}
window.agentHQCoordCloud={refresh,assignFromChat,answer,runTeam,isRunning:id=>running.has(id)};
const load=()=>refresh().catch(error=>window.agentHQCoordError?.(error.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(load,0));
window.addEventListener('focus',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
setInterval(()=>{if(!document.hidden)load()},20000);
load();
