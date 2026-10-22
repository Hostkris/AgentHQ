const staff=[["alex","👔","Alex","General Manager"],["maya","📣","Maya","Marketing"],["jordan","🎬","Jordan","Scripts & Content"],["riley","🔎","Riley","Research"],["taylor","📧","Taylor","Communications"],["casey","📱","Casey","Social Media"],["morgan","🛍️","Morgan","Shopify"],["avery","📊","Avery","Business Analysis"],["jamie","📅","Jamie","Scheduling"],["quinn","💡","Quinn","Growth & Partnerships"]];const app=document.querySelector("#app");let screen="home",active=null;const drafts=new Map();const messages=new Map();const sendFeedback=new Map();const sendingAgents=new Set();let chatNotice="Loading saved text messages…",chatFingerprint="";const teamAssignments=new Map(),teamNotes=new Map();let teamActive=null,teamNotice="Loading team assignments…",teamFingerprint="",teamCreateFeedback="",teamPostFeedback="",teamDraft="",teamSaving=false;
window.agentHQTeamSync=(assignments,notes,notice)=>{
  const fingerprint=JSON.stringify({assignments,notes});
  if(fingerprint===teamFingerprint&&teamNotice===notice)return;
  teamFingerprint=fingerprint;teamNotice=notice;
  teamAssignments.clear();teamNotes.clear();
  for(const a of assignments)teamAssignments.set(a.id,a);
  for(const n of notes){if(!teamAssignments.has(n.assignment_id))continue;teamNotes.set(n.assignment_id,[...(teamNotes.get(n.assignment_id)||[]),n])}
  if(["team","assignments","messages","chat"].includes(screen))renderWithoutInterruptingDraft()
};
window.agentHQTeamError=(message)=>{teamNotice=message;if(["team","assignments","messages"].includes(screen))renderWithoutInterruptingDraft()};
const teamMemberNames=ids=>(ids||[]).map(id=>staff.find(s=>s[0]===id)?.[2]||id).join(", ");
const teamStatusLabel={planned:"Planned",in_progress:"In progress",blocked:"Waiting for information",completed:"Completed"};
const workerHistory=[];let workerConnection={ready:false,message:"Checking AI connection…",provider:null,model:null},workerBusy=null,workerCheckBusy=false,workerFeedback="";
window.agentHQWorkerConnection=data=>{const next={ready:!!data.ready,message:String(data.message||""),provider:data.provider||null,model:data.model||null};
 workerConnection=next;
 const message=document.querySelector("#ai-connection-message");
 if(message)message.textContent=next.message;
 const provider=document.querySelector("#ai-provider-value");
 if(provider)provider.textContent=next.ready?(next.provider==="groq"?"Groq":next.provider==="openrouter"?"OpenRouter":"AI provider")+" ✓ Verified":"Not verified";
 if(["team","assignments","chat"].includes(screen))renderWithoutInterruptingDraft()
};
window.agentHQWorkerRuns=rows=>{if(JSON.stringify(rows)===JSON.stringify(workerHistory))return;workerHistory.splice(0,workerHistory.length,...rows);if(screen==="team")renderWithoutInterruptingDraft()};
window.agentHQWorkerError=message=>{workerFeedback=message;if(["team","assignments"].includes(screen))renderWithoutInterruptingDraft()};

