// Combined integrations control surface. This module cannot access provider secrets.
// Existing Gmail/Meta connections and worker DNA remain unchanged.
import {agentCloud} from "./agent-cloud-auth.js";
const esc=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let result=null,message="",busy=false,lastCheck=0,checking=false;
let nangoFrontend=null,nangoLoader=null,nangoLoadError="",nangoNotice="";
function preloadNango(){
 if(nangoFrontend)return Promise.resolve(nangoFrontend);
 if(nangoLoader)return nangoLoader;
 nangoLoader=Promise.race([
  import("https://esm.sh/@nangohq/frontend@0.71.12?bundle"),
  new Promise((_,reject)=>setTimeout(()=>reject(Error("Nango sign-in software timed out")),12000))
 ]).then(mod=>{
  if(typeof mod.default!=="function")throw Error("Nango sign-in software did not load correctly");
  nangoFrontend=mod.default;nangoLoadError="";render();return nangoFrontend;
 }).catch(err=>{
  nangoLoadError=String(err?.message||err);nangoLoader=null;render();throw err;
 });
 return nangoLoader;
}
function render(){
 const root=document.getElementById("agenthq-automation-root");
 if(!root)return;
 const a=result?.activepieces,n=result?.nango;
 const signature=JSON.stringify([!!busy,message,result]);
 if(root.dataset.signature===signature)return;
 root.dataset.signature=signature;
 root.innerHTML='<section class="ah-automation-hub" aria-label="Automation and connected apps">'+
  '<h3>Automations &amp; Connections</h3><p>Activepieces handles workflows. Nango authorizes additional accounts. Existing Gmail and Meta connections stay as they are.</p>'+
  '<div class="ah-automation-rows">'+
  '<div class="ah-automation-row"><strong>Activepieces · Workflows</strong><span class="ah-badge '+(a?.configured?'ah-pending':'')+'">'+esc(!a?'Status unknown':a.configured?'Configured · unverified':'Setup required')+'</span>'+
  '<small>Protected test webhook only. No unattended external actions enabled.</small><button type="button" data-ah-automation="pilot" '+(busy||!a?.configured?'disabled':'')+'>Test safe workflow delivery</button></div>'+
  '<div class="ah-automation-row"><strong>Nango · New Accounts</strong><span class="ah-badge '+(n?.configured?'ah-pending':'')+'">'+esc(!n?'Status unknown':n.configured?'Configured · unverified':'Setup required')+'</span>'+
  '<small>'+esc(n?.integrations?.length?'Allowed integrations: '+n.integrations.join(", "):"Provider authorizations require a Nango server configuration.")+'</small>'+
  '<button type="button" data-ah-automation="connect" '+(busy||!n?.configured?'disabled':'')+'>Authorize a new account</button>'+
  (nangoNotice?'<small class="ah-connect-feedback" role="status" aria-live="polite">'+esc(nangoNotice)+'</small>':'')+'</div></div>'+
  '<button type="button" data-ah-automation="status" '+(busy?'disabled':'')+'>Check both integrations</button>'+
  '<p role="status" class="ah-status">'+esc(message||"Sign in to Agent HQ to check real connector readiness.")+'</p>'+
  '<p class="ah-caution">Connected does not mean approved for every agent or action. Financial changes, spending, publishing and sensitive account operations require their own explicit permissions.</p></section>';
}
async function invoke(action){
 const {data,error}=await agentCloud.functions.invoke("agent-hq-automation",{body:{action}});
 if(error)throw Error(error.message||"Could not reach Agent HQ connectors");
 if(data?.error)throw Error(data.error);
 return data;
}
async function refresh(force=false){
 if(checking||busy||(!force&&Date.now()-lastCheck<15000))return;
 checking=true;lastCheck=Date.now();
 try{const {data}=await agentCloud.auth.getUser();if(!data?.user){result=null;message="Sign in to Agent HQ to check and connect accounts.";return;}
 result=await invoke("status");
 message="Server configuration checked. Live provider credentials and workflow execution are not verified by this status.";
 }catch(e){result=null;message="Connector status unavailable: "+String(e?.message||e)}
 finally{checking=false;render()}
}
async function connect(){
 // Create the auth window immediately on the tap so iPhone browsers can allow it.
 const nango=new nangoFrontend();
 const ui=nango.openConnectUI({onEvent(event){
   if(event?.type==="connect"){
    message="Nango reports authorization completed. The account still needs server verification.";
    nangoNotice=message;
   }
   if(event?.type==="close"&&!message.includes("completed")){
    message="Nango authorization was closed without a confirmed connection.";
    nangoNotice=message;
   }
   render();
 }});
 if(!ui||typeof ui.setSessionToken!=="function")throw Error("Nango could not open its authorization window");
 try{
  nangoNotice="Nango window opened. Requesting a secure authorization session…";render();
  const {sessionToken}=await Promise.race([
   invoke("connect_session"),
   new Promise((_,reject)=>setTimeout(()=>reject(Error("Nango session request timed out. Retry authorization.")),18000))
  ]);
  if(!sessionToken)throw Error("Nango did not return a session token");
  ui.setSessionToken(sessionToken);
  message="Nango sign-in is ready. Choose GitHub and review the requested permissions.";
  nangoNotice=message;
 }catch(err){
  try{ui.close?.()}catch{}
  throw err;
 }
}
document.addEventListener("click",async(e)=>{
 const button=e.target.closest?.("[data-ah-automation]");
 if(!button||busy)return;
 const action=button.dataset.ahAutomation;
 if(action==="status"){await refresh(true);return}
 if(action==="connect"&&!nangoFrontend){
  nangoNotice=nangoLoadError?"Nango sign-in failed to load: "+nangoLoadError+". Retrying.":"Preparing Nango sign-in. Tap again when ready.";
  message=nangoNotice;render();
  preloadNango().then(()=>{
   nangoNotice="Nango sign-in is ready. Tap Authorize a new account again.";
   message=nangoNotice;render();
  }).catch(err=>{
   nangoNotice="Nango sign-in could not load: "+String(err?.message||err)+". Retry or open Agent HQ in Safari.";
   message=nangoNotice;render();
  });
  return;
 }
 busy=true;message=action==="connect"?"Opening Nango authorization…":"Sending a harmless Activepieces test…";
 if(action==="connect")nangoNotice=message;
 render();
 try{
  if(action==="connect")await connect();
  if(action==="pilot"){const data=await invoke("activepieces_pilot");message=data.message||"Delivery not confirmed.";}
 }catch(err){
  message="Connection action failed: "+String(err?.message||err);
  if(action==="connect")nangoNotice=message+". You may retry without changing the saved keys.";
 }
 finally{busy=false;render()}
});
const observer=new MutationObserver(()=>{if(document.getElementById("agenthq-automation-root")){render();refresh().catch(()=>{});}});
observer.observe(document.getElementById("app")||document.body,{childList:true,subtree:true});
agentCloud.auth.onAuthStateChange(()=>{lastCheck=0;result=null;message="Sign-in changed; checking integrations…";render();setTimeout(()=>refresh(true),0)});
window.addEventListener("focus",()=>{if(document.getElementById("agenthq-automation-root"))refresh().catch(()=>{})});
render();
// Load the Nango client before a user tap, while keeping status UI independent.
preloadNango().catch(()=>{});
