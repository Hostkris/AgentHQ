import {CHATGPT_WORKERS} from '../../../agent-chatgpt-app-core.js';
import {requestChatGPT} from '../_shared/chatgpt-requests.ts';
const uuid=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
export async function chatGPTDeskAction(db:any,owner:string,input:any){
 if(input.action==='chatgpt_desk'){
  const [requests,settings,bots,projects,sessions]=await Promise.all([
   db.from('agent_chatgpt_requests').select('*').eq('owner_id',owner).order('updated_at',{ascending:false}).limit(100),
   db.from('agent_secretary_settings').select('chatgpt_delegate_nonfinancial,chatgpt_notifications_enabled').eq('owner_id',owner).maybeSingle(),
   db.from('agent_custom_bots').select('id,name,template_key').eq('owner_id',owner).eq('status','active'),
   db.from('agent_team_assignments').select('id,title').eq('owner_id',owner).eq('workflow_version',2).order('updated_at',{ascending:false}).limit(100),
   db.from('agent_project_sessions').select('assignment_id,revision').eq('owner_id',owner)
  ]);
  if([requests,settings,bots,projects,sessions].some(x=>x.error))throw Error('Could not load the ChatGPT request desk');
  const workers=[...Object.entries(CHATGPT_WORKERS).map(([id,name])=>({id,name})),...(bots.data||[]).filter((b:any)=>b.template_key!=='eleanor-secretary-v1').map((b:any)=>({id:b.id,name:b.name}))];
  return {requests:requests.data||[],settings:settings.data||{},workers,projects:(projects.data||[]).map((p:any)=>({...p,revision:(sessions.data||[]).find((s:any)=>s.assignment_id===p.id)?.revision})),transport:'chatgpt_handoff',automatic_execution:false,paid_api_enabled:false};
 }
 if(input.action==='request_chatgpt'){
  if(input.project_id&&!uuid(input.project_id)||!uuid(input.request_id))throw Error('Choose a project and a saved request identifier');
  return await requestChatGPT(db,owner,String(input.worker||''),String(input.question||''),String(input.reason||''),'desk:'+input.request_id,input.project_id||undefined,input.revision);
 }
 if(input.action==='chatgpt_preferences'){
  if(typeof input.delegate!=='boolean'||typeof input.notifications!=='boolean')throw Error('Choose the two ChatGPT preferences');
  const {data,error}=await db.from('agent_secretary_settings').update({chatgpt_delegate_nonfinancial:input.delegate,chatgpt_notifications_enabled:input.notifications,updated_at:new Date().toISOString()}).eq('owner_id',owner).select('chatgpt_delegate_nonfinancial,chatgpt_notifications_enabled').single();
  if(error||!data)throw Error('The ChatGPT preferences could not be saved');return {settings:data,saved:true};
 }
 if(input.action==='decide_chatgpt_request'){
  if(!uuid(input.request_id)||!Number.isSafeInteger(input.revision))throw Error('Choose the exact current ChatGPT request');
  const {data,error}=await db.rpc('decide_agent_chatgpt_request',{p_owner:owner,p_request:input.request_id,p_decision:input.decision,p_revision:input.revision});
  if(error)throw Error(error.message);return data;
 }
 if(input.action==='review_chatgpt_result'){
  if(!uuid(input.request_id)||!uuid(input.output_version)||!['approve','changes'].includes(input.decision))throw Error('Choose the exact returned version');
  const {data:r,error:e}=await db.from('agent_chatgpt_requests').select('project_id,status,output_version').eq('id',input.request_id).eq('owner_id',owner).maybeSingle();
  if(e||!r||r.status!=='review'||r.output_version!==input.output_version)throw Error('This returned version changed or was already reviewed');
  const {data,error}=await db.rpc('review_agent_project',{p_owner:owner,p_assignment:r.project_id,p_version:input.output_version,p_decision:input.decision,p_feedback:String(input.feedback||'')});
  if(error)throw Error(error.message);return data;
 }
 return null;
}