const coordSteps=new Map(),coordProgress=new Map(),answerDrafts=new Map(),answeringAssignments=new Set();
let coordNotice="Loading worker handoffs…",coordFingerprint="";
window.agentHQCoordSync=(rows,notice)=>{
 const next=JSON.stringify(rows);
 if(next===coordFingerprint&&notice===coordNotice)return;
 coordFingerprint=next;coordNotice=notice;
 coordSteps.clear();
 for(const step of rows)coordSteps.set(step.assignment_id,[...(coordSteps.get(step.assignment_id)||[]),step]);
 for(const steps of coordSteps.values())steps.sort((a,b)=>a.step_number-b.step_number);
 if(["chat","team","assignments","messages"].includes(screen))renderWithoutInterruptingDraft();
};
window.agentHQCoordError=message=>{coordNotice=message;if(["chat","team","assignments"].includes(screen))renderWithoutInterruptingDraft()};
window.agentHQCoordProgress=data=>{
 coordProgress.set(data.assignmentId,data);
 if(["chat","team","assignments"].includes(screen))renderWithoutInterruptingDraft();
};
const workerLabel=id=>staff.find(s=>s[0]===id)?.[2]||id;
const coordLabels={manual:"Not planned",planning:"Manager planning",ready:"Worker queued",working:"Drafting",waiting_for_owner:"Needs your answer",waiting_for_permission:"Permission requested",completed:"Drafts ready for review",failed:"Coordination paused"};
function taskStats(a){
 const steps=coordSteps.get(a.id)||[],completed=steps.filter(step=>step.status==="completed").length;
 const waiting=steps.find(step=>["waiting_for_owner","waiting_for_permission"].includes(step.status));
 const state=coordProgress.get(a.id)?.active?coordProgress.get(a.id).stage:(waiting?.status||a.coordination_status||"manual");
 return {steps,completed,percent:steps.length?Math.round(completed/steps.length*100):0,state,waiting};
}
function renderProgressBar(a){
 const p=taskStats(a);
 return '<div class="assignment-progress"><div class="progress-meta"><span>'+escapeHTML(coordLabels[p.state]||p.state)+'</span><strong>'+p.completed+'/'+p.steps.length+' steps · '+p.percent+'%</strong></div><div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p.percent+'" aria-label="Completed drafting steps"><div class="progress-fill" style="width:'+p.percent+'%"></div></div></div>';
}
const approvalRequests=new Map();let approvalNotice="Connecting saved permission requests…",approvalFingerprint="";const pendingCount=()=>[...approvalRequests.values()].filter(r=>r.status==="pending").length;const requestApproval=async(agentId,website,reason)=>{if(!staff.some(s=>s[0]===agentId))throw Error("Unknown employee");if(!window.agentHQCloudApprovals)throw Error("Permission service is loading. Try again shortly.");return window.agentHQCloudApprovals.create(agentId,website,reason)};window.agentHQRequestApproval=requestApproval;window.agentHQSyncApprovals=(rows,notice)=>{const fingerprint=JSON.stringify(rows);if(fingerprint===approvalFingerprint&&notice===approvalNotice)return;approvalFingerprint=fingerprint;approvalNotice=notice;approvalRequests.clear();for(const [id,items] of messages)messages.set(id,items.filter(m=>m.type!=="approval"));for(const row of rows){if(!staff.some(s=>s[0]===row.employee_id))continue;const status=row.status==="pending"&&Date.parse(row.expires_at)<=Date.now()?"expired":row.status;(window.agentHQStartedChats??=new Set()).add(row.employee_id);approvalRequests.set(row.id,{id:row.id,agentId:row.employee_id,website:row.target_url,reason:row.reason,status,kind:row.request_kind,createdAt:row.created_at,expiresAt:row.expires_at});messages.set(row.employee_id,[...(messages.get(row.employee_id)||[]),{type:"approval",id:row.id}])}if(screen==="chat"||screen==="approvals"||screen==="messages"||screen==="contacts")renderWithoutInterruptingDraft()};window.agentHQApprovalCloudError=message=>{approvalNotice=message;approvalFingerprint="";if(screen==="approvals"||screen==="chat")renderWithoutInterruptingDraft()};const assessResearchTarget=(raw)=>{let url;try{url=new URL(raw)}catch{return {level:"blocked",reason:"Invalid website address"}}if(!["https:","http:"].includes(url.protocol)||url.username||url.password)return {level:"blocked",reason:"Unsupported or credential-bearing URL"};const host=url.hostname.toLowerCase();if(host==="localhost"||host.endsWith(".local")||host.endsWith(".internal")||/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)||/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)||host==="[::1]")return {level:"blocked",reason:"Local or private network destination"};if(url.protocol!=="https:")return {level:"review",reason:"Unencrypted HTTP connection"};if(/(?:login|signin|account|checkout|payment|billing|admin|download|upload|oauth|authorize)/i.test(url.pathname+url.search))return {level:"review",reason:"Sensitive account, payment, or file-related page"};return {level:"review",reason:"Unverified external website. Manual approval required for simulated agent research"}};const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));window.agentHQSyncMessages=(rows,notice)=>{const next=JSON.stringify(rows);if(next===chatFingerprint&&notice===chatNotice)return;chatFingerprint=next;chatNotice=notice;for(const [id,items] of messages)messages.set(id,items.filter(m=>m.type==="approval"));for(const row of rows){if(!["hq",...staff.map(s=>s[0])].includes(row.employeeId))continue;(window.agentHQStartedChats??=new Set()).add(row.employeeId);messages.set(row.employeeId,[...(messages.get(row.employeeId)||[]),{id:row.id,type:"text",text:row.text,sender:row.sender,createdAt:row.createdAt}])}if(screen==="chat"||screen==="messages"||screen==="contacts")renderWithoutInterruptingDraft()};window.agentHQChatCloudNotice=(notice,quiet=false)=>{if(chatNotice===notice)return;chatNotice=notice;if(!quiet&&(screen==="chat"||screen==="messages"))renderWithoutInterruptingDraft()};const getConversationPreview=id=>{
 const last=(messages.get(id)||[]).filter(m=>m.type!=="approval").at(-1);
 if(last)return " · "+escapeHTML(String(last.text).replace(/\s+/g," ").slice(0,55));
 const waiting=[...coordSteps.values()].flat().some(step=>step.employee_id===id&&["waiting_for_owner","waiting_for_permission"].includes(step.status));
 if(waiting)return " · Waiting for you";
 return "";
};function renderWithoutInterruptingDraft(){if((screen==="chat"&&(document.activeElement?.id==="draft"||document.activeElement?.hasAttribute?.("data-answer-input")||sendingAgents.has(active)||answeringAssignments.size>0))||((screen==="team"||screen==="assignments")&&(teamSaving||["team-title","team-instructions","team-info","team-note"].includes(document.activeElement?.id)))){const notice=document.querySelector("#chat-sync-status");if(notice)notice.textContent=chatNotice+" Permission requests: "+approvalNotice+" No AI worker is connected.";return}render()}const button=(label,screenName,emoji)=>`<button class="tile" data-nav="${screenName}"><span class="emoji">${emoji}</span><span>${label}</span></button>`;
const teamRows=()=>[...teamAssignments.values()].map(a=>
 '<div class="assignment-list-item"><button class="row task-row" data-team-open="'+escapeHTML(a.id)+'"><span class="avatar">📋</span><span>'+
 '<strong>'+escapeHTML(a.title)+'</strong><small>'+escapeHTML(teamMemberNames(a.employee_ids))+'</small>'+
 '<small>'+escapeHTML(coordLabels[a.coordination_status]||teamStatusLabel[a.status]||a.status)+'</small>'+
 renderProgressBar(a)+'</span></button><button class="tiny-delete assignment-delete" type="button" data-delete-assignment="'+escapeHTML(a.id)+'" aria-label="Delete assignment '+escapeHTML(a.title)+'" title="Delete assignment">×</button></div>').join("");
