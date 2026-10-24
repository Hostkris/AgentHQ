// Combined integrations control surface. This module cannot access provider secrets.
// Existing Gmail/Meta connections and worker DNA remain unchanged.
import {agentCloud} from "./agent-cloud-auth.js";
const esc=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let result=null,message="",busy=false,lastCheck=0,checking=false;
let nangoLink="",nangoLinkExpiresAt="";
function render(){
 const root=document.getElementById("agenthq-automation-root");
 if(!root)return;
 const a=result?.activepieces,n=result?.nango;
 const signature=JSON.stringify([!!busy,message,result,nangoLink,nangoLinkExpiresAt]);
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
  (nangoLink?'<a class="ah-connect-link" href="'+esc(nangoLink)+'" target="_blank" rel="noopener noreferrer">Open secure Nango authorization ↗</a><small>This personal authorization link expires after 30 minutes. Approve GitHub access only if you agree with the permissions.</small>':'')+'</div></div>'+
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
 const data=await Promise.race([
  invoke("connect_session"),
  new Promise((_,reject)=>setTimeout(()=>reject(Error("Nango did not respond. Tap Authorize a new account to retry.")),18000))
 ]);
 if(typeof data?.connectLink!=="string")throw Error("Nango did not return a secure connection link. Check the backend and retry.");
 const u=new URL(data.connectLink);
 if(u.protocol!=="https:"||u.hostname!=="connect.nango.dev"||u.username||u.password)throw Error("Nango returned an unexpected link. Authorization was stopped for safety.");
 nangoLink=u.toString();
 nangoLinkExpiresAt=String(data.expiresAt||"");
 message="Secure Nango link created. Opening Nango for your authorization; if nothing opens, tap Open secure Nango authorization.";
 render();
 // A same-tab navigation works in Safari and installed iPhone web apps without a module SDK or popup.
 window.location.assign(nangoLink);
}
document.addEventListener("click",async(e)=>{
 const button=e.target.closest?.("[data-ah-automation]");
 if(!button||busy)return;
 const action=button.dataset.ahAutomation;
 if(action==="status"){await refresh(true);return}
 busy=true;message=action==="connect"?"Creating a secure Nango authorization link…":"Sending a harmless Activepieces test…";
 if(action==="connect"){nangoLink="";nangoLinkExpiresAt="";}
 render();
 try{
  if(action==="connect")await connect();
  if(action==="pilot"){const data=await invoke("activepieces_pilot");message=data.message||"Delivery not confirmed.";}
 }catch(err){
  message="Connection action failed: "+String(err?.message||err)+". Your saved settings have not been changed; retry from this screen.";
 }
 finally{busy=false;render()}
});
const observer=new MutationObserver(()=>{if(document.getElementById("agenthq-automation-root")){render();refresh().catch(()=>{});}});
observer.observe(document.getElementById("app")||document.body,{childList:true,subtree:true});
agentCloud.auth.onAuthStateChange(()=>{lastCheck=0;result=null;nangoLink="";nangoLinkExpiresAt="";message="Sign-in changed; checking integrations…";render();setTimeout(()=>refresh(true),0)});
window.addEventListener("focus",()=>{if(document.getElementById("agenthq-automation-root"))refresh(true).catch(()=>{})});
render();
