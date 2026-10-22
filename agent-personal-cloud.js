// Owner-scoped personal account labels and individual worker approval plans.
// Profiles contain NO passwords, cookies, OAuth tokens or platform sessions.
// Even approved plans DO NOT grant live external account access.
import {agentCloud} from './agent-cloud-auth.js';
const PLATFORM_IDS=new Set([
 'instagram','facebook','tiktok','youtube','threads','pinterest',
 'x','snapchat','google_ads','tiktok_ads','pinterest_ads'
]);
const STAFF_IDS=new Set([
 'alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn'
]);
const CAPS=new Set([
 'draft_posts','draft_replies','plan_content',
 'read_account_data','publish_content','manage_messages'
]);
let version=0,lastState='';
async function signedIn(){
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw Error('Account sign-in could not be verified: '+error.message);
 if(!data?.user)throw Error('Sign in under Settings to manage your personal accounts.');
 return data.user;
}
async function refresh(){
 const serial=++version;
 try{await signedIn()}
 catch(error){
  if(serial===version)window.agentHQPersonalSync?.([],[],error.message);
  return;
 }
 const [accounts,permissions]=await Promise.all([
  agentCloud.from('agent_personal_accounts')
   .select('id,platform,label,handle,integration_status,created_at')
   .order('created_at',{ascending:false}).limit(50),
  agentCloud.from('agent_personal_permission_plans')
   .select('id,account_id,employee_id,capability,purpose,status,expires_at,requested_at,decided_at,revoked_at,external_execution_enabled')
   .order('requested_at',{ascending:false}).limit(300)
 ]);
 if(serial!==version)return;
 if(accounts.error||permissions.error){
  window.agentHQPersonalError?.(accounts.error?.message||permissions.error?.message||'Failed to synchronize personal accounts');
  return;
 }
 const a=accounts.data||[],p=permissions.data||[];
 const next=JSON.stringify({a,p});
 if(next!==lastState){
  lastState=next;
  window.agentHQPersonalSync?.(a,p,'My accounts are saved privately under my sign-in.');
 }
 return {accounts:a,permissions:p};
}
async function rpc(name,args){
 await signedIn();
 const {data,error}=await agentCloud.rpc(name,args);
 if(error)throw Error(error.message||'Account permission could not be saved');
 if(!data)throw Error('The server did not confirm your changes');
 await refresh();
 return data;
}
async function addAccount(platform,label,handle){
 if(!PLATFORM_IDS.has(platform))throw Error('Choose a supported social or advertising platform.');
 label=String(label||'').trim();handle=String(handle||'').trim();
 if(label.length<1||label.length>80||handle.length<2||handle.length>120)throw Error('Enter a name and a profile handle (not a password).');
 return rpc('register_agent_personal_account',{
  p_platform:platform,p_label:label,p_handle:handle
 });
}
async function removeAccount(id){
 return rpc('remove_agent_personal_account',{p_account_id:id});
}
async function requestPermission(accountId,worker,capability,purpose){
 if(!STAFF_IDS.has(worker)||!CAPS.has(capability))throw Error('Choose a valid worker and task scope.');
 purpose=String(purpose||'').trim();
 if(purpose.length<5||purpose.length>500)throw Error('Explain the purpose in 5–500 characters.');
 return rpc('request_agent_personal_permission',{
  p_account_id:accountId,p_employee_id:worker,
  p_capability:capability,p_purpose:purpose
 });
}
async function decidePermission(id,approved){
 return rpc('decide_agent_personal_permission',{
  p_permission_id:id,p_approve:approved===true
 });
}
async function revokePermission(id){
 return rpc('revoke_agent_personal_permission',{p_permission_id:id});
}
window.agentHQPersonalCloud={
 refresh,addAccount,removeAccount,requestPermission,decidePermission,revokePermission
};
const reload=()=>refresh().catch(error=>window.agentHQPersonalError?.(error.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(reload,0));
window.addEventListener('focus',reload);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
setInterval(()=>{if(!document.hidden)reload()},30000);
reload();
