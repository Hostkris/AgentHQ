import {agentCloud} from './agent-cloud-auth.js';
import {projectRoomHTML,projectPrivateHTML,projectIsTyping} from './agent-project-view.js?v=20261024-all-workers-web-1';
let rows=[],ownerId=null,generation=0,refreshing=null,timer=null,inFlight=null,selected=null,answerTarget=null;
const wanted=new Set();
function changed(){window.agentHQProjectsChanged?.();}
async function owner(){const {data,error}=await agentCloud.auth.getUser();if(error||!data?.user)throw Error('Sign in to Agent HQ to work with the team.');return data.user;}
function schedule(ms=12000){clearTimeout(timer);if(document.hidden)return;timer=setTimeout(tick,ms);}
async function refresh(){
 if(refreshing)return refreshing;
 const epoch=generation;
 refreshing=(async()=>{
  try{
   const user=await owner();if(epoch!==generation)return;
   if(ownerId&&ownerId!==user.id){rows=[];selected=null;answerTarget=null;wanted.clear();}
   ownerId=user.id;
   const {data,error}=await agentCloud.from('agent_project_sessions')
    .select('*,assignment:agent_team_assignments!inner(title,owner_paused,status,source_employee_id,created_at)')
    .eq('owner_id',user.id).order('updated_at',{ascending:false}).limit(200);
   if(epoch!==generation)return;
   if(error)throw Error(error.message);
   const next=data||[];
   if(JSON.stringify(next)!==JSON.stringify(rows)){rows=next;if(!selected||!rows.some(s=>s.assignment_id===selected))selected=rows[0]?.assignment_id||null;changed();}
  }catch(error){if(epoch===generation){if(!ownerId){rows=[];changed();}window.agentHQProjectsError?.(error.message);}}
  finally{refreshing=null;}
 })();
 return refreshing;
}
async function invoke(action,id,extra={}){
 const user=await owner(),epoch=generation;
 const {data,error}=await agentCloud.functions.invoke('agent-hq-coordinate',{body:{action,assignment_id:id,...extra}});
 if(epoch!==generation||user.id!==ownerId)throw Error('The signed-in account changed. The response was not applied to this screen.');
 if(error||data?.error){let reason=data?.error;if(!reason&&error?.context?.clone){try{reason=(await error.context.clone().json())?.error}catch{}}throw Error(reason||error?.message||'The project response was not confirmed');}
 if(!data?.state)throw Error('The server did not confirm this project action');
 return data;
}
async function sync(){await Promise.allSettled([refresh(),window.agentHQTeamCloud?.refresh(),window.agentHQCoordCloud?.refresh(),window.agentHQChatCloud?.refresh(),window.agentHQCloudApprovals?.refresh()]);}
function runnable(s){return ['planning','discussion','drafting','checking','polishing'].includes(s.phase)&&!s.assignment?.owner_paused&&!s.last_error&&!projectIsTyping(s)&&Date.parse(s.next_run_at||0)<=Date.now();}
async function tick(){
 if(document.hidden||inFlight){schedule(3000);return;}
 await refresh();
 const id=[...wanted].find(id=>!rows.some(s=>s.assignment_id===id))||rows.filter(runnable).at(-1)?.assignment_id;
 if(!id){schedule(rows.some(s=>projectIsTyping(s))?2500:12000);return;}
 inFlight=id;const epoch=generation;
 try{
  // One model request at a time. No synthetic typing delay or continuous model polling.
  const promise=invoke('next',id);setTimeout(()=>{if(inFlight===id&&epoch===generation)refresh();},700);
  const result=await promise;
  if(epoch!==generation)return;
  wanted.delete(id);
  if(result.state==='failed')window.agentHQProjectsError?.(result.message||'The team paused. Retry this turn in the project.');
  await sync();
 }catch(error){if(epoch===generation){wanted.delete(id);window.agentHQProjectsError?.(error.message);}}
 finally{if(epoch===generation){inFlight=null;schedule(2500);}}
}
async function start(id){
 await owner();wanted.add(id);selected=id;await refresh();schedule(0);
 return {state:'working',workflow_version:2};
}
async function review(id,version,decision,feedback=''){
 const result=await invoke('project_review',id,{output_version:version,decision,feedback});
 await sync();if(result.state==='ready')schedule(0);return result;
}
async function answer(id,decision,text){
 const s=rows.find(s=>s.assignment_id===id);if(!s)throw Error('This project question has changed. Refresh the conversation.');
 const result=await invoke('project_answer',id,{decision,text,revision:s.revision});
 await sync();if(result.state==='ready')schedule(0);return result;
}
async function control(id,control){const result=await invoke('project_control',id,{control});await sync();if(control!=='pause')schedule(0);return result;}
async function decidePermission(requestId,decision){
 await refresh();const s=rows.find(s=>s.phase==='waiting_permission'&&s.pending_request_id===requestId);
 if(!s)return false;
 await answer(s.assignment_id,decision,decision==='approved'?'Approved this exact request.':'Denied this request. Use an available alternative.');return true;
}
function context(worker){
 const s=worker==='hq'?rows.find(s=>s.assignment_id===selected)||rows[0]:rows.find(s=>s.assignment_id===answerTarget&&s.waiting_worker===worker);
 return s?{projectId:s.assignment_id,projectVersion:s.output_version,projectRevision:s.revision}:{};
}
function select(id){if(rows.some(s=>s.assignment_id===id)){selected=id;answerTarget=null;return true;}return false;}
function selectAnswer(id){const s=rows.find(s=>s.assignment_id===id);if(!s)return null;answerTarget=id;return s.waiting_worker;}
window.agentHQProjects={refresh,start,review,answer,control,context,select,selectAnswer,decidePermission,
 all:()=>rows,isProject:id=>rows.some(s=>s.assignment_id===id),
 renderHQ:options=>projectRoomHTML({...options,projects:rows,selected}),
 renderPrivate:(worker,options)=>projectPrivateHTML({...options,projects:rows,worker})};
agentCloud.auth.onAuthStateChange(()=>{generation++;rows=[];ownerId=null;selected=null;answerTarget=null;wanted.clear();refreshing=null;inFlight=null;clearTimeout(timer);changed();schedule(0);});
window.addEventListener('focus',()=>schedule(0));
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else schedule(0);});
schedule(0);
