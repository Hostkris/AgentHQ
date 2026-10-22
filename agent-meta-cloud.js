// Read-only Meta Ads connection for Agent HQ.
// User tokens never reach the browser or GitHub Pages.
import {agentCloud} from './agent-cloud-auth.js';
let statusSerial=0,lastState='';
async function signedIn(){
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw Error('Could not verify Agent HQ sign-in: '+error.message);
 if(!data?.user)throw Error('Sign in under Settings before connecting Meta Ads.');
 return data.user;
}
async function call(action,extra={}){
 await signedIn();
 const {data,error}=await agentCloud.functions.invoke('agent-meta-ads',{
  body:{action,...extra}
 });
 if(error){
  let message=data?.error;
  if(!message&&typeof error.context?.clone==='function'){
   try{message=(await error.context.clone().json())?.error}catch{}
  }
  throw Error(message||error.message||'Meta Ads request did not complete');
 }
 if(data?.error)throw Error(data.error);
 return data;
}
async function refresh(){
 const serial=++statusSerial;
 let result;
 try{
  await signedIn();
  result=await call('status');
 }catch(error){
  if(serial===statusSerial)window.agentHQMetaStatus?.({
   configured:false,connected:false,accounts:[],message:error.message,auth_error:true
  });
  return;
 }
 if(serial!==statusSerial)return;
 const fingerprint=JSON.stringify(result);
 if(fingerprint!==lastState){
  lastState=fingerprint;
  window.agentHQMetaStatus?.(result);
 }
 return result;
}
async function connect(){
 const result=await call('connect');
 if(!result?.authorization_url||!/^https:\/\/www\.facebook\.com\//.test(result.authorization_url))
  throw Error('Meta did not provide a secure authorization page');
 // Navigation follows an explicit Connect button. Nothing is submitted without the user.
 window.location.assign(result.authorization_url);
 return true;
}
async function reloadAccounts(){
 const result=await call('accounts');
 await refresh();
 return result;
}
async function report(accountId,period='last_7d'){
 if(!/^act_\d+$/.test(accountId))throw Error('Choose a connected advertising account');
 if(!['yesterday','last_7d','last_30d'].includes(period))throw Error('Choose a supported reporting window');
 const data=await call('report',{account_id:accountId,period});
 if(data?.source!=='meta_marketing_api_live')throw Error('No verified Meta report was returned');
 return data;
}
async function chooseAccount(accountId){
 if(!/^act_\d+$/.test(accountId))throw Error('Choose an available advertising account');
 const result=await call('select_account',{account_id:accountId});
 await refresh();
 return result;
}
const workerIds=new Set(['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']);
async function grantWorker(workerId,accountId){
 if(!workerIds.has(workerId)||!/^act_\d+$/.test(accountId))throw Error('Choose an employee and an ad account');
 await signedIn();
 const {data,error}=await agentCloud.rpc('grant_agent_meta_worker_read',{
  p_employee_id:workerId,p_account_id:accountId
 });
 if(error||data!==true)throw Error(error?.message||'Permission could not be saved');
 await refresh();
 return true;
}
async function revokeWorker(workerId,accountId){
 if(!workerIds.has(workerId)||!/^act_\d+$/.test(accountId))throw Error('Choose an employee and an ad account');
 await signedIn();
 const {data,error}=await agentCloud.rpc('revoke_agent_meta_worker_read',{
  p_employee_id:workerId,p_account_id:accountId
 });
 if(error)throw Error(error.message);
 await refresh();
 return data===true;
}
async function disconnect(){
 const result=await call('disconnect');
 await refresh();
 return result;
}
window.agentHQMetaCloud={refresh,connect,reloadAccounts,report,chooseAccount,grantWorker,revokeWorker,disconnect};
const auto=()=>refresh().catch(err=>window.agentHQMetaError?.(err.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(auto,0));
window.addEventListener('focus',auto);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)auto()});
setInterval(()=>{if(!document.hidden)auto()},45000);
auto();
