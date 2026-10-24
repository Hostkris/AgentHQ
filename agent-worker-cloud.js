// Agent HQ manual worker steps. Secrets stay in Supabase, never in the browser.
import { agentCloud } from './agent-cloud-auth.js';
let runsFingerprint='';
let statusPromise=null;

async function getUser() {
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw new Error('Could not verify sign-in: '+error.message);
 if(!data?.user)throw new Error('Sign in under Settings to use the AI worker engine.');
 return data.user;
}

// Always deliver a result, even when unchanged from the previous check.
async function getFunctionError(error) {
 let message=error?.message||'The worker endpoint could not be reached.';
 const response=error?.context;
 if(response && typeof response.clone==='function'){
  try{
   const payload=await response.clone().json();
   if(typeof payload?.error==='string')message=payload.error;
   else if(typeof payload?.message==='string')message=payload.message;
  }catch{}
 }
 return message;
}
async function requestStatus(){
 try {
  await getUser();
  const request=agentCloud.functions.invoke('agent-hq-worker',{body:{action:'status'}});
  let timeoutId;
  let output;
  try{
   output=await Promise.race([
    request,
    new Promise((_,reject)=>{
     timeoutId=setTimeout(()=>reject(new Error('The AI connection check took too long (15 seconds). Check your internet and tap Check again.')),15000);
    })
   ]);
  }finally{clearTimeout(timeoutId)}
  const {data,error}=output;
  if(error)throw new Error(await getFunctionError(error));
  if(!data||typeof data.ready!=='boolean')throw new Error('Supabase did not return an AI connection status. Refresh and try again.');
  window.agentHQWorkerConnection?.(data);
  return data;
 }catch(error){
  const payload={ready:false,provider:null,model:null,step:'error',message:error?.message||'Unknown connection error'};
  window.agentHQWorkerConnection?.(payload);
  return payload;
 }
}
async function status(){
 if(statusPromise)return statusPromise;
 statusPromise=requestStatus();
 try{return await statusPromise}finally{statusPromise=null}
}

async function runs() {
 try {
  await getUser();
  const {data,error}=await agentCloud.from('agent_worker_runs')
   .select('id,assignment_id,employee_id,status,provider,model,result_preview,error_summary,created_at,finished_at')
   .order('created_at',{ascending:false}).limit(60);
  if(error)throw new Error(error.message);
  const next=JSON.stringify(data||[]);
  if(next!==runsFingerprint){
    runsFingerprint=next;
    window.agentHQWorkerRuns?.(data||[]);
  }
  return data||[];
 }catch(error){
  window.agentHQWorkerError?.('Worker history unavailable: '+error.message);
  return [];
 }
}

async function run(assignmentId,employeeId) {
 const user=await getUser();
 if(!/^[0-9a-f-]{36}$/i.test(assignmentId))throw new Error('Invalid assignment ID');
 if(!['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn'].includes(employeeId))
  throw new Error('Invalid employee');
 const activity=window.agentHQActivity?.begin(employeeId,'Preparing assigned work',{ownerId:user.id});
 try{
 const {data,error}=await agentCloud.functions.invoke('agent-hq-worker',{
   body:{action:'run',assignment_id:assignmentId,employee_id:employeeId}
 });
 if(error)throw new Error(data?.error||error.context?.message||error.message||'Worker step failed');
 if(data?.error)throw new Error(data.error);
 if(!data?.success)throw new Error('The worker step was not confirmed by the server');
 await runs();
 return data;
 }finally{activity?.end();}
}

window.agentHQWorkerCloud={status,runs,run};
const refresh=()=>{
 status().catch(error=>window.agentHQWorkerError?.(error.message));
 runs().catch(error=>window.agentHQWorkerError?.(error.message));
};
agentCloud.auth.onAuthStateChange(()=>setTimeout(refresh,0));
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
setInterval(()=>{if(!document.hidden)runs().catch(()=>{})},30000);
refresh();