function renderAIConnectionGuide(){
 const provider=workerConnection.ready?(workerConnection.provider==="groq"?"Groq":workerConnection.provider==="openrouter"?"OpenRouter":"AI provider"):"Not verified";
 return `<section class="card" id="ai-connection-guide">
  <h2>AI connection</h2>
  <p><strong>Provider:</strong> <span id="ai-provider-value">${escapeHTML(provider)} ${workerConnection.ready?"✓ Verified":""}</span></p>
  <p class="notice" id="ai-connection-message" role="status">${escapeHTML(workerConnection.message)}</p>
  <button type="button" class="back" data-worker-check="1" ${workerCheckBusy?"disabled":""}>${workerCheckBusy?"Checking…":"↻ Check Groq / AI connection"}</button>
  <p class="notice">A connection check only verifies the API key. It does not generate text, spend generation tokens, or start a worker.</p>
 </section>`;
}
function renderAssignments(){
  return `${renderAIConnectionGuide()}<p class="notice">${escapeHTML(teamNotice)} Create and save an assignment to use the worker’s Draft next step button. ${workerConnection.ready?"Your AI provider is verified. The worker runs only when you tap its button.":"You can save an assignment now, but the AI provider must be verified before a worker can draft."}</p>
  <section class="card"><h2>New team assignment</h2>
   <form id="team-create-form">
   <label for="team-title">Assignment title</label><input id="team-title" maxlength="160" required placeholder="Example: Plan a product launch" class="form-field">
   <label for="team-instructions">Task and acceptance criteria</label><textarea id="team-instructions" required maxlength="10000" class="form-field" placeholder="Describe the work and what counts as complete"></textarea>
   <label for="team-info">Information needed to finish</label><textarea id="team-info" maxlength="5000" class="form-field" placeholder="Links, files, decisions, account permissions, or questions to resolve"></textarea>
   <strong>Employees assigned</strong><div class="team-members">${staff.map(s=>`<label><input type="checkbox" name="member" value="${s[0]}"> ${escapeHTML(s[2])} — ${escapeHTML(s[3])}</label>`).join("")}</div>
   <button type="submit" class="primary">Save team assignment</button></form>
   <p id="team-create-feedback" class="notice" role="status">${escapeHTML(teamCreateFeedback)}</p></section>
   <h2>Team assignment discussions</h2>
   ${teamAssignments.size?teamRows():`<p class="muted">No assignments yet. Create one above to open a private team discussion.</p>`}`;
}

