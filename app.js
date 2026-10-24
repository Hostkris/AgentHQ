import {messageDeleteButton, messageIsDeleted} from './agent-message-controls.js?v=20261024-delete-1';
import {renderHomeScreen,connectHomeScreen} from './agent-home-layout.js?v=20261024-home-pages-1';
const staff=[["alex","👔","Alex","General Manager"],["maya","📣","Maya","Marketing"],["jordan","🎬","Jordan","Scripts & Content"],["riley","🔎","Riley","Market Research Analyst"],["taylor","📧","Taylor","Communications"],["casey","📱","Casey","Social Media"],["morgan","🛍️","Morgan","Shopify"],["avery","📊","Avery","Business Analysis"],["jamie","📅","Jamie","Scheduling"],["quinn","💡","Quinn","Growth & Partnerships"]];const app=document.querySelector("#app");const oauthReturnWorker=(()=>{
 try{
  const callback=new URLSearchParams(location.search);
  if(callback.get("chat")==="riley")return "riley";
  const saved=sessionStorage.getItem("agenthq_gmail_chat_return");
  const valid=['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn'];
  if(callback.has("gmail")&&valid.includes(saved)){
   sessionStorage.removeItem("agenthq_gmail_chat_return");return saved;
  }
 }catch{}
 return null;
})();
let screen=oauthReturnWorker?"chat":typeof location!=="undefined"&&new URLSearchParams(location.search).has("gmail")?"email":typeof location!=="undefined"&&new URLSearchParams(location.search).has("meta")?"operations":"home",active=oauthReturnWorker;const drafts=new Map();const messages=new Map();const unreadCounts=new Map();let lastViewedThread=null;const sendFeedback=new Map();const sendingAgents=new Set();
let chatGmailStatus={connected:false,configured:false,message:"Checking Gmail authorization…"};
let chatGmailGrants=[];
let chatConnectorBusy=false;
window.agentHQGmailChatStatus=(status,grants)=>{
 const next=JSON.stringify({status,grants});
 if(JSON.stringify({status:chatGmailStatus,grants:chatGmailGrants})===next)return;
 chatGmailStatus=status||{};
 chatGmailGrants=Array.isArray(grants)?grants:[];
 if(screen==="chat"&&!chatConnectorBusy)renderWithoutInterruptingDraft();
};let chatNotice="Loading saved text messages…",chatFingerprint="";let metaState={configured:false,connected:false,accounts:[],message:"Checking Meta Ads…"};
let metaSelected="",metaPeriod="last_7d",metaReport=null,metaBusy=false,metaNotice="";
window.agentHQMetaStatus=data=>{
 const next=JSON.stringify(data);
 if(JSON.stringify(metaState)===next)return;
 metaState={...data,accounts:Array.isArray(data.accounts)?data.accounts:[]};
 if(!metaState.accounts.some(a=>a.account_id===metaSelected)){
  metaSelected=metaState.accounts[0]?.account_id||"";
  metaReport=null;
 }
 if(!metaState.connected)metaReport=null;
 if(screen==="operations"&&!metaBusy)renderWithoutInterruptingDraft();
};
window.agentHQMetaError=message=>{
 metaNotice=message;
 if(screen==="operations")renderWithoutInterruptingDraft();
};
const metaCallbackNote=()=>{
 if(typeof location==="undefined")return "";
 const status=new URLSearchParams(location.search).get("meta");
 return ({
  connected:"Meta authorized the read-only connection. Select your ad account to fetch a report.",
  accounts:"Meta sign-in succeeded, but ad account discovery needs attention. Tap Refresh accounts.",
  cancelled:"Meta authorization was cancelled; your ad account was not connected.",
  permission:"Meta did not grant ads_read. Reconnect and approve read-only advertising access.",
  invalid:"The Meta authorization link expired or was already used. Please reconnect.",
  setup:"Meta developer app configuration is incomplete.",
  error:"Meta could not finish the connection. Check the app ID, secret and redirect URI."
 })[status]||"";
};
const personalAccounts=[],personalPermissions=[];
let personalNotice="Loading your account labels…",personalFeedback="",personalBusy=false;
window.agentHQPersonalSync=(accounts,permissions,notice)=>{
 const current=JSON.stringify({accounts:personalAccounts,permissions:personalPermissions,notice:personalNotice});
 const next=JSON.stringify({accounts,permissions,notice});
 if(current===next)return;
 personalAccounts.splice(0,personalAccounts.length,...accounts);
 personalPermissions.splice(0,personalPermissions.length,...permissions);
 personalNotice=notice;
 if(screen==="accounts"&&!personalBusy)renderWithoutInterruptingDraft();
};
window.agentHQPersonalError=message=>{
 personalFeedback="Could not sync your accounts: "+String(message);
 if(screen==="accounts"&&!personalBusy)renderWithoutInterruptingDraft();
};
const studioBots=[],studioMessaged=new Set(),studioHandoffs=[];
window.agentHQBotStudioSync=(rows,notice,messaged=[],handoffs=[])=>{
 const key=JSON.stringify({rows,messaged,handoffs});
 if(window.agentHQBotStudioSnapshotKey===key)return;
 window.agentHQBotStudioSnapshotKey=key;
 window.agentHQBotStudioSnapshot={rows,messaged,notice};
 studioBots.splice(0,studioBots.length,...(rows||[]));
 studioMessaged.clear();for(const id of messaged||[])studioMessaged.add(id);
 studioHandoffs.splice(0,studioHandoffs.length,...(handoffs||[]));
 window.agentHQBotStudioUI?.sync(rows||[],notice||"");
 if(["contacts","messages","office","home"].includes(screen))renderWithoutInterruptingDraft();
};
window.agentHQBotStudioError=message=>{
 window.agentHQBotStudioUI?.sync(studioBots,"Worker Studio: "+message);
};
const businessActions=[];
let businessActionsNotice="Loading business action requests…";
window.agentHQOperationsSync=(rows,notice)=>{
 if(JSON.stringify(businessActions)===JSON.stringify(rows)&&businessActionsNotice===notice)return;
 businessActions.splice(0,businessActions.length,...rows);
 businessActionsNotice=notice;
 updateAttentionIndicators();
};
window.agentHQOperationsError=message=>{
 businessActionsNotice=message;
 if(screen==="operations")renderWithoutInterruptingDraft();
};
const teamAssignments=new Map(),teamNotes=new Map();let teamActive=null,teamNotice="Loading team assignments…",teamFingerprint="",teamCreateFeedback="",teamPostFeedback="",teamDraft="",teamSaving=false;
window.agentHQTeamSync=(assignments,notes,notice)=>{
  const fingerprint=JSON.stringify({assignments,notes});
  if(fingerprint===teamFingerprint&&teamNotice===notice)return;
  teamFingerprint=fingerprint;teamNotice=notice;
  teamAssignments.clear();teamNotes.clear();
  for(const a of assignments)teamAssignments.set(a.id,a);
  for(const n of notes){if(!teamAssignments.has(n.assignment_id))continue;teamNotes.set(n.assignment_id,[...(teamNotes.get(n.assignment_id)||[]),n])}
  updateAttentionIndicators();
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
 updateAttentionIndicators();
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
const approvalRequests=new Map();let approvalNotice="Connecting saved permission requests…",approvalFingerprint="";const pendingCount=()=>[...approvalRequests.values()].filter(r=>r.status==="pending"&&!messageIsDeleted("approval",r.id)).length;const requestApproval=async(agentId,website,reason)=>{if(!staff.some(s=>s[0]===agentId))throw Error("Unknown employee");if(!window.agentHQCloudApprovals)throw Error("Permission service is loading. Try again shortly.");return window.agentHQCloudApprovals.create(agentId,website,reason)};window.agentHQRequestApproval=requestApproval;window.agentHQSyncApprovals=(rows,notice)=>{const fingerprint=JSON.stringify(rows);if(fingerprint===approvalFingerprint&&notice===approvalNotice)return;approvalFingerprint=fingerprint;approvalNotice=notice;approvalRequests.clear();for(const [id,items] of messages)messages.set(id,items.filter(m=>m.type!=="approval"));for(const row of rows){if(!staff.some(s=>s[0]===row.employee_id))continue;const status=row.status==="pending"&&Date.parse(row.expires_at)<=Date.now()?"expired":row.status;approvalRequests.set(row.id,{id:row.id,agentId:row.employee_id,website:row.target_url,reason:row.reason,status,kind:row.request_kind,createdAt:row.created_at,expiresAt:row.expires_at});messages.set(row.employee_id,[...(messages.get(row.employee_id)||[]),{type:"approval",id:row.id}])}updateAttentionIndicators();};window.agentHQApprovalCloudError=message=>{approvalNotice=message;approvalFingerprint="";if(screen==="approvals"||screen==="chat")renderWithoutInterruptingDraft()};const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const clearedAtByWorker=new Map();
window.agentHQConversationClearSync=rows=>{clearedAtByWorker.clear();for(const [id,value] of Object.entries(rows||{}))if(value)clearedAtByWorker.set(id,Date.parse(value)||0)};
window.agentHQSyncMessages=(rows,notice)=>{const next=JSON.stringify(rows);if(next===chatFingerprint&&notice===chatNotice)return;chatFingerprint=next;chatNotice=notice;for(const [id,items] of messages)messages.set(id,items.filter(m=>m.type==="approval"));for(const row of rows){if(!["hq",...staff.map(s=>s[0])].includes(row.employeeId))continue;messages.set(row.employeeId,[...(messages.get(row.employeeId)||[]),{id:row.id,type:"text",text:row.text,sender:row.sender,createdAt:row.createdAt}])}if(screen==="chat"||screen==="messages"||screen==="contacts")renderWithoutInterruptingDraft()};const unreadFor=id=>Math.max(0,Number(unreadCounts.get(id)||0));
const totalUnread=()=>[...unreadCounts.values()].reduce((sum,n)=>sum+n,0);
const pendingRequestsFor=id=>[...approvalRequests.values()].filter(r=>r.status==="pending"&&r.agentId===id).length;
const employeeAttention=id=>unreadFor(id)+pendingRequestsFor(id);
const messagesAttention=()=>totalUnread()+pendingCount();
const operationsAttention=()=>businessActions.filter(a=>a.status==="pending").length;
const assignmentAttention=()=>[...teamAssignments.values()].filter(a=>{
 if(a.coordination_status==="completed"||a.status==="completed")return false;
 const pendingPlan=Boolean(a.manager_summary)&&a.alex_plan_status!=="approved"&&(coordSteps.get(a.id)||[]).every(t=>t.status==="queued");
 const waiting=a.coordination_status==="waiting_for_owner"||(a.status==="blocked"&&a.coordination_status!=="waiting_for_permission");
 return pendingPlan||waiting;
}).length;
const allAttention=()=>messagesAttention()+assignmentAttention()+operationsAttention();
const unreadLabel=n=>n>99?"99+":String(n);
const unreadBadge=(count,variant="thread")=>count>0
 ?'<span class="agent-unread-badge agent-unread-badge--'+variant+'" aria-label="'+count+' item'+(count===1?'':'s')+' needing attention'+'">'+unreadLabel(count)+'</span>':'';
function syncAppBadge(){
 const count=allAttention();
 try{
  // Only supported installed web apps can reflect the badge on the iPhone app icon.
  if(count&&typeof navigator.setAppBadge==="function")navigator.setAppBadge(count).catch(()=>{});
  if(!count&&typeof navigator.clearAppBadge==="function")navigator.clearAppBadge().catch(()=>{});
 }catch{}
}
window.agentHQVisibleThread=()=>screen==="chat"?active:null;
window.agentHQUnreadSync=counts=>{
 const next=Object.entries(counts||{}).filter(([id,n])=>["hq",...staff.map(s=>s[0])].includes(id)&&Number(n)>0);
 const current=JSON.stringify([...unreadCounts]);
 const updated=JSON.stringify(next);
 if(current===updated)return;
 unreadCounts.clear();
 for(const [id,count] of next)unreadCounts.set(id,Number(count));
 updateAttentionIndicators();
 syncAppBadge();
 if(["home","messages","contacts"].includes(screen))renderWithoutInterruptingDraft();
};
function updateAttentionIndicators(){
 const total=allAttention();
 document.title=(total?'('+total+') ':'')+'Agent HQ';
 syncAppBadge();
 if(["home","messages","contacts","assignments","approvals","team","chat","office","operations"].includes(screen))renderWithoutInterruptingDraft();
}
window.agentHQUnreadError=notice=>{if(screen==="messages")window.agentHQChatCloudNotice?.(notice)};
window.agentHQChatCloudNotice=(notice,quiet=false)=>{if(chatNotice===notice)return;chatNotice=notice;if(!quiet&&(screen==="chat"||screen==="messages"))renderWithoutInterruptingDraft()};const getConversationPreview=id=>{
 if(pendingRequestsFor(id))return " · Permission request awaiting your decision";
 const last=(messages.get(id)||[]).filter(m=>m.type!=="approval").at(-1);
 if(last)return " · "+escapeHTML(String(last.text).replace(/\s+/g," ").slice(0,55));
 const waiting=[...coordSteps.values()].flat().some(step=>step.employee_id===id&&["waiting_for_owner","waiting_for_permission"].includes(step.status));
 if(waiting)return " · Waiting for you";
 return "";
};function renderWithoutInterruptingDraft(){if((screen==="chat"&&(document.activeElement?.id==="draft"||document.activeElement?.hasAttribute?.("data-answer-input")||sendingAgents.has(active)||answeringAssignments.size>0))||((screen==="team"||screen==="assignments")&&(teamSaving||["team-title","team-instructions","team-info","team-note"].includes(document.activeElement?.id)))){const notice=document.querySelector("#chat-sync-status");if(notice)notice.textContent=chatNotice+" Permission requests: "+approvalNotice;return}render()}const button=(label,screenName,emoji)=>{
 const count=screenName==="messages"?messagesAttention():screenName==="approvals"?pendingCount():screenName==="assignments"?assignmentAttention():screenName==="operations"?operationsAttention():0;
 return `<button class="tile" data-nav="${screenName}" aria-label="${label}${count?", "+count+" items needing attention":""}"><span class="app-icon app-icon--${screenName}" aria-hidden="true">${window.AgentHQIcons?.svg(screenName)||emoji}</span>${unreadBadge(count,"tile")}<span class="tile-label">${label}</span></button>`;
};
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
window.agentHQSettingsAI=()=>renderAIConnectionGuide();
function renderAssignments(){
 return renderAIConnectionGuide()+
 '<section class="card"><h2>Team assignment discussions</h2><p class="notice">Start and approve work in Messages. Alex selects specialists automatically; this page is your saved work history.</p></section>'+
 (teamAssignments.size?teamRows():'<p class="muted">No saved assignments yet. Message Alex or a specialist to begin.</p>');
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
 const awaitingApproval=p.steps.length>0&&a.alex_plan_status!=="approved"&&p.steps.every(step=>step.status==="queued");
 const continueTeam=p.steps.length>0&&pending&&!p.waiting&&a.alex_plan_status==="approved";
 const entries=p.steps.map(step=>'<li class="handoff-step"><strong>'+escapeHTML(workerLabel(step.employee_id))+' — '+escapeHTML(step.title)+'</strong>'+
 '<small>'+escapeHTML(({queued:"Queued",running:"Drafting",completed:"Draft finished",waiting_for_owner:"Waiting for answer",waiting_for_permission:"Permission needed",failed:"Paused"})[step.status]||step.status)+'</small>'+
 (step.handoff_from?'<small>Handoff from '+escapeHTML(workerLabel(step.handoff_from))+'</small>':"")+
 '<p>'+escapeHTML(step.instructions)+'</p>'+
 (step.output?'<details><summary>Read completed draft</summary><p>'+escapeHTML(step.output)+'</p></details>':"")+'</li>').join("");
 return '<section class="card coordination-panel"><h2>AI manager and worker handoffs</h2>'+
 '<p class="notice">Alex routes drafting work to specialists. Each run is bounded and only continues while this page is open. No external websites, accounts or publishing are available. Alex proposes plans and waits for your approval.</p>'+
 renderProgressBar(a)+
 (a.manager_summary?'<p><strong>Alex’s plan:</strong> '+escapeHTML(a.manager_summary)+'</p>':"")+
 (record?'<p class="notice" role="status">'+escapeHTML(record.detail)+'</p>':"")+
 (start?'<button class="primary" data-team-plan="'+escapeHTML(a.id)+'" '+(busy?"disabled":"")+'>▶ Ask Alex to propose a plan</button>':"")+
 (awaitingApproval?'<p class="notice">Alex proposes the specialist work. Nothing starts until you approve this plan.</p><div class="worker-actions"><button type="button" class="primary" data-alex-decision="approve" data-alex-assignment="'+escapeHTML(a.id)+'" '+(busy?"disabled":"")+'>Approve plan</button><button type="button" class="back" data-alex-decision="reject" data-alex-assignment="'+escapeHTML(a.id)+'" '+(busy?"disabled":"")+'>Reject plan</button></div>':"")+
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
 ${ready?(a.manager_summary&&a.alex_plan_status!=="approved"?`<p class="notice">Alex’s plan is awaiting your approval. Specialist drafting is locked until you tap Approve plan above.</p>`:`<p class="notice">Each run sends the assignment and recent team notes to the selected AI provider. Maximum 10 worker steps per hour.</p>
 <div class="worker-actions">${a.employee_ids.filter(id=>id!=="alex").map(id=>`<button type="button" class="worker-run" data-worker-run="${escapeHTML(id)}" ${workerBusy?"disabled":""}>▶ ${escapeHTML(staff.find(s=>s[0]===id)?.[2]||id)} — Draft next step</button>`).join("")}</div>`):
 `<p class="notice">To connect: Supabase → Authentication → Users → copy your signed-in user UUID. Then Edge Functions → Secrets → add AGENT_HQ_ALLOWED_OWNER_IDS with that UUID, plus GROQ_API_KEY or OPENROUTER_API_KEY. Keep both values out of chats and GitHub. Provider usage limits and charges depend on your account.</p>`}
 <p id="worker-feedback" class="notice" role="status">${escapeHTML(workerBusy?"Worker drafting… please wait.":workerFeedback)}</p>
 ${recent.length?`<h3>Recent worker activity</h3>${recent.map(r=>`<p class="notice">${escapeHTML(staff.find(s=>s[0]===r.employee_id)?.[2]||r.employee_id)}: ${escapeHTML(r.status)} · ${escapeHTML(new Date(r.created_at).toLocaleString())}${r.error_summary?" · "+escapeHTML(r.error_summary):""}</p>`).join("")}`:""}
 </section>`;
}
function renderTeamThread(){
 const a=teamAssignments.get(teamActive);
 if(!a)return '<section class="card">Assignment not found. Return to Assignments.</section>';
 const steps=[...(coordSteps.get(a.id)||[])].sort((x,y)=>(x.step_number||0)-(y.step_number||0)),notes=teamNotes.get(a.id)||[];
 const completed=steps.filter(x=>x.status==="completed").length;
 const status=steps.length?completed+"/"+steps.length+" drafts saved":(teamStatusLabel[a.status]||a.status);
 const records=steps.map(step=>'<details class="archived-step"><summary>'+
  escapeHTML(workerLabel(step.employee_id))+' — '+escapeHTML(step.title)+' · '+escapeHTML(step.status)+'</summary>'+
  '<p>'+escapeHTML(step.instructions)+'</p>'+
  (step.output?'<div class="archive-deliverable">'+messageHTML(step.output)+'</div>':'')+
  (step.question?'<p>Question: '+escapeHTML(step.question)+'</p>':'')+
  '</details>').join("");
 const discussion=notes.filter(n=>!messageIsDeleted("team",n.id)).map(n=>'<article class="team-message">'+messageDeleteButton("team",n.id)+'<strong>'+
  escapeHTML(n.sender_kind==="owner"?"You":n.sender_kind==="agent"?workerLabel(n.sender_id):"System")+'</strong>'+
  '<small> · '+escapeHTML(new Date(n.created_at).toLocaleString())+'</small><p>'+escapeHTML(n.body)+'</p></article>').join("");
 return '<section class="card assignment-archive"><h2>'+escapeHTML(a.title)+'</h2>'+
  '<p class="notice">Saved assignment log · '+escapeHTML(status)+'</p>'+
  '<p>'+escapeHTML(a.instructions)+'</p><h3>Specialists</h3><p>'+escapeHTML(teamMemberNames(a.employee_ids))+'</p>'+
  '<h3>Completed work and drafts</h3>'+(records||'<p class="notice">Alex has not routed this task yet.</p>')+
  '<h3>Team assignment discussions</h3>'+(discussion||'<p class="notice">No saved discussion notes.</p>')+
  '<p class="notice">Review-only history. Return to Messages to give instructions or approvals.</p></section>';
}

function renderWorkerTeamLinks(employeeId){
 const related=[...teamAssignments.values()].filter(a=>(a.employee_ids||[]).includes(employeeId));
 if(!related.length)return "";
 return `<section class="team-related"><h2>Team assignments and coworker discussions</h2>
 <p class="notice">Task details and shared messages from the workers assigned to these projects appear here.</p>
 ${related.map(a=>{
 const recent=(teamNotes.get(a.id)||[]).filter(n=>!messageIsDeleted("team",n.id)).slice(-3);
 return `<div class="card"><button type="button" class="row" data-team-open="${escapeHTML(a.id)}"><span class="avatar">👥</span><span><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(teamMemberNames(a.employee_ids))}</small><small>View full team discussion ›</small></span></button>
 <p><strong>Information needed:</strong> ${escapeHTML(a.info_needed||"No outstanding information listed.")}</p>
 <strong>Recent team messages</strong>
 ${recent.length?recent.map(n=>{
 const speaker=n.sender_kind==="owner"?"You":n.sender_kind==="agent"?(staff.find(s=>s[0]===n.sender_id)?.[2]||"Agent"):"System";
 return `<div class="team-message">${messageDeleteButton("team",n.id)}<small>${escapeHTML(speaker)}:</small> ${escapeHTML(n.body.length>180?n.body.slice(0,180)+"…":n.body)}</div>`;
 }).join(""):'<p class="muted">No team messages yet.</p>'}</div>`;
 }).join("")}</section>`;
}

// Provider authorization choices in the actual worker conversation, not a fake login form.
// A chat button can initiate supported OAuth; it never receives a password or OAuth token.
function renderChatConnectorCard(items){
 // Show connection guidance for the most recent request or worker blocker.
 // These are app-curated links, not arbitrary model-generated OAuth URLs.
 const recent=items.slice(-3);
 const last=recent.at(-1);
 if(!last)return "";
 const dismissalKey=active+":"+String(last.id||last.createdAt||"connection");
 if(messageIsDeleted("connector",dismissalKey))return "";
 const owner=[...recent].reverse().find(m=>m.sender==="owner");
 const request=String(last.text||"")+" "+String(owner?.text||"");
 const socialRead=active==="riley"&&/\b(facebook|messenger)\b/i.test(request);
 const blocked=/\b(connect|authorization|authorize|permission|sign.?in|log.?in|need access|access required|not connected|grant access|connection required|requires access|cannot access|can't access|publish|upload|post to|send to|not authorized)\b/i.test(request);
 const email=!socialRead&&/\b(gmail|inbox|e-mails?|emails?)\b/i.test(request)&&/\b(check|review|read|scan|connect|access|summarize|summarise|reply|priorit|authorization)\b/i.test(request);
 const icloud=/\b(icloud|apple mail)\b/i.test(request)&&blocked;
 const facebook=!(active==="riley"&&/\bfacebook\b/i.test(request))&&/\b(facebook|instagram)\b/i.test(request)&&blocked;
 const metaAds=/\b(meta ads|facebook ads|advertising account|ad account|ad spend)\b/i.test(request)&&blocked;
 const chatgpt=/\b(chatgpt|chat gpt|openai)\b/i.test(request)&&(blocked||/\b(use|create|generate|render|make)\b/i.test(request));
 const other=/\b(tiktok|youtube|shopify|pinterest|twitter)\b/i.test(request)&&blocked;
 if(!email&&!icloud&&!facebook&&!metaAds&&!chatgpt&&!other)return "";
 const name=staff.find(row=>row[0]===active)?.[2]||"this worker";
 const link=(id,label)=>'<a href="#" data-chat-connect="'+id+'" class="ios-auth-link">'+label+'</a>';
 let result='<section class="ios-chat-connect" aria-label="Account connection needed"><strong>🔐 Account connection needed</strong>'+
  '<p>Tap a link below. Where Agent HQ supports secure sign-in, the provider handles your login. Simply signing into a website does not authorize an agent.</p>';
 if(email){
  const connected=chatGmailStatus.connected===true;
  const grant=chatGmailGrants.find(g=>g.employee_id===active);
  const approved=connected&&grant&&grant.scope==="priority_summaries"&&!grant.revoked_at&&Date.parse(grant.expires_at)>Date.now();
  if(!connected){
   const needsSetup=Array.isArray(chatGmailStatus.missing)&&chatGmailStatus.missing.length>0;
   result+=needsSetup?'<p>Gmail needs its one-time Google OAuth setup before sign-in will work.</p>'+
    link("gmail-setup","Finish Google setup →")+link("gmail-refresh","↻ Check connection again"):
    '<p>Gmail is not yet connected to Agent HQ.</p>'+
    link("gmail-connect","Sign in with Google to connect Gmail ↗");
  }else if(!approved){
   result+='<p>Gmail connected. '+escapeHTML(name)+' needs your separate, limited worker approval.</p>'+
    link("gmail-grant","Allow "+escapeHTML(name)+" to read priority summaries · 24 hours");
  }else{
   result+='<p>Gmail connected and '+escapeHTML(name)+' approved for priority summaries until '+
    escapeHTML(new Date(grant.expires_at).toLocaleString())+'. No sending permission.</p>'+
    link("gmail-check","Check Gmail now ↻")+link("gmail-revoke","Revoke worker access");
  }
 }
 if(metaAds){
  result+=metaState.connected?'<p>Meta Ads reporting is connected (read only). Each worker needs separate read permission.</p>'+
   link("meta-center","Review Meta Ads worker access →"):
   '<p>Meta Ads reporting is not connected. This connection does not grant Facebook or Instagram publishing.</p>'+
   link(metaState.configured?"meta-connect":"meta-center",metaState.configured?"Authorize Meta Ads reporting ↗":"Configure Meta Ads →");
 }
 if(chatgpt){
  result+='<p><strong>ChatGPT: Awaiting OpenAI authorization (not connected).</strong> Agent HQ cannot automatically use your subscription until OpenAI approves a supported integration. A ChatGPT website login alone cannot grant that access.</p>'+
   link("chatgpt-apply","Request official OpenAI authorization ↗")+
   link("chatgpt-open","Open ChatGPT manually ↗");
 }
 if(facebook){
  result+='<p>Facebook / Instagram direct publishing connections are not available yet. A saved profile or website login does not grant Agent HQ access.</p>'+
   link("open-accounts","View account connection status →");
 }
 if(icloud){
  result+='<p>iCloud does not have a supported one-tap Agent HQ sign-in integration. Do not give agents your Apple password.</p>'+
   link("icloud-info","View Apple sign-in guidance ↗");
 }
 if(other){
  result+='<p>This provider is not linked to Agent HQ for publishing. The integration must be developed first; a website login is not sufficient.</p>'+
   link("open-accounts","View account connection status →");
 }
 const returned=new URLSearchParams(location.search).get("gmail");
 if(email&&returned)result+='<p class="ios-connection-feedback">Google sign-in return: '+
  escapeHTML(({connected:"Connected",cancelled:"Cancelled",setup:"Setup required",scope:"Scopes missing",error:"Not completed",invalid:"Expired link",refresh:"Reconnect needed"})[returned]||returned)+
  '. Check the connection before continuing.</p>';
 return '<div class="ios-message-row incoming"><div class="ios-message-bubble theirs ios-connect-bubble">'+messageDeleteButton("connector",dismissalKey)+result+'</section></div></div>';
}

function messageHTML(value){
 const text=String(value||'');let out='',last=0;const pattern=/https?:\/\/[^\s<>"'\]\)]+/gi;
 for(const match of text.matchAll(pattern)){const raw=match[0].replace(/[.,;]+$/,'');out+=escapeHTML(text.slice(last,match.index));try{const url=new URL(raw);out+='<a href="'+escapeHTML(url.href)+'" target="_blank" rel="noopener noreferrer">'+escapeHTML(raw)+'</a>'}catch{out+=escapeHTML(raw)}last=match.index+raw.length}
 return out+escapeHTML(text.slice(last));
}
// Editorial approval only. This is never permission to publish or contact accounts.
const CREATIVE_REVIEW_PREFIX="CREATIVE_REVIEW_V1";
function conversationDraftInfo(a){
 const steps=coordSteps.get(a.id)||[],notes=teamNotes.get(a.id)||[];
 const eligible=steps.length>0&&steps.every(x=>x.status==="completed")&&
  steps.some(x=>typeof x.output==="string"&&x.output.trim())&&a.alex_plan_status==="approved";
 const imported=[...notes].reverse().find(n=>n.sender_kind==="owner"&&n.sender_id==="owner"&&String(n.body||"").startsWith("CHATGPT_OWNER_IMPORT_V1\n"));
 const content=steps.filter(x=>x.status==="completed"&&typeof x.output==="string"&&x.output.trim()).map(x=>x.id+"|"+x.output).join("\n\n")+"\nOWNER_IMPORT|"+String(imported?.body?.slice("CHATGPT_OWNER_IMPORT_V1\n".length)||"");
 let hash=2166136261;for(let i=0;i<content.length;i++){hash^=content.charCodeAt(i);hash=Math.imul(hash,16777619)}
 const version=(hash>>>0).toString(16).padStart(8,"0");
 const review=[...notes].reverse().find(n=>n.sender_kind==="owner"&&n.sender_id==="owner"&&
  (String(n.body||"").startsWith(CREATIVE_REVIEW_PREFIX+"|APPROVED|"+version+"\n")||
   String(n.body||"").startsWith(CREATIVE_REVIEW_PREFIX+"|REVISION_REQUESTED|"+version+"\n")));
 const approved=String(review?.body||"").includes("|APPROVED|");
 const rejected=String(review?.body||"").includes("|REVISION_REQUESTED|");
 return {eligible,approved,rejected,version};
}
function finalDraftForChat(worker){
 const related=[...teamAssignments.values()].filter(a=>
  (worker==="alex"||worker==="hq"||a.source_employee_id===worker||(a.employee_ids||[]).includes(worker))&&conversationDraftInfo(a).eligible&&!conversationDraftInfo(a).approved&&!conversationDraftInfo(a).rejected);
 if(related.length!==1)return null;
 const a=related[0];return {a,...conversationDraftInfo(a)};
}
function renderConversationWork(worker){
 const relevant=[...teamAssignments.values()].filter(a=>
  worker==="alex"||worker==="hq"||a.source_employee_id===worker||(a.employee_ids||[]).includes(worker));
 relevant.sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0));
 return relevant.filter(a=>!messageIsDeleted("work",a.id)&&(Date.parse(a.created_at)||0)>=(clearedAtByWorker.get(worker)||0)).slice(0,3).map(a=>{
  const steps=coordSteps.get(a.id)||[];
  const completed=steps.filter(x=>x.status==="completed").length;
  const approved=a.alex_plan_status==="approved";
  const waiting=steps.length>0&&steps.every(x=>x.status==="queued")&&!approved;
  const finished=steps.length>0&&completed===steps.length;
  const label=a.owner_paused?"Stopped by owner":finished?"Drafts ready for review":waiting?"Awaiting your approval":
   approved?"Approved — drafting in progress":a.coordination_status==="planning"?"Alex is preparing a plan":
   a.coordination_status==="waiting_for_owner"?"Question awaiting your reply":
   a.coordination_status==="waiting_for_permission"?"Permission awaiting your decision":"Assignment saved";
  const work=steps.map((step,i)=>{
   const title=escapeHTML(workerLabel(step.employee_id))+" — "+escapeHTML(step.title);
   const written=step.output?'<details class="ios-work-draft"><summary>View completed draft from '+
    escapeHTML(workerLabel(step.employee_id))+'</summary><div class="ios-work-draft-body">'+messageHTML(step.output)+'</div></details>':'';
   return '<div class="ios-work-step"><strong>'+(i+1)+'. '+title+'</strong><small>'+
    escapeHTML(step.status.replace(/_/g," "))+'</small><p>'+escapeHTML(step.instructions)+'</p>'+
    written+(step.question?'<p class="ios-work-question">Question: '+escapeHTML(step.question)+'</p>':'')+'</div>';
  }).join("");
  const review=conversationDraftInfo(a);
  const prompt=a.owner_paused?'<p class="ios-work-prompt">🔴 Red light — specialists are stopped. Reply <b>green light</b> to resume only this previously approved internal drafting work.</p>':waiting?'<p class="ios-work-prompt">Text <b>green light</b> or <b>approved</b> to authorize these drafts. Text <b>red light</b> or <b>stop</b> to reject. This never authorizes publishing or outside account access.</p>':
   finished?'<p class="ios-work-prompt">'+( review.approved?'✅ Final written draft approved. Nothing was published.':review.rejected?'👎 Draft rejected. Tell your worker what to change in a new message; the revision will be another internal assignment.':'Draft ready. Reply <b>green light</b>, <b>thumbs up</b>, or <b>I like it</b> to approve the text; <b>red light</b> or <b>thumbs down</b> to reject. Nothing will be published.')+'</p>':'';
  return '<div class="ios-message-row incoming"><article class="ios-work-card">'+messageDeleteButton("work",a.id)+
   '<div class="ios-work-type">📎 Team work order · Alex</div><h3>'+escapeHTML(a.title)+'</h3>'+
   '<div class="ios-work-status">'+escapeHTML(label)+(steps.length?' · '+completed+'/'+steps.length:'')+'</div>'+
   (a.manager_summary?'<p class="ios-work-summary">'+escapeHTML(a.manager_summary)+'</p>':'')+
   '<div class="ios-work-steps">'+(work||'<p>Alex is selecting the appropriate specialists.</p>')+'</div>'+
   prompt+'</article></div>';
 }).join("");
}
function naturalResearchHTML(report){
 const blocks=String(report||"").slice(0,12500).split(/\n/);
 return blocks.map(line=>{
  const t=line.trim();
  if(!t)return '<div class="ios-report-space"></div>';
  const heading=t.match(/^#{1,4}\s+(.{1,130})$/);
  if(heading)return '<h4>'+messageHTML(heading[1])+'</h4>';
  let raw=t.replace(/^\s*(?:\d+\.\s*|[-*]\s+)/,'');
  return '<p>'+messageHTML(raw).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')+'</p>';
 }).join("");
}
function renderConversationResearch(worker){
 const after=clearedAtByWorker.get(worker)||0;
 const latest=researchJobs.filter(j=>(j.employee_id===worker||(worker==="alex"&&j.employee_id==="riley"))&&j.status==="completed"&&j.report&&
  (Date.parse(j.created_at)||0)>=after).slice(0,2);
 return latest.map(j=>'<div class="ios-message-row incoming"><article class="ios-research-attachment">'+
  '<div class="ios-work-type">🔎 '+(worker==="alex"?"Riley's research for review":"Saved research")+'</div>'+
  '<strong>'+escapeHTML(j.query.slice(0,115))+'</strong>'+
  '<small>Full report · Public sources and limitations</small>'+
  '<details><summary>Read findings and sources</summary><div class="ios-research-report">'+naturalResearchHTML(j.report)+'</div></details>'+
  '</article></div>').join("");
}
function naturalChatText(text){
 const raw=String(text||"");
 // Old provider reports are still accessible, but should not monopolize Messages.
 if(raw.length>850||/^#{1,4}\s/m.test(raw)){
  const preview=raw.replace(/[#*]+/g,"").replace(/\s+/g," ").slice(0,155);
  return '<details class="ios-long-chat"><summary>'+escapeHTML(preview)+'… <span>Read more</span></summary>'+
   '<div class="ios-long-chat-content">'+naturalResearchHTML(raw)+'</div></details>';
 }
 return messageHTML(raw);
}
function renderIPhoneChat(){
 const person=staff.find(s=>s[0]===active);
 const title=active==="hq"?"Company HQ":(person?.[2]||"Worker");
 const role=active==="hq"?"AI team":(person?.[3]||"AI worker");
 const initial=active==="hq"?"HQ":title.slice(0,1).toUpperCase();
 const items=(messages.get(active)||[]).filter(m=>!messageIsDeleted(m.type==="approval"?"approval":"message",m.id)).slice().sort((a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0));
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
   return label+'<div class="ios-message-row incoming"><div class="ios-message-bubble theirs">'+messageDeleteButton("approval",r.id)+escapeHTML(message)+'</div></div>';
  }
  const social=window.agentHQSocialReadMessage?.(active,item.id);
  if(social)return label+social;
  const mine=item.sender==="owner",system=item.sender==="system";
  return label+'<div class="ios-message-row '+(mine?"outgoing":"incoming")+'"><div class="ios-message-bubble '+(mine?"mine":"theirs")+(item.pending?" sending":"")+'">'+
    messageDeleteButton("message",item.id,item.pending)+
    (system?'<span class="ios-message-source">Team handoff</span>':"")+
    '<span class="ios-message-text">'+(mine?messageHTML(item.text||""):naturalChatText(item.text||""))+'</span>'+

    '</div></div>';
 }).join("");
 const status=sendFeedback.get(active)||"";
 const errors=/not saved|failed|unavailable|error|could not/i.test(status);
 return '<div class="ios-thread">'+
  '<div class="ios-chat-list" id="chat-scroll" aria-label="Conversation" aria-live="polite">'+
  (rows||'<div class="ios-empty-chat">Send a message to start the conversation.</div>')+
  renderChatConnectorCard(items)+
  renderConversationWork(active)+
  renderConversationResearch(active)+
  '<div data-social-read-thread>'+(window.agentHQSocialReadThread?.(active)||'')+'</div>'+
  '</div>'+
  (sendingAgents.has(active)?'<div class="ios-typing" aria-live="polite"><span></span><span></span><span></span></div>':"")+
  '<form id="composer" class="ios-composer" autocomplete="off">'+
   '<textarea id="draft" aria-label="Text message" placeholder="Text Message" rows="1" maxlength="10000"></textarea>'+
   '<button class="ios-send" id="send-message" type="submit" aria-label="Send message" '+(sendingAgents.has(active)?"disabled":"")+'><span aria-hidden="true">↑</span></button>'+
  '</form>'+
  '<div id="send-feedback" class="ios-chat-feedback" role="status" aria-live="polite">'+(errors?escapeHTML(status):"")+'</div>'+
 '</div>';
}
function recentOfficeHandoff(){
 for(const steps of coordSteps.values()){
  const ordered=[...steps].sort((a,b)=>a.step_number-b.step_number);
  for(let i=1;i<ordered.length;i++){
   const previous=ordered[i-1],next=ordered[i];
   if(next.handoff_from!==previous.employee_id||previous.status!=="completed")continue;
   const time=Date.parse(previous.updated_at||"");
   if(Number.isFinite(time)&&time<=Date.now()+60000&&Date.now()-time<120000)
    return {from:previous.employee_id,to:next.employee_id,step:next.title};
  }
 }
 return null;
}
function officeWorkerState(id){
 const handoff=recentOfficeHandoff();
 if(handoff&&(handoff.from===id||handoff.to===id))
  return {emoji:handoff.from===id?"📄➡️":"🤝📄",short:handoff.from===id?"Handing off":"Receiving",detail:handoff.step,kind:"handoff"};
 const activeTasks=[...coordSteps.values()].flat().filter(step=>step.employee_id===id);
 const running=activeTasks.find(step=>step.status==="running");
 if(running)return {emoji:"✍️",short:"Drafting",detail:running.title,kind:"working"};
 const waiting=activeTasks.find(step=>["waiting_for_owner","waiting_for_permission"].includes(step.status));
 if(waiting)return {emoji:waiting.status==="waiting_for_permission"?"🔐":"❓",short:"Waiting",detail:waiting.title,kind:"waiting"};
 const action=businessActions.find(request=>request.employee_id===id&&request.status==="pending");
 if(action)return {emoji:"📝🔐",short:"Approval",detail:action.summary,kind:"waiting"};
 const approvedAction=businessActions.find(request=>request.employee_id===id&&request.status==="approved"&&request.execution_status==="not_connected");
 if(approvedAction)return {emoji:"🔌",short:"Connection",detail:"Approved proposal; provider not connected",kind:"waiting"};
 const related=[...teamAssignments.values()].filter(a=>(a.employee_ids||[]).includes(id)&&a.status!=="completed");
 const queued=activeTasks.find(step=>step.status==="queued");
 if(queued)return {emoji:"📋",short:"Queued",detail:queued.title,kind:"queued"};
 if(related.length)return {emoji:"📋",short:"Assigned",detail:related[0].title,kind:"queued"};
 const last=activeTasks.find(step=>step.status==="completed");
 if(last)return {emoji:"✅",short:"Done",detail:last.title,kind:"done"};
 return {emoji:"☕",short:"Available",detail:"No active task",kind:"idle"};
}
function renderOffice(){
 const handoff=recentOfficeHandoff();
 const customHandoff=studioHandoffs.find(x=>Date.now()-Date.parse(x.created_at)<120000&&Date.now()-Date.parse(x.created_at)>=-60000);
 const activeStudioWorkers=studioBots.filter(bot=>bot.status==="active");
 const extraDesks=activeStudioWorkers.map(bot=>{
  const sending=customHandoff?.source_bot_id===bot.id,receiving=customHandoff?.target_bot_id===bot.id;
  return '<div class="office-station '+(sending||receiving?"office-handoff":"office-idle")+' office-custom"><div class="office-emoji-bubble" aria-label="'+(sending?"Handing off":receiving?"Receiving paperwork":"Chat ready")+'">'+(sending?"📄➡️":receiving?"🤝📄":"💬")+'</div>'+
  '<button type="button" class="office-employee" data-studio-worker="'+escapeHTML(bot.id)+'" aria-label="Message custom worker '+escapeHTML(bot.name)+'">'+
  '<span class="office-sprite studio-office-sprite" data-rpg-worker="'+escapeHTML(bot.id)+'"></span><strong>'+escapeHTML(bot.name)+'</strong></button>'+
  '<div class="office-workstation"><span class="office-screen"><span></span></span><span class="office-chair"></span></div>'+
  '<span class="office-status">'+(sending?"Handing off":receiving?"Receiving":"Chat ready")+'</span></div>';
 }).join("");
 const people=staff.map((person,index)=>{
 const [id,,name,role]=person,state=officeWorkerState(id);
 return '<div class="office-station office-'+state.kind+'">'+
  '<div class="office-emoji-bubble" title="'+escapeHTML(state.detail)+'" aria-label="'+escapeHTML(state.short)+'">'+state.emoji+'</div>'+
  '<button type="button" class="office-employee" data-chat="'+id+'" aria-label="Open '+escapeHTML(name)+' messages">'+
   '<span class="office-sprite" data-rpg-worker="'+id+'"></span><strong>'+escapeHTML(name)+'</strong>'+
   '</button>'+
  '<div class="office-workstation"><span class="office-screen"><span></span></span><span class="office-chair"></span></div>'+
  '<span class="office-status">'+escapeHTML(state.short)+'</span>'+
 '</div>';
 }).join("");
 const working=staff.filter(person=>officeWorkerState(person[0]).kind==="working").length;
 const waiting=staff.filter(person=>officeWorkerState(person[0]).kind==="waiting").length;
 return '<section class="office-screen-page"><div class="office-banner"><div><strong>Office floor</strong><p>Live assignment status · tap a person to message</p></div>'+
 '<button type="button" class="back" data-nav="assignments">Assignments ↗</button></div>'+
 '<div class="office-summary"><span>✍️ '+working+' drafting</span><span>❓ '+waiting+' waiting</span><span>👥 '+(staff.length+activeStudioWorkers.length)+' staff</span></div>'+
 (handoff?'<div class="office-handoff-banner" role="status"><span class="handoff-paper">📄➡️🤝</span><span>'+escapeHTML(workerLabel(handoff.from))+' → '+escapeHTML(workerLabel(handoff.to))+'<small>'+escapeHTML(handoff.step)+'</small></span></div>':"")+
 (customHandoff?'<div class="office-handoff-banner" role="status"><span class="handoff-paper">📄➡️🤝</span><span>'+
   escapeHTML(studioBots.find(x=>x.id===customHandoff.source_bot_id)?.name||"Coworker")+' → '+
   escapeHTML(studioBots.find(x=>x.id===customHandoff.target_bot_id)?.name||"Coworker")+
   '<small>Saved paperwork handoff · no outside actions</small></span></div>':"")+
 '<div class="office-floor">'+people+extraDesks+'</div>'+
 '<p class="office-legend">✍️ Drafting · 📋 Assigned · ❓ Needs you · 🔐 Permission · ✅ Done · ☕ Available</p>'+
 '<p class="notice">Bubbles reflect saved assignment activity. Available workers are not running tasks in the background.</p></section>';
}
const PERSONAL_PLATFORMS=[
 ["instagram","Instagram","📸"],["facebook","Facebook","📘"],["tiktok","TikTok","🎵"],
 ["youtube","YouTube","▶️"],["threads","Threads","🧵"],["pinterest","Pinterest","📌"],
 ["x","X / Twitter","𝕏"],["snapchat","Snapchat","👻"],
 ["google_ads","Google Ads","📊"],["tiktok_ads","TikTok Ads","📈"],
 ["pinterest_ads","Pinterest Ads","📣"]
];
const PERSONAL_SCOPES=[
 ["draft_posts","Draft posts"],["draft_replies","Draft replies"],["plan_content","Plan content"],
 ["read_account_data","Request account analytics"],["publish_content","Request publishing"],
 ["manage_messages","Request inbox management"]
];
function personalPermissionState(p){
 if(p.status==="approved"&&new Date(p.expires_at).getTime()<=Date.now())return "expired";
 if(p.status==="requested"&&new Date(p.expires_at).getTime()<=Date.now())return "expired";
 return p.status;
}
function renderPersonalAccounts(){
 const names=Object.fromEntries(PERSONAL_PLATFORMS.map(row=>[row[0],row[1]]));
 const icons=Object.fromEntries(PERSONAL_PLATFORMS.map(row=>[row[0],row[2]]));
 const capabilities=Object.fromEntries(PERSONAL_SCOPES.map(row=>[row[0],row[1]]));
 const option=(value,label,selected)=>'<option value="'+escapeHTML(value)+'"'+(selected?" selected":"")+'>'+escapeHTML(label)+'</option>';
 const workerOptions=staff.map(row=>option(row[0],row[2],row[0]==="maya")).join("");
 const scopeOptions=PERSONAL_SCOPES.map(row=>option(row[0],row[1],row[0]==="draft_posts")).join("");
 const countActive=personalPermissions.filter(p=>personalPermissionState(p)==="approved").length;
 const rows=personalAccounts.map(account=>{
  const grants=personalPermissions.filter(p=>p.account_id===account.id);
  const hasPending=grants.some(p=>personalPermissionState(p)==="requested");
  const item=grants.map(p=>{
   const status=personalPermissionState(p);
   const person=staff.find(row=>row[0]===p.employee_id)?.[2]||p.employee_id;
   const action=status==="requested"?
    '<div class="personal-permission-actions">'+
    '<button type="button" data-personal-decision="'+escapeHTML(p.id)+'" data-personal-approve="yes">Approve plan</button>'+
    '<button type="button" data-personal-decision="'+escapeHTML(p.id)+'" data-personal-approve="no">Deny</button></div>':
    status==="approved"?
    '<button type="button" class="personal-danger" data-personal-revoke="'+escapeHTML(p.id)+'">Revoke now</button>':"";
   return '<div class="personal-permission"><div><strong>'+escapeHTML(person)+'</strong> · '+escapeHTML(capabilities[p.capability]||p.capability)+'</div>'+
    '<span class="personal-permission-status personal-status-'+escapeHTML(status)+'">'+escapeHTML(status==="requested"?"Awaiting your decision":status==="approved"?"Approved for planning only":status)+"</span>"+
    '<p>'+escapeHTML(p.purpose)+'</p>'+
    (status==="approved"?'<small>Expires '+escapeHTML(new Date(p.expires_at).toLocaleString())+'</small>':"")+
    '<small>External account actions remain disabled.</small>'+action+'</div>';
  }).join("");
  return '<article class="personal-account"><div class="personal-account-head"><div class="personal-account-icon">'+(icons[account.platform]||"🔐")+'</div>'+
   '<div class="personal-account-title"><strong>'+escapeHTML(account.label)+'</strong><small>'+escapeHTML(names[account.platform]||account.platform)+' · '+escapeHTML(account.handle)+'</small></div>'+
   '<button class="personal-remove" type="button" data-personal-delete="'+escapeHTML(account.id)+'" title="Remove saved profile label" aria-label="Remove '+escapeHTML(account.label)+'">×</button></div>'+
   '<div class="personal-account-status">○ Account label only · Not connected</div>'+
   (account.platform==='facebook'?'<div data-facebook-read-setup>'+(window.agentHQFacebookReadAccount?.(account)||'<a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">Sign in to Facebook ↗</a>')+'</div>':'')+
   '<details class="personal-worker-details"'+(hasPending?' open':'')+'><summary>Worker permissions'+(hasPending?' · Approval needed':'')+(grants.length?' ('+grants.length+')':"")+'</summary>'+
   (item||'<p class="personal-muted">No worker permission plans yet.</p>')+
   '<form class="personal-request-form" data-personal-request="'+escapeHTML(account.id)+'">'+
   '<label>Worker<select name="worker" required>'+workerOptions+'</select></label>'+
   '<label>Task scope<select name="scope" required>'+scopeOptions+'</select></label>'+
   '<label>Why does this worker need the scope?<textarea name="purpose" required minlength="5" maxlength="500" placeholder="For example, draft captions for this Instagram account."></textarea></label>'+
   '<button type="submit" class="personal-primary">Prepare permission request</button>'+
   '<p class="personal-muted">You will approve or deny this request separately. No account login or external action occurs.</p>'+
   '</form></details></article>';
 }).join("");
 return '<section class="personal-workspace">'+
  '<div class="personal-intro"><h2>My accounts</h2><p>Your own social profiles and advertising accounts, organized for personal use. You control exactly which AI worker may plan what.</p>'+
  '<div class="personal-privacy">🔒 Account labels and approvals are only visible under your Agent HQ sign-in. The GitHub Pages frontend itself remains public.</div></div>'+
  '<section class="personal-ad-card"><div><strong>📊 My Meta Ads</strong><p>'+escapeHTML(metaState.connected?"Read-only Meta connection active":"Not connected — available after your authorization")+'</p></div>'+
  '<button type="button" data-nav="operations">Manage Meta Ads ↗</button></section>'+
  '<div class="personal-connection-banner">Social account profiles below are saved labels, <strong>not authenticated connections</strong>. Never enter passwords, login codes, or access tokens here.</div>'+
  '<details class="personal-add-section"><summary>＋ Add my social or advertising profile</summary>'+
  '<form id="personal-add-form" class="personal-add-form">'+
  '<label>Platform<select name="platform" required>'+PERSONAL_PLATFORMS.map(row=>option(row[0],row[1],row[0]==="instagram")).join("")+'</select></label>'+
  '<label>Profile nickname<input name="label" required maxlength="80" placeholder="My personal page"></label>'+
  '<label>Public handle or account label<input name="handle" required maxlength="120" placeholder="@myprofile — never a password"></label>'+
  '<button type="submit" class="personal-primary">Save profile label</button>'+
  '</form></details>'+
  '<div class="personal-section-heading"><h3>Saved profiles <span>'+personalAccounts.length+'</span></h3><small>'+countActive+' active planning approvals</small></div>'+
  (rows||'<div class="personal-empty">No profiles saved yet. Add a social handle or advertising account label to organize permissions for your workers.</div>')+
  '<p class="personal-feedback" role="status">'+escapeHTML(personalFeedback||personalNotice)+'</p>'+
  '<p class="personal-footer">Worker permissions are scoped, expire after 24 hours when approved, and can be revoked. They do not open accounts, read private messages, publish content or change ads. Those actions require actual provider connections and separate consent.</p>'+
 '</section>';
}
function renderOperations(){
 const providerNames={meta_ads:"Meta Ads",facebook:"Facebook",instagram:"Instagram",tiktok:"TikTok",manychat:"Manychat",email:"Email",youtube:"YouTube",other:"Other"};
 const actionNames={read_metrics:"Account reporting",change_ad_budget:"Advertising budget",create_content:"Content draft",
 publish_content:"Publishing",reply_to_comment:"Community response",create_automation:"Automation setup",send_email:"Email delivery",other:"Outside action"};
 const guides=[
  {worker:"avery",example:"What did I spend yesterday on my Meta Ads account?",title:"Review ad spending",icon:"📊"},
  {worker:"alex",example:"Prepare to change our Hook 7 ad set daily budget to $600. Ask my approval first.",title:"Propose a budget change",icon:"💰"},
  {worker:"casey",example:"Draft captions for my personal Instagram and TikTok accounts. Do not publish.",title:"Personal social posts",icon:"📱"},
  {worker:"jamie",example:"Help me plan content for my personal social accounts.",title:"Personal content planning",icon:"🤖"}
 ];
 return '<section class="operations-page">'+
 '<div class="operations-intro"><h2>Manage your own projects by conversation</h2><p>Your AI coworkers can help with personal posts, projects and your own advertising. External accounts require your authorization and individual worker permissions.</p></div>'+
 '<h3>Try a request</h3><div class="operations-examples">'+guides.map(g=>
  '<button type="button" class="operations-example" data-op-prompt="'+escapeHTML(g.example)+'" data-op-worker="'+g.worker+'"><span>'+g.icon+'</span><strong>'+escapeHTML(g.title)+'</strong><small>Ask '+escapeHTML(staff.find(v=>v[0]===g.worker)?.[2]||g.worker)+' →</small></button>'
 ).join("")+'</div>'+
 '<div class="operations-connection"><h3>My account connections</h3><p>Groq handles AI conversations and drafts. You choose which personal accounts to connect and which workers may work with them. No social platform sign-ins are connected yet.</p><button type="button" class="operations-open-chat" data-nav="accounts">Manage my profiles and worker permissions ↗</button>'+
 '<div class="operations-services"><span>Meta Ads <em>Not connected</em></span><span>Instagram & Facebook <em>Not connected</em></span><span>TikTok <em>Not connected</em></span><span>Manychat <em>Not connected</em></span><span>Email <em>Not connected</em></span></div></div>'+
 '<h3>Requests waiting for my approval</h3><p class="operations-caption">'+escapeHTML(businessActionsNotice)+'</p>'+
 (businessActions.length?businessActions.map(a=>
  '<article class="operations-proposal"><div class="operations-proposal-head"><strong>'+escapeHTML(actionNames[a.action_kind]||a.action_kind)+'</strong>'+
  '<span class="operations-status operations-'+escapeHTML(a.status)+'">'+escapeHTML(a.status==='approved'?"Approved plan":a.status==='denied'?"Declined":"Waiting for your answer")+'</span></div>'+
  '<p>'+escapeHTML(a.summary)+'</p><div class="operations-scope"><strong>Requested scope:</strong> '+escapeHTML(a.scope)+'</div>'+
  '<small>'+escapeHTML(providerNames[a.provider]||a.provider)+' · '+escapeHTML(staff.find(v=>v[0]===a.employee_id)?.[2]||a.employee_id)+
  ' · '+escapeHTML(new Date(a.created_at).toLocaleString())+'</small>'+
  '<p class="operations-blocked">🔒 External action not executed — account integration not connected.</p>'+
  '<button type="button" class="operations-open-chat" data-chat="'+escapeHTML(a.employee_id)+'">Open conversation →</button></article>'
 ).join(""):'<p class="operations-empty">No proposed outside actions yet. Start by asking a coworker about reporting, ads, social posts, or automations.</p>')+
 '</section>';
}
let researchConnection={ready:false,message:"Tap Check connection to verify web research."},researchJobs=[];
function researchConnectionCard(){return '<section class="card research-connection"><h2>Web Research</h2><p id="research-connection-status" class="notice" role="status">'+escapeHTML(researchConnection.message)+'</p><button type="button" class="back" data-research-check>Check connection</button><p class="notice">Uses your server’s Groq connection. Each report needs your approval. Public topics only; no passwords or private account information. Provider limits or charges may apply.</p></section>'}
window.agentHQSettingsResearch=researchConnectionCard;
function renderResearchHistory(){return researchJobs.length?researchJobs.map(job=>'<article class="research-history-item"><div class="research-history-heading"><strong>'+escapeHTML(job.status==='completed'?'Report ready':job.status==='running'?'Researching…':job.status==='pending'?'Awaiting your reply':job.status)+'</strong><small>'+escapeHTML(staff.find(x=>x[0]===job.employee_id)?.[2]||'Company HQ')+'</small></div><p>'+escapeHTML(job.query)+'</p>'+(job.report?'<details><summary>Read report</summary><div class="research-report">'+messageHTML(job.report)+'</div></details>':'')+(job.error?'<p class="notice">'+escapeHTML(job.error)+'</p>':'')+'<button type="button" class="back" data-chat="'+escapeHTML(job.employee_id)+'">Open conversation</button></article>').join(''):'<p class="notice">Your research requests and reports will appear here.</p>'}
function renderResearchPage(browser){return (browser?'<section class="card"><h2>Browse yourself</h2><form id="agent-browser-form" class="research-browser-form"><input id="agent-browser-input" aria-label="Search or website" placeholder="Search or enter a URL" required><button class="primary" type="submit">Go</button></form><p class="notice" id="agent-browser-status">Opens a new tab for you.</p></section>':'')+researchConnectionCard()+'<section class="card research-request"><h2>Ask a worker</h2><p class="notice">Choose a worker and describe what to find. They’ll ask for your approval in Messages, then research the public web and return a report with source links.</p><form id="live-research-form"><label for="research-agent">Worker</label><select id="research-agent">'+staff.map(x=>'<option value="'+x[0]+'"'+(x[0]==='riley'?' selected':'')+'>'+x[2]+' · '+x[3]+'</option>').join('')+'</select><label for="research-topic">Research topic</label><textarea id="research-topic" required minlength="5" maxlength="1900" rows="4" placeholder="Compare three current options for my project, with prices and sources."></textarea><button class="primary" type="submit">Send research request</button></form><p class="notice" id="research-status" role="status">You can also ask any built-in worker to research directly in Messages. Up to 8 reports per hour.</p></section><section class="card"><h2>Research history</h2><button type="button" class="back" data-research-refresh>Refresh reports</button><p id="research-history-notice" class="notice" role="status"></p><div id="research-history">'+renderResearchHistory()+'</div></section>'}
window.agentHQResearchSync=(jobs,notice)=>{researchJobs=jobs||[];if(screen==='chat'&&active&&jobs?.some(j=>j.employee_id===active&&j.status==='completed'))renderWithoutInterruptingDraft();const history=document.querySelector('#research-history');if(history)history.innerHTML=renderResearchHistory();const status=document.querySelector('#research-history-notice');if(status)status.textContent=notice||''};
window.agentHQResearchConnection=data=>{researchConnection=data;const status=document.querySelector('#research-connection-status');if(status)status.textContent=data.message};
app.addEventListener('click',async e=>{const refresh=e.target.closest('[data-research-refresh]');if(refresh){refresh.disabled=true;try{await window.agentHQResearchCloud?.refresh()}catch{}finally{refresh.disabled=false}return}const button=e.target.closest('[data-research-check]');if(!button)return;button.disabled=true;button.textContent='Checking…';try{if(!window.agentHQResearchCloud)throw Error('Research connection is loading. Refresh Agent HQ.');await window.agentHQResearchCloud.status()}catch(err){window.agentHQResearchConnection({ready:false,message:err.message})}finally{button.disabled=false;button.textContent='Check connection'}});
let settingsReturn=false;
function render(){const isChat=screen==="chat";
 if(!isChat)lastViewedThread=null;
 else if(active&&active!==lastViewedThread){lastViewedThread=active;window.agentHQChatCloud?.markRead(active).catch(()=>{});}
const title=isChat?(active==="hq"?"Company Headquarters":staff.find(x=>x[0]===active)?.[2]):screen==="team"?(teamAssignments.get(teamActive)?.title||"Team discussion"):({home:"Agent HQ",office:"Office",studio:"Worker Studio",accounts:"My Accounts",operations:"Operations",creative:"Creative Desk",email:"Email Center",contacts:"Contacts",messages:"Messages",assignments:"Assignments",approvals:"Approvals",research:"Research",browser:"Browser",reminders:"Reminders",settings:"Settings"})[screen];let body="";if(screen==="home")body=renderHomeScreen(button,{messages:messagesAttention(),approvals:pendingCount(),assignments:assignmentAttention(),research:researchJobs.filter(j=>j.status==="completed").length});else if(screen==="office")body=renderOffice();else if(screen==="studio")body='<section class="bot-studio-page" id="agent-bot-studio-root"><p class="muted">Loading your AI worker marketplace…</p></section>';else if(screen==="creative")body='<section id="agent-creative-root" aria-label="Creative Desk">'+(window.agentHQCreativeDeskRender?.()||'<p class="muted">Loading Creative Desk…</p>')+'</section>';else if(screen==="accounts")body=renderPersonalAccounts();else if(screen==="email")body='<section class="email-center-page" id="email-center"><p class="email-loading">Loading your private Email Center…</p></section>';else if(screen==="operations")body=renderOperations();else if(screen==="browser"||screen==="research")body=renderResearchPage(screen==="browser");else if(screen==="approvals")body=`<p class="notice">${escapeHTML(approvalNotice)} These records do not grant real browsing access.</p><div class="card"><strong>Pending requests: ${pendingCount()}</strong><p class="muted">Open the employee's individual message to approve or deny.</p></div>${[...approvalRequests.values()].filter(r=>r.status==="pending"&&!messageIsDeleted("approval",r.id)).map(r=>`<button class="row" data-chat="${escapeHTML(r.agentId)}"><span class="avatar">⚠️</span><span><strong>${escapeHTML(staff.find(s=>s[0]===r.agentId)?.[2]||r.agentId)}</strong><small>${escapeHTML(r.website)}</small></span></button>`).join("")}<h2>Saved decisions</h2><p class="muted">Approved and denied requests remain visible in the employee conversation.</p>${[...approvalRequests.values()].filter(r=>r.status!=="pending"&&!messageIsDeleted("approval",r.id)).reverse().slice(0,25).map(r=>`<button class="row" data-chat="${escapeHTML(r.agentId)}"><span class="avatar">${r.status==="approved"?"✅":r.status==="denied"?"⛔":"🕒"}</span><span><strong>${escapeHTML(staff.find(s=>s[0]===r.agentId)?.[2]||r.agentId)} · ${escapeHTML(r.status)}</strong><small>${escapeHTML(r.website)}</small></span></button>`).join("")}`;else if(screen==="assignments")body=renderAssignments();else if(screen==="team")body=renderTeamThread();else if(screen==="contacts"||screen==="messages")body=`<input id="search" aria-label="Search workers" placeholder="Search" style="width:100%;padding:12px;border:1px solid #d2d2d7;border-radius:14px"><div id="contact-list"></div>`;else if(isChat)body=renderIPhoneChat();else if(screen==="settings")body='<section id="settings-root" aria-label="Agent HQ settings"></section>';else body=`<div class="card"><strong>Planned feature</strong><p class="muted">This screen will be connected in a later development phase. No live service is connected yet.</p></div>`;if(isChat){
 const person=staff.find(row=>row[0]===active);
 const name=active==="hq"?"Company HQ":(person?.[2]||"Worker");
 const role=active==="hq"?"AI team":(person?.[3]||"AI coworker");
 const initial=active==="hq"?"HQ":name.slice(0,1).toUpperCase();
 app.innerHTML='<main class="shell ios-chat-shell"><header class="ios-chat-header">'+
 '<button class="ios-back" type="button" data-nav="messages" aria-label="Back to messages">‹ <span>Messages</span></button>'+
 '<div class="ios-contact" data-thread-press="'+escapeHTML(active)+'" title="Hold to manage this conversation"><span class="ios-contact-avatar" data-rpg-worker="'+escapeHTML(active)+'">'+escapeHTML(initial)+'</span><span class="ios-contact-name">'+escapeHTML(name)+
 '<small>'+escapeHTML(role)+'</small></span></div>'+
 '<button class="ios-refresh" type="button" id="refresh" aria-label="Refresh messages">↻</button>'+
 '</header>'+body+'</main>';
 }else{
 app.innerHTML=`<main class="shell ${screen==="home"?"home-shell":screen==="office"?"office-shell":screen==="settings"?"settings-shell":""}"><header class="main-navigation">${screen!=="home"?`<button class="back" data-nav="${screen==="team"?"assignments":settingsReturn?"settings":"home"}" aria-label="Go back">‹ ${settingsReturn?"Settings":"Home"}</button>`:`<button type="button" class="home-brand" data-nav="office" aria-label="Open office">${window.AgentHQIcons?.svg("office")||""}<span>Office</span></button>`}<span class="header-brand">Agent HQ</span></header>${screen==="home"?"":`<h1>${escapeHTML(title||"Agent HQ")}</h1>`}${body}</main>`;
 }if(screen==="contacts"||screen==="messages"){const show=(q="")=>{
 const inbox=screen==="messages";
 const hasConversation=id=>employeeAttention(id)>0||(messages.get(id)||[]).some(m=>m.type==="text"&&String(m.text||"").trim().length>0);
 const matches=x=>[x[2],x[3]].join(" ").toLowerCase().includes(q.toLowerCase());
 const shown=inbox?staff.filter(x=>matches(x)&&hasConversation(x[0])):staff.filter(matches);
 const showHQ=!inbox||hasConversation("hq");
 const headquarters=showHQ&&"company headquarters".includes(q.toLowerCase())?`<button class="row" data-chat="hq" aria-label="Company Headquarters${employeeAttention("hq")?", "+employeeAttention("hq")+" unread items":""}"><span class="avatar">🏢</span><span class="agent-contact-copy"><strong>Company Headquarters</strong><small>All 10 employees</small></span>${unreadBadge(employeeAttention("hq"))}</button>`:"";
 const staffRows=shown.map(x=>`<button class="row" data-chat="${x[0]}" aria-label="${escapeHTML(x[2])}${employeeAttention(x[0])?", "+employeeAttention(x[0])+" unread items":""}"><span class="avatar">${x[1]}</span><span class="agent-contact-copy"><strong>${x[2]}</strong><small>${escapeHTML(x[3])}${inbox?getConversationPreview(x[0]):""}</small></span>${unreadBadge(employeeAttention(x[0]))}</button>`).join("");
 const customRows=studioBots.filter(b=>b.status==="active"&&
   (!inbox||studioMessaged.has(b.id))&&[b.name,b.role].join(" ").toLowerCase().includes(q.toLowerCase()))
  .map(b=>'<button class="row" data-studio-worker="'+escapeHTML(b.id)+'"><span class="avatar studio-contact-avatar" data-rpg-worker="'+escapeHTML(b.id)+'"></span>'+
   '<span><strong>'+escapeHTML(b.name)+'</strong><small>'+escapeHTML(b.role)+'</small></span></button>').join("");
 document.querySelector("#contact-list").innerHTML=headquarters+staffRows+customRows||(inbox?'<p class="muted">No individual conversations yet. Start one from Contacts.</p>':'<p class="muted">No employees match that search.</p>');
 };show();document.querySelector("#search").addEventListener("input",e=>show(e.target.value));
 if(screen==="messages"&&document.querySelector("#sync-msgs"))document.querySelector("#sync-msgs").addEventListener("click",async e=>{const button=e.currentTarget;button.disabled=true;button.textContent="↻ Syncing…";try{await Promise.all([window.agentHQCloudApprovals?.refresh(),window.agentHQChatCloud?.refresh(),window.agentHQTeamCloud?.refresh()])}catch(err){window.agentHQChatCloudNotice("Sync failed: "+err.message)}finally{button.disabled=false;if(button.isConnected)button.textContent="↻ Sync saved messages"}})
}
if(screen==="research"||screen==="browser"){
 const researchForm=document.querySelector("#live-research-form");
 researchForm.addEventListener("submit",async e=>{
  e.preventDefault();const worker=document.querySelector("#research-agent").value;
  const query=document.querySelector("#research-topic").value.trim();
  const status=document.querySelector("#research-status"),submit=researchForm.querySelector('[type="submit"]');
  if(query.length<5){status.textContent="Enter a topic with at least five characters.";return}
  submit.disabled=true;status.textContent="Sending your topic to the worker…";
  try{
   if(!window.agentHQChatCloud?.converse)throw Error("Chat connection is loading. Try again shortly.");
   await window.agentHQChatCloud.converse(worker,query,{research:true});
   active=worker;screen="chat";settingsReturn=false;render();
  }catch(err){status.textContent=err.message}finally{submit.disabled=false}
 });
 document.querySelector("#agent-browser-form")?.addEventListener("submit",e=>{
  e.preventDefault();const input=document.querySelector("#agent-browser-input").value.trim();
  const target=/^https?:\/\//i.test(input)?input:/^[^\s]+\.[a-z]{2,}(?:[\/:?#].*)?$/i.test(input)?"https://"+input:"https://www.google.com/search?q="+encodeURIComponent(input);
  try{const url=new URL(target);if(!["https:","http:"].includes(url.protocol)||url.username||url.password)throw Error();window.open(url.href,"_blank","noopener,noreferrer");document.querySelector("#agent-browser-status").textContent="Opened in a new tab. Use Ask a worker below for an AI research report."}
  catch{document.querySelector("#agent-browser-status").textContent="Enter a valid public URL or search phrase."}
 });
 queueMicrotask(()=>window.agentHQResearchCloud?.refresh().catch(()=>{}));
}if(isChat){
 const field=document.querySelector("#draft"),form=document.querySelector("#composer");
 field.value=drafts.get(active)||"";
 field.addEventListener("input",event=>drafts.set(active,event.target.value));
 form.addEventListener("submit",async event=>{
  event.preventDefault();
  const worker=active,value=field.value.trim();
  if(sendingAgents.has(worker))return;
  if(!value){field.focus();return}
  sendingAgents.add(worker);
  const optimisticId="pending-"+Date.now();
  const previous=messages.get(worker)||[];
  messages.set(worker,[...previous,{id:optimisticId,type:"text",text:value,sender:"owner",createdAt:new Date().toISOString(),pending:true}]);
  drafts.set(worker,"");
  sendFeedback.delete(worker);
  if(screen==="chat"&&active===worker)render();
  try{
   if(!window.agentHQChatCloud?.converse)throw Error("Conversation service is loading. Please refresh Agent HQ.");
   const reviewText=value.trim().toLowerCase().replace(/[.!?]+$/g,"").replace(/\s+/g," ");
   const approveSignals=/^(approve(?: (?:the|this|final))? (?:draft|content|copy)(?: please)?|approved|i approve|green light|green thumb|thumbs up|thumb up|👍|✅|like it|i like it|looks good|love it|i love it|good to go|yes,? i like it)$/i;
   const rejectSignals=/^(reject(?: (?:the|this|final))? (?:draft|content|copy)|deny|denied|red light|thumbs down|thumb down|👎|❌|dislike it|i dislike it|i don't like it|not approved)$/i;
   const reviewDecision=approveSignals.test(reviewText)?"APPROVED":rejectSignals.test(reviewText)?"REVISION_REQUESTED":null;
   const final=reviewDecision?finalDraftForChat(worker):null;
   if(reviewDecision&&final){
    // Reread owner-scoped evidence before recording the decision. Never treat
    // a draft review as external permission to send, publish or use accounts.
    await Promise.allSettled([window.agentHQTeamCloud?.refresh(),window.agentHQCoordCloud?.refresh()]);
    const latest=conversationDraftInfo(teamAssignments.get(final.a.id)||final.a);
    if(!latest.eligible||latest.approved||latest.rejected||latest.version!==final.version)
     throw Error("This draft changed or was already reviewed. Check the latest work before replying.");
    await window.agentHQChatCloud.send(worker,value);
    const reviewNote=reviewDecision==="APPROVED"?
     "Owner approved the written draft only. No publishing, sending, account access or spending approved.":
     "Owner rejected this text draft. Ask for the specific changes and prepare a NEW internal revision draft before another review.";
    await window.agentHQTeamCloud.post(final.a.id,CREATIVE_REVIEW_PREFIX+"|"+reviewDecision+"|"+latest.version+"\n"+reviewNote);
    await Promise.allSettled([window.agentHQChatCloud.refresh(),window.agentHQTeamCloud.refresh()]);
    drafts.set(worker,"");
    messages.set(worker,(messages.get(worker)||[]).filter(msg=>msg.id!==optimisticId));
    sendFeedback.set(worker,reviewDecision==="APPROVED"?"Written draft approved. Nothing was published or sent.":"Draft marked for revision. Text what you want changed; your worker can start a revision assignment.");
    return;
   }
   if(/^approve (?:the |this |final )?(?:draft|content|copy)(?: please)?[.!]?$/i.test(value)&&!final)
    throw Error("There is no single unreviewed completed draft here. Ask the worker to show the exact assignment.");
   const result=await window.agentHQChatCloud.converse(worker,value);
   drafts.set(worker,"");
   messages.set(worker,(messages.get(worker)||[]).filter(msg=>msg.id!==optimisticId));
   sendFeedback.delete(worker);
   if(result.approved_assignment_id){
    window.agentHQCoordCloud?.runTeam(result.approved_assignment_id,{planFirst:false,maxSteps:4})
     .catch(error=>window.agentHQCoordError?.("Team paused: "+error.message));
   }
   if(result.start_assignment_id||result.resume_assignment_id){
    const id=result.start_assignment_id||result.resume_assignment_id;
    const planFirst=Boolean(result.start_assignment_id);
    window.agentHQCoordCloud?.runTeam(id,{planFirst,autoApproveInternal:planFirst,maxSteps:4}).catch(error=>{
     window.agentHQCoordError?.("AI team paused: "+error.message);
    });
   }
   await Promise.allSettled([window.agentHQTeamCloud?.refresh(),window.agentHQCoordCloud?.refresh(),window.agentHQCloudApprovals?.refresh(),window.agentHQPersonalCloud?.refresh()]);
  }catch(error){
   messages.set(worker,(messages.get(worker)||[]).filter(msg=>msg.id!==optimisticId));
   drafts.set(worker,value);
   sendFeedback.set(worker,"Could not confirm sending: "+error.message+". Your text is kept; check the thread before sending it again.");
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
}}app.addEventListener("submit",async e=>{
 const accountForm=e.target.closest?.("#personal-add-form");
 const accessForm=e.target.closest?.("[data-personal-request]");
 if(!accountForm&&!accessForm)return;
 e.preventDefault();
 if(personalBusy)return;
 personalBusy=true;
 try{
  const cloud=window.agentHQPersonalCloud;
  if(!cloud)throw Error("Your private account service is loading. Refresh Agent HQ.");
  if(accountForm){
   const inputs=accountForm.elements;
   await cloud.addAccount(inputs.platform.value,inputs.label.value,inputs.handle.value);
   personalFeedback="Profile label saved. It is not yet connected to the social platform.";
  }else{
   const fields=accessForm.elements;
   const worker=fields.worker.value,scope=fields.scope.value;
   const account=personalAccounts.find(x=>x.id===accessForm.dataset.personalRequest);
   if(!account)throw Error("That saved account is not available.");
   await cloud.requestPermission(account.id,worker,scope,fields.purpose.value);
   personalFeedback="Permission request prepared. Review it under the account and choose Approve or Deny.";
  }
 }catch(error){personalFeedback="Could not save: "+error.message}
 finally{personalBusy=false;if(screen==="accounts")render()}
});
app.addEventListener("click",async e=>{
 const connectChoice=e.target.closest("[data-chat-connect]");
 if(connectChoice){
  e.preventDefault();
  if(chatConnectorBusy)return;
  const action=connectChoice.dataset.chatConnect;
  const worker=active;
  chatConnectorBusy=true;connectChoice.setAttribute("aria-disabled","true");
  try{
   const gmail=window.agentHQEmailCloud;
   if(action==="gmail-setup"||action==="gmail-center"){screen="email";render();return}
   if(action==="social-info"||action==="open-accounts"){screen="settings";render();window.agentHQSettingsNavigate?.("integrations");return}
   if(action==="chatgpt-apply"){window.open("https://openai.com/form/sign-in-with-chatgpt-interest/","_blank","noopener,noreferrer");return}
   if(action==="chatgpt-open"){window.open("https://chatgpt.com/","_blank","noopener,noreferrer");return}
   if(action==="meta-center"){screen="operations";render();return}
   if(action==="icloud-info"){window.open("https://support.apple.com/en-us/102525","_blank","noopener,noreferrer");return}
   if(action==="meta-connect"){
    if(!window.agentHQMetaCloud)throw Error("Meta Ads connection is loading. Refresh the app.");
    await window.agentHQMetaCloud.connect();return;
   }
   if(!gmail)throw Error("Gmail connection is loading. Refresh the app.");
   if(action==="gmail-refresh"){
    await gmail.refresh();
    sendFeedback.set(worker,"Gmail setup checked. If setup is complete, tap Connect Gmail with Google. Otherwise, finish the one-time steps in Email Center.");
    return;
   }
   if(action==="gmail-connect"){
    try{sessionStorage.setItem("agenthq_gmail_chat_return",worker)}catch{}
    try{await gmail.connect()}catch(err){
     try{sessionStorage.removeItem("agenthq_gmail_chat_return")}catch{}
     throw err;
    }
    return;
   }
   if(action==="gmail-grant"){
    if(!window.confirm("Give "+(staff.find(x=>x[0]===worker)?.[2]||"this worker")+
     " read-only access to Gmail priority summaries for 24 hours? No messages will be sent and you can revoke this permission anytime."))return;
    await gmail.grantWorker(worker);
    sendFeedback.set(worker,"Worker access approved for priority summaries only. Tap Check Gmail inbox now to run the review.");
   }else if(action==="gmail-revoke"){
    await gmail.revokeWorker(worker);
    sendFeedback.set(worker,"Gmail worker permission revoked. Your Gmail account remains connected for your own use.");
   }else if(action==="gmail-check"){
    const result=await gmail.check(); // explicit button initiates live Gmail API review
    if(result?.error)throw Error(result.error);
    if(!window.agentHQChatCloud?.converse)throw Error("Worker Messages is not ready");
    try{
     await window.agentHQChatCloud.converse(worker,
      "Please summarize the Gmail priority summaries from the inbox check I just approved. Rank urgent to low and note any drafts ready to review. Do not send anything.");
     sendFeedback.set(worker,"Gmail checked. Worker response saved in this conversation; Email Center has the editable replies.");
    }catch(summaryError){
     sendFeedback.set(worker,"Gmail inbox check succeeded, but the worker summary was unavailable: "+
      (summaryError?.message||"Please try asking the worker again."));
    }
   }
  }catch(err){
   sendFeedback.set(worker,"Account action did not complete: "+(err?.message||"Unknown error"));
  }finally{chatConnectorBusy=false;if(screen==="chat"&&active===worker)renderWithoutInterruptingDraft()}
  return;
 }
 const customOpen=e.target.closest("[data-studio-worker]");
 if(customOpen){
  const id=customOpen.dataset.studioWorker;
  if(!studioBots.some(b=>b.id===id&&b.status==="active"))return;
  screen="studio";render();
  window.agentHQBotStudioUI?.openBot(id);
  return;
 }
 const personalDecision=e.target.closest("[data-personal-decision]");
 const personalRevoke=e.target.closest("[data-personal-revoke]");
 const personalDelete=e.target.closest("[data-personal-delete]");
 if(personalDecision||personalRevoke||personalDelete){
  if(personalBusy)return;
  const cloud=window.agentHQPersonalCloud;
  if(!cloud){personalFeedback="Account permissions are loading. Refresh Agent HQ.";render();return}
  let agreed=false;
  if(personalDelete){
   const account=personalAccounts.find(a=>a.id===personalDelete.dataset.personalDelete);
   if(!account)return;
   agreed=window.confirm('Remove "'+account.label+'" from Agent HQ and discard all related worker permission plans? This does not delete the external profile.');
  }else{
   const id=personalDecision?.dataset.personalDecision||personalRevoke?.dataset.personalRevoke;
   const grant=personalPermissions.find(p=>p.id===id);
   if(!grant)return;
   const account=personalAccounts.find(a=>a.id===grant.account_id);
   const workerName=staff.find(x=>x[0]===grant.employee_id)?.[2]||grant.employee_id;
   if(personalDecision){
    agreed=window.confirm((personalDecision.dataset.personalApprove==="yes"?"Approve":"Deny")+
     ' '+workerName+' for "'+(account?.label||"this profile")+
     '"? This is a planning permission only; it does not connect the account or enable outside actions.');
   }else{
    agreed=window.confirm("Revoke "+workerName+"'s approval for this profile now?");
   }
  }
  if(!agreed)return;
  personalBusy=true;personalFeedback="Saving your permission decision…";
  try{
   if(personalDelete){
    await cloud.removeAccount(personalDelete.dataset.personalDelete);
    personalFeedback="Account label and associated permission plans removed.";
   }else if(personalDecision){
    await cloud.decidePermission(personalDecision.dataset.personalDecision,
      personalDecision.dataset.personalApprove==="yes");
    personalFeedback="Your approval decision was saved. No external actions have been enabled.";
   }else{
    await cloud.revokePermission(personalRevoke.dataset.personalRevoke);
    personalFeedback="Worker permission revoked.";
   }
  }catch(error){personalFeedback="Could not update permission: "+error.message}
  finally{personalBusy=false;if(screen==="accounts")render()}
  return;
 }
 const operationShortcut=e.target.closest("[data-op-prompt]");
 if(operationShortcut){
  const employee=operationShortcut.dataset.opWorker;
  if(!staff.some(worker=>worker[0]===employee))return;
  active=employee;
  drafts.set(employee,operationShortcut.dataset.opPrompt||"");
  screen="chat";render();
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
 const alexDecision=e.target.closest("[data-alex-decision]");
 if(alexDecision){
  const id=alexDecision.dataset.alexAssignment,decision=alexDecision.dataset.alexDecision;
  if(!teamAssignments.has(id)||!window.agentHQCoordCloud?.decidePlan)return;
  alexDecision.disabled=true;
  window.agentHQCoordCloud.decidePlan(id,decision).catch(error=>{
    window.agentHQCoordError?.("Alex plan decision failed: "+error.message);
  }).finally(()=>{alexDecision.disabled=false;});
  return;
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
 const teamLink=e.target.closest("[data-team-open]");if(teamLink){const id=teamLink.dataset.teamOpen;if(teamAssignments.has(id)){teamActive=id;teamDraft="";teamPostFeedback="";screen="team";render()}return}const decision=e.target.closest("[data-approval]");if(decision){const req=approvalRequests.get(decision.dataset.approval);if(req&&req.status==="pending"&&req.agentId===active){const choice=decision.dataset.decision;const service=window.agentHQCloudApprovals;if(!service){window.agentHQApprovalCloudError("Permission service unavailable. Try refreshing Agent HQ.");return}const controls=[...decision.closest(".card").querySelectorAll("[data-approval]")];controls.forEach(button=>button.disabled=true);service.decide(req.id,choice).catch(err=>{window.agentHQApprovalCloudError("Decision not saved: "+err.message)}).finally(()=>controls.forEach(button=>button.disabled=false))}return}const nav=e.target.closest("[data-nav]");const chat=e.target.closest("[data-chat]");if(nav){
 const next=nav.getAttribute("data-nav");
 // Apple needs a user gesture for the one-time native Home Screen badge permission.
 // No separate Agent HQ setup button, onboarding banner or repeated prompt.
 if(next==="messages"&&(navigator.standalone===true||window.matchMedia?.("(display-mode: standalone)")?.matches)
    &&typeof Notification!=="undefined"&&Notification.permission==="default"
    &&typeof navigator.setAppBadge==="function"){
  try{Notification.requestPermission().then(()=>syncAppBadge()).catch(()=>{});}catch{}
 }
 settingsReturn=screen==="settings"&&!["home","settings"].includes(next)?true:["home","settings"].includes(next)?false:settingsReturn;screen=next;window.scrollTo(0,0);if(screen==="hq"){active="hq";screen="chat"}render()}if(chat){active=chat.dataset.chat;screen="chat";render()}});
connectHomeScreen(()=>{if(screen==="home")render()});
render();

// Press and hold a contact, or the contact header, to manage just that conversation.
const clearableWorkers=new Set(["hq",...staff.map(s=>s[0])]);
let heldThread=null,holdTimer=null,holdStart=null,blockThreadClick=false;
function closeThreadMenu(){
 document.querySelector("#agent-thread-action-backdrop")?.remove();
}
function showThreadMenu(worker){
 if(!clearableWorkers.has(worker))return;
 closeThreadMenu();
 const name=worker==="hq"?"Company HQ":staff.find(x=>x[0]===worker)?.[2]||worker;
 const panel=document.createElement("div");
 panel.id="agent-thread-action-backdrop";
 panel.className="agent-thread-action-backdrop";
 panel.innerHTML='<div class="agent-thread-actions" role="dialog" aria-modal="true" aria-label="Conversation options">'+
  '<strong>'+escapeHTML(name)+'</strong>'+
  '<button type="button" class="thread-delete-all" data-thread-delete="'+escapeHTML(worker)+'">Delete all text messages</button>'+
  '<button type="button" data-thread-cancel>Cancel</button></div>';
 document.body.append(panel);
 panel.querySelector("[data-thread-delete]")?.focus();
}
document.addEventListener("pointerdown",event=>{
 if(document.querySelector("#agent-thread-action-backdrop"))return;
 const item=event.target.closest?.('#contact-list [data-chat],.ios-contact[data-thread-press]');
 if(!item)return;
 const worker=item.dataset.chat||item.dataset.threadPress;
 if(!clearableWorkers.has(worker))return;
 heldThread=worker;holdStart={x:event.clientX,y:event.clientY};
 holdTimer=setTimeout(()=>{showThreadMenu(worker);blockThreadClick=true;heldThread=null;holdTimer=null},620);
});
document.addEventListener("pointermove",event=>{
 if(!holdStart||!holdTimer)return;
 if(Math.hypot(event.clientX-holdStart.x,event.clientY-holdStart.y)>12){
  clearTimeout(holdTimer);holdTimer=null;heldThread=null;holdStart=null;
 }
});
document.addEventListener("pointerup",()=>{if(holdTimer)clearTimeout(holdTimer);holdTimer=null;heldThread=null;holdStart=null});
document.addEventListener("pointercancel",()=>{if(holdTimer)clearTimeout(holdTimer);holdTimer=null;heldThread=null;holdStart=null});
document.addEventListener("contextmenu",event=>{
 const item=event.target.closest?.('#contact-list [data-chat],.ios-contact[data-thread-press]');
 if(!item)return;
 const worker=item.dataset.chat||item.dataset.threadPress;
 if(clearableWorkers.has(worker)){event.preventDefault();showThreadMenu(worker);blockThreadClick=true}
});
document.addEventListener("click",event=>{
 if(blockThreadClick){
  blockThreadClick=false;
  if(event.target.closest?.('#contact-list [data-chat],.ios-contact[data-thread-press]')){
   event.preventDefault();event.stopImmediatePropagation();return;
  }
 }
 const backdrop=event.target.closest?.("#agent-thread-action-backdrop");
 if(!backdrop)return;
 const cancel=event.target.closest("[data-thread-cancel]");
 if(cancel||event.target===backdrop){event.preventDefault();closeThreadMenu();return}
 const clear=event.target.closest("[data-thread-delete]");
 if(!clear)return;
 event.preventDefault();
 const worker=clear.dataset.threadDelete;
 const name=worker==="hq"?"Company HQ":staff.find(x=>x[0]===worker)?.[2]||worker;
 if(!confirm('Permanently delete all text messages with '+name+'? Saved assignment and research records will remain in your history.'))return;
 clear.disabled=true;clear.textContent="Deleting…";
 (async()=>{
  try{
   await window.agentHQChatCloud.clearConversation(worker);
   closeThreadMenu();
   if(screen==="chat"&&active===worker)render();
  }catch(error){
   clear.disabled=false;clear.textContent="Delete all text messages";
   let p=backdrop.querySelector("[role=alert]");
   if(!p){p=document.createElement("p");p.setAttribute("role","alert");backdrop.querySelector(".agent-thread-actions")?.append(p)}
   p.textContent="Could not delete the conversation: "+error.message;
  }
 })();
},true);
window.agentHQSocialReadSync=()=>{if((screen==='chat'&&active==='riley')||screen==='accounts')renderWithoutInterruptingDraft()};
window.agentHQSocialReadOpen=()=>{active='riley';screen='chat';render()};

document.addEventListener("agenthq-message-deletions",()=>{if(["chat","team","messages","contacts","approvals"].includes(screen))renderWithoutInterruptingDraft()});
