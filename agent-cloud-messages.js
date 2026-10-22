import { agentCloud } from './agent-cloud-auth.js';
export async function getMessages(employeeId){
 const {data:thread,error}=await agentCloud.from('agent_conversations').select('id').eq('employee_id',employeeId).maybeSingle();
 if(error)throw error;if(!thread)return [];
 const r=await agentCloud.from('agent_messages').select('id,sender,body,created_at').eq('conversation_id',thread.id).order('created_at');
 if(r.error)throw r.error;return r.data||[];
}
export async function sendMessage(employeeId,body){
 const {data:{user}}=await agentCloud.auth.getUser();if(!user)throw new Error('Please sign in first.');
 let {data:thread,error}=await agentCloud.from('agent_conversations').select('id').eq('employee_id',employeeId).maybeSingle();if(error)throw error;
 if(!thread){const r=await agentCloud.from('agent_conversations').upsert({owner_id:user.id,employee_id:employeeId},{onConflict:'owner_id,employee_id'}).select('id').single();if(r.error)throw r.error;thread=r.data;}
 const r=await agentCloud.from('agent_messages').insert({conversation_id:thread.id,owner_id:user.id,sender:'owner',body});if(r.error)throw r.error;
}