function renderQuestionCards(employeeId){
 const rows=[...teamAssignments.values()].flatMap(a=>(coordSteps.get(a.id)||[])
  .filter(step=>step.employee_id===employeeId&&["waiting_for_owner","waiting_for_permission"].includes(step.status))
  .map(step=>({a,step})));
 if(!rows.length)return "";
 return '<section class="task-questions"><h2>Worker questions and permission requests</h2>'+
 rows.map(({a,step})=>'<div class="card task-question"><strong>'+escapeHTML(workerLabel(step.employee_id))+' · '+escapeHTML(a.title)+'</strong>'+
 '<p class="notice">'+(step.status==="waiting_for_permission"?"Website approval does not start browsing. Reply with source information to let the team continue drafting.":"The worker needs your reply before continuing.")+'</p>'+
 '<p>'+escapeHTML(step.question||"Please provide the missing information.")+'</p>'+
 '<form data-task-answer="'+escapeHTML(a.id)+'"><textarea data-answer-input="'+escapeHTML(a.id)+'" aria-label="Answer task question" maxlength="10000" placeholder="Reply with what your worker needs…"></textarea>'+
 '<button type="submit" class="primary" '+(answeringAssignments.has(a.id)?"disabled":"")+'>Answer and resume team</button></form></div>').join("")+'</section>';
}
function renderCoordinationPanel(a){
 const p=taskStats(a),record=coordProgress.get(a.id),busy=Boolean(record?.active||window.agentHQCoordCloud?.isRunning?.(a.id));
 const pending=p.steps.some(step=>step.status==="queued");
 const start=!p.steps.length&&a.status!=="completed";
 const continueTeam=p.steps.length>0&&pending&&!p.waiting;
 const entries=p.steps.map(step=>'<li class="handoff-step"><strong>'+escapeHTML(workerLabel(step.employee_id))+' — '+escapeHTML(step.title)+'</strong>'+
 '<small>'+escapeHTML(({queued:"Queued",running:"Drafting",completed:"Draft finished",waiting_for_owner:"Waiting for answer",waiting_for_permission:"Permission needed",failed:"Paused"})[step.status]||step.status)+'</small>'+
 (step.handoff_from?'<small>Handoff from '+escapeHTML(workerLabel(step.handoff_from))+'</small>':"")+
 '<p>'+escapeHTML(step.instructions)+'</p>'+
 (step.output?'<details><summary>Read completed draft</summary><p>'+escapeHTML(step.output)+'</p></details>':"")+'</li>').join("");
 return '<section class="card coordination-panel"><h2>AI manager and worker handoffs</h2>'+
 '<p class="notice">Alex routes drafting work to specialists. Each run is bounded and only continues while this page is open. No external websites, accounts or publishing are available.</p>'+
 renderProgressBar(a)+
 (a.manager_summary?'<p><strong>Alex’s plan:</strong> '+escapeHTML(a.manager_summary)+'</p>':"")+
 (record?'<p class="notice" role="status">'+escapeHTML(record.detail)+'</p>':"")+
 (start?'<button class="primary" data-team-plan="'+escapeHTML(a.id)+'" '+(busy?"disabled":"")+'>▶ Ask Alex to plan and start</button>':"")+
 (continueTeam?'<button class="primary" data-team-continue="'+escapeHTML(a.id)+'" '+(busy?"disabled":"")+'>▶ Continue teamwork</button>':"")+
 (p.waiting?'<p><strong>'+escapeHTML(workerLabel(p.waiting.employee_id))+' needs your response in Messages.</strong></p>'+
 '<button class="back" data-chat="'+escapeHTML(p.waiting.employee_id)+'">Open worker Messages →</button>':"")+
 (entries?'<ol class="handoff-steps">'+entries+'</ol>':'<p class="muted">Alex will create the specialist handoff steps when this task starts.</p>')+
 '</section>';
}
function renderWorkerPanel(a){
 const recent=workerHistory.filter(r=>r.assignment_id===a.id).slice(0,5);
 const ready=workerConnection.ready;
 return `<section class="card"><h2>AI worker desk</h2>
 <p class="notice">Manual text drafting only. No web browsing, account access, publishing or background execution.</p>
 <p><strong>Connection:</strong> ${escapeHTML(ready?(workerConnection.provider+" · "+workerConnection.model):"Not connected")}</p>
 <p class="notice">${escapeHTML(workerConnection.message)}</p>
 <button type="button" class="back" data-worker-check="1" ${workerCheckBusy?"disabled":""}>${workerCheckBusy?"Checking…":"↻ Check AI connection"}</button>
 ${ready?`<p class="notice">Each run sends the assignment and recent team notes to the selected AI provider. Maximum 10 worker steps per hour.</p>
 <div class="worker-actions">${a.employee_ids.map(id=>`<button type="button" class="worker-run" data-worker-run="${escapeHTML(id)}" ${workerBusy?"disabled":""}>▶ ${escapeHTML(staff.find(s=>s[0]===id)?.[2]||id)} — Draft next step</button>`).join("")}</div>`:
 `<p class="notice">To connect: Supabase → Authentication → Users → copy your signed-in user UUID. Then Edge Functions → Secrets → add AGENT_HQ_ALLOWED_OWNER_IDS with that UUID, plus GROQ_API_KEY or OPENROUTER_API_KEY. Keep both values out of chats and GitHub. Provider usage limits and charges depend on your account.</p>`}
 <p id="worker-feedback" class="notice" role="status">${escapeHTML(workerBusy?"Worker drafting… please wait.":workerFeedback)}</p>
 ${recent.length?`<h3>Recent worker activity</h3>${recent.map(r=>`<p class="notice">${escapeHTML(staff.find(s=>s[0]===r.employee_id)?.[2]||r.employee_id)}: ${escapeHTML(r.status)} · ${escapeHTML(new Date(r.created_at).toLocaleString())}${r.error_summary?" · "+escapeHTML(r.error_summary):""}</p>`).join("")}`:""}
 </section>`;
}
function renderTeamThread(){
 const a=teamAssignments.get(teamActive);
 if(!a)return '<div class="card"><p>Assignment not found. Return to Assignments and sync.</p></div>';
 const notes=teamNotes.get(a.id)||[];
 return `<p class="notice">${escapeHTML(teamNotice)} ${workerConnection.ready?"Use the AI Worker Desk to request a draft from a selected worker. Nothing runs automatically.":"Worker drafts require an AI provider connection. You can save your notes now."}</p>
 <section class="card"><strong>Team</strong><p>${escapeHTML(teamMemberNames(a.employee_ids))}</p><strong>Assignment</strong><p>${escapeHTML(a.instructions)}</p>
 <strong>Information needed</strong><p>${a.info_needed?escapeHTML(a.info_needed):"Nothing specified yet. Use the discussion below to add details."}</p>
 <label for="team-status">Assignment status (set manually)</label>
 <select id="team-status" class="form-field">${Object.entries(teamStatusLabel).map(([value,label])=>`<option value="${value}" ${a.status===value?"selected":""}>${label}</option>`).join("")}</select></section>
 ${renderCoordinationPanel(a)}${renderWorkerPanel(a)}<h2>Team discussion</h2>
 <p class="notice">Assigned workers share this discussion through manual AI steps once connected. No fake replies or automatic background work.</p>
 <div class="team-thread" aria-live="polite">${notes.length?notes.map(n=>{
 const author=n.sender_kind==="owner"?"You":n.sender_kind==="agent"?(staff.find(s=>s[0]===n.sender_id)?.[2]||"Agent"):"System";
 return `<article class="team-message ${n.sender_kind==="owner"?"team-message-mine":""}"><strong>${escapeHTML(author)}</strong>${n.sender_kind==="agent"?'<small> · AI-generated draft</small>':""}<small> · ${escapeHTML(new Date(n.created_at).toLocaleString())}</small><p>${escapeHTML(n.body)}</p></article>`;
 }).join(""):'<p class="muted">No messages yet. Add assignment information or an instruction to start the discussion.</p>'}</div>
 <form id="team-note-form"><label for="team-note">Add a note or information for the team</label>
 <textarea class="form-field" id="team-note" maxlength="10000" placeholder="Share instructions, research context, resources, or information the team needs"></textarea>
 <button class="primary" type="submit">Post to team discussion</button></form>
 <p id="team-post-feedback" role="status" class="notice">${escapeHTML(teamPostFeedback)}</p>`;
}
function renderWorkerTeamLinks(employeeId){
 const related=[...teamAssignments.values()].filter(a=>(a.employee_ids||[]).includes(employeeId));
 if(!related.length)return "";
 return `<section class="team-related"><h2>Team assignments and coworker discussions</h2>
 <p class="notice">Task details and shared messages from the workers assigned to these projects appear here.</p>
 ${related.map(a=>{
 const recent=(teamNotes.get(a.id)||[]).slice(-3);
 return `<div class="card"><button type="button" class="row" data-team-open="${escapeHTML(a.id)}"><span class="avatar">👥</span><span><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(teamMemberNames(a.employee_ids))}</small><small>View full team discussion ›</small></span></button>
 <p><strong>Information needed:</strong> ${escapeHTML(a.info_needed||"No outstanding information listed.")}</p>
 <strong>Recent team messages</strong>
 ${recent.length?recent.map(n=>{
 const speaker=n.sender_kind==="owner"?"You":n.sender_kind==="agent"?(staff.find(s=>s[0]===n.sender_id)?.[2]||"Agent"):"System";
 return `<p><small>${escapeHTML(speaker)}:</small> ${escapeHTML(n.body.length>180?n.body.slice(0,180)+"…":n.body)}</p>`;
 }).join(""):'<p class="muted">No team messages yet.</p>'}</div>`;
 }).join("")}</section>`;
}

