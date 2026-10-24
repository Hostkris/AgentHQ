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
function card(job){
 const info=projectInfo(job),all=steps.get(job.id)||[],drafts=completed(job),imported=ownerImport(job),approval=reviewOf(job),ready=readyForReview(job),plan=plans.get(job.id),version=versionOf(job);
 const at=jobStatus(job);
 const pendingPlan=all.length>0&&plan!=="approved"&&job.coordination_status!=="completed";
 const canRun=all.length>0&&plan==="approved"&&!ready&&!["waiting_for_owner","waiting_for_permission"].includes(job.coordination_status);
 const body=all.map(step=>'<div class="creative-step"><div class="creative-step-head"><strong>'+safe(step.title)+'</strong><span>'+safe(step.employee_id)+' · '+safe(step.status)+'</span></div>'+
  (step.output?'<div class="creative-output">'+safe(step.output)+'</div>':step.question?'<p class="creative-note">Question: '+safe(step.question)+'</p>':'<p class="creative-note">No written draft yet.</p>')+'</div>').join("");
 return '<article class="creative-job" data-creative-job="'+safe(job.id)+'">'+
  '<div class="creative-job-head"><div><strong>'+safe(job.title.replace(/^Creative:\s*/,""))+'</strong><small>'+safe(info.business)+' · '+safe(info.destination)+' · '+safe(info.format)+'</small></div><span class="creative-job-state">'+safe(at)+'</span></div>'+
  '<p class="creative-brief">'+safe(info.brief)+'</p>'+
  (job.manager_summary?'<details class="creative-manager"><summary>Alex’s work plan</summary><p>'+safe(job.manager_summary)+'</p></details>':'')+
  (body?'<div class="creative-output-list">'+body+'</div>':'')+
  '<section class="creative-handoff"><h3>Use your ChatGPT subscription — manual handoff</h3>'+
  '<p>Copy this assignment into ChatGPT, then paste the text result here. This does not connect your ChatGPT account or give agents access to it.</p>'+
  '<div class="creative-controls"><button type="button" data-creative-copy-chatgpt="'+safe(job.id)+'">Copy request for ChatGPT</button>'+
  '<button type="button" data-creative-open-chatgpt="'+safe(job.id)+'">Open ChatGPT ↗</button></div>'+
  '<form data-creative-import-form="'+safe(job.id)+'"><label>Paste text made in ChatGPT (or your own draft)'+
  '<textarea name="chatgpt_output" rows="4" minlength="20" maxlength="7000" placeholder="Paste the actual completed text here…" required></textarea></label>'+
  '<button type="submit"'+(busy?' disabled':'')+'>Save text to this assignment</button></form>'+
  (imported?'<div class="creative-imported"><strong>Latest owner-imported draft — not verified as a ChatGPT response</strong><div class="creative-output">'+safe(imported.body)+'</div></div>':'')+
  '</section>'+
  '<div class="creative-controls">'+
  (!all.length?'<button type="button" data-creative-plan="'+safe(job.id)+'"'+(busy?" disabled":"")+'>Ask Alex to plan</button>':'')+
  (pendingPlan?'<button type="button" class="creative-primary" data-creative-plan-approve="'+safe(job.id)+'"'+(busy?" disabled":"")+'>Approve specialist plan</button>':'')+
  (canRun?'<button type="button" class="creative-primary" data-creative-run="'+safe(job.id)+'"'+(busy?" disabled":"")+'>Draft next specialist steps</button>':'')+
  '<button type="button" data-team-open="'+safe(job.id)+'">Open team discussion</button>'+
  (drafts.length||imported?'<button type="button" data-creative-copy="'+safe(job.id)+'">Copy draft</button>':'')+
  '</div>'+
  (ready?'<section class="creative-final"><h3>Final editorial approval</h3><p>Approve the written draft only. Publication still requires a separate platform connection and separate explicit approval.</p>'+
   (approval==="APPROVED"?'<p class="creative-confirm">✓ Written draft approved. Nothing has been posted.</p>':
    '<button type="button" class="creative-primary" data-creative-approve="'+safe(job.id)+'" data-creative-version="'+version+'"'+(busy?" disabled":"")+'>Approve text content</button>')+
   '<label for="creative-revision-'+safe(job.id)+'">Request a revision</label><textarea id="creative-revision-'+safe(job.id)+'" class="creative-revision" data-revision-input="'+safe(job.id)+'" maxlength="1200" rows="2" placeholder="What should your creative team change?"></textarea>'+
   '<button type="button" data-creative-revise="'+safe(job.id)+'" data-creative-version="'+version+'"'+(busy?" disabled":"")+'>Create revision assignment</button>'+
   '</section>':'')+
  '<p class="creative-nopublish">🔒 No external accounts are accessed and nothing is published from Creative Desk.</p></article>';
}
function render(){
 return '<div class="creative-page">'+
  '<section class="creative-hero"><strong>✦ Creative Desk</strong><p>Your request → Alex’s plan → specialist drafts → your final review. Publishing is always a separate, permissioned action.</p>'+
  '<div class="creative-engine"><span>ChatGPT automatic connection: <b>Not authorized</b></span><span>Manual ChatGPT handoff: ready</span><span>AI worker drafting: existing configured provider</span></div>'+
  '<p class="creative-note">ChatGPT subscription sign-in cannot simply be enabled on this GitHub Pages website: OpenAI’s open-source client flow requires a user-controlled local host and loopback OAuth callback. No ChatGPT password or session cookie should be entered here.</p></section>'+
  '<section class="creative-intake"><h2>New content request</h2><form id="creative-request-form">'+
  '<label>Business or project<input name="business" maxlength="90" minlength="2" required placeholder="For example: skincare store" value="'+safe(formDraft.business)+'"></label>'+
  '<div class="creative-two"><label>Destination<select name="destination">'+optionRows(destinations.map(x=>[x,x]),formDraft.destination)+'</select></label>'+
  '<label>Content type<select name="format">'+optionRows(formats,formDraft.format)+'</select></label></div>'+
  '<label>Accountable creative specialist<select name="specialist">'+optionRows(specialists,formDraft.specialist)+'</select></label>'+
  '<label>What should the team create?<textarea name="brief" maxlength="3500" minlength="10" required rows="4" placeholder="Goal, audience, product, important facts, and call to action">'+safe(formDraft.brief)+'</textarea></label>'+
  '<label>Style or requirements (optional)<textarea name="requirements" maxlength="900" rows="2" placeholder="Tone, restrictions, format, brand voice…">'+safe(formDraft.requirements)+'</textarea></label>'+
  '<button type="submit" class="creative-primary"'+(busy?" disabled":"")+'>Save request for Alex & the team</button></form>'+
  '<p class="creative-note">Saving a request does not use AI. You separately approve Alex’s plan and manually start text generation; each model request may count toward your configured provider’s usage.</p></section>'+
  '<section class="creative-history"><div class="creative-history-header"><h2>Content and approvals</h2><button type="button" data-creative-refresh>↻ Refresh</button></div>'+
  '<p class="creative-feedback" role="status">'+safe(busy?"Working on your request…":feedback||notice)+'</p>'+
  (jobs.length?jobs.map(card).join(""):'<p class="creative-empty">No saved creative requests. Use the form above to create your first one.</p>')+
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
   .select("id,title,instructions,employee_ids,status,manager_summary,coordination_status,created_at")
   .eq("owner_id",user.id).like("title","Creative:%").order("created_at",{ascending:false}).limit(80);
  if(error)throw Error(error.message);
  const visible=(data||[]).filter(x=>String(x.instructions||"").startsWith(MARKER));
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
function trackForm(form){for(const field of ["business","destination","format","specialist","brief","requirements"]){const input=form.elements.namedItem(field);if(input)formDraft[field]=String(input.value||"");}}
host?.addEventListener("input",event=>{const form=event.target.closest?.("#creative-request-form");if(form)trackForm(form);});
host?.addEventListener("submit",event=>{
 const form=event.target.closest?.("#creative-request-form");if(!form)return;
 event.preventDefault();trackForm(form);
 act(async()=>{
  await currentUser();
  const business=formDraft.business.trim(),brief=formDraft.brief.trim(),rules=formDraft.requirements.trim();
  const dest=formDraft.destination,type=formDraft.format,worker=formDraft.specialist;
  if(business.length<2||brief.length<10||!destinations.includes(dest)||!formats.some(x=>x[0]===type)||!specialists.some(x=>x[0]===worker))throw Error("Complete the required fields.");
  const title=("Creative: "+business+" · "+summaryType(type)).slice(0,150);
  const instructions=MARKER+"Business: "+business+"\nDestination: "+dest+"\nFormat: "+summaryType(type)+
   "\nRequested specialist: "+worker+"\nBrief: "+brief+"\nRequirements: "+(rules||"None specified")+
   "\nDeliverable: editable TEXT copy only, suitable for the requested destination, with no fabricated links or metrics."+
   "\nBoundaries: do not publish, post, email, browse private accounts, generate images or assert that an external action occurred. Return content for owner review.";
  if(instructions.length>10000)throw Error("The creative brief is too long.");
  if(!window.agentHQTeamCloud?.create)throw Error("The assignment service is loading. Refresh Agent HQ.");
  await window.agentHQTeamCloud.create(title,instructions,"The owner will approve Alex’s plan separately, then run writing specialists and review the result in Creative Desk.",[worker]);
  formDraft={business:"",destination:dest,format:type,specialist:worker,brief:"",requirements:""};
  feedback="Request saved. Choose Ask Alex to plan; no AI generation or publishing has started.";
 });
});
host?.addEventListener("click",event=>{
 const element=event.target.closest?.("[data-creative-refresh],[data-creative-plan],[data-creative-plan-approve],[data-creative-run],[data-creative-copy],[data-creative-approve],[data-creative-revise]");
 if(!element)return;
 const id=element.dataset.creativeRefresh?null:element.dataset.creativePlan||element.dataset.creativePlanApprove||element.dataset.creativeRun||element.dataset.creativeCopy||element.dataset.creativeApprove||element.dataset.creativeRevise;
 if(!id){refresh();return;}
 // Capture revision text before act() redraws the page for its busy state.
 const revisionValue=element.hasAttribute("data-creative-revise")?document.querySelector('[data-revision-input="'+id+'"]')?.value:"";
 if(element.hasAttribute("data-creative-copy")){
  const job=parseJob(id),text=textContent(job);
  if(!text)return;
  if(!navigator.clipboard?.writeText){window.prompt("Copy this draft:",text);return;}
  navigator.clipboard.writeText(text).then(()=>{feedback="Draft copied. Nothing was published.";draw();}).catch(()=>{window.prompt("Copy this draft:",text);});
  return;
 }
 act(async()=>{
  await currentUser();
  let job=parseJob(id);
  if(element.hasAttribute("data-creative-plan")){
   if(!window.agentHQCoordCloud?.runTeam)throw Error("Alex’s coordinator is not available.");
   await window.agentHQCoordCloud.runTeam(id,{planFirst:true,maxSteps:1});
   feedback="Alex’s plan saved. Review the specialists and approve the plan before any drafting.";
  }else if(element.hasAttribute("data-creative-plan-approve")){
   if(!window.agentHQCoordCloud?.decidePlan)throw Error("Alex’s approval service is unavailable.");
   await window.agentHQCoordCloud.decidePlan(id,"approve");
   feedback="Specialist plan approved. You can now run the writing steps.";
  }else if(element.hasAttribute("data-creative-run")){
   if(!window.agentHQCoordCloud?.runTeam)throw Error("AI team coordinator is unavailable.");
   await window.agentHQCoordCloud.runTeam(id,{planFirst:false,maxSteps:3});
   feedback="Specialist step finished or safely paused. Check the draft and worker questions.";
  }else if(element.hasAttribute("data-creative-approve")||element.hasAttribute("data-creative-revise")){
   // Reread before any review decision: a stale tab cannot approve an old version.
   await refresh({quiet:true});
   job=parseJob(id);
   if(!readyForReview(job)||versionOf(job)!==element.dataset.creativeVersion)throw Error("The draft changed or is incomplete. Review the latest version.");
   if(element.hasAttribute("data-creative-approve")){
    if(!window.confirm("Approve this written content? This does NOT authorize publication to any account or website."))return;
    if(!window.agentHQTeamCloud?.post)throw Error("Approval notes service unavailable");
    await window.agentHQTeamCloud.post(id,REVIEW+"|APPROVED|"+versionOf(job)+"\nOwner approved the written content only. No external publishing is authorized.");
    feedback="Text content approved and recorded. Publishing remains separately blocked.";
   }else{
    const detail=String(revisionValue||"").trim();
    if(detail.length<10||detail.length>1200)throw Error("Describe the revision in at least 10 characters.");
    const info=projectInfo(job);
    const worker=specialists.some(s=>s[0]===info.specialist)?info.specialist:"jordan";
    if(!window.agentHQTeamCloud?.create||!window.agentHQTeamCloud?.post)throw Error("Team assignment service unavailable");
    const request=MARKER+"Business: "+info.business+"\nDestination: "+info.destination+"\nFormat: "+info.format+
      "\nRequested specialist: "+worker+"\nBrief: Revised version of existing approved-for-review draft. Original request: "+info.brief+
      "\nRevision instructions: "+detail+"\nPrevious draft for reference:\n"+textContent(job).slice(0,4800)+
      "\nBoundaries: text only, no publication, no external actions. Return a NEW draft for owner review.";
    const next=await window.agentHQTeamCloud.create(("Creative: "+info.business+" · Revision").slice(0,150),request,
     "Owner must approve the new Alex plan and newly generated draft.",[worker]);
    await window.agentHQTeamCloud.post(id,REVIEW+"|REVISION_REQUESTED|"+versionOf(job)+"\nNew revision assignment: "+next+"\nRequested changes: "+detail);
    feedback="Revision assignment saved. The new draft requires a fresh review and approval.";
   }
  }
 });
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
