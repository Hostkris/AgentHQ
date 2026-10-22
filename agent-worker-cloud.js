// Agent HQ manual worker steps. Secrets stay in Supabase, never in the browser.
import { agentCloud } from './agent-cloud-auth.js';
let generation=0;
let connectionFingerprint='';
let runsFingerprint='';

async function getUser() {
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw new Error('Could not verify sign-in: '+error.message);
 if(!data?.user)throw new Error('Sign in under Settings to use the AI worker engine.');
 return data.user;
}

async function status() {
 const serial=++generation;
 try {
  await getUser();
  const {data,error}=await agentCloud.functions.invoke('agent-hq-worker',{body:{action:'status'}});
  if(serial!==generation)return;
  if(error)throw new Error(error.message||'Worker endpoint unavailable');
  if(!data||typeof data.ready!=='boolean')throw new Error('Worker endpoint did not confirm readiness');
  const fingerprint=JSON.stringify(data);
  if(fingerprint!==connectionFingerprint){
   connectionFingerprint=fingerprint;
   window.agentHQWorkerConnection?.(data);
  }
  return data;
 } catch(error) {
  if(serial!==generation)return;
  const payload={ready:false,message:error.message,provider:null,model:null};
  const fingerprint=JSON.stringify(payload);
  if(connectionFingerprint!==fingerprint){
    connectionFingerprint=fingerprint;
    window.agentHQWorkerConnection?.(payload);
  }
  return payload;
 }
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
 await getUser();
 if(!/^[0-9a-f-]{36}$/i.test(assignmentId))throw new Error('Invalid assignment ID');
 if(!['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn'].includes(employeeId))
  throw new Error('Invalid employee');
 const {data,error}=await agentCloud.functions.invoke('agent-hq-worker',{
   body:{action:'run',assignment_id:assignmentId,employee_id:employeeId}
 });
 if(error)throw new Error(data?.error||error.context?.message||error.message||'Worker step failed');
 if(data?.error)throw new Error(data.error);
 if(!data?.success)throw new Error('The worker step was not confirmed by the server');
 await runs();
 return data;
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
