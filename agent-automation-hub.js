// Combined integrations control surface. This module cannot access provider secrets.
// Existing Gmail/Meta connections and worker DNA remain unchanged.
import {agentCloud} from "./agent-cloud-auth.js";
const esc=(s)=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let result=null,message="",busy=false,lastCheck=0,checking=false;
// Keep new authorizations available while confirming intent before consuming free-plan slots.
let nangoLink="",nangoLinkExpiresAt="",nangoVerification=null,cleanupReview=null;
function render(){
 const root=document.getElementById("agenthq-automation-root");
 if(!root)return;
 const a=result?.activepieces,n=result?.nango;
 const apConnected=a?.configured===true&&a?.deliveryVerified===true;
 const apLabel=!a?"Status unknown":!a.configured?"Setup required":apConnected?"Connected · webhook delivery verified":a.deliveryStatusAvailable===false?"Configured · status unavailable":"Configured · unverified";
 const v=nangoVerification;
 const verified=v?.state==="api_verified";
 const found=v?.authorizationFound===true;
 const nangoLabel=verified?"GitHub connected · API verified":found?"GitHub authorized · API unverified":v?.state==="permissions_needed"?"Verification needs key permission":v?.state==="credentials_invalid"?"Nango verification key rejected":v?.state==="not_found"?"No matching GitHub connection":v?.state==="owner_tag_mismatch"?"GitHub connection not linked to Agent HQ":v?.state==="environment_no_connection"?"No GitHub connection in this Nango environment":v?.state==="matching_details_mismatch"?"GitHub connection details need review":v?.state==="diagnostic_incomplete"?"Nango diagnosis incomplete":v?.state==="needs_reconnect"?"GitHub authorization needs attention":v?"Live verification incomplete":n?.configured?"Configured · not live verified":"Setup required";
 const signature=JSON.stringify([!!busy,!!checking,message,result,nangoVerification,cleanupReview,nangoLink,nangoLinkExpiresAt]);
 if(root.dataset.signature===signature)return;
 root.dataset.signature=signature;
 root.innerHTML='<section class="ah-automation-hub" aria-label="Automation and connected apps">'+
  '<h3>Automations &amp; Connections</h3><p>Activepieces handles workflows. Nango authorizes additional accounts. Existing Gmail and Meta connections stay as they are.</p>'+
  '<div class="ah-automation-rows">'+
  '<div class="ah-automation-row"><strong>Activepieces · Workflows</strong><span class="ah-badge '+(apConnected?'ah-verified':a?.configured?'ah-pending':'')+'">'+esc(apLabel)+'</span>'+
  '<small>'+esc(apConnected?'Last webhook test accepted: '+new Date(a.deliveryCheckedAt).toLocaleString()+'. Check Activepieces Runs for downstream step results.':'Protected test webhook only. No unattended external actions enabled.')+'</small><button type="button" data-ah-automation="pilot" '+(busy||!a?.configured?'disabled':'')+'>Test safe workflow delivery</button></div>'+
  '<div class="ah-automation-row"><strong>Nango · New Accounts</strong><span class="ah-badge '+(verified?'ah-verified':n?.configured?'ah-pending':'')+'">'+esc(!n?'Status unknown':nangoLabel)+'</span>'+
  '<small>'+esc(n?.integrations?.length?'Allowed integrations: '+n.integrations.join(", "):"Provider authorizations require a Nango server configuration.")+'</small>'+
  (v?'<small class="ah-connect-feedback" role="status">'+esc(v.message||"Live connection test returned no detail.")+(v.githubLogin?' GitHub user: '+esc(v.githubLogin)+'.':'')+'</small>':'')+
  '<button type="button" data-ah-automation="connect" '+(busy||!n?.configured?'disabled':'')+'>Authorize a new account</button>'+
  '<small>Your existing GitHub connection is verified. Starting another authorization may use an additional Nango connection; Agent HQ will ask before proceeding.</small>'+
  '<button type="button" class="ah-review-button" data-ah-automation="inventory" '+(busy||checking||!verified?'disabled':'')+'>Review existing GitHub connections (read-only)</button>'+
  (cleanupReview?'<div class="ah-connection-review" role="status">'+
    '<strong>'+esc(cleanupReview.state==="ready"?"GitHub connection cleanup review":"Connection review needs attention")+'</strong>'+
    '<p>'+esc(cleanupReview.message||"")+'</p>'+
    (cleanupReview.state==="ready"&&cleanupReview.keep?'<p><strong>KEEP — '+esc(cleanupReview.keep.ref)+'</strong> (GitHub: '+esc(cleanupReview.keep.githubLogin)+')</p>'+
       '<small>Connections linked to this Agent HQ account: '+esc(cleanupReview.linkedCount)+'. Verified same-account alternatives: '+esc(cleanupReview.verifiedDuplicateCount)+'. Require individual review: '+esc(cleanupReview.reviewRequiredCount)+'.</small>'+
       (cleanupReview.duplicates?.length?'<ul>'+cleanupReview.duplicates.map(c=>'<li><strong>'+esc(c.ref)+'</strong> — '+esc(c.state==="same_github_user"?"Same GitHub user; possible duplicate":"Not verified; do not delete")+'</li>').join("")+'</ul>':'<p>No duplicates linked to this Agent HQ account.</p>')+
       '<small>These are shortened connection ID references for matching to Nango Connections. No connections have been deleted. Keep the marked working connection. Delete other connections in Nango only after verifying nothing else needs them.</small>':'')+
    '</div>':'')+
  (nangoLink?'<a class="ah-connect-link" href="'+esc(nangoLink)+'" target="_blank" rel="noopener noreferrer">Open secure Nango authorization ↗</a><small>This personal authorization link expires after 30 minutes. Approve GitHub access only if you agree with the permissions.</small>':'')+'</div></div>'+
  '<button type="button" class="ah-status-check" data-ah-automation="status" aria-label="Check Activepieces and Nango integration setup" aria-busy="'+(checking?'true':'false')+'" '+(busy||checking?'disabled':'')+'>'+(checking?'Checking connections…':'↻ Check both integrations')+'</button>'+
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
 if(checking){
  if(force){message="A connection check is already running.";render();}
  return;
 }
 if(busy||(!force&&Date.now()-lastCheck<15000))return;
 checking=true;lastCheck=Date.now();
 if(force)message="Checking integration settings and testing GitHub through Nango…";
 render();
 try{
  const {data}=await agentCloud.auth.getUser();
  if(!data?.user){result=null;message="Sign in to Agent HQ to check and connect accounts.";return;}
  result=await invoke("status");
  if(force){
    nangoVerification=null;cleanupReview=null;
    if(result?.nango?.configured){
      message="Integration settings recognized. Running a read-only GitHub connection test through Nango…";
      render();
      try{nangoVerification=await invoke("nango_verify");}
      catch(err){nangoVerification={state:"unavailable",verified:false,message:"GitHub verification could not finish: "+String(err?.message||err)};}
    }else nangoVerification={state:"not_configured",verified:false,message:"Configure Nango before attempting live GitHub verification."};
  }
  const clock=new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"});
  const statusA=result?.activepieces?.deliveryVerified?"connected (webhook delivery verified; check Activepieces Runs for step execution)":result?.activepieces?.configured?"configured (delivery not verified)":"setup needed";
  const statusN=result?.nango?.configured?"configured":"setup needed";
  message="Checked at "+clock+". Activepieces: "+statusA+". Nango: "+statusN+". "+
    (nangoVerification?nangoVerification.message:"Tap Check both integrations for a live, read-only GitHub test.");
 }catch(e){result=null;message="Connection check failed: "+String(e?.message||e)+". Tap Check both integrations to retry.";}
 finally{checking=false;render();}
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
 if(action==="connect"){
  const proceed=window.confirm("Your GitHub connection is already verified. Connecting a new account may use another Nango free-plan slot. Do you want to start a new authorization?");
  if(!proceed){message="New account authorization canceled. Your verified GitHub connection was not changed.";render();return;}
 }
 if(action==="status"){await refresh(true);return}
 if(action==="inventory"){
  if(!nangoVerification||nangoVerification.state!=="api_verified"){message="Verify GitHub successfully before reviewing connections.";render();return;}
  busy=true;cleanupReview=null;message="Reviewing your existing Nango GitHub connections with read-only requests…";render();
  try{cleanupReview=await invoke("nango_cleanup_preview");message=cleanupReview?.message||"Nango did not return a cleanup review.";}
  catch(err){cleanupReview={state:"unavailable",message:"Read-only connection review failed: "+String(err?.message||err)};message=cleanupReview.message;}
  finally{busy=false;render();}
  return;
 }
 busy=true;message=action==="connect"?"Creating a secure Nango authorization link…":"Sending a harmless Activepieces test…";
 if(action==="connect"){nangoLink="";nangoLinkExpiresAt="";}
 render();
 try{
  if(action==="connect")await connect();
  if(action==="pilot"){
    const data=await invoke("activepieces_pilot");
    message=data.message||"Delivery not confirmed.";
    if(data.delivered===true&&data.deliveryVerified===true){
      result={...result,activepieces:{...result?.activepieces,configured:true,deliveryVerified:true,
        deliveryCheckedAt:data.deliveryCheckedAt,executionVerified:false}};
    }
  }
 }catch(err){
  message="Connection action failed: "+String(err?.message||err)+". Your saved settings have not been changed; retry from this screen.";
 }
 finally{busy=false;render()}
});
const observer=new MutationObserver(()=>{if(document.getElementById("agenthq-automation-root")){render();refresh().catch(()=>{});}});
observer.observe(document.getElementById("app")||document.body,{childList:true,subtree:true});
agentCloud.auth.onAuthStateChange(()=>{lastCheck=0;result=null;nangoVerification=null;cleanupReview=null;nangoLink="";nangoLinkExpiresAt="";message="Sign-in changed; checking integrations…";render();setTimeout(()=>refresh(false),0)});
window.addEventListener("focus",()=>{if(document.getElementById("agenthq-automation-root"))refresh(false).catch(()=>{})});
render();
