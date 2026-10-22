// Agent HQ native Worker Studio: in-app specialist marketplace + original Worker Architect.
// Inspired by public bot-builder workflows, not affiliated with the original Dr Eggbot.
(()=>{
 const app=document.getElementById("app");
 if(!app)return;
 const E=x=>String(x??"").replaceAll("&","&amp;").replaceAll("<","&lt;")
  .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
 const CATEGORIES=[["personal","Personal"],["research","Research"],["marketing","Marketing"],
  ["productivity","Productivity"],["writing","Writing"],["engineering","Engineering"],["operations","Operations"]];
 const TEMPLATES=[
  {id:"inbox",icon:"✉️",name:"Inbox Priority Assistant",category:"productivity",
   job:"Sort my personal incoming email into low, medium, high and urgent priorities, then suggest editable responses for emails that need my attention.",
   deliverable:"Prioritized email summary and proposed replies for my review.",
   boundaries:"Never send, delete, forward, archive or open email accounts without my explicit approval.",tone:"Warm, organized and concise"},
  {id:"research",icon:"🔎",name:"Research Brief Writer",category:"research",
   job:"Turn my questions and research materials into short evidence-aware summaries and practical follow-up questions.",
   deliverable:"Short research brief, uncertainties and a next-steps checklist.",
   boundaries:"Never claim to browse websites or cite sources it hasn't actually received.",tone:"Clear and curious"},
  {id:"social",icon:"📸",name:"Personal Social Planner",category:"marketing",
   job:"Help me plan and draft captions, video concepts and content calendars for my own social accounts.",
   deliverable:"Editable social post drafts and a weekly content calendar.",
   boundaries:"Never publish, sign in, respond publicly or spend money on advertising.",tone:"Creative and conversational"},
  {id:"organizer",icon:"📅",name:"Personal Project Planner",category:"productivity",
   job:"Help me break down personal goals and projects into small clear milestones and assign next steps in a plan.",
   deliverable:"Step-by-step project plan with checkpoints and blockers.",
   boundaries:"Never claim to run a background task, schedule a real event or hand off live work without an integration.",tone:"Supportive and to the point"},
  {id:"quality",icon:"🧪",name:"Bot Quality Reviewer",category:"engineering",
   job:"Audit the job description, output format and boundaries of other AI worker designs and suggest improvements.",
   deliverable:"Review checklist and a revised worker job specification.",
   boundaries:"Never change a bot automatically, grant permissions or deploy code.",tone:"Friendly, precise and constructive"},
  {id:"writing",icon:"📝",name:"Writing and Reply Helper",category:"writing",
   job:"Write and polish messages, personal correspondence and short documents while preserving my own voice.",
   deliverable:"Copy-ready editable writing drafts in my preferred voice.",
   boundaries:"Never send any message, imply it was sent, or invent private details.",tone:"Natural and personable"}
 ];
 let bots=[],chats=new Map(),selected=null,tab="marketplace",draft=null,templateKey="",feedback="",busy=false;
 let intake={job:"",boundaries:"",style:"friendly and direct",deliverable:"",category:"personal"};
 let rendered="",lastScreen=false;
 function cloud(){
  if(!window.agentHQBotStudioCloud)throw Error("AI Worker Studio is loading. Please refresh Agent HQ.");
  return window.agentHQBotStudioCloud;
 }
 function selectedBot(){return bots.find(b=>b.id===selected)}
 function sync(rows,message){
  bots=rows||[];
  if(selected&&!bots.some(b=>b.id===selected)){selected=null;if(tab==="chat")tab="library"}
  feedback=message||feedback;
  draw();
 }
 window.agentHQBotStudioUI={
  sync,openBot(id){
   selected=id;tab="chat";feedback="";
   draw();
   loadChat(id);
  },
  openBuilder(){tab="builder";draft=null;draw()}
 };
 async function loadChat(id){
  try{
   const history=await cloud().history(id);
   chats.set(id,history);
   if(tab==="chat"&&selected===id)draw();
  }catch(error){feedback=error.message;draw()}
 }
 function draw(){
  const root=app.querySelector("#agent-bot-studio-root");
  if(!root){lastScreen=false;return}
  lastScreen=true;
  const html=render();
  if(html===rendered&&root.dataset.ready==="1")return;
  root.innerHTML=html;root.dataset.ready="1";rendered=html;
  if(tab==="chat"){
   const list=root.querySelector(".studio-chat-bubbles");
   if(list)list.scrollTop=list.scrollHeight;
  }
 }
 function render(){
  const tabs=[["marketplace","Discover"],["builder","Create"],["library","My workers"]];
  let html='<div class="studio-heading"><div><strong>🧬 AI Worker Studio</strong><small>Make your own specialists — one job per bot</small></div>'+
   '<span class="studio-counter">'+bots.filter(b=>b.status==="active").length+' active</span></div>'+
   '<nav class="studio-nav">'+tabs.map(([id,label])=>'<button type="button" data-studio-tab="'+id+'" class="'+(id===tab?"active":"")+'">'+label+'</button>').join("")+'</nav>';
  if(tab==="marketplace"){
   html+='<div class="studio-callout"><strong>Inspired by the bot marketplace in your video</strong>'+
    '<p>Choose an original starter design or use Worker Architect to make a new AI coworker from scratch. No outside app is installed automatically.</p></div>'+
    '<div class="studio-tiles">'+TEMPLATES.map(t=>'<article class="studio-template"><span>'+t.icon+'</span>'+
      '<strong>'+E(t.name)+'</strong><small>'+E(t.job)+'</small>'+
      '<button type="button" data-studio-template="'+t.id+'">Design this worker →</button></article>').join("")+'</div>'+
    '<div class="studio-reference"><strong>Looking for the original dr eggbot?</strong><p>Lauren Tan’s official Grok Bot template designs bots inside Grok Bot. It is not an Agent HQ plugin or an open-source runtime.</p>'+
    '<a href="https://x.ai/bot/marketplace/bots/dr-eggbot-v2" target="_blank" rel="noopener noreferrer">Open original dr eggbot ↗</a></div>';
  }else if(tab==="builder"){
   html+='<div class="studio-callout"><strong>Worker Architect</strong><p>Answer four short questions. I’ll draft a focused worker with a clear role, skills and tasks it must never do.</p></div>'+
   '<form id="studio-design-form" class="studio-design-form">'+
    '<label>1. What job should the worker handle?<textarea name="job" required minlength="15" maxlength="1100" rows="4" placeholder="Example: help me prepare replies to personal emails…">'+E(intake.job)+'</textarea></label>'+
    '<label>2. What should it never do?<textarea name="boundaries" maxlength="800" rows="2" placeholder="Example: never send emails or sign in without me">'+E(intake.boundaries)+'</textarea></label>'+
    '<label>3. What should the result look like?<input name="deliverable" maxlength="450" value="'+E(intake.deliverable)+'" placeholder="Example: a short editable draft and checklist"></label>'+
    '<label>4. How should it talk?<input name="style" maxlength="200" value="'+E(intake.style)+'" placeholder="Example: relaxed and clear"></label>'+
    '<label>Specialty<select name="category">'+CATEGORIES.map(([id,name])=>'<option value="'+id+'"'+(id===intake.category?" selected":"")+'>'+name+'</option>').join("")+'</select></label>'+
    '<button type="submit" class="studio-primary"'+(busy?" disabled":"")+'>🧬 '+(busy?"Designing your coworker…":"Design my worker")+'</button></form>';
   if(draft){
    html+='<section class="studio-preview"><h3>Worker preview — not active yet</h3>'+
     '<div class="studio-preview-title"><span>'+E(draft.avatar_emoji)+'</span><div><strong>'+E(draft.name)+'</strong><small>'+E(draft.role)+'</small></div></div>'+
     '<p>'+E(draft.mission)+'</p><div class="studio-review"><strong>Skills</strong><span>'+E((draft.skills||[]).join(" · ")||"Conversation and drafting")+'</span></div>'+
     '<div class="studio-review"><strong>Must not do</strong><span>'+E((draft.anti_jobs||[]).join(" · "))+'</span></div>'+
     '<details><summary>View worker instructions</summary><p>'+E(draft.instructions)+'</p></details>'+
     '<p class="studio-warning">No tools or account access are activated by saving this design. You decide when to add it to the team.</p>'+
     '<button type="button" class="studio-primary" data-studio-save="1"'+(busy?" disabled":"")+'>Save worker as draft</button></section>';
   }
  }else if(tab==="library"){
   html+='<div class="studio-library-intro"><p>Your own saved workers. Activate a draft to start private conversations; archive a worker to stop new messages.</p>'+
     '<button class="studio-primary" type="button" data-studio-tab="builder">＋ Create worker</button></div>';
   html+=bots.length?'<div class="studio-worker-list">'+bots.map(b=>{
    const active=b.status==="active",archived=b.status==="archived";
    return '<article class="studio-worker"><div class="studio-worker-summary"><span class="studio-worker-avatar" data-rpg-worker="'+E(b.id)+'"></span>'+
     '<div><strong>'+E(b.name)+'</strong><small>'+E(b.role)+'</small><span class="studio-worker-status">'+E(b.status)+'</span></div></div>'+
     '<p>'+E(b.mission)+'</p><div class="studio-actions">'+
     (active?'<button type="button" data-studio-chat="'+E(b.id)+'" class="studio-primary">Message worker</button>':
      '<button type="button" data-studio-activate="'+E(b.id)+'" class="studio-primary">'+(archived?"Reactivate":"Add to team")+'</button>')+
     (!archived?'<button type="button" data-studio-archive="'+E(b.id)+'" class="studio-secondary">Archive</button>':
      '<button type="button" data-studio-delete="'+E(b.id)+'" class="studio-danger">Delete</button>')+
     '</div></article>';
   }).join("")+'</div>':'<p class="studio-empty">No saved workers yet. Try a starter from Discover or create your own in Worker Architect.</p>';
  }else if(tab==="chat"){
   const bot=selectedBot();
   if(!bot)return html+'<p class="studio-empty">Choose a worker from My workers.</p>';
   const history=chats.get(bot.id)||[];
   html+='<section class="studio-chat"><header><button type="button" data-studio-tab="library">‹ Workers</button>'+
     '<span class="studio-chat-face" data-rpg-worker="'+E(bot.id)+'"></span><div><strong>'+E(bot.name)+'</strong><small>'+E(bot.role)+'</small></div></header>'+
     '<div class="studio-chat-bubbles">'+
     (!history.length?'<div class="studio-chat-tip">'+E(bot.starting_message||"What can I help you with?")+'</div>':
      history.map(m=>'<div class="studio-chat-row '+(m.sender==="owner"?"mine":"theirs")+(m.sender==="handoff"?" handoff":"")+'"><div class="studio-chat-bubble">'+
       E(m.body)+'</div></div>').join(""))+
     (busy?'<div class="studio-chat-row theirs"><div class="studio-typing">● ● ●</div></div>':"")+
     '</div><form class="studio-chat-composer" id="studio-message-form"><textarea name="message" maxlength="4500" rows="2" placeholder="Text '+E(bot.name)+'…"'+(busy?" disabled":"")+'></textarea>'+
     '<button type="submit" class="studio-primary"'+(busy?" disabled":"")+'>Send</button></form>'+
     (bots.filter(b=>b.status==="active"&&b.id!==bot.id).length?
       '<details class="studio-handoff-box"><summary>📄➡️🤝 Pass paperwork to another worker</summary>'+
       '<form id="studio-handoff-form"><label>Send to<select name="target" required>'+
       bots.filter(b=>b.status==="active"&&b.id!==bot.id).map(b=>'<option value="'+E(b.id)+'">'+E(b.name)+" — "+E(b.role)+'</option>').join("")+
       '</select></label><label>What should they handle?<textarea name="reason" required minlength="10" maxlength="900" rows="3" placeholder="Explain the next step for the other specialist."></textarea></label>'+
       '<button type="submit" class="studio-primary"'+(busy?" disabled":"")+'>Approve written handoff</button>'+
       '<p class="studio-warning">A brief will be generated from this conversation and saved to both coworkers. It does not start an outside task.</p></form></details>':"")+
     '<p class="studio-warning">This custom worker can chat and draft only. It does not run background tasks, browse or access your accounts.</p></section>';
  }
  return html+'<p class="studio-feedback" role="status">'+E(feedback)+'</p>';
 }
 function collect(){
  const f=app.querySelector("#studio-design-form");if(!f)return;
  for(const key of ["job","boundaries","style","deliverable","category"]){
   const field=f.elements?.namedItem?.(key)||f.querySelector('[name="'+key+'"]');
   if(field)intake[key]=field.value;
  }
 }
 function setTab(next){
  if(tab==="builder")collect();
  tab=next;feedback="";rendered="";draw();
 }
 async function guarded(fn){
  if(busy)return;
  busy=true;feedback="";draw();
  try{await fn()}catch(err){feedback=err?.message||"Worker Studio action failed."}
  finally{busy=false;draw()}
 }
 app.addEventListener("click",async event=>{
  const tabBtn=event.target.closest("[data-studio-tab]");
  if(tabBtn){setTab(tabBtn.dataset.studioTab);return}
  const template=event.target.closest("[data-studio-template]");
  if(template){
   const t=TEMPLATES.find(x=>x.id===template.dataset.studioTemplate);
   if(!t)return;
   intake={job:t.job,boundaries:t.boundaries,deliverable:t.deliverable,
    style:t.tone,category:t.category};
   templateKey=t.id;draft=null;setTab("builder");return;
  }
  const save=event.target.closest("[data-studio-save]");
  if(save)await guarded(async()=>{
   if(!draft)throw Error("Design your worker first");
   const result=await cloud().save(draft,templateKey);
   draft=null;templateKey="";
   tab="library";feedback=result.worker?.name+" saved as a draft. Add it to the team when ready.";
  });
  const activate=event.target.closest("[data-studio-activate]");
  if(activate)await guarded(async()=>{
   await cloud().activate(activate.dataset.studioActivate);
   feedback="Worker activated and available for conversation.";
  });
  const archive=event.target.closest("[data-studio-archive]");
  if(archive&&window.confirm("Archive this worker? Its saved conversation remains, but new messages are paused."))
   await guarded(async()=>{await cloud().archive(archive.dataset.studioArchive);feedback="Worker archived."});
  const remove=event.target.closest("[data-studio-delete]");
  if(remove&&window.confirm("Permanently delete this archived worker and all its saved messages?"))
   await guarded(async()=>{await cloud().remove(remove.dataset.studioDelete);feedback="Worker and saved messages deleted."});
  const chat=event.target.closest("[data-studio-chat]");
  if(chat){selected=chat.dataset.studioChat;setTab("chat");loadChat(selected)}
 });
 app.addEventListener("submit",async event=>{
  if(event.target.matches("#studio-handoff-form")){
   event.preventDefault();
   const form=event.target;
   const to=form.elements.namedItem("target")?.value;
   const reason=form.elements.namedItem("reason")?.value?.trim();
   const other=bots.find(b=>b.id===to&&b.status==="active");
   if(!selected||!other||!reason)return;
   if(!window.confirm("Approve sending written task context from "+(selectedBot()?.name||"this worker")+
      " to "+other.name+"? This will save a handoff in both conversations, but it will not start any external action."))return;
   const from=selected;
   await guarded(async()=>{
    const result=await cloud().handoff(from,to,reason);
    chats.set(from,await cloud().history(from));
    feedback=result.message||"Written handoff saved and delivered.";
   });
   return;
  }
  if(event.target.matches("#studio-design-form")){
   event.preventDefault();collect();
   await guarded(async()=>{
    const response=await cloud().design(intake);
    draft=response.draft;
    feedback="Review the job, skills and actions it must not perform. Save only if the design is right.";
   });
   return;
  }
  if(event.target.matches("#studio-message-form")){
   event.preventDefault();
   const text=event.target.elements?.namedItem?.("message")?.value?.trim();
   if(!text||!selected)return;
   const id=selected;
   await guarded(async()=>{
    const {history}=await cloud().send(id,text);
    chats.set(id,history);
    feedback="Message saved in your private conversation.";
   });
  }
 });
 const observer=new MutationObserver(()=>{
  if(app.querySelector("#agent-bot-studio-root")&&!lastScreen)queueMicrotask(draw);
  else if(!app.querySelector("#agent-bot-studio-root"))lastScreen=false;
 });
 observer.observe(app,{childList:true,subtree:false});
 window.agentHQBotStudioUIRefresh=draw;
 const existing=window.agentHQBotStudioSnapshot;
 if(existing)sync(existing.rows||[],existing.notice||"",existing.messaged||[]);
 draw();
})();