function renderIPhoneChat(){
 const person=staff.find(s=>s[0]===active);
 const title=active==="hq"?"Company HQ":(person?.[2]||"Worker");
 const role=active==="hq"?"AI team":(person?.[3]||"AI worker");
 const initial=active==="hq"?"HQ":title.slice(0,1).toUpperCase();
 const items=(messages.get(active)||[]).slice().sort((a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0));
 let previousDay="";
 const rows=items.map(item=>{
  const date=new Date(item.createdAt||Date.now());
  const day=isNaN(date.getTime())?"":date.toDateString();
  const label=day&&day!==previousDay?'<div class="ios-date">'+escapeHTML(date.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}))+'</div>':"";
  if(day)previousDay=day;
  if(item.type==="approval"){
   const r=approvalRequests.get(item.id);if(!r)return "";
   const message="Website request: "+r.website+"\nReason: "+r.reason+
    "\n"+(r.status==="pending"?"Please reply yes or no if you want to discuss approval for this specific website. No browsing will start.":"Request "+r.status+".");
   return label+'<div class="ios-message-row incoming"><div class="ios-message-bubble theirs">'+escapeHTML(message)+'</div></div>';
  }
  const mine=item.sender==="owner",system=item.sender==="system";
  return label+'<div class="ios-message-row '+(mine?"outgoing":"incoming")+'"><div class="ios-message-bubble '+(mine?"mine":"theirs")+'">'+
    (system?'<span class="ios-message-source">Team handoff</span>':"")+
    '<span class="ios-message-text">'+escapeHTML(item.text||"")+'</span>'+
    (item.id?'<button type="button" class="ios-message-delete" data-delete-message="'+escapeHTML(item.id)+'" aria-label="Delete message" title="Delete message">×</button>':"")+
    '</div></div>';
 }).join("");
 const status=sendFeedback.get(active)||"";
 const errors=/not saved|failed|unavailable|error|could not/i.test(status);
 return '<div class="ios-thread">'+
  '<div class="ios-chat-list" id="chat-scroll" aria-label="Conversation" aria-live="polite">'+
  (rows||'<div class="ios-empty-chat">Send a message to start the conversation.</div>')+
  '</div>'+
  (sendingAgents.has(active)?'<div class="ios-typing" aria-live="polite"><span></span><span></span><span></span></div>':"")+
  '<form id="composer" class="ios-composer" autocomplete="off">'+
   '<textarea id="draft" aria-label="Text message" placeholder="Text Message" rows="1" maxlength="10000"></textarea>'+
   '<button class="ios-send" id="send-message" type="submit" aria-label="Send message" '+(sendingAgents.has(active)?"disabled":"")+'><span aria-hidden="true">↑</span></button>'+
  '</form>'+
  '<div id="send-feedback" class="ios-chat-feedback" role="status" aria-live="polite">'+(errors?escapeHTML(status):"")+'</div>'+
 '</div>';
}
function render(){const isChat=screen==="chat";const title=isChat?(active==="hq"?"Company Headquarters":staff.find(x=>x[0]===active)?.[2]):screen==="team"?(teamAssignments.get(teamActive)?.title||"Team discussion"):({home:"Agent HQ",contacts:"Contacts",messages:"Messages",assignments:"Assignments",approvals:"Approvals",research:"Research",browser:"Browser",reminders:"Reminders",settings:"Settings"})[screen];let body="";if(screen==="home")body=`<p class="muted">Your private virtual company</p><div class="grid">${button("Messages","messages","💬")}${button("Contacts","contacts","👥")}${button("Company HQ","hq","🏢")}${button("Assignments","assignments","📋")}${button("Research","research","🔎")}${button("Browser","browser","🌐")}${button("Approvals","approvals","✅")}${button("Reminders","reminders","📅")}${button("Settings","settings","⚙️")}</div>`;else if(screen==="browser")body=`<section class="card"><p class="muted">Agent HQ Browser</p><form id="agent-browser-form" style="display:flex;gap:8px;flex-wrap:wrap"><input id="agent-browser-input" type="text" aria-label="Search or website" placeholder="Search the web or enter a URL" required style="flex:1;min-width:180px;padding:12px;border:1px solid #d2d2d7;border-radius:12px"><button class="primary" type="submit">Go</button></form><p class="notice" id="agent-browser-status">Searches and websites open in a new tab. Agent browsing and account access are not connected yet.</p><p class="notice">To test the permission message workflow, select an employee and create a simulated risky-site request.</p><select id="test-agent" aria-label="Employee">${staff.map(s=>`<option value="${s[0]}">${s[2]}</option>`).join("")}</select> <button type="button" id="test-risk">Test approval request</button></section>`;else if(screen==="research")body=`<section class="card"><strong>Agent research safety check</strong><p class="notice">This is a local workflow test. No AI employee or remote browsing engine is connected.</p><form id="research-form"><label for="research-agent">Employee</label><select id="research-agent">${staff.map(s=>`<option value="${s[0]}">${s[2]}</option>`).join("")}</select><label for="research-url">Website to review</label><input id="research-url" type="url" required placeholder="https://example.com" style="width:100%;padding:12px;margin:8px 0"><button class="primary" type="submit">Request research access</button></form><p id="research-status" class="notice">No external website will open automatically.</p></section>`;else if(screen==="approvals")body=`<p class="notice">${escapeHTML(approvalNotice)} These records do not grant real browsing access.</p><div class="card"><strong>Pending requests: ${pendingCount()}</strong><p class="muted">Open the employee's individual message to approve or deny.</p></div>${[...approvalRequests.values()].filter(r=>r.status==="pending").map(r=>`<button class="row" data-chat="${escapeHTML(r.agentId)}"><span class="avatar">⚠️</span><span><strong>${escapeHTML(staff.find(s=>s[0]===r.agentId)?.[2]||r.agentId)}</strong><small>${escapeHTML(r.website)}</small></span></button>`).join("")}<h2>Saved decisions</h2><p class="muted">Approved and denied requests remain visible in the employee conversation.</p>${[...approvalRequests.values()].filter(r=>r.status!=="pending").reverse().slice(0,25).map(r=>`<button class="row" data-chat="${escapeHTML(r.agentId)}"><span class="avatar">${r.status==="approved"?"✅":r.status==="denied"?"⛔":"🕒"}</span><span><strong>${escapeHTML(staff.find(s=>s[0]===r.agentId)?.[2]||r.agentId)} · ${escapeHTML(r.status)}</strong><small>${escapeHTML(r.website)}</small></span></button>`).join("")}`;else if(screen==="assignments")body=renderAssignments();else if(screen==="team")body=renderTeamThread();else if(screen==="contacts"||screen==="messages")body=`<input id="search" aria-label="Search workers" placeholder="Search" style="width:100%;padding:12px;border:1px solid #d2d2d7;border-radius:14px"><div id="contact-list"></div>`;else if(isChat)body=renderIPhoneChat();else body=`<div class="card"><strong>Planned feature</strong><p class="muted">This screen will be connected in a later development phase. No live service is connected yet.</p></div>`;if(isChat){
 const person=staff.find(row=>row[0]===active);
 const name=active==="hq"?"Company HQ":(person?.[2]||"Worker");
 const role=active==="hq"?"AI team":(person?.[3]||"AI coworker");
 const initial=active==="hq"?"HQ":name.slice(0,1).toUpperCase();
 app.innerHTML='<main class="shell ios-chat-shell"><header class="ios-chat-header">'+
 '<button class="ios-back" type="button" data-nav="messages" aria-label="Back to messages">‹ <span>Messages</span></button>'+
 '<div class="ios-contact"><span class="ios-contact-avatar">'+escapeHTML(initial)+'</span><span class="ios-contact-name">'+escapeHTML(name)+
 '<small>'+escapeHTML(role)+'</small></span></div>'+
 '<button class="ios-refresh" type="button" id="refresh" aria-label="Refresh messages">↻</button>'+
 '</header>'+body+'</main>';
 }else{
 app.innerHTML=`<main class="shell"><header>${screen!=="home"?`<button class="back" data-nav="${screen==="team"?"assignments":"home"}" aria-label="Go back">‹ Back</button>`:"<span>● ● ●</span>"}<span>Agent HQ</span></header><h1>${escapeHTML(title||"Agent HQ")}</h1>${body}</main>`;
 }if(screen==="contacts"||screen==="messages"){const show=(q="")=>{
 const inbox=screen==="messages";
 const started=window.agentHQStartedChats||new Set();
 const matches=x=>[x[2],x[3]].join(" ").toLowerCase().includes(q.toLowerCase());
 const shown=inbox?staff.filter(x=>matches(x)&&(started.has(x[0])||(messages.get(x[0])||[]).length>0)):staff.filter(matches);
 const showHQ=!inbox||started.has("hq")||(messages.get("hq")||[]).length>0;
 const headquarters=showHQ&&"company headquarters".includes(q.toLowerCase())?`<button class="row" data-chat="hq"><span class="avatar">🏢</span><span><strong>Company Headquarters</strong><small>All 10 employees</small></span></button>`:"";
 const staffRows=shown.map(x=>`<button class="row" data-chat="${x[0]}"><span class="avatar">${x[1]}</span><span><strong>${x[2]}</strong><small>${escapeHTML(x[3])}${inbox?getConversationPreview(x[0]):""}</small></span></button>`).join("");
 document.querySelector("#contact-list").innerHTML=headquarters+staffRows||(inbox?'<p class="muted">No individual conversations yet. Start one from Contacts.</p>':'<p class="muted">No employees match that search.</p>');
 };show();document.querySelector("#search").addEventListener("input",e=>show(e.target.value));
 if(screen==="messages"&&document.querySelector("#sync-msgs"))document.querySelector("#sync-msgs").addEventListener("click",async e=>{const button=e.currentTarget;button.disabled=true;button.textContent="↻ Syncing…";try{await Promise.all([window.agentHQCloudApprovals?.refresh(),window.agentHQChatCloud?.refresh(),window.agentHQTeamCloud?.refresh()])}catch(err){window.agentHQChatCloudNotice("Sync failed: "+err.message)}finally{button.disabled=false;if(button.isConnected)button.textContent="↻ Sync saved messages"}})
}
if(screen==="assignments"){
 document.querySelector("#team-create-form").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget;
  const title=form.querySelector("#team-title").value.trim(),instructions=form.querySelector("#team-instructions").value.trim(),info=form.querySelector("#team-info").value.trim();
  const members=[...form.querySelectorAll('input[name="member"]:checked')].map(x=>x.value);
  const feedback=document.querySelector("#team-create-feedback");
  if(!members.length){feedback.textContent="Choose at least one employee. For team coordination, select two or more.";return}
  const button=form.querySelector('button[type="submit"]');button.disabled=true;teamSaving=true;feedback.textContent="Saving assignment…";
  try{
   if(!window.agentHQTeamCloud)throw Error("Team connection is loading. Refresh Agent HQ.");
   const id=await window.agentHQTeamCloud.create(title,instructions,info,members);
   teamActive=id;teamDraft="";teamCreateFeedback="";teamPostFeedback="Assignment saved. You can add information to the team discussion.";
   screen="team";
  }catch(err){teamCreateFeedback="Assignment not saved: "+err.message;feedback.textContent=teamCreateFeedback}
  finally{teamSaving=false;if(screen==="team")render();else{button.disabled=false}}
 });
}
if(screen==="team"&&teamAssignments.has(teamActive)){
 const selector=document.querySelector("#team-status");
 selector.addEventListener("change",async e=>{
  const value=e.currentTarget.value,assignmentId=teamActive;const old=teamAssignments.get(assignmentId)?.status;
  teamSaving=true;selector.disabled=true;
  try{
   if(!window.agentHQTeamCloud)throw Error("Team connection not ready.");
   await window.agentHQTeamCloud.setStatus(assignmentId,value);
   teamPostFeedback="Assignment status saved.";
  }catch(err){teamPostFeedback="Status not saved: "+err.message;if(teamAssignments.has(assignmentId))teamAssignments.get(assignmentId).status=old}
  finally{teamSaving=false;render()}
 });
 document.querySelector("#team-note").value=teamDraft;
 document.querySelector("#team-note").addEventListener("input",e=>teamDraft=e.target.value);
 document.querySelector("#team-note-form").addEventListener("submit",async e=>{
  e.preventDefault();const body=e.currentTarget.querySelector("#team-note").value.trim(),assignmentId=teamActive;
  const notice=document.querySelector("#team-post-feedback");
  if(!body){notice.textContent="Enter a note or information first.";return}
  teamSaving=true;const button=e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;notice.textContent="Saving to team discussion…";
  try{
   if(!window.agentHQTeamCloud)throw Error("Team connection not ready.");
   await window.agentHQTeamCloud.post(assignmentId,body);
   teamDraft="";teamPostFeedback="Note saved to this team assignment.";
  }catch(err){teamPostFeedback="Note not saved: "+err.message+" Your draft is kept."}
  finally{teamSaving=false;render()}
 });
}
if(screen==="research"){document.querySelector("#research-form").addEventListener("submit",async e=>{e.preventDefault();const agentId=document.querySelector("#research-agent").value;const raw=document.querySelector("#research-url").value.trim();const verdict=assessResearchTarget(raw);const status=document.querySelector("#research-status");if(verdict.level==="blocked"){status.textContent="Blocked: "+verdict.reason;return}const submit=e.currentTarget.querySelector('[type="submit"]');submit.disabled=true;status.textContent="Saving permission request…";try{const id=await requestApproval(agentId,raw,"RESEARCH TEST — "+verdict.reason+". No action will execute automatically.");if(id){active=agentId;screen="chat";render()}}catch(err){status.textContent=err.message}finally{submit.disabled=false}})}if(screen==="browser"){document.querySelector("#test-risk").addEventListener("click",async e=>{const button=e.currentTarget;const agentId=document.querySelector("#test-agent").value;button.disabled=true;document.querySelector("#agent-browser-status").textContent="Saving test request…";try{const id=await requestApproval(agentId,"https://example.com/permission-test","SIMULATION: Unknown website requires your permission before continuing.");if(id){active=agentId;screen="chat";render()}}catch(err){document.querySelector("#agent-browser-status").textContent=err.message}finally{button.disabled=false}});document.querySelector("#agent-browser-form").addEventListener("submit",e=>{e.preventDefault();const input=document.querySelector("#agent-browser-input").value.trim();let target;if(/^https?:\/\//i.test(input))target=input;else if(/^[^\s]+\.[a-z]{2,}(?:[\/:?#].*)?$/i.test(input))target="https://"+input;else target="https://www.google.com/search?q="+encodeURIComponent(input);try{const url=new URL(target);if(!["https:","http:"].includes(url.protocol))throw Error("Invalid protocol");const tab=window.open(url.href,"_blank","noopener,noreferrer");document.querySelector("#agent-browser-status").textContent=tab===null?"Pop-up blocked. In Safari, allow pop-ups for Agent HQ, then tap Go again.":"Website requested in a new tab. Agent access is not enabled."}catch{document.querySelector("#agent-browser-status").textContent="Enter a valid website or search phrase."}})}if(isChat){
 const field=document.querySelector("#draft"),form=document.querySelector("#composer");
 field.value=drafts.get(active)||"";
 field.addEventListener("input",event=>drafts.set(active,event.target.value));
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  const worker=active,value=field.value.trim();
  if(sendingAgents.has(worker))return;
  if(!value){field.focus();return}
  sendingAgents.add(worker);
  const button=form.querySelector("#send-message");
  button.disabled=true;
  sendFeedback.set(worker,"");
  try{
   if(!window.agentHQChatCloud?.converse)throw Error("Conversation service is loading. Please refresh Agent HQ.");
   const result=await window.agentHQChatCloud.converse(worker,value);
   drafts.set(worker,"");
   sendFeedback.delete(worker);
   if(result.start_assignment_id||result.resume_assignment_id){
    const id=result.start_assignment_id||result.resume_assignment_id;
    const planFirst=Boolean(result.start_assignment_id);
    window.agentHQCoordCloud?.runTeam(id,{planFirst,maxSteps:3}).catch(error=>{
     window.agentHQCoordError?.("AI team paused: "+error.message);
    });
   }
   await Promise.allSettled([window.agentHQTeamCloud?.refresh(),window.agentHQCoordCloud?.refresh(),window.agentHQCloudApprovals?.refresh()]);
  }catch(error){
   sendFeedback.set(worker,"Message not sent: "+error.message);
   // Preserve the draft if the message couldn't be submitted.
  }finally{
   sendingAgents.delete(worker);
   if(active===worker&&screen==="chat")render();
  }
 });
 document.querySelector("#refresh").addEventListener("click",async()=>{
  await Promise.allSettled([window.agentHQChatCloud?.refresh(),window.agentHQCloudApprovals?.refresh(),window.agentHQTeamCloud?.refresh(),window.agentHQCoordCloud?.refresh()]);
  if(screen==="chat")render();
 });
 const scroll=document.querySelector("#chat-scroll");
 if(scroll)scroll.scrollTop=scroll.scrollHeight;
}}app.addEventListener("click",async e=>{
 const messageDelete=e.target.closest("[data-delete-message]");
 if(messageDelete){
  const id=messageDelete.dataset.deleteMessage;
  if(!window.confirm("Delete this message from your conversation?"))return;
  try{
   if(!window.agentHQChatCloud?.deleteMessage)throw Error("Message service unavailable");
   await window.agentHQChatCloud.deleteMessage(id);
   const items=messages.get(active)||[];
   messages.set(active,items.filter(x=>x.id!==id));
   if(screen==="chat")render();
  }catch(error){sendFeedback.set(active,"Could not delete message: "+error.message);if(screen==="chat")render()}
  return;
 }
 const assignmentDelete=e.target.closest("[data-delete-assignment]");
 if(assignmentDelete){
  const id=assignmentDelete.dataset.deleteAssignment;
  if(!window.confirm("Delete this assignment and its progress, team notes, and handoffs? This cannot be undone."))return;
  try{
   if(!window.agentHQTeamCloud?.deleteAssignment)throw Error("Assignments service unavailable");
   await window.agentHQTeamCloud.deleteAssignment(id);
   teamAssignments.delete(id);teamNotes.delete(id);coordSteps.delete(id);coordProgress.delete(id);
   if(teamActive===id){teamActive=null;if(screen==="team")screen="assignments"}
   render();
  }catch(error){teamNotice="Could not delete assignment: "+error.message;render()}
  return;
 }
const check=e.target.closest("[data-worker-check]");if(check){
  if(workerCheckBusy)return;
  workerCheckBusy=true;
  workerFeedback="Checking AI connection…";
  workerConnection={...workerConnection,ready:false,message:"Checking your account, saved secret names and AI-provider API key…"};
  renderWithoutInterruptingDraft();
  try{
   if(!window.agentHQWorkerCloud)throw Error("AI worker script did not load. Refresh Agent HQ.");
   const outcome=await window.agentHQWorkerCloud.status();
   if(!outcome)throw Error("The connection test was interrupted. Tap Check again.");
   workerFeedback=outcome.ready?"Connection verified. You can now create an assignment.":"Connection check finished: "+outcome.message;
  }catch(err){
   workerFeedback="Connection check failed: "+err.message;
   window.agentHQWorkerConnection({ready:false,provider:null,model:null,message:workerFeedback});
  }finally{workerCheckBusy=false;renderWithoutInterruptingDraft()}
  return
 }
 const action=e.target.closest("[data-worker-run]");if(action){
  const employeeId=action.dataset.workerRun,assignmentId=teamActive;
  const task=teamAssignments.get(assignmentId);
  if(!task||!task.employee_ids.includes(employeeId)||workerBusy||!workerConnection.ready)return;
  workerBusy=employeeId;workerFeedback="";renderWithoutInterruptingDraft();
  try{
   if(!window.agentHQWorkerCloud)throw Error("AI worker module unavailable");
   await window.agentHQWorkerCloud.run(assignmentId,employeeId);
   workerFeedback=(staff.find(s=>s[0]===employeeId)?.[2]||employeeId)+" saved an AI draft in the team thread and individual Messages.";
   await Promise.allSettled([window.agentHQTeamCloud?.refresh(),window.agentHQChatCloud?.refresh()]);
  }catch(err){workerFeedback="Worker did not finish: "+err.message}
  finally{workerBusy=null;if(screen==="team")renderWithoutInterruptingDraft()}
  return
 }
 const manager=e.target.closest("[data-team-plan]");
 const nextStep=e.target.closest("[data-team-continue]");
 if(manager||nextStep){
  const id=manager?.dataset.teamPlan||nextStep?.dataset.teamContinue;
  if(!teamAssignments.has(id))return;
  if(!window.agentHQCoordCloud){window.agentHQCoordError?.("Coordination service not loaded. Refresh Agent HQ.");return}
  if(window.agentHQCoordCloud.isRunning(id))return;
  window.agentHQCoordCloud.runTeam(id,{planFirst:Boolean(manager),maxSteps:3}).catch(error=>{
   window.agentHQCoordError?.("AI team paused: "+error.message);
  });
  return;
 }
 const teamLink=e.target.closest("[data-team-open]");if(teamLink){const id=teamLink.dataset.teamOpen;if(teamAssignments.has(id)){teamActive=id;teamDraft="";teamPostFeedback="";screen="team";render()}return}const decision=e.target.closest("[data-approval]");if(decision){const req=approvalRequests.get(decision.dataset.approval);if(req&&req.status==="pending"&&req.agentId===active){const choice=decision.dataset.decision;const service=window.agentHQCloudApprovals;if(!service){window.agentHQApprovalCloudError("Permission service unavailable. Try refreshing Agent HQ.");return}const controls=[...decision.closest(".card").querySelectorAll("[data-approval]")];controls.forEach(button=>button.disabled=true);service.decide(req.id,choice).catch(err=>{window.agentHQApprovalCloudError("Decision not saved: "+err.message)}).finally(()=>controls.forEach(button=>button.disabled=false))}return}const nav=e.target.closest("[data-nav]");const chat=e.target.closest("[data-chat]");if(nav){screen=nav.dataset.nav;if(screen==="hq"){active="hq";screen="chat"}render()}if(chat){active=chat.dataset.chat;(window.agentHQStartedChats??=new Set()).add(active);screen="chat";render()}});render();