// Creative Desk: owner-directed content drafting and final editorial review.
// Reuses existing Agent HQ assignments, Alex plan approvals and worker drafts.
// No ChatGPT credentials, third-party sessions, posting or publishing occur here.
import {agentCloud} from "./agent-cloud-auth.js";

const host=document.getElementById("app");
const MARKER="Agent HQ Creative Request v1\n";
const REVIEW="CREATIVE_REVIEW_V1";
const CHATGPT_IMPORT="CHATGPT_OWNER_IMPORT_V1";
const specialists=[
 ["casey","Casey · Social Media"],["jordan","Jordan · Scripts & Content"],
 ["maya","Maya · Marketing"],["morgan","Morgan · Shopify"],
 ["taylor","Taylor · Communications"]
];
const formats=[
 ["social_post","Social media post"],["ad_copy","Advertisement copy"],
 ["video_script","Short video script"],["product_description","Product description"],
 ["email","Marketing email"],["article","Article or blog"],["calendar","Content calendar"]
];
const destinations=["Instagram","Facebook","TikTok","YouTube","Shopify","Website","Email","Other"];
const safe=value=>String(value==null?"":value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let jobs=[],steps=new Map(),messages=new Map(),plans=new Map(),notice="Sign in to see your saved creative work.",loading=false,busy=false,lastRoot=null,feedback="";
let formDraft={business:"",destination:"Instagram",format:"social_post",specialist:"casey",brief:"",requirements:""};
const summaryType=key=>formats.find(x=>x[0]===key)?.[1]||"Creative content";
function projectInfo(job){
 const text=String(job.instructions||"");
 const get=key=>text.split("\n").find(line=>line.startsWith(key+": "))?.slice(key.length+2)||"";
 return {business:get("Business"),destination:get("Destination"),format:get("Format"),specialist:get("Requested specialist"),brief:get("Brief")};
}
function ownerImport(job){
 const entries=(messages.get(job.id)||[]).filter(n=>n.sender_kind==="owner"&&n.sender_id==="owner"&&typeof n.body==="string"&&n.body.startsWith(CHATGPT_IMPORT+"\n"));
 const latest=entries.at(-1);
 return latest?{body:latest.body.slice(CHATGPT_IMPORT.length+1),createdAt:latest.created_at||null}:null;
}
function readyForReview(job){return finished(job)||Boolean(ownerImport(job));}
function buildChatGPTPrompt(job){
 const info=projectInfo(job);
 const requirements=String(job.instructions||"").split("\nRequirements: ")[1]?.split("\nDeliverable: ")[0]||"None specified";
 return ["AGENT HQ — CREATIVE REQUEST (MANUAL HANDOFF)",
 "You are helping the owner create a draft for review, not acting as an Agent HQ employee.",
 "Business/project: "+info.business,"Publishing destination: "+info.destination,
 "Content type: "+info.format,"Assignment brief: "+info.brief,
 "Owner requirements: "+requirements,
 "Create complete, editable text copy suited to that platform. If facts, prices or product claims are missing, flag them instead of inventing them.",
 "Never claim to log in, post, email, upload, or modify outside accounts. Do not publish anything.",
 "Return the draft only, with any short verification questions at the end.",
 "I will manually paste the result back into Agent HQ for my final approval."].join("\n\n");
}
function completed(job){
 return (steps.get(job.id)||[]).filter(s=>s.status==="completed"&&typeof s.output==="string"&&s.output.trim());
}
function versionOf(job){
 // Version fingerprint is for UI freshness only, not a cryptographic authorization token.
 const text=completed(job).map(s=>s.id+"|"+s.output).join("\n\n")+"\nOWNER_IMPORT|"+String(ownerImport(job)?.body||"");
 let hash=2166136261;
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(16).padStart(8,"0");
}
function reviewOf(job){
 const version=versionOf(job);
 const notes=messages.get(job.id)||[];
 const records=notes.filter(n=>n.sender_kind==="owner"&&n.sender_id==="owner")
  .map(n=>String(n.body||"").split("\n")[0].split("|"))
  .filter(parts=>parts.length===3&&parts[0]===REVIEW&&["APPROVED","REVISION_REQUESTED"].includes(parts[1])&&parts[2]===version);
 return records.length?records.at(-1)[1]:null;
}
function finished(job){
 const relevant=steps.get(job.id)||[];
 return job.coordination_status==="completed"&&relevant.length>0&&relevant.every(s=>s.status==="completed")&&completed(job).length>0;
}
function textContent(job){return [...(ownerImport(job)?["Owner-imported ChatGPT draft (source not verified by Agent HQ)\n"+ownerImport(job).body]:[]),...completed(job).map(s=>(s.title||"Draft")+" — "+(specialists.find(x=>x[0]===s.employee_id)?.[1]||s.employee_id)+"\n"+s.output)].join("\n\n---\n\n");}
function jobStatus(job){
 if(reviewOf(job)==="APPROVED")return "Approved — not published";
 if(reviewOf(job)==="REVISION_REQUESTED")return "Revisions requested";
 if(readyForReview(job))return "Ready for your review";
 if(["waiting_for_owner","waiting_for_permission"].includes(job.coordination_status))return "Worker needs information";
 if(!steps.get(job.id)?.length)return "Alex plan needed";
 if(plans.get(job.id)!=="approved")return "Approve Alex's plan";
 return "Specialist draft in progress";
}
function optionRows(items,selected){return items.map(([value,label])=>'<option value="'+safe(value)+'"'+(value===selected?' selected':'')+'>'+safe(label)+'</option>').join("");}
// Creative Desk is now a read-only workspace. Requests, approvals and sign-ins
// belong in the appropriate worker's Messages conversation.
function card(job){
 const info=projectInfo(job),all=steps.get(job.id)||[],imported=ownerImport(job),source=job.source_employee_id;
 const worker=source&&["alex","maya","jordan","riley","taylor","casey","morgan","avery","jamie","quinn","hq"].includes(source)
  ?source:(["casey","jordan","maya","morgan","taylor"].includes(info.specialist)?info.specialist:"alex");
 const drafts=all.filter(step=>typeof step.output==="string"&&step.output.trim());
 const label=jobStatus(job);
 const outputs=drafts.map(step=>'<section class="creative-step"><strong>'+safe(step.title||"Draft")+'</strong>'+
  '<div class="creative-output">'+safe(step.output)+'</div></section>').join("");
 return '<article class="creative-job" data-creative-job="'+safe(job.id)+'">'+
  '<div class="creative-job-head"><div><strong>'+safe(job.title)+'</strong><small>'+
  safe(info.business||"From worker Messages")+(info.destination?" · "+safe(info.destination):"")+
  '</small></div><span class="creative-job-state">'+safe(label)+'</span></div>'+
  (job.manager_summary?'<details class="creative-manager"><summary>Alex’s specialist plan</summary><p>'+safe(job.manager_summary)+'</p></details>':'')+
  (outputs?'<div class="creative-output-list">'+outputs+'</div>':'')+
  (imported?'<section class="creative-imported"><strong>Owner-imported text · origin not verified</strong><div class="creative-output">'+safe(imported.body)+'</div></section>':'')+
  (!outputs&&!imported?'<p class="creative-note">No completed drafts yet. Your worker will update the Messages conversation as progress is made.</p>':'')+
  '<div class="creative-controls"><button type="button" data-chat="'+safe(worker)+'">Open '+safe(worker==="alex"?"Alex":specialists.find(x=>x[0]===worker)?.[1]||"worker")+' Messages →</button></div>'+
  '<p class="creative-nopublish">Requests and approvals happen in Messages. No social publishing is active.</p></article>';
}
function isCreativeJob(job){
 const text=String(job.title||"")+" "+String(job.instructions||"");
 const worker=job.source_employee_id;
 return String(job.instructions||"").startsWith(MARKER)||
 ["casey","jordan","maya","morgan","taylor"].includes(worker)||
 /\b(creative|create (?:a |an |the )?(?:post|caption|flyer|ad|advert|script|graphic|image|photo|content)|marketing|social media|flyer|advertisement|product description|promo(?:tion)?|newsletter|campaign|reel|tiktok (?:post|video)|youtube (?:script|video)|instagram (?:post|caption))\b/i.test(text);
}
function render(){
 return '<div class="creative-page">'+
  '<section class="creative-hero"><strong>✦ Creative Desk</strong>'+
  '<p>This is your finished-work library, not a separate request form. Ask Alex or your creative workers what to make directly in Messages. They ask for clarification and approvals there.</p>'+
  '<div class="creative-engine"><span>OpenAI automatic connection: <b>Awaiting authorization · not connected</b></span>'+
  '<span>Existing Agent HQ AI workers: separate connection</span></div>'+
  '<div class="creative-controls"><button type="button" data-nav="messages">Open Messages →</button></div>'+
  '<p class="creative-note">If a worker needs a service connection, an authorization link appears in that worker’s Messages thread. Only supported connections can grant Agent HQ account access.</p></section>'+
  '<section class="creative-history"><div class="creative-history-header"><h2>Creative work history</h2>'+
  '<button type="button" data-creative-refresh>↻ Refresh</button></div>'+
  '<p class="creative-feedback" role="status">'+safe(busy?"Refreshing…":feedback||notice)+'</p>'+
  (jobs.length?jobs.map(card).join(""):'<p class="creative-empty">No creative work yet. Message Alex, Casey, Maya or Jordan to start an assignment.</p>')+
  '</section></div>';
}
function draw(force=false){
 const root=document.getElementById("agent-creative-root");
 if(!root)return;
 if(!force&&document.activeElement?.closest?.("#creative-request-form,[data-creative-import-form]"))return;
 root.innerHTML=render();
}
async function currentUser(){
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw Error(error.message);
 if(!data?.user)throw Error("Sign in under Settings before using Creative Desk.");
 return data.user;
}
async function refresh({quiet=false}={}){
 if(loading)return;
 loading=true;
 try{
  const user=await currentUser();
  const {data,error}=await agentCloud.from("agent_team_assignments")
   .select("id,title,instructions,source_employee_id,employee_ids,status,manager_summary,coordination_status,created_at")
   .eq("owner_id",user.id).order("created_at",{ascending:false}).limit(150);
  if(error)throw Error(error.message);
  const visible=(data||[]).filter(isCreativeJob);
  const ids=visible.map(x=>x.id);
  const nextSteps=new Map(),nextMessages=new Map(),nextPlans=new Map();
  if(ids.length){
   const [s,m,p]=await Promise.all([
    agentCloud.from("agent_task_steps").select("id,assignment_id,title,employee_id,status,output,question,step_number").in("assignment_id",ids).order("step_number",{ascending:true}),
    agentCloud.from("agent_team_messages").select("assignment_id,sender_kind,sender_id,body,created_at").in("assignment_id",ids).order("created_at",{ascending:true}).limit(1000),
    agentCloud.from("agent_alex_plan_decisions").select("assignment_id,status").in("assignment_id",ids)
   ]);
   if(s.error||m.error||p.error)throw Error(s.error?.message||m.error?.message||p.error?.message);
   for(const item of s.data||[])nextSteps.set(item.assignment_id,[...(nextSteps.get(item.assignment_id)||[]),item]);
   for(const item of m.data||[])nextMessages.set(item.assignment_id,[...(nextMessages.get(item.assignment_id)||[]),item]);
   for(const item of p.data||[])nextPlans.set(item.assignment_id,item.status);
  }
  jobs=visible;steps=nextSteps;messages=nextMessages;plans=nextPlans;
  notice="Saved in your signed-in Agent HQ workspace.";
  if(!quiet)feedback="";
 }catch(error){
  notice="Creative Desk could not sync: "+error.message;
  if(!quiet)feedback=notice;
 }finally{loading=false;draw();}
}
async function act(fn){
 if(busy)return;
 busy=true;feedback="";draw(true);
 try{await fn();await Promise.allSettled([window.agentHQTeamCloud?.refresh(),window.agentHQCoordCloud?.refresh()]);await refresh({quiet:true});}
 catch(error){feedback=error?.message||"Request could not be completed.";}
 finally{busy=false;draw(true);}
}
function parseJob(id){if(!uid.test(id))throw Error("Invalid content assignment");const job=jobs.find(x=>x.id===id);if(!job)throw Error("This request is unavailable. Refresh first.");return job;}
// Only history refresh is interactive here; tasks and authorizations live in Messages.
host?.addEventListener("click",event=>{
 if(event.target.closest?.("[data-creative-refresh]"))refresh();
});
window.agentHQCreativeDeskRender=render;
const observer=new MutationObserver(()=>{
 const root=document.getElementById("agent-creative-root");
 if(root!==lastRoot){lastRoot=root;if(root)refresh();}
});
if(host)observer.observe(host,{subtree:true,childList:true});
agentCloud.auth.onAuthStateChange(()=>setTimeout(()=>refresh({quiet:true}),0));
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&document.getElementById("agent-creative-root"))refresh({quiet:true});});
window.addEventListener("focus",()=>{if(document.getElementById("agent-creative-root"))refresh({quiet:true});});
