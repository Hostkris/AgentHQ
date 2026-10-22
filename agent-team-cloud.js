// Agent HQ assignment coordination. Owner writes assignment briefs and notes.
// Future worker-to-worker updates require a trusted agent runtime; never impersonate employees here.
import { agentCloud } from './agent-cloud-auth.js';

let version = 0;
async function signedIn() {
  const {data,error}=await agentCloud.auth.getUser();
  if(error)throw new Error('Could not verify sign-in: '+error.message);
  if(!data?.user)throw new Error('Sign in under Settings to save team assignments.');
  return data.user;
}
async function refresh() {
  const current=++version;
  try {await signedIn()}catch(error){
    if(current===version)window.agentHQTeamSync?.([],[],error.message);
    return;
  }
  const {data:assignments,error:assignmentError}=await agentCloud
    .from('agent_team_assignments')
    .select('id,title,instructions,info_needed,employee_ids,status,source_employee_id,manager_summary,coordination_status,created_at,updated_at')
    .order('created_at',{ascending:false}).limit(200);
  if(current!==version)return;
  if(assignmentError){
    window.agentHQTeamError?.('Could not load assignments: '+assignmentError.message);
    return;
  }
  if(!assignments?.length){
    window.agentHQTeamSync?.([],[],'No team assignments saved yet.');
    return;
  }
  const ids=assignments.map(a=>a.id);
  const {data:notes,error:notesError}=await agentCloud
    .from('agent_team_messages')
    .select('id,assignment_id,sender_kind,sender_id,message_type,body,created_at')
    .in('assignment_id',ids)
    .order('created_at',{ascending:true}).limit(1000);
  if(current!==version)return;
  if(notesError){
    window.agentHQTeamError?.('Could not load team discussion: '+notesError.message);
    return;
  }
  window.agentHQTeamSync?.(assignments,notes||[],'Team assignments and notes saved securely.');
}
async function create(title,instructions,infoNeeded,members){
  await signedIn();
  const {data,error}=await agentCloud.rpc('create_agent_team_assignment',{
    p_title:title,p_instructions:instructions,p_info_needed:infoNeeded,p_employee_ids:members
  });
  if(error)throw new Error('Assignment not saved: '+error.message);
  await refresh();
  return data;
}
async function post(assignmentId,body){
  await signedIn();
  const {data,error}=await agentCloud.rpc('post_agent_team_owner_note',{
    p_assignment_id:assignmentId,p_body:body
  });
  if(error)throw new Error('Team note not saved: '+error.message);
  await refresh();
  return data;
}
async function setStatus(assignmentId,status){
  await signedIn();
  const {data,error}=await agentCloud.rpc('set_agent_team_assignment_status',{
    p_assignment_id:assignmentId,p_status:status
  });
  if(error)throw new Error('Status not saved: '+error.message);
  await refresh();
  return data;
}
window.agentHQTeamCloud={refresh,create,post,setStatus};
const load=()=>refresh().catch(error=>window.agentHQTeamError?.(error.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(load,0));
window.addEventListener('focus',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
setInterval(()=>{if(!document.hidden)load()},30000);
load();
