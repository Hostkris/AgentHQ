// Agent HQ Email Center: Alex prioritizes; Taylor prepares editable replies.
// No sending unless the signed-in owner confirms an individual reply.
(()=>{
 const app=document.getElementById("app");
 if(!app)return;
 const escape=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;")
  .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
 const priorityOrder={urgent:0,high:1,medium:2,low:3};
 const labels={urgent:"Urgent",high:"High",medium:"Medium",low:"Low"};
 const ICON={urgent:"🚨",high:"🔴",medium:"🟡",low:"⚪"};
 const callbackInfo={
  connected:"Gmail connected. To prepare automatic replies, review the AI-drafting option.",
  cancelled:"Google authorization was cancelled.",
  invalid:"The Google authorization link expired or was already used. Please reconnect.",
  scope:"Gmail did not grant both read and send permissions. You can reconnect and review Google's consent screen.",
  refresh:"Google did not provide a refresh token. Reconnect Gmail and choose Continue on its consent screen.",
  setup:"Google developer configuration is incomplete.",
  error:"Gmail authorization did not complete. Check the Google OAuth client, secret, and exact redirect URI."
 };
 const callback=typeof location!=="undefined"?callbackInfo[new URLSearchParams(location.search).get("gmail")]||"":"";
 let status={configured:false,connected:false,ai_drafting_enabled:false,
  message:"Checking your Gmail connection…" };
 let emails=[],filter="attention",selected="",messageView=null;
 let busy=false,feedback="",modified=new Map(),error="";
 let lastMarkup="";
 const d=(date)=>{if(!date)return "";const t=new Date(date);return Number.isFinite(t.getTime())?t.toLocaleString():""};
 const get=(id)=>emails.find(e=>e.gmail_message_id===id);
 function show(){
  const panel=app.querySelector("#email-center");
  if(!panel)return;
  const markup=render();
  if(markup!==lastMarkup||panel.dataset.ready!=="yes"){
   panel.innerHTML=markup;panel.dataset.ready="yes";lastMarkup=markup;
  }
 }
 function setFeedback(text){feedback=String(text||"");show()}
 function sync(st,rows,notice){
  status=st||{};
  emails=Array.isArray(rows)?rows:[];
  if(selected&&!get(selected)){selected="";messageView=null}
  if(!selected&&emails.length)selected=[...emails].sort((a,b)=>
   (priorityOrder[a.priority]??4)-(priorityOrder[b.priority]??4)||
   new Date(b.received_at)-new Date(a.received_at))[0]?.gmail_message_id||"";
  if(!feedback)feedback=notice||"";
  show();
 }
 window.agentHQEmailSync=sync;
 window.agentHQEmailError=text=>setFeedback("Could not sync Email Center: "+text);
 function mailCounts(){
  const n={urgent:0,high:0,medium:0,low:0};let drafts=0;
  for(const row of emails){
   if(n[row.priority]!==undefined)n[row.priority]++;
   if(row.draft_state==="ready")drafts++;
  }
  return {...n,drafts};
 }
 function render(){
  const counts=mailCounts();
  const connected=status.connected===true;
  const missing=Array.isArray(status.missing)&&status.missing.length>0;
  let content='<div class="email-top"><div><h2>✉️ My Email Center</h2>'+
   '<p>Alex sorts priorities. Taylor prepares replies. You decide what gets sent.</p></div>'+
   '<span class="email-account-status">'+(connected?"Gmail connected":missing?"Setup needed":"Not connected")+'</span></div>';
  if(callback)content+='<p class="email-callback">'+escape(callback)+'</p>';
  if(!status.auth_error&&status.email)content+='<div class="email-connected-as">📮 '+escape(status.email)+'</div>';
  if(missing){
   content+='<section class="email-setup"><h3>🔧 One-time Gmail setup</h3>'+
    '<p>The Connect Gmail button cannot open Google sign-in yet. The app owner must finish these steps once; this is not a problem with your iPhone or Maya.</p>'+
    '<p><strong>Step 1 — Google.</strong> Enable Gmail API, set up Google Auth Platform, and create an OAuth client of type <strong>Web application</strong>.</p>'+
    '<a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Open Google OAuth setup ↗</a>'+
    '<div class="email-redirect"><strong>Copy this exact Authorized redirect URI into your Google OAuth client:</strong>'+
    '<code>https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-gmail?op=callback</code></div>'+
    '<p><strong>Step 2 — Save credentials privately.</strong> Add the following missing names under Supabase <strong>Edge Functions → Secrets</strong>. Do not enter their values here or in chat.</p>'+
    '<div class="email-secret-names">'+status.missing.map(escape).join(" · ")+'</div>'+
    '<a href="https://supabase.com/dashboard/project/slekcezduwnygywiiitp/functions/secrets" target="_blank" rel="noopener noreferrer">Open secure Agent HQ settings ↗</a>'+
    '<a href="https://github.com/Hostkris/AgentHQ/blob/main/docs/GMAIL_EMAIL_ASSISTANT.md" target="_blank" rel="noopener noreferrer">Detailed setup guide ↗</a>'+
    '<p><strong>Step 3 — Try again.</strong> Return here, tap Check setup, then Connect Gmail once setup is complete.</p>'+
    '<button type="button" class="email-primary" data-email-action="refresh">↻ Check setup</button></section>';
  }else if(!connected){
   content+='<section class="email-setup"><h3>Review, prioritize and prepare replies</h3>'+
    '<p>Connect through Google’s official sign-in page. Agent HQ asks for Gmail read access and permission to send <em>only when you explicitly approve a reply</em>.</p>'+
    '<p>Nothing is read or sent until you connect and choose to check your inbox.</p>'+
    (status.reconnect_required?'<p>Your Gmail authorization needs renewal.</p>':"")+
    '<button type="button" class="email-primary" data-email-action="connect">Connect my Gmail ↗</button></section>';
  }else{
   content+='<div class="email-tools"><button type="button" class="email-primary" data-email-action="check"'+(busy?" disabled":"")+'>🔄 Check Inbox Now</button>'+
    '<button type="button" class="email-secondary" data-email-action="refresh"'+(busy?" disabled":"")+'>Refresh saved list</button></div>'+
    '<div class="email-ai-controls"><div><strong>✨ Automatically prepare replies</strong><p>'+
     (status.ai_drafting_enabled?
      "On: new emails that need replies and rank Medium, High, or Urgent receive suggested drafts when possible.":
      "Off: email content is not shared with Groq or OpenRouter for drafting. You can still write and save replies yourself.")+
    '</p></div>'+
    '<button type="button" class="email-ai-toggle" data-email-action="'+(status.ai_drafting_enabled?"ai-off":"ai-on")+'"'+(busy?" disabled":"")+'>'+
    (status.ai_drafting_enabled?"Turn off":"Enable AI drafts")+'</button></div>'+
    '<p class="email-last-check">'+(status.last_checked_at?"Last checked "+escape(d(status.last_checked_at)):
     "Inbox not checked yet. Select Check Inbox Now.")+'</p>'+
    '<div class="email-summary">'+
      [["urgent",counts.urgent],["high",counts.high],["medium",counts.medium],["low",counts.low]].map(([name,n])=>
       '<div class="email-summary-item email-tier-'+name+'"><span>'+ICON[name]+' '+labels[name]+'</span><strong>'+n+'</strong></div>').join("")+
    '</div>'+
    '<div class="email-tally">'+counts.drafts+' replies ready for review. Low-priority email generally receives no automatic draft.</div>';
   if(!emails.length)content+='<div class="email-empty">No saved inbox items yet. Choose <strong>Check Inbox Now</strong> to check your latest Gmail messages.</div>';
   else{
    const filters=[["attention","Needs attention"],["all","All"],["urgent","Urgent"],["high","High"],["medium","Medium"],["low","Low"]];
    const listing=[...emails].filter(row=>filter==="all"||filter==="attention"?
      filter==="all"||row.priority!=="low":row.priority===filter)
     .sort((a,b)=>(priorityOrder[a.priority]??4)-(priorityOrder[b.priority]??4)||
      new Date(b.received_at)-new Date(a.received_at));
    content+='<div class="email-filter-row">'+filters.map(([value,label])=>
      '<button type="button" data-email-filter="'+value+'" class="'+(filter===value?"active":"")+'">'+label+'</button>').join("")+'</div>'+
     '<div class="email-columns"><div class="email-list" aria-label="Priority sorted emails">'+
      (listing.length?listing.map(e=>'<button type="button" class="email-row '+(selected===e.gmail_message_id?"selected":"")+
       '" data-email-open="'+escape(e.gmail_message_id)+'">'+
       '<div class="email-row-top"><span class="email-priority email-tier-'+escape(e.priority)+'">'+ICON[e.priority]+' '+labels[e.priority]+'</span>'+
       (e.is_unread?'<span class="email-unread">Unread</span>':"")+
       '<time>'+escape(d(e.received_at))+'</time></div>'+
       '<strong>'+escape(e.from_name||e.from_email)+'</strong>'+
       '<div class="email-row-subject">'+escape(e.subject||"(No subject)")+'</div>'+
       '<p>'+escape(e.snippet||"")+'</p>'+
       (e.draft_state==="ready"?'<small class="email-draft-ready">✍️ Reply ready for your review</small>':
        e.draft_state==="sent"?'<small class="email-draft-sent">✓ Sent</small>':
        e.needs_reply?'<small class="email-no-draft">Needs a reply · No draft ready yet</small>':"")+
       '</button>').join(""):'<div class="email-empty">No messages in this priority group.</div>')+
     '</div><div class="email-detail">'+renderSelected()+'</div></div>';
   }
   content+='<div class="email-bottom"><button type="button" class="email-disconnect" data-email-action="disconnect"'+(busy?" disabled":"")+'>Disconnect Gmail</button>'+
    '<p>No automatic sends, deletion, forwarding, link opening, or attachments. The Gmail connection can be revoked in Google settings too.</p></div>';
  }
  const message=error||feedback||status.message||"";
  return content+'<div class="email-feedback" role="status" aria-live="polite">'+escape(message)+'</div>';
 }
 function renderSelected(){
  const item=get(selected);
  if(!item)return '<div class="email-empty">Choose an email to read and review.</div>';
  const draft=modified.has(selected)?modified.get(selected):item.draft_body||"";
  const unsaved=draft!==(item.draft_body||"");
  const waiting=busy?" disabled":"";
  const couldSend=item.draft_state==="ready"&&!unsaved&&!busy;
  let body='<div class="email-detail-head"><strong>'+escape(item.subject||"(No subject)")+'</strong>'+
   '<p>From: '+escape(item.from_name?item.from_name+" <"+item.from_email+">":item.from_email)+'</p>'+
   '<p>Reply to: '+escape(item.reply_to||item.from_email)+'</p>'+
   '<p>'+escape(d(item.received_at))+'</p></div>'+
   '<label class="email-priority-label">Priority<select data-email-priority="'+escape(item.gmail_message_id)+'"'+waiting+'>'+
    ["urgent","high","medium","low"].map(x=>'<option value="'+x+'"'+(item.priority===x?" selected":"")+'>'+labels[x]+'</option>').join("")+'</select></label>'+
   '<div class="email-reason">'+escape(item.priority_reason||"Review its urgency and importance.")+'</div>'+
   '<div class="email-original"><strong>Original message</strong>'+
   (messageView?.message_id===selected?'<div class="email-original-body">'+escape(messageView.body||"(No plain text in this message)")+'</div>':
    '<p>Tap Read message to load the plain text. Attachments are never opened.</p>'+
    '<button type="button" class="email-secondary" data-email-action="original"'+waiting+'>Read message</button>')+
   '</div>'+
   '<div class="email-reply"><div class="email-reply-header"><strong>✍️ Suggested reply</strong>'+
   '<small>'+(item.draft_state==="sent"?"Sent":item.draft_state==="ready"?"Ready to review":
    item.draft_state==="sending"?"Sending":item.draft_state==="unknown"?"Check Gmail Sent":"No draft yet")+'</small></div>';
  if(item.draft_state==="sent")return body+
    '<p class="email-success">✓ This response was sent after approval on '+escape(d(item.sent_at))+'.</p></div>';
  if(item.draft_state==="unknown"||item.draft_state==="sending")
    return body+'<p class="email-send-warning">The sending outcome is uncertain. Check Gmail Sent before taking any other action. Agent HQ blocks duplicate attempts.</p></div>';
  body+='<textarea data-email-draft="'+escape(item.gmail_message_id)+
    '" aria-label="Review and edit email reply" maxlength="8000" rows="6" placeholder="Edit the draft, or type a response here."'+waiting+'>'+escape(draft)+'</textarea>'+
   (unsaved?'<p class="email-unsaved">Unsaved changes. Save your draft before sending.</p>':"")+
   '<div class="email-reply-actions"><button type="button" class="email-secondary" data-email-action="save"'+(busy||!draft.trim()?" disabled":"")+'>'+
    'Save draft</button>'+
   '<button type="button" class="email-primary email-send-approved" data-email-action="send"'+(couldSend?"":" disabled")+'>'+
   'Send approved reply</button></div>'+
   '<p class="email-safety">The send button only works after you review the message and save the exact reply. Nothing sends in the background.</p></div>';
  return body;
 }
 async function run(action){
  const service=window.agentHQEmailCloud;
  if(!service)throw Error("Email Center is loading. Refresh Agent HQ.");
  if(action==="refresh"){await service.refresh();feedback="Gmail connection and saved list synchronized."}
  if(action==="connect"){feedback="Opening Google's authorization page…";show();await service.connect()}
  if(action==="check"){
   feedback="Checking your inbox and preparing drafts. This may take a moment.";show();
   const out=await service.check();
   feedback=out.message||"Inbox reviewed.";
  }
  if(action==="original"){
   const messageId=selected;const content=await service.original(messageId);
   if(selected===messageId)messageView=content;
   feedback="Original email loaded as text. No attachments opened.";
  }
  if(action==="ai-on"){
   const yes=window.confirm("Enable automatic AI email drafts? When you check your inbox, message text from medium, high and urgent emails needing replies will be sent to your configured Groq/OpenRouter AI provider. No reply will be sent without your review and confirmation.");
   if(!yes)return;
   await service.setAI(true);
   feedback="AI drafting enabled. Use Check Inbox Now to prepare replies.";
  }
  if(action==="ai-off"){
   await service.setAI(false);
   feedback="AI drafting disabled. Saved replies remain for your review.";
  }
  if(action==="save"){
   const item=get(selected);
   if(!item)throw Error("Select an email first.");
   const draft=modified.has(selected)?modified.get(selected):item.draft_body||"";
   await service.saveDraft(item.gmail_message_id,draft);
   modified.delete(item.gmail_message_id);
   feedback="Draft saved. You can review it once more before sending.";
  }
  if(action==="send"){
   const item=get(selected);
   if(!item||item.draft_state!=="ready")throw Error("Review and save your reply first.");
   const body=modified.has(selected)?modified.get(selected):item.draft_body||"";
   if(body!==item.draft_body||!body)throw Error("Save the exact text you want to send first.");
   const recipient=item.reply_to||item.from_email;
   const approved=window.confirm("Send this exact reply from your connected Gmail to "+recipient+
    "?\n\nSubject: "+(item.subject||"(No subject)")+
    "\n\n"+body.slice(0,600)+(body.length>600?"\n[…longer message]":"")+
    "\n\nThis is a real email send and cannot be undone.");
   if(!approved){feedback="Sending cancelled. The draft was kept.";return}
   const result=await service.send(item.gmail_message_id,body);
   if(!result.sent)throw Error(result.error||"Gmail did not confirm sending");
   feedback="Your approved reply was sent from Gmail.";
  }
  if(action==="disconnect"){
   const yes=window.confirm("Disconnect your Gmail account? Agent HQ will remove its local token, saved priority list and drafts. This does not delete your real Gmail messages.");
   if(!yes)return;
   await service.disconnect();
   emails=[];selected="";messageView=null;modified.clear();
   feedback="Gmail disconnected and locally stored drafts removed.";
  }
 }
 app.addEventListener("click",async event=>{
  const filterButton=event.target.closest("[data-email-filter]");
  if(filterButton){filter=filterButton.dataset.emailFilter;show();return}
  const selectButton=event.target.closest("[data-email-open]");
  if(selectButton){
   selected=selectButton.dataset.emailOpen;messageView=null;show();
   return;
  }
  const action=event.target.closest("[data-email-action]");
  if(!action||busy)return;
  const task=action.dataset.emailAction;
  busy=true;error="";show();
  try{await run(task)}
  catch(exc){error="Email Center: "+(exc?.message||"Action failed")}
  finally{busy=false;show()}
 });
 app.addEventListener("input",event=>{
  const field=event.target.closest("[data-email-draft]");
  if(!field)return;
  modified.set(field.dataset.emailDraft,field.value);
  // Never replace the focused textarea: doing so can swallow the Save button tap in iOS Safari.
  const details=field.closest(".email-detail");
  const send=details?.querySelector('[data-email-action="send"]');
  if(send)send.disabled=true;
  const hint=details?.querySelector(".email-safety");
  if(hint)hint.textContent="Unsaved changes. Tap Save draft before sending. Nothing sends automatically.";
 });
 app.addEventListener("change",async event=>{
  const select=event.target.closest("[data-email-priority]");
  if(!select||busy)return;
  busy=true;error="";show();
  try{
   await window.agentHQEmailCloud.priority(select.dataset.emailPriority,select.value);
   feedback="Priority updated by you.";
  }catch(exc){error=exc.message}
  finally{busy=false;show()}
 });
 const observer=new MutationObserver(()=>{if(app.querySelector("#email-center"))queueMicrotask(show)});
 observer.observe(app,{childList:true,subtree:true});
 show();
})();
