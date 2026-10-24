// Agent HQ approved-work memory. Never stores raw unapproved conversations.
// All database reads/inserts/deletions are RLS scoped to the signed-in owner.
import {agentCloud} from "./agent-cloud-auth.js";
const escaped=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let entries=[],ready=false,busy=false,status="Sign in to view approved examples.",generation=0;
async function owner(){
 const {data,error}=await agentCloud.auth.getUser();
 if(error||!data?.user)throw Error("Sign in to Agent HQ to use approved-work knowledge.");
 return data.user;
}
function renderPanel(){
 const cards=entries.map(row=>'<article class="hq-knowledge-item">'+
 '<div><strong>'+escaped(String(row.topic||"").split("\n")[0])+'</strong>'+
 '<small>Saved '+escaped(new Date(row.created_at).toLocaleDateString())+' · Private approved draft</small></div>'+
 '<details><summary>Preview saved example</summary><pre>'+escaped(String(row.approved_excerpt||"").slice(0,700))+'</pre></details>'+
 '<button type="button" data-knowledge-forget="'+escaped(row.id)+'"'+(busy?' disabled':'')+'>Forget example</button></article>').join("");
 return '<section class="hq-knowledge">'+
 '<p>Agents can reuse relevant examples of work you explicitly approved. This is private retrieval, not model retraining; saved examples are treated as untrusted reference data.</p>'+
 '<p class="hq-knowledge-status" role="status">'+escaped(status)+'</p>'+
 '<div class="hq-knowledge-header"><strong>'+entries.length+' saved example'+(entries.length===1?'':'s')+'</strong>'+
 '<button type="button" data-knowledge-refresh'+(busy?' disabled':'')+'>Refresh</button></div>'+
 (cards||'<p>No saved examples yet. Approve a completed written draft in Messages to teach workers its style.</p>')+
 '<p>Forget removes an example from future draft context. Deleting the underlying assignment also removes its saved examples. Neither action changes your prior editorial decision.</p>'+
 '</section>';
}
function refreshVisible(){
 const root=document.getElementById("agenthq-settings-knowledge-root");
 if(root)root.innerHTML=renderPanel();
}
async function refresh(){
 const request=++generation;ready=false;status="Checking saved examples…";refreshVisible();
 try{
  const user=await owner();
  const {data,error}=await agentCloud.from("agent_approved_knowledge")
   .select("id,topic,approved_excerpt,created_at").eq("owner_id",user.id)
   .order("created_at",{ascending:false}).limit(80);
  if(error)throw Error(error.message);
  if(request!==generation)return;
  entries=data||[];ready=true;status="Saved examples are available to specialists when relevant.";
 }catch(error){
  if(request!==generation)return;
  entries=[];status="Knowledge is unavailable: "+error.message;
 }finally{if(request===generation)refreshVisible();}
}
async function rememberApproved(assignment,version,steps,worker){
 const user=await owner();
 if(!uuid.test(String(assignment?.id||""))||!/^[0-9a-f]{8}$/.test(String(version||"")))
  throw Error("A verified assignment and review version are required.");
 const complete=(Array.isArray(steps)?steps:[]).filter(s=>s.status==="completed"&&typeof s.output==="string"&&s.output.trim());
 if(!complete.length)throw Error("No completed specialist text was found to remember.");
 const topic=(String(assignment.title||"")+" \n"+String(assignment.instructions||"").slice(0,370)).trim().slice(0,600);
 const excerpt=complete.map(s=>(s.title||"Draft")+":\n"+s.output.trim()).join("\n\n").slice(0,3000);
 if(topic.length<3||excerpt.length<20)throw Error("Approved draft is too short for a useful reusable example.");
 const {error}=await agentCloud.from("agent_approved_knowledge").upsert({
  owner_id:user.id,assignment_id:assignment.id,review_version:version,
  topic,approved_excerpt:excerpt,source_worker:String(worker||"worker").slice(0,40)
 },{onConflict:"owner_id,assignment_id,review_version",ignoreDuplicates:true});
 if(error)throw Error(error.message);
 refresh().catch(()=>{});
 return true;
}
async function forget(id){
 const user=await owner();
 if(!uuid.test(String(id)))throw Error("Invalid saved example.");
 const {error}=await agentCloud.from("agent_approved_knowledge")
  .delete().eq("owner_id",user.id).eq("id",id);
 if(error)throw Error(error.message);
 entries=entries.filter(row=>row.id!==id);
 status="Example forgotten. Agents will no longer retrieve it.";
 refreshVisible();
}
document.getElementById("app")?.addEventListener("click",async event=>{
 const refreshButton=event.target.closest?.("[data-knowledge-refresh]");
 const forgetButton=event.target.closest?.("[data-knowledge-forget]");
 if(!refreshButton&&!forgetButton)return;
 event.preventDefault();if(busy)return;
 if(forgetButton&&!window.confirm("Forget this approved example? Agents will no longer use it as reference."))return;
 busy=true;refreshVisible();
 try{if(refreshButton)await refresh();else await forget(forgetButton.dataset.knowledgeForget);}
 catch(error){status="Could not change knowledge: "+error.message;}
 finally{busy=false;refreshVisible();}
});
agentCloud.auth.onAuthStateChange(()=>setTimeout(refresh,0));
window.agentHQKnowledge={rememberApproved,refresh,renderPanel};
window.addEventListener("focus",()=>{if(document.getElementById("agenthq-settings-knowledge-root"))refresh()});
refresh();
