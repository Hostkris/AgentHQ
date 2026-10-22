// Phase 7: owner-scoped business operation proposals.
// External provider accounts are NOT connected or operated by this adapter.
import {agentCloud} from './agent-cloud-auth.js';
let serial=0,signature='';
async function refresh(){
 const check=++serial;
 const {data:auth,error:authError}=await agentCloud.auth.getUser();
 if(check!==serial)return;
 if(authError||!auth?.user){
  window.agentHQOperationsSync?.([],authError?.message||'Sign in to see your business action requests.');
  return;
 }
 const {data,error}=await agentCloud.from('agent_action_proposals')
  .select('id,employee_id,provider,action_kind,summary,scope,status,execution_status,created_at,decided_at')
  .order('created_at',{ascending:false}).limit(100);
 if(check!==serial)return;
 if(error){window.agentHQOperationsError?.('Cannot load business requests: '+error.message);return}
 const rows=data||[];
 const next=JSON.stringify(rows);
 if(next!==signature){
  signature=next;
  window.agentHQOperationsSync?.(rows,'Business requests synchronized.');
 }
 return rows;
}
window.agentHQOperationsCloud={refresh};
const update=()=>refresh().catch(error=>window.agentHQOperationsError?.(error.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(update,0));
window.addEventListener('focus',update);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
setInterval(()=>{if(!document.hidden)update()},20000);
update();
