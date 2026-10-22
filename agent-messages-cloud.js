import { agentCloud } from './agent-cloud-auth.js';
let syncGeneration=0;
const employees = new Set(['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq']);
async function getUser() {
  const {data,error}=await agentCloud.auth.getUser();
  if(error)throw Error(error.message);
  if(!data?.user)throw Error('Sign in under Settings to sync messages.');
  return data.user;
}
async function refresh() {
  const generation=++syncGeneration;
  let user;
  try {user=await getUser()}catch(e){if(generation===syncGeneration)window.agentHQSyncMessages?.([],e.message);return}
  if(generation!==syncGeneration)return;
  const {data:chats,error:chatError}=await agentCloud.from('agent_conversations').select('id,employee_id');
  if(generation!==syncGeneration)return;
  if(chatError)throw Error(chatError.message);
  const valid=(chats||[]).filter(c=>employees.has(c.employee_id));
  if(!valid.length){window.agentHQSyncMessages?.([],'No saved text messages yet.');return}
  const {data:items,error:messageError}=await agentCloud.from('agent_messages').select('id,conversation_id,sender,body,created_at').in('conversation_id',valid.map(x=>x.id)).order('created_at',{ascending:false}).limit(1000);
  if(generation!==syncGeneration)return;
  if(messageError)throw Error(messageError.message);
  const mapping=new Map(valid.map(x=>[x.id,x.employee_id]));
  window.agentHQSyncMessages?.((items||[]).reverse().map(x=>({id:x.id,employeeId:mapping.get(x.conversation_id),sender:x.sender,text:x.body})).filter(x=>x.employeeId),'Text messages saved in Agent HQ.');
}
async function send(employeeId,body) {
  if(!employees.has(employeeId))throw Error('Invalid employee.');
  body=String(body||'').trim();
  if(!body||body.length>20000)throw Error('Enter a message under 20,000 characters.');
  const user=await getUser();
  const {data:chat,error:chatError}=await agentCloud.from('agent_conversations').upsert({owner_id:user.id,employee_id:employeeId},{onConflict:'owner_id,employee_id'}).select('id').single();
  if(chatError)throw Error(chatError.message);
  const {error}=await agentCloud.from('agent_messages').insert({owner_id:user.id,conversation_id:chat.id,sender:'owner',body});
  if(error)throw Error(error.message);
  await refresh();
}
window.agentHQChatCloud={refresh,send};
const load=()=>refresh().catch(error=>window.agentHQChatCloudNotice?.('Message sync failed: '+error.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(load,0));
window.addEventListener('focus',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
setInterval(()=>{if(!document.hidden)load()},30000);
load();
