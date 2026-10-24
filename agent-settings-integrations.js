// Settings > Accounts & Sign-Ins + Publishing Authorization.
// OAuth never accepts passwords in Agent HQ. Publishing controls are a saved
// owner preference only; they DO NOT grant or execute external posting.
import {agentCloud} from "./agent-cloud-auth.js";

const escapeText=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SERVICES=[
 {id:"chatgpt",name:"ChatGPT",mark:"✦",url:"https://chatgpt.com/",type:"chatgpt",detail:"Awaiting authorization for direct ChatGPT use by Agent HQ workers. No approved OpenAI connection is installed or application approval confirmed. Use Messages to request creative work, or open ChatGPT manually. Agent HQ never collects your ChatGPT password."},
 {id:"gmail",name:"Gmail",mark:"✉️",type:"gmail",detail:"Official Google authorization connects Gmail to Agent HQ's existing Email Center. Sending still requires your review."},
 {id:"facebook",name:"Facebook",mark:"f",url:"https://www.facebook.com/",type:"external",detail:"Signing into the Facebook website is not a Meta publishing authorization. Social publishing requires the correct Meta app scopes and account selection."},
 {id:"instagram",name:"Instagram",mark:"◎",url:"https://www.instagram.com/",type:"external",detail:"Instagram publishing access is not connected. A supported Instagram professional-account integration and publishing permission would be required."},
 {id:"tiktok",name:"TikTok",mark:"♪",url:"https://www.tiktok.com/",type:"external",detail:"TikTok website login does not authorize Agent HQ to publish. A registered app and the relevant TikTok API approval are required."},
 {id:"youtube",name:"YouTube",mark:"▶",url:"https://www.youtube.com/",type:"external",detail:"Gmail authorization does not also grant YouTube uploads. YouTube needs separate authorized Google API scopes."},
 {id:"icloud",name:"iCloud",mark:"☁",url:"https://www.icloud.com/",type:"external",detail:"Logging in to iCloud on Safari does not give Agent HQ access to iCloud Mail or Photos. Apple account passwords must never be entered here."},
 {id:"meta",name:"Meta Ads",mark:"📊",type:"meta",detail:"Existing Meta Ads integration supports read-only reports. It is not authorization to publish on Facebook or Instagram."},
 {id:"shopify",name:"Shopify",mark:"🛍",url:"https://accounts.shopify.com/",type:"external",detail:"Shopify store permissions require a separate Shopify app connection."},
 {id:"x",name:"X",mark:"𝕏",url:"https://x.com/",type:"external",detail:"Signing in on X does not authorize Agent HQ to post through its API."},
 {id:"pinterest",name:"Pinterest",mark:"📌",url:"https://www.pinterest.com/",type:"external",detail:"Pinterest publishing requires a separate approved app integration."}
];
const SERVICE_BY_ID=new Map(SERVICES.map(s=>[s.id,s]));
let state={signedIn:false,userId:null,gmail:null,meta:null,publishing:false,prefLoaded:false,loading:false,saving:false,message:"Sign in to Agent HQ to view saved connections.",settingsError:""};
let serial=0;
function socialBadge(service){
 if(service.type==="gmail"){
  if(state.gmail?.connected)return ["Connected","connected"];
  if(state.gmail?.configured)return ["Not connected","pending"];
  return ["Setup needed","pending"];
 }
 if(service.type==="meta"){
  if(state.meta?.connected)return ["Reporting connected","connected"];
  if(state.meta?.configured)return ["Not connected","pending"];
  return ["Setup needed","pending"];
 }
 return service.type==="chatgpt"?["Awaiting OpenAI authorization","pending"]:["Not linked to Agent HQ","pending"];
}
function buttons(service){
 if(service.type==="gmail")return (state.gmail?.connected?
  '<button type="button" data-ah-service="gmail-manage">Manage Gmail</button><button type="button" data-ah-service="gmail-disconnect">Disconnect</button>':
  state.gmail?.configured?'<button type="button" data-ah-service="gmail-connect">Connect with Google</button>':'<button type="button" data-ah-service="gmail-manage">Set up Gmail</button>');
 if(service.type==="meta")return (state.meta?.connected?
  '<button type="button" data-ah-service="meta-manage">View Meta Ads</button><button type="button" data-ah-service="meta-disconnect">Disconnect</button>':
  state.meta?.configured?'<button type="button" data-ah-service="meta-connect">Authorize Meta Ads (read only)</button>':'<button type="button" data-ah-service="meta-manage">Meta Ads setup</button>');
 if(service.type==="chatgpt")return '<button type="button" data-ah-service="chatgpt-open">Open ChatGPT ↗</button><button type="button" data-ah-service="chatgpt-request">Request OpenAI access ↗</button><button type="button" data-ah-service="chatgpt-help">Integration requirements ↗</button>';
 return '<button type="button" data-ah-open="'+escapeText(service.id)+'">Open official website ↗</button>'+
 '<button type="button" data-nav="accounts">Save profile in Agent HQ</button>';
}
function renderConnections(){
 return '<div class="ah-integrations">'+
 '<div class="ah-intro"><strong>Accounts &amp; Sign-Ins</strong><p>Connect supported apps here. Agent HQ never asks for your ChatGPT, Google, Apple, or social-media password.</p>'+
 '<p class="ah-status" role="status">'+escapeText(state.message)+'</p>'+
 (!state.signedIn?'<button type="button" data-ah-show-account>Sign in to Agent HQ</button>':'<span class="ah-signed-in">Agent HQ account signed in</span>')+
 '</div>'+
 '<div id="agenthq-automation-root"></div>'+ 
 '<div class="ah-service-list">'+SERVICES.map(service=>{
  const [badge,style]=socialBadge(service);
  return '<article class="ah-service" data-ah-card="'+service.id+'">'+
   '<span class="ah-service-mark" aria-hidden="true">'+escapeText(service.mark)+'</span>'+
   '<div class="ah-service-copy"><div class="ah-service-title"><strong>'+escapeText(service.name)+'</strong><span class="ah-badge ah-'+style+'">'+escapeText(badge)+'</span></div>'+
   '<p>'+escapeText(service.detail)+'</p><div class="ah-service-actions">'+buttons(service)+'</div></div></article>';
 }).join("")+'</div>'+
 '<p class="ah-caution">Opening a provider website does not connect it to Agent HQ. Only the Google Gmail and read-only Meta Ads authorization buttons use a real integration today. Other accounts require their own approved OAuth setup.</p></div>';
}
function renderPublishingCompact(){
 const enabled=state.prefLoaded&&state.publishing;
 return '<label class="ah-publish-toggle ah-publish-compact"><span><strong>Enable Authorized Social Publishing</strong>'+
 '<small>Owner approval required for every post</small></span>'+
 '<input type="checkbox" role="switch" data-ah-publish-toggle'+(enabled?" checked":"")+
 ((!state.signedIn||!state.prefLoaded||state.saving)?" disabled":"")+
 ' aria-label="Enable Authorized Social Publishing">'+
 '<span class="ah-switch" aria-hidden="true"></span></label>'+
 '<p class="ah-compact-status">'+escapeText(!state.signedIn?"Sign in to enable":!state.prefLoaded?"Checking saved setting…":state.settingsError||(enabled?"Enabled for requests only — posting unavailable":"Off — no publishing authorization"))+'</p>';
}
function renderPublishing(){
 const enabled=state.prefLoaded&&state.publishing;
 return '<div class="ah-publishing">'+
 '<div class="ah-intro"><strong>Social Publishing Authorization</strong><p>Control whether your agents may prepare requests to publish on your behalf.</p></div>'+
 '<label class="ah-publish-toggle"><span><strong>Enable Authorized Social Publishing</strong><small>Allow agents to prepare publication requests; never auto-post</small></span>'+
 '<input type="checkbox" role="switch" data-ah-publish-toggle'+(enabled?" checked":"")+
 ((!state.signedIn||!state.prefLoaded||state.saving)?" disabled":"")+' aria-label="Enable Authorized Social Publishing">'+
 '<span class="ah-switch" aria-hidden="true"></span></label>'+
 '<p class="ah-status" role="status">'+escapeText(state.settingsError||(!state.signedIn?"Sign in to save your preference.":!state.prefLoaded?"Checking your saved preference…":enabled?"Enabled for authorization requests. Live social publishing is NOT connected.":"Disabled. Agents cannot be approved for posting through this setting."))+'</p>'+
 '<div class="ah-requirements"><strong>Every post still needs:</strong><p>✓ A genuinely connected social platform account</p><p>✓ A specific employee permission for that account</p><p>✓ Your approval of the exact content and destination</p><p>✓ A trusted publisher that verifies those approvals server-side</p></div>'+
 '<p class="ah-caution">This switch is an opt-in preference, not a platform connection or an automatic-posting control. Until a supported publishing integration exists, no social-media posts can be sent by Agent HQ.</p>'+
 '<button type="button" data-settings-view="integrations">Review Accounts &amp; Sign-Ins →</button></div>';
}
function refreshVisible(){
 const connections=document.getElementById("agenthq-settings-integrations-root");
 const publishing=document.getElementById("agenthq-settings-publishing-root");
 const compact=document.getElementById("agenthq-settings-publishing-compact");
 if(compact)compact.innerHTML=renderPublishingCompact();
 if(connections)connections.innerHTML=renderConnections();
 if(publishing)publishing.innerHTML=renderPublishing();
}
async function queryService(name){
 const {data,error}=await agentCloud.functions.invoke(name,{body:{action:"status"}});
 if(error||!data||data.error)return {configured:false,connected:false,unavailable:true};
 return data;
}
async function refresh(){
 const id=++serial;
 state.loading=true;
 try{
  const {data,error}=await agentCloud.auth.getUser();
  if(error)throw Error(error.message);
  if(id!==serial)return;
  if(!data?.user){
   state={...state,signedIn:false,userId:null,gmail:null,meta:null,publishing:false,prefLoaded:false,
    message:"Sign in under Settings → Account & Sign-In to enable connections and publishing preferences.",settingsError:""};
   return;
  }
  const owner=data.user.id;
  state.signedIn=true;state.userId=owner;state.message="Checking your active integrations and saved authorizations…";
  refreshVisible();
  const [g,m,p]=await Promise.allSettled([
   queryService("agent-gmail"),queryService("agent-meta-ads"),
   agentCloud.from("agent_publishing_controls").select("publish_requests_enabled").eq("owner_id",owner).maybeSingle()
  ]);
  if(id!==serial)return;
  state.gmail=g.status==="fulfilled"?g.value:{configured:false,connected:false,unavailable:true};
  state.meta=m.status==="fulfilled"?m.value:{configured:false,connected:false,unavailable:true};
  if(p.status==="fulfilled"&&!p.value.error){
   state.publishing=p.value.data?.publish_requests_enabled===true;
   state.prefLoaded=true;state.settingsError="";
  }else{
   state.publishing=false;state.prefLoaded=false;
   state.settingsError="Publishing preference unavailable. No permission changes can be saved until the service recovers.";
  }
  state.message="Connections verified. Account access is not shared with workers unless you explicitly approve it.";
 }catch(error){
  state={...state,signedIn:false,userId:null,publishing:false,prefLoaded:false,
   message:"Connection status unavailable: "+String(error.message||error),settingsError:"Sign-in must be verified."};
 }finally{if(id===serial){state.loading=false;refreshVisible();}}
}
async function setPublishing(enabled){
 if(state.saving)return;
 const previous=state.publishing;
 if(!state.signedIn||!state.userId||!state.prefLoaded)throw Error("Sign in and check the saved preference first.");
 state.saving=true;state.settingsError="Saving your preference…";refreshVisible();
 try{
  const {data:identity,error:authError}=await agentCloud.auth.getUser();
  if(authError||identity?.user?.id!==state.userId)throw Error("Your sign-in changed. Please refresh.");
  const {data,error}=await agentCloud.from("agent_publishing_controls").upsert({
    owner_id:state.userId,publish_requests_enabled:enabled===true,per_post_approval_required:true,updated_at:new Date().toISOString()
   },{onConflict:"owner_id"}).select("publish_requests_enabled").single();
  if(error||!data||data.publish_requests_enabled!==(enabled===true))
   throw Error(error?.message||"The database did not confirm the change.");
  state.publishing=data.publish_requests_enabled;
  state.settingsError=enabled?"Preference saved. Agents may propose posts, but none can publish yet.":"Preference saved. Social publishing requests disabled.";
 }catch(error){
  state.publishing=previous;state.settingsError="Could not change permission: "+error.message;
 }finally{state.saving=false;refreshVisible();}
}
const app=document.getElementById("app");
app?.addEventListener("change",event=>{
 const input=event.target.closest?.("[data-ah-publish-toggle]");if(!input)return;
 const enabled=input.checked;input.checked=state.publishing;
 if(enabled&&!window.confirm("Enable requests for authorized publishing? No social platform will be connected, and every actual post will still require separate final approval."))return;
 setPublishing(enabled);
});
app?.addEventListener("click",async event=>{
 const external=event.target.closest?.("[data-ah-open]");
 if(external){
  const service=SERVICE_BY_ID.get(external.dataset.ahOpen);
  if(!service?.url)return;
  window.open(service.url,"_blank","noopener,noreferrer");
  return;
 }
 const action=event.target.closest?.("[data-ah-service],[data-ah-show-account]");
 if(!action)return;
 if(action.hasAttribute("data-ah-show-account")){window.agentHQSettingsNavigate?.("account");return;}
 const value=action.dataset.ahService;
 if(["chatgpt-help","chatgpt-open","chatgpt-request"].includes(value)){
  const url=value==="chatgpt-open"?"https://chatgpt.com/":value==="chatgpt-request"?"https://openai.com/form/sign-in-with-chatgpt-interest/":"https://developers.openai.com/siwc/website";
  window.open(url,"_blank","noopener,noreferrer");return;
 }
 if(["gmail-manage","meta-manage"].includes(value)){
  const nav=value==="gmail-manage"?"email":"operations";
  // Let Agent HQ's existing delegated data-nav handler perform the transition.
  const destination=document.createElement("button");
  destination.type="button";destination.hidden=true;destination.dataset.nav=nav;
  app.append(destination);destination.click();destination.remove();
  return;
 }
 if(!state.signedIn){state.message="Sign in to Agent HQ first.";refreshVisible();return;}
 if(!["gmail-connect","meta-connect","gmail-disconnect","meta-disconnect"].includes(value))return;
 if(value.endsWith("-disconnect")&&!window.confirm("Disconnect this "+(value.startsWith("gmail")?"Gmail":"Meta Ads")+" account from Agent HQ?"))return;
 action.disabled=true;state.message="Opening the official authorization flow or updating the saved connection…";refreshVisible();
 try{
  if(value==="gmail-connect")await window.agentHQEmailCloud?.connect();
  else if(value==="meta-connect")await window.agentHQMetaCloud?.connect();
  else if(value==="gmail-disconnect")await window.agentHQEmailCloud?.disconnect();
  else await window.agentHQMetaCloud?.disconnect();
  state.message="Action completed. Reloading account status.";
 }catch(error){state.message="Connection did not complete: "+String(error?.message||error);}
 finally{await refresh();}
});
window.agentHQSettingsIntegrations={renderConnections,renderPublishing,renderPublishingCompact,refresh};
window.agentHQSettingsDidOpen=(view)=>{
 if(view==="integrations"||view==="publishing"||view==="home")refresh();
};
agentCloud.auth.onAuthStateChange(()=>{++serial;setTimeout(()=>refresh(),0)});
window.addEventListener("focus",()=>{if(document.getElementById("agenthq-settings-integrations-root")||document.getElementById("agenthq-settings-publishing-root"))refresh()});
refresh();