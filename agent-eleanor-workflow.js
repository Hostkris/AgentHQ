// Eleanor's on-device Notes review and explicit daily check-in.
// The Home Notes widget is device-local; nothing here claims an external
// calendar, TikTok inbox, wearable, or automatic background reading connection.

const CHECKIN_KEY='agenthq-eleanor-daily-checkin-v1:';
const FIELDS=[
 ['multivitamin','Multivitamin drink'],
 ['apple_cider_vinegar','Apple cider vinegar'],
 ['tiktok_live','TikTok Live'],
 ['posts','Checked TikTok posts'],
 ['messages','Checked TikTok messages']
];
const OPTIONS=[['not_yet','Not yet / not reported'],['yes','Yes / completed'],['no','No / skipped today']];
function notes(owner){
 try {
  const list=JSON.parse(localStorage.getItem('agenthq-home-notes-v1:'+owner)||'[]');
  return Array.isArray(list)?list.filter(n=>n&&typeof n.text==='string'&&n.text.trim()).slice(0,100).map(n=>({text:n.text.slice(0,2000),date:String(n.date||'')})):[];
 } catch {return [];}
}
function readCheckins(owner){
 try {
  const d=JSON.parse(localStorage.getItem(CHECKIN_KEY+owner)||'{}');
  return d&&typeof d==='object'&&!Array.isArray(d)?d:{};
 } catch{return {};}
}
function todayRecord(owner,day){return readCheckins(owner)[day]||null;}
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
 const count=notes(state.settings.owner_id).length;
 return '<section class="secretary-card eleanor-workflow-summary"><h3>Eleanor’s daily coordination</h3><p>'+E(r?(r.sent_at?'Today’s check-in was sent to Eleanor’s Messages.':'Today’s check-in is saved on this device, not yet sent.'):'Your morning check-in has not been reported today.')+'</p><div class="secretary-actions"><button type="button" data-secretary-tab="checkin">Daily check-in</button><button type="button" data-secretary-tab="notes">Review Notes ('+count+')</button></div><p class="secretary-subtle">Notes and draft check-ins are stored in this browser. Eleanor cannot read another device’s Notes or your live TikTok inbox automatically.</p></section>';
}
export function renderEleanorCoordination(tab,state,day,E){
 const owner=state.settings.owner_id;
 if(tab==='checkin'){
  const record=todayRecord(owner,day)||{},f=record.fields||{};
  return '<section class="secretary-card eleanor-workflow"><h3>Morning and daily check-in · '+E(day)+'</h3>'+
   '<p>Report only what actually happened. Heart rate is entered manually; no device or Apple Health connection is implied. No doses or water targets are assumed.</p>'+
   '<form data-eleanor-checkin-form>'+
   '<label>Heart rate, beats per minute (if measured)<input type="number" name="heart_rate" min="20" max="250" step="1" inputmode="numeric" value="'+E(f.heart_rate??'')+'" placeholder="Not measured"></label>'+
   '<label>Water consumed today, fluid ounces (if tracked)<input type="number" name="water_oz" min="0" max="500" step="0.5" inputmode="decimal" value="'+E(f.water_oz??'')+'" placeholder="Not reported"></label>'+
   FIELDS.map(([key,label])=>'<label>'+E(label)+statusSelect(key,f[key]||'not_yet',E)+'</label>').join('')+
   '<label>Posts, comments or messages that need a reply (paste only what you choose to share)<textarea name="reply_context" rows="4" maxlength="2000" placeholder="Paste the message and context. Eleanor can suggest a reply but will not post it.">'+E(f.reply_context||'')+'</textarea></label>'+
   '<label>What would you like Eleanor to help with today?<textarea name="request" rows="3" maxlength="1000" placeholder="Planning, follow-ups, replies, reminders, projects...">'+E(f.request||'')+'</textarea></label>'+
   '<button type="submit">Save and send check-in to Eleanor</button><p class="secretary-subtle">Your entry is saved on this device first. Sending uses Eleanor’s existing Messages conversation and available AI allowance.</p>'+
   '<p role="status" data-eleanor-checkin-status>'+E(record.sent_at?'Last sent: '+new Date(record.sent_at).toLocaleString():'Not sent yet')+'</p></form></section>';
 }
 const list=notes(owner);
 return '<section class="secretary-card eleanor-workflow"><h3>Notes review and project ideas</h3><p>Eleanor can examine the Notes widget saved on this device when Agent HQ is open. Select Review to ask Eleanor for recommendations. Nothing is delegated, scheduled, posted or sent to outside accounts without your action and the required approvals.</p>'+
  (list.length?list.map((n,i)=>'<article class="eleanor-note"><small>'+E(n.date||'Saved note')+'</small><p>'+E(n.text)+'</p><p class="secretary-subtle">Possible specialists: '+E(specialists(n.text).join(', '))+'. Alex confirms project assignments.</p>'+
   '<div class="secretary-actions"><button type="button" data-eleanor-note-action="review" data-note-index="'+i+'">Ask Eleanor for ideas</button><button type="button" data-eleanor-note-action="task" data-note-index="'+i+'">Make task</button><button type="button" data-eleanor-note-action="calendar" data-note-index="'+i+'">Propose calendar entry</button><button type="button" data-eleanor-note-action="project" data-note-index="'+i+'">Start project</button></div></article>').join(''):'<p>No notes are saved in the Home Screen Notes widget on this device.</p>')+
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
function openNoteDialog(kind,note,state,{apply,load,message},E){
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
    await load();message('Saved to Eleanor’s internal calendar. No external calendar was changed.');
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
    await load();message('Project saved for Alex and appropriate specialists. Review its progress in Projects.');
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
  fields.reply_context=String(f.get('reply_context')||'').trim().slice(0,2000);
  fields.request=String(f.get('request')||'').trim().slice(0,1000);
  const owner=state.settings.owner_id,prior=todayRecord(owner,day);
  const signature=JSON.stringify(fields);
  const record={fields,saved_at:new Date().toISOString(),sent_at:prior?.sent_signature===signature?prior.sent_at:null,sent_signature:prior?.sent_signature===signature?signature:null};
  try{
   saveRecord(owner,day,record);
   if(record.sent_at){status.textContent='This exact check-in was already sent. Saved without sending a duplicate.';return;}
   const summary=['Daily check-in for '+day+' (owner-reported; no automatic measurement):',
    'Heart rate: '+(fields.heart_rate===undefined?'not measured/reported':fields.heart_rate+' bpm'),
    'Water: '+(fields.water_oz===undefined?'not measured/reported':fields.water_oz+' fluid oz'),
    ...FIELDS.map(([key,label])=>label+': '+(OPTIONS.find(x=>x[0]===fields[key])?.[1]||'Not reported')),
    'Messages needing a drafted reply (not permission to send): '+(fields.reply_context||'none supplied'),
    'My requested assistance: '+(fields.request||'Please ask what I need help with.')];
   await sendToEleanor(state,summary.join('\n'));
   record.sent_at=new Date().toISOString();record.sent_signature=signature;saveRecord(owner,day,record);
   status.textContent='Saved and sent to Eleanor’s Messages. No external posts or replies were sent.';
   helpers.message('Check-in recorded in Eleanor’s conversation. Open Messages to continue step by step.');
  }catch(error){status.textContent='Saved on this device, but not sent to Eleanor: '+String(error?.message||error);}
  finally{submit.disabled=false;}
 });
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
