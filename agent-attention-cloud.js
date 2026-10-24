// Fast private Agent HQ attention updates while this app is open.
// iOS suspends web apps in the background: persistent phone alerts need Web Push
// and a one-time OS-approved notification permission, not a silent JS prompt.
import {agentCloud} from './agent-cloud-auth.js';

const watched=[
 'agent_messages',
 'agent_permission_requests',
 'agent_team_assignments',
 'agent_task_steps',
 'agent_team_messages',
 'agent_project_sessions',
 'agent_action_proposals'
];
let channel=null,ownerId=null,version=0,pending=new Set(),refreshTimer=null;

function dispatch(){
 const changed=[...pending];pending.clear();
 if(document.hidden)return;
 const calls=[];
 if(changed.includes('agent_messages'))calls.push(window.agentHQChatCloud?.refresh?.());
 if(changed.includes('agent_permission_requests'))calls.push(window.agentHQCloudApprovals?.refresh?.());
 if(changed.includes('agent_team_assignments'))calls.push(window.agentHQTeamCloud?.refresh?.());
 if(changed.includes('agent_task_steps'))calls.push(window.agentHQCoordCloud?.refresh?.());
 if(changed.includes('agent_team_messages'))calls.push(window.agentHQTeamCloud?.refresh?.());
 if(changed.includes('agent_project_sessions'))calls.push(window.agentHQProjects?.refresh?.());
 if(changed.includes('agent_action_proposals'))calls.push(window.agentHQOperationsCloud?.refresh?.());
 Promise.allSettled(calls.filter(Boolean)).catch(()=>{});
}
function onChange(table){
 pending.add(table);
 if(refreshTimer!==null)clearTimeout(refreshTimer);
 refreshTimer=setTimeout(()=>{refreshTimer=null;dispatch()},250);
}
async function connect(){
 const generation=++version;
 const {data,error}=await agentCloud.auth.getUser();
 if(generation!==version)return;
 const next=error?null:data?.user?.id||null;
 if(next===ownerId&&channel)return;
 if(channel){const old=channel;channel=null;await agentCloud.removeChannel(old)}
 ownerId=next;
 if(!next)return;
 const joined=agentCloud.channel('agent-hq-attention-'+next);
 for(const table of watched){
  joined.on('postgres_changes',{
   event:'*',schema:'public',table,filter:'owner_id=eq.'+next
  },()=>onChange(table));
 }
 if(generation!==version){await agentCloud.removeChannel(joined);return}
 channel=joined;
 joined.subscribe();
}
function reconnect(){setTimeout(()=>connect().catch(()=>{}),0)}
agentCloud.auth.onAuthStateChange(reconnect);
window.addEventListener('focus',()=>{if(!document.hidden)reconnect()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconnect()});
reconnect();

