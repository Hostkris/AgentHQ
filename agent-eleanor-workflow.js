// Eleanor manages owner-private Agent HQ Notes, habits, book reading and internal Calendar; Saturday remains a rest day.
import {routineDue,nextEligible} from './agent-reading-schedule.js?v=20261107-eligible-days-1';
// Heart rate, water and social check-ins remain owner-reported unless a separate capability is verified.

const CHECKIN_KEY='agenthq-eleanor-daily-checkin-v1:';
const FIELDS=[
 ['multivitamin','Multivitamin drink'],
 ['apple_cider_vinegar','Apple cider vinegar'],
 ['tiktok_live','TikTok Live'],
 ['posts','Checked TikTok posts'],
 ['messages','Checked TikTok messages'],
 ['reading','Read four pages'],
 ['eating_cutoff','Finished eating by 5 PM (personal choice)']
];
const OPTIONS=[['not_yet','Not yet / not reported'],['yes','Yes / completed'],['no','No / skipped today']];
function notes(owner){
 const cloud=window.agentHQNotesCloud;
 if(cloud?.owner?.()===owner&&cloud.loaded?.())return cloud.list();
 // Unmigrated device Notes remain visible until the first confirmed server sync.
 try{const rows=JSON.parse(localStorage.getItem('agenthq-home-notes-v1:'+owner)||'[]');
  return Array.isArray(rows)?rows.filter(n=>typeof n?.text==='string'&&n.text.trim()).slice(0,100):[];
 }catch{return []}
}
function readCheckins(owner){
 try {
  const d=JSON.parse(localStorage.getItem(CHECKIN_KEY+owner)||'{}');
  return d&&typeof d==='object'&&!Array.isArray(d)?d:{};
 } catch{return {};}
}
function todayRecord(owner,day){
 const cloud=window.agentHQCheckins;
 const c=cloud?.owner?.()===owner&&cloud.loaded?.()?cloud.record(day):null;
 if(c)return {fields:c.fields||{},sent_at:c.submitted_at,sent_signature:c.sent_signature,saved_at:c.updated_at};
 return readCheckins(owner)[day]||null;
}
function saveRecord(owner,day,record){
 const all=readCheckins(owner);
 all[day]=record;
 for(const key of Object.keys(all))if(key<day.slice(0,4)+'-01-01' || Object.keys(all).length>40&&key!==day)delete all[key];
 localStorage.setItem(CHECKIN_KEY+owner,JSON.stringify(all));
}
function specialists(text){
 const s=text.toLowerCase(),roles=['Alex · coordination'];
 if(/tiktok|post|social|comment|live|video|content/i.test(s))roles.push('Casey · social media','Jordan · content');
 if(/message|reply|inbox|communication|outreach/i.test(s))roles.push('Taylor · communications');
 if(/shopify|product|store|customer|skincare|shipping/i.test(s))roles.push('Morgan · e-commerce');
 if(/marketing|advertis|brand|campaign/i.test(s))roles.push('Maya · marketing');
 if(/budget|price|profit|financial|cost/i.test(s))roles.push('Avery · finance');
 if(/schedule|date|appointment|calendar|meeting/i.test(s))roles.push('Jamie · scheduling');
 if(/research|compare|learn|source|study/i.test(s))roles.push('Riley · research');
 if(/new idea|growth|business idea|launch/i.test(s))roles.push('Quinn · growth');
 return [...new Set(roles)].slice(0,5);
}
function titleFromNote(note){return note.text.replace(/\s+/g,' ').slice(0,110).trim()||'Note for review';}
function statusSelect(name,selected,E){
 return '<select name="'+name+'">'+OPTIONS.map(([key,label])=>'<option value="'+key+'"'+(selected===key?' selected':'')+'>'+E(label)+'</option>').join('')+'</select>';
}
export function renderEleanorTodaySummary(state,day,E){
 const r=todayRecord(state.settings.owner_id,day);
 const list=notes(state.settings.owner_id),count=list.length,pending=list.filter(n=>n.review_status==='pending').length;
 const active=state.items.filter(i=>i.status==='active');
 const tasks=active.filter(i=>i.kind==='task');
 const meetings=active.filter(i=>i.kind==='meeting'&&i.scheduled_at&&new Date(i.scheduled_at).getTime()>=Date.now()-3600000).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)).slice(0,4);
 const fmt=v=>new Intl.DateTimeFormat('en-US',{timeZone:state.settings.timezone||'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(v));
 const agenda=meetings.map(i=>'<li>'+E(fmt(i.scheduled_at)+' · '+i.title)+'</li>').join('')||'<li>No upcoming appointments saved.</li>';
 return '<section class="secretary-card eleanor-workflow-summary"><h3>Eleanor’s daily coordination</h3><p>'+E(r?(r.sent_at?'Today’s check-in is saved in Agent HQ and sent to Eleanor.':'Today’s check-in is saved as a draft; Eleanor is waiting for your report.'):'Eleanor is ready for today’s check-in. Nothing is marked complete without your report.')+'</p>'+
  '<p><strong>Agent HQ Calendar:</strong> '+meetings.length+' upcoming appointment(s) · '+tasks.length+' active task(s) · '+pending+' Note proposal(s) awaiting your decision.</p>'+
  '<ul class="eleanor-agenda-list">'+agenda+'</ul>'+
  '<div class="secretary-actions"><button type="button" data-secretary-tab="checkin">Answer today’s check-in</button><button type="button" data-secretary-tab="meetings">Open Calendar</button><button type="button" data-secretary-tab="tasks">Open Tasks</button><button type="button" data-secretary-tab="notes">Review Notes ('+count+')</button></div>'+
  '<p class="secretary-subtle">The Calendar and Notes are inside Agent HQ. Daily reports sync privately; reports about your body and social activity are never guessed. Notifications require your device alert permission.</p></section>';
}
export function renderEleanorCoordination(tab,state,day,E){
 const owner=state.settings.owner_id;
 if(tab==='checkin'){
  const record=todayRecord(owner,day)||{},f=record.fields||{};
  const reading=(state.items||[]).find(i=>i.kind==='reminder'&&i.data?.reading_goal&&i.status==='active');
  const savedBook=String(reading?.data?.book_title||'');
  const readMode=reading?.data?.reading_mode==='daily'?'daily':'alternate';
  const readingToday=reading?routineDue(reading,day):false;
  return '<section class="secretary-card eleanor-workflow"><h3>Eleanor’s daily check-in · '+E(day)+'</h3>'+
   '<p>Eleanor is checking in about your morning routine, hydration, TikTok Live and any outstanding posts or messages. Report only what happened. Heart rate must be measured or entered by you; no outside health connection or target is assumed.</p>'+
   '<form data-eleanor-checkin-form>'+
   '<label>Heart rate, beats per minute (if measured)<input type="number" name="heart_rate" min="20" max="250" step="1" inputmode="numeric" value="'+E(f.heart_rate??'')+'" placeholder="Not measured"></label>'+
   '<label>Water consumed today, fluid ounces (if tracked)<input type="number" name="water_oz" min="0" max="500" step="0.5" inputmode="decimal" value="'+E(f.water_oz??'')+'" placeholder="Not reported"></label>'+
   FIELDS.map(([key,label])=>'<label>'+E(label)+statusSelect(key,f[key]||'not_yet',E)+'</label>').join('')+
   '<label>Pages actually read today (if any)<input type="number" name="pages_read" min="0" max="200" step="1" value="'+E(f.pages_read??'')+'" placeholder="0 if none"></label>'+
   '<label>Body weight, pounds (monthly, if measured)<input type="number" name="weight_lb" min="40" max="1000" step="0.1" inputmode="decimal" value="'+E(f.weight_lb??'')+'" placeholder="Only enter a real measurement"></label>'+
   '<p><strong>Book:</strong> '+E(savedBook||'Not selected yet')+' · '+(readingToday?'Four pages scheduled today.':'No new reading session scheduled today.')+' Saturday is protected as your rest day.</p>'+
   '<label>Posts, comments or messages that need a reply (paste only what you choose to share)<textarea name="reply_context" rows="4" maxlength="2000" placeholder="Paste the message and context. Eleanor can suggest a reply but will not post it.">'+E(f.reply_context||'')+'</textarea></label>'+
   '<label>What would you like Eleanor to help with today?<textarea name="request" rows="3" maxlength="1000" placeholder="Planning, follow-ups, replies, reminders, projects...">'+E(f.request||'')+'</textarea></label>'+
   '<button type="submit">Save in Agent HQ and report to Eleanor</button><button type="button" data-eleanor-social-review>Ask Eleanor to review authorized social activity</button><p class="secretary-subtle">Your answers sync privately inside Agent HQ before Eleanor receives your report. She can suggest replies but cannot assume TikTok inbox access or publish messages without permission.</p>'+
   '<p role="status" data-eleanor-checkin-status>'+E(record.sent_at?'Last sent: '+new Date(record.sent_at).toLocaleString():'Not sent yet')+'</p></form>'+
   '<form data-eleanor-reading-plan-form><h3>Your reading plan</h3><p>Which book have you chosen? Eleanor will put four-page sessions on the Agent HQ Calendar without Saturday reminders.</p>'+
   '<label>Book title<input name="book_title" maxlength="180" required value="'+E(savedBook)+'" placeholder="Type the actual book title"></label>'+
   '<label>Reading frequency<select name="reading_mode"><option value="alternate"'+(readMode==='alternate'?' selected':'')+'>Every other available day (skip Saturday)</option><option value="daily"'+(readMode==='daily'?' selected':'')+'>Every day except Saturday</option></select></label>'+
   '<label>Reading reminder time<input type="time" name="reading_time" required value="'+E(String(reading?.local_time||'19:00').slice(0,5))+'"></label>'+
   '<button type="submit">Save book and reading schedule in Agent HQ</button><p role="status" data-eleanor-reading-status></p></form></section>';
 }
 const list=notes(owner);
 return '<section class="secretary-card eleanor-workflow"><h3>Notes review and project ideas</h3><p>Eleanor checks Notes saved inside Agent HQ and flags possible work for your yes/no approval. Select Ask Eleanor for ideas when you want a fuller discussion. Unapproved proposals never create calendar events, projects, outside posts or purchases.</p>'+
  (list.length?list.map((n,i)=>'<article class="eleanor-note"><small>'+E(n.date||'Saved note')+'</small><p>'+E(n.text)+'</p>'+
   (n.review_status==='pending'?'<p><strong>Eleanor suggests:</strong> '+E(n.review_summary)+'</p>'+
    '<div class="secretary-actions"><button type="button" data-eleanor-note-decision="approve" data-note-id="'+E(n.id)+'">Approve '+E(n.review_kind==='calendar'?'calendar entry':n.review_kind==='project'?'project':'task')+'</button><button type="button" data-eleanor-note-decision="decline" data-note-id="'+E(n.id)+'">No, leave it as a note</button></div>':
    n.review_status==='approved'?'<p class="secretary-subtle">Proposal approved and recorded.</p>':
    n.review_status==='declined'?'<p class="secretary-subtle">Proposal declined. The note remains available.</p>':'')+
   '<p class="secretary-subtle">Suggested agents: '+E(specialists(n.text).join(', '))+'. Alex assigns the project team.</p>'+
   '<div class="secretary-actions"><button type="button" data-eleanor-note-action="review" data-note-index="'+i+'">Ask Eleanor for ideas</button><button type="button" data-eleanor-note-action="task" data-note-index="'+i+'">Make task</button><button type="button" data-eleanor-note-action="calendar" data-note-index="'+i+'">Add to Calendar</button><button type="button" data-eleanor-note-action="project" data-note-index="'+i+'">Start project</button></div></article>').join(''):'<p>No Notes have been saved in Agent HQ yet.</p>')+
  '<p class="secretary-subtle">Internal calendar entries use Eleanor’s saved Meetings register, not Apple or iCloud Calendar. Exact dates and times must be confirmed before saving.</p></section>';
}
async function sendToEleanor(state,text){
 if(!window.agentHQBotStudioCloud?.send)throw Error('Eleanor’s Messages service is not available. Try again after the app finishes loading.');
 const result=await window.agentHQBotStudioCloud.send(state.settings.bot_id,text);
 await window.agentHQBotStudioCloud.refresh?.().catch(()=>{});
 return result;
}
function dialog(title,content,onSubmit){
 const d=document.createElement('dialog');
 d.className='secretary-dialog';
 d.innerHTML='<form><header><h2>'+title+'</h2><button type="button" data-close aria-label="Close">×</button></header>'+content+'<div class="secretary-actions"><button type="submit">Confirm and save</button><button type="button" data-close>Cancel</button></div><p role="status"></p></form>';
 d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());
 d.addEventListener('close',()=>d.remove(),{once:true});
 d.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,submit=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');
  submit.disabled=true;
  try{await onSubmit(new FormData(form));d.close();}catch(error){status.textContent=String(error?.message||error);submit.disabled=false;}
 };
 document.body.append(d);d.showModal();
}
function openNoteDialog(kind,note,state,{apply,load,message},E,onSaved=null){
 const title=titleFromNote(note);
 if(kind==='calendar'){
  dialog('Propose Agent HQ calendar entry',
   '<p>This saves an internal Eleanor meeting/appointment, not an external iCloud event.</p>'+
   '<label>Title<input name="title" maxlength="180" required value="'+E(title)+'"></label>'+
   '<label>Date and exact local time<input type="datetime-local" name="local_start" required></label>'+
   '<label>Notes<textarea name="notes" rows="4" maxlength="4000">'+E(note.text)+'</textarea></label>',
   async f=>{
    const chosen=String(f.get('local_start')||'');
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(chosen))throw Error('Choose an exact date and time.');
    const start=new Date(chosen);
    if(!Number.isFinite(start.getTime())||start.getTime()<Date.now()-60000)throw Error('Choose a future date and time.');
    const name=String(f.get('title')||'').trim(),details=String(f.get('notes')||'');
    await apply([{op:'save_item',item:{kind:'meeting',title:name,details,timezone:state.settings.timezone,local_start:chosen,weekdays:[0,1,2,3,4,5,6],data:{attendees:[],purpose:name,notes:details,objectives:''}}}]);
    if(onSaved)await onSaved();await load();message('Saved to the Agent HQ Calendar. No outside calendar was changed.');
   });
 }else{
  const workers=specialists(note.text).join(', ');
  dialog('Review internal project proposal',
   '<p>Alex will determine which specialists should work on it. Suggested: '+E(workers)+'. Nothing is sent or published externally.</p>'+
   '<label>Project title<input name="title" maxlength="180" required value="'+E(title)+'"></label>'+
   '<label>Project goal and required deliverable<textarea name="brief" rows="6" maxlength="9500" required>'+E('Please use this saved Agent HQ note to build a practical project with clear steps and a finished deliverable. Present ideas and alternatives for owner review before new external commitments. Original note:\n'+note.text)+'</textarea></label>',
   async f=>{
    const name=String(f.get('title')||'').trim(),brief=String(f.get('brief')||'').trim();
    if(!name||brief.length<5)throw Error('Add a title and project requirements.');
    await apply([{op:'create_project',title:name,brief,output_format:'markdown'}]);
    if(onSaved)await onSaved();await load();message('Project saved for Alex and appropriate specialists. Review its progress in Projects.');
   });
 }
}
export function bindEleanorCoordination(root,state,day,helpers,E){
 const form=root.querySelector('[data-eleanor-checkin-form]');
 form?.addEventListener('submit',async event=>{
  event.preventDefault();const submit=form.querySelector('[type=submit]'),status=form.querySelector('[data-eleanor-checkin-status]');
  submit.disabled=true;const f=new FormData(form),fields={};
  for(const [key] of FIELDS)fields[key]=String(f.get(key)||'not_yet');
  const rate=String(f.get('heart_rate')||'').trim(),water=String(f.get('water_oz')||'').trim();
  if(rate)fields.heart_rate=Number(rate);
  if(water)fields.water_oz=Number(water);
  const pages=String(f.get('pages_read')||'').trim(),weight=String(f.get('weight_lb')||'').trim();
  if(pages)fields.pages_read=Number(pages);
  if(weight)fields.weight_lb=Number(weight);
  fields.reply_context=String(f.get('reply_context')||'').trim().slice(0,2000);
  fields.request=String(f.get('request')||'').trim().slice(0,1000);
  const owner=state.settings.owner_id,prior=todayRecord(owner,day);
  const signature=JSON.stringify(fields);
  const record={fields,saved_at:new Date().toISOString(),sent_at:prior?.sent_signature===signature?prior.sent_at:null,sent_signature:prior?.sent_signature===signature?signature:null};
  try{
   saveRecord(owner,day,record); // Retain an on-device draft if the network is lost.
   const cloud=window.agentHQCheckins;
   if(!cloud?.save||cloud.owner?.()!==owner)throw Error('Private Agent HQ daily register is not available. The draft remains on this device.');
   const remote=await cloud.save(day,fields);
   if(remote.sent_signature===signature&&remote.submitted_at){
    status.textContent='This check-in is already saved and reported. No duplicate was sent.';return;
   }
   const reading=(state.items||[]).find(i=>i.kind==='reminder'&&i.data?.reading_goal&&i.status==='active');
   const summary=['Daily check-in for '+day+' (owner-reported; no automatic measurement):',
    'Selected book: '+(reading?.data?.book_title||'not chosen'),
    'Reading pages completed: '+(fields.pages_read??'not reported'),
    'Monthly body weight: '+(fields.weight_lb===undefined?'not measured':fields.weight_lb+' lb'),
    'Heart rate: '+(fields.heart_rate===undefined?'not measured/reported':fields.heart_rate+' bpm'),
    'Water: '+(fields.water_oz===undefined?'not measured/reported':fields.water_oz+' fluid oz'),
    ...FIELDS.map(([key,label])=>label+': '+(OPTIONS.find(x=>x[0]===fields[key])?.[1]||'Not reported')),
    'Messages needing a drafted reply (not permission to send): '+(fields.reply_context||'none supplied'),
    'My requested assistance: '+(fields.request||'Please ask what I need help with.')];
   await sendToEleanor(state,summary.join('\n'));
   await cloud.markSent(day,fields);
   record.sent_at=new Date().toISOString();record.sent_signature=signature;saveRecord(owner,day,record);
   status.textContent='Saved inside Agent HQ and sent to Eleanor’s Messages. No external posts or replies were sent.';
   helpers.message('Check-in recorded in Eleanor’s conversation. Open Messages to continue step by step.');
  }catch(error){status.textContent='Check-in not fully confirmed: '+String(error?.message||error)+' Your device keeps a draft; verify Eleanor’s Messages before resending.';}
  finally{submit.disabled=false;}
 });
 root.querySelector('[data-eleanor-reading-plan-form]')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget,submit=form.querySelector('[type=submit]'),status=form.querySelector('[data-eleanor-reading-status]');
  if(submit.disabled)return;submit.disabled=true;
  const fields=new FormData(form),book=String(fields.get('book_title')||'').trim(),
   mode=String(fields.get('reading_mode')||'alternate'),time=String(fields.get('reading_time')||'19:00');
  try{
   if(!book||book.length>180||!['daily','alternate'].includes(mode)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw Error('Choose a book title, reading frequency and valid time.');
   const previous=(state.items||[]).find(i=>i.kind==='reminder'&&i.data?.reading_goal&&i.status==='active');
   const today=day,anchor=nextEligible(today,0);
   const meta={...(previous?.data||{}),reading_goal:4,book_title:book,reading_mode:mode,anchor_date:mode===previous?.data?.reading_mode?previous.data.anchor_date||anchor:anchor};
   await helpers.apply([{op:'save_item',...(previous?{id:previous.id}:{}),item:{
    kind:'reminder',title:'Read four pages · '+book.slice(0,120),
    details:'Read four pages of '+book+' on scheduled days. Report pages actually read and ask Eleanor to move unfinished work to the next opening; no Saturday sessions.',
    timezone:state.settings.timezone,local_time:time,weekdays:[0,1,2,3,4,5],data:meta
   }}]);
   status.textContent='Saved '+book+' and your four-page '+(mode==='daily'?'daily':'every-other-available-day')+' plan in Agent HQ Calendar. Saturdays are excluded.';
   helpers.message('Reading schedule saved. Eleanor can now ask about this specific book and track your four-page goal.');
  }catch(error){status.textContent='Reading plan not confirmed: '+String(error?.message||error)}
  finally{submit.disabled=false;}
 });
 root.querySelector('[data-eleanor-social-review]')?.addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{
   await sendToEleanor(state,'Eleanor, please check what social-account read permissions are actually active in Agent HQ. If a permitted connector can read any posts, comments or messages, review only what I have authorized and prepare draft reply suggestions for my approval. Do not claim TikTok DMs are accessible merely because the account is listed. If there is no working connection, tell me clearly and ask for a specific approved page review or pasted message. Coordinate Casey and Taylor for social replies; do not publish, reply or spend.');
   helpers.message('Asked Eleanor to verify authorized social access and recommend replies inside her Messages.');
  }catch(error){helpers.message('Could not ask Eleanor: '+String(error?.message||error));}
  finally{button.disabled=false;}
 });
 root.querySelectorAll('[data-eleanor-note-decision]').forEach(button=>button.addEventListener('click',async()=>{
  const note=notes(state.settings.owner_id).find(n=>n.id===button.dataset.noteId);
  if(!note||note.review_status!=='pending')return helpers.message('This proposal has changed. Refresh Notes review.');
  const cloud=window.agentHQNotesCloud,decision=button.dataset.eleanorNoteDecision;
  if(!cloud?.decide)return helpers.message('The private Notes service is not ready.');
  button.disabled=true;
  try{
   if(decision==='decline'){
    await cloud.decide(note.id,note.revision,'declined');
    helpers.message('Eleanor’s proposal declined. Your original note is still saved.');
   }else if(note.review_kind==='calendar'||note.review_kind==='project'){
    openNoteDialog(note.review_kind,note,state,helpers,E,()=>cloud.decide(note.id,note.revision,'approved'));
   }else if(note.review_kind==='task'){
    await helpers.apply([{op:'save_item',item:{kind:'task',title:titleFromNote(note),details:note.text,timezone:state.settings.timezone,weekdays:[0,1,2,3,4,5,6],data:{source:'agent-hq-notes',source_note_id:note.id}}}]);
    await cloud.decide(note.id,note.revision,'approved');
    await helpers.load();helpers.message('Approved. Eleanor saved the task inside Agent HQ.');
   }
  }catch(error){helpers.message('Could not confirm the note decision: '+String(error?.message||error));}
  finally{button.disabled=false;}
 }));
 root.querySelectorAll('[data-eleanor-note-action]').forEach(button=>button.addEventListener('click',async()=>{
  const note=notes(state.settings.owner_id)[Number(button.dataset.noteIndex)],kind=button.dataset.eleanorNoteAction;
  if(!note)return helpers.message('This note changed. Reopen Notes review.');
  if(kind==='calendar'||kind==='project'){openNoteDialog(kind,note,state,helpers,E);return;}
  button.disabled=true;
  try{
   if(kind==='task'){
    if(!confirm('Save this note as an open task in Eleanor’s private task register?'))return;
    await helpers.apply([{op:'save_item',item:{kind:'task',title:titleFromNote(note),details:note.text,timezone:state.settings.timezone,weekdays:[0,1,2,3,4,5,6],data:{source:'home-notes'}}}]);
    await helpers.load();helpers.message('Note saved as an active task. No deadline was invented.');
   }else if(kind==='review'){
    await sendToEleanor(state,'Eleanor, review this note from my Agent HQ Notes widget. Tell me what next steps you recommend, which members of the existing team are best suited, and one or two possible new ideas. Present options for my decision before starting another internal project. Do not send messages, publish, spend money or change external calendars.\n\nNote:\n'+note.text);
    helpers.message('Note sent to Eleanor’s Messages for ideas and your next decision. Open her conversation to read the response.');
   }
  }catch(error){helpers.message('Could not complete this action: '+String(error?.message||error));}
  finally{button.disabled=false;}
 }));
}
