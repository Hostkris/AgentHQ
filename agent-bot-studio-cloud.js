// Private Worker Studio — only signed-in owners can view or activate bot specifications.
import {agentCloud} from './agent-cloud-auth.js';
let generation=0,lastBotHash='';
async function getUser(){
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw Error(error.message||'Agent HQ sign-in error');
 if(!data?.user)throw Error('Sign in under Settings to manage your AI coworkers.');
 return data.user;
}
async function invoke(action,extra={}){
 await getUser();
 const {data,error}=await agentCloud.functions.invoke('agent-bot-studio',{body:{action,...extra}});
 if(error){
  let message=data?.error;
  if(!message&&typeof error.context?.clone==='function'){
   try{message=(await error.context.clone().json())?.error}catch{}
  }
  throw Error(message||error.message||'Worker Studio server did not respond.');
 }
 if(data?.error)throw Error(data.error);
 return data;
}
async function refresh(){
 const serial=++generation;
 try{await getUser()}catch(error){
  if(serial===generation){
   lastBotHash="";
   window.agentHQBotStudioSync?.([],error.message,[],[]);
  }
  return [];
 }
 const {data,error}=await agentCloud.from('agent_custom_bots')
  .select('id,name,role,mission,tone,instructions,skills,anti_jobs,starting_message,category,avatar_emoji,status,template_key,created_at,updated_at')
  .order('created_at',{ascending:false}).limit(50);
 if(serial!==generation)return [];
 if(error){window.agentHQBotStudioError?.(error.message);return []}
 const bots=data||[];
 const {data:messages,error:messageError}=await agentCloud.from('agent_custom_bot_messages')
  .select('bot_id').order('created_at',{ascending:false}).limit(500);
 if(serial!==generation)return [];
 if(messageError){window.agentHQBotStudioError?.('Could not sync worker conversations: '+messageError.message);return bots}
 const messaged=[...new Set((messages||[]).map(row=>row.bot_id))];
 const {data:handoffs,error:handoffError}=await agentCloud.from('agent_custom_bot_handoffs')
  .select('id,source_bot_id,target_bot_id,brief,created_at').order('created_at',{ascending:false}).limit(40);
 if(serial!==generation)return [];
 if(handoffError){window.agentHQBotStudioError?.('Could not sync worker handoffs: '+handoffError.message);return bots}
 const key=JSON.stringify({bots,messaged,handoffs:handoffs||[]});
 if(key!==lastBotHash){
  lastBotHash=key;window.agentHQBotStudioSync?.(bots,'Your AI workers are saved under your Agent HQ sign-in.',messaged,handoffs||[]);
 }
 return bots;
}
async function history(id){
 await getUser();
 const {data,error}=await agentCloud.from('agent_custom_bot_messages')
  .select('id,bot_id,sender,body,created_at').eq('bot_id',id)
  .order('created_at',{ascending:true}).limit(300);
 if(error)throw Error(error.message);
 return data||[];
}
async function design(input){
 const result=await invoke('design',input);
 if(!result?.draft)throw Error('The AI designer did not return a draft');
 return result;
}
async function save(spec,templateKey=''){
 const r=await invoke('save',{spec,template_key:templateKey});
 await refresh();return r;
}
async function activate(id){const r=await invoke('activate',{bot_id:id});await refresh();return r}
async function archive(id){const r=await invoke('archive',{bot_id:id});await refresh();return r}
async function remove(id){const r=await invoke('delete',{bot_id:id});await refresh();return r}
async function handoff(fromId,toId,reason){
 const result=await invoke('handoff',{source_bot_id:fromId,target_bot_id:toId,reason});
 await refresh();
 return result;
}
async function send(id,message){
 const result=await invoke('chat',{bot_id:id,message});
 const transcript=await history(id);
 await refresh();
 return {result,history:transcript};
}
window.agentHQBotStudioCloud={refresh,history,design,save,activate,archive,remove,handoff,send};
const background=()=>refresh().catch(error=>window.agentHQBotStudioError?.(error.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(background,0));
window.addEventListener('focus',background);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)background()});
setInterval(()=>{if(!document.hidden)background()},35000);
background();
