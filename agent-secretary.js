import {agentCloud} from './agent-cloud-auth.js';
import {renderEleanorTodaySummary,renderEleanorCoordination,bindEleanorCoordination} from './agent-eleanor-workflow.js?v=20261107-book-reading-1';
import './agent-hq-checkin-cloud.js?v=20261107-checkin-cloud-1';
import './agent-hq-goals-cloud.js?v=20261107-goal-1';
import {renderEleanorGoals,bindEleanorGoals} from './agent-eleanor-goals.js?v=20261107-goal-1';
import './agent-hq-autonomy-cloud.js?v=20261107-proactive-1';
import {renderEleanorInitiatives,bindEleanorInitiatives} from './agent-eleanor-initiatives.js?v=20261107-proactive-1';
import {renderEleanorBoards,bindEleanorBoards} from './agent-eleanor-boards.js?v=20261107-confirmed-5pm-1';
import {ELEANOR_ETHICS,secretaryDate} from './eleanor-secretary-core.js?v=20261107-chatgpt-desk-1';
import {saveSecretarySnapshot,clearSecretarySnapshot} from './agent-secretary-snapshot.js?v=20261109-message-navigation-1';
let snapshotStorage;try{snapshotStorage=window.localStorage;}catch{}
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let owner,epoch=0,state=null,root=null,tab=new URL(location.href).searchParams.has('agentAlerts')?'alerts':'today',notice='',busy=false,loading=false,loadingEpoch=null,publicKey=null,registration=null,pushState={code:'checking',deviceId:null},pushBusy=false,pushCheckInFlight=false,pendingOpen=new URL(location.href).searchParams.has('secretary');
const host=()=>document.getElementById('agent-secretary-root');
const localDate=()=>secretaryDate(new Date(),state.settings.timezone);
const dateText=value=>value?new Intl.DateTimeFormat('en-US',{timeZone:state.settings.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Not set';
async function api(action,extra={}){
 const generation=epoch,{data,error:authError}=await agentCloud.auth.getUser();if(authError||!data.user)throw Error('Sign in under Settings → Account to open Eleanor’s desk.');
 if(generation!==epoch)throw Error('The signed-in account changed.');const {data:result,error}=await agentCloud.functions.invoke('agent-secretary',{body:{action,...extra}});if(generation!==epoch)throw Error('The signed-in account changed.');let reason=result?.error;if(error?.context?.clone&&!reason)try{reason=(await error.context.clone().json())?.error}catch{}if(error||reason)throw Error(reason||error.message||'The secretary request failed.');if(['apply','act_delivery','dismiss_agent_alert','set_agent_alerts'].includes(action)){clearSecretarySnapshot(snapshotStorage,owner);window.dispatchEvent(new CustomEvent('agenthq-secretary-state-invalidated',{detail:{owner_id:owner}}));}return result;
}
let checkinProvisioning=false;
async function ensureDailyCheckinReminder(){
 const current=state,generation=epoch;
 if(checkinProvisioning||!owner||!current?.settings?.brief_time||current.items.some(i=>i.kind==='reminder'&&i.title.toLowerCase()==='eleanor daily check-in'))return;
 checkinProvisioning=true;
 try{
  const at=current.settings.brief_time.slice(0,5);
  await api('apply',{request_id:crypto.randomUUID(),version:current.settings.version,operations:[{op:'save_item',item:{
   kind:'reminder',title:'Eleanor daily check-in',
   details:'Good morning. How is your heart rate if you measured it? Have you had your multivitamin drink or apple cider vinegar, and how is your water intake? Have you gone live on TikTok, reviewed posts or messages, or noticed any comments that need a reply? I can draft replies and help with your approved tasks in Agent HQ. Open Daily check-in and tell me what is done, what remains and what assistance you need. I will not assume completion or doses.',
   timezone:current.settings.timezone,local_time:at,weekdays:[0,1,2,3,4,5],data:{intake_type:'routine'}
  }}]});
  if(generation===epoch)await load();
 }catch(error){if(generation===epoch)message('The daily check-in reminder was not confirmed: '+String(error?.message||error));}
 finally{checkinProvisioning=false;}
}
async function load(){const generation=epoch;if(loading&&loadingEpoch===generation)return;loading=true;loadingEpoch=generation;try{const next=await api('state');if(generation===epoch){state=next;notice='';saveSecretarySnapshot(snapshotStorage,owner,next);window.dispatchEvent(new CustomEvent('agenthq-secretary-state',{detail:{owner_id:owner,state:next}}));}}catch(e){if(generation===epoch)notice=e.message;}finally{if(loadingEpoch===generation){loading=false;loadingEpoch=null;}if(generation===epoch){render();if(tab==='settings'&&!pushBusy)void refreshDeviceStatus();if(state)void ensureDailyCheckinReminder();}}}
async function apply(operations,requestId=crypto.randomUUID()){
 const r=await api('apply',{operations,request_id:requestId,version:state.settings.version});await load();await window.agentHQBotStudioCloud?.refresh?.();return r;
}
function message(value){notice=value;root?.querySelector('[data-secretary-notice]')?.replaceChildren(document.createTextNode(value));}
const isIOS=()=>/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isInstalled=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
function pushStatusLabel(){
 const map={checking:'Checking this device…',connected:'Connected ✓',disabled:'Not connected',permission:'Permission not granted',blocked:'Notifications blocked',unsupported:'Device alerts unsupported',install:'Home Screen installation required',error:'Connection could not be verified'};
 return map[pushState.code]||map.error;
}
function pushStatusText(){
 if(pushState.code==='connected')return 'Notification permission granted, and this device is registered in your Agent HQ account. Delivery still depends on iOS settings and network availability.';
 if(pushState.code==='install')return 'On iPhone or iPad, open Agent HQ in Safari, choose Share → Add to Home Screen, then launch the Home Screen icon before allowing notifications.';
 if(pushState.code==='blocked')return 'Notifications are blocked on this device. Allow Agent HQ notifications in iPhone Settings, then return to recheck.';
 if(pushState.code==='permission')return 'Tap Enable alerts to request device permission. No permission has been granted yet.';
 if(pushState.code==='disabled')return 'No active registration for this device. Tap Enable alerts to connect it.';
 if(pushState.code==='unsupported')return 'Push notifications are not available in this browser. Reminders are still saved in Eleanor’s Messages.';
 if(pushState.code==='error')return 'The connection could not be confirmed. Recheck after restoring the app connection.';
 return 'Looking up your device notification permission and saved registration.';
}
async function refreshDeviceStatus(){
 if(pushBusy||pushCheckInFlight||!owner||!state||tab!=='settings')return;
 const ticket=epoch;
 pushCheckInFlight=true;pushState={code:'checking',deviceId:null};render();
 try{
  let next;
  if(isIOS()&&!isInstalled())next={code:'install',deviceId:null};
  else if(!('serviceWorker' in navigator)||!('PushManager' in window)||typeof Notification==='undefined')next={code:'unsupported',deviceId:null};
  else if(Notification.permission==='denied')next={code:'blocked',deviceId:null};
  else if(Notification.permission!=='granted')next={code:'permission',deviceId:null};
  else{
   const reg=await navigator.serviceWorker.getRegistration('./');
   const sub=await reg?.pushManager?.getSubscription();
   if(!sub)next={code:'disabled',deviceId:null};
   else{
    const saved=await api('device_status',{subscription:sub.toJSON()});
    next=saved.registered?{code:'connected',deviceId:saved.device_id,lastAccepted:saved.last_success_at,lastError:saved.last_error}:{code:'disabled',deviceId:null};
   }
  }
  if(ticket===epoch){pushState=next;render();}
 }catch(error){if(ticket===epoch){pushState={code:'error',deviceId:null};message('Could not verify alerts: '+String(error?.message||error));render();}}
 finally{pushCheckInFlight=false;}
}
function pushUI(){
 const connected=pushState.code==='connected';
 const label=pushStatusLabel();
 const b=pushBusy?'Working…':connected?'Connected ✓':'Enable alerts on this device';
 return '<div class="secretary-push-state" role="status" aria-live="polite"><strong>'+E(label)+'</strong><p>'+E(pushStatusText())+'</p></div>'+
 '<div class="secretary-actions">'+
 '<button type="button" data-secretary-enable-push '+(connected?'aria-pressed="true" disabled':'')+(pushBusy?' disabled':'')+'>'+E(b)+'</button>'+
 '<button type="button" data-secretary-recheck-push '+(pushBusy?'disabled':'')+'>Recheck connection</button>'+
 (connected?'<button type="button" data-secretary-disable-current '+(pushBusy?'disabled':'')+'>Disable alerts on this device</button><button type="button" data-secretary-test-push '+(pushBusy?'disabled':'')+'>Test device notification</button>':'')+
 '</div>';
}
const controls=item=>'<div class="secretary-actions"><button type="button" data-secretary-edit="'+E(item.id)+'">Edit</button>'+(item.status==='active'?'<button type="button" data-secretary-control="'+E(item.id)+'" data-choice="paused">Pause</button><button type="button" data-secretary-control="'+E(item.id)+'" data-choice="stopped">Stop</button>':'<button type="button" data-secretary-control="'+E(item.id)+'" data-choice="active">Resume</button>')+(['task','meeting'].includes(item.kind)&&item.status!=='completed'?'<button type="button" data-secretary-control="'+E(item.id)+'" data-choice="completed">Mark complete</button>':'')+'</div>';
function itemCard(item){return '<article class="secretary-card"><div class="secretary-item-heading"><h3>'+E(item.title)+'</h3><small>'+E(item.status)+'</small></div><p class="secretary-subtle">'+E(item.kind==='meeting'?dateText(item.scheduled_at):item.kind==='task'?item.due_at?'Due '+dateText(item.due_at):'Deadline not supplied':(item.data?.repeat==='none'?'One-time · '+(item.next_due_at?dateText(item.next_due_at):String(item.data?.once_at||'Scheduled time passed').replace('T',' '))+' · '+item.timezone:item.weekdays.map(d=>DAYS[d].slice(0,3)).join(', ')+(item.local_time?' · '+item.local_time.slice(0,5):'')+' · '+item.timezone))+'</p><pre>'+E(item.details||'No additional instructions.')+'</pre>'+(item.kind==='workout'?'<button type="button" data-secretary-workout="'+E(item.id)+'">Log today’s workout</button><button type="button" data-secretary-workout="'+E(item.id)+'" data-workout-choice="skipped">Skip today’s workout</button>':'')+(item.data?.project_id?'<button type="button" data-secretary-project="'+E(item.data.project_id)+'">Open delegated project</button>':'')+(item.kind==='reminder'&&item.status==='active'?'<button type="button" data-secretary-today="'+E(item.id)+'">Mark today done</button>':'')+controls(item)+'</article>';}
function render(){
 if(!root||root!==host())return;
 if(!state){root.innerHTML='<section class="secretary-desk"><h2>Eleanor</h2><p>Your personal executive secretary</p><p role="status">'+E(notice||'Loading your private registers…')+'</p><button type="button" data-secretary-refresh>Refresh</button></section>';bind();return;}
 const s=state.settings,active=state.items.filter(i=>i.status==='active'),agentPending=(state.agent_alerts||[]).filter(a=>a.status==='open'),pending=state.deliveries.filter(d=>d.status==='saved'&&d.action_state==='open'&&(!d.item_id||active.some(i=>i.id===d.item_id&&i.version===d.item_version))),list=state.items.filter(i=>i.kind===({reminders:'reminder',workouts:'workout',tasks:'task',meetings:'meeting'})[tab]);
 let body='';
 if(tab==='alerts')body='<section class="secretary-card"><h3>Agent attention inbox</h3><p>Eleanor collects completed drafts needing review, missing information, and permission requests. Opening an item does not approve it.</p>'+(agentPending.length?agentPending.map(a=>'<article class="secretary-agent-alert"><div><strong>'+E(a.actor||'Agent')+' · '+E(a.alert_kind==='review'?'Ready for review':a.alert_kind==='approval'?'Approval requested':a.alert_kind==='question'?'Waiting for your reply':'Needs attention')+'</strong><small>'+E(dateText(a.created_at))+'</small></div><p>'+E(a.title)+'</p><p>'+E(a.body||'Review the agent’s saved work in Agent HQ.')+'</p><div class="secretary-actions"><button type="button" data-secretary-open-agent="'+E(a.id)+'">Review in Agent HQ</button><button type="button" data-secretary-dismiss-agent="'+E(a.id)+'">Dismiss this alert</button></div></article>').join(''):'<p>No agent work is currently waiting for your attention.</p>')+'</section>';
 else if(tab==='today')body='<div class="secretary-metrics"><span><strong>'+agentPending.length+'</strong> agent requests</span><span><strong>'+active.filter(i=>i.kind==='reminder').length+'</strong> active reminders</span><span><strong>'+active.filter(i=>i.kind==='task').length+'</strong> open tasks</span><span><strong>'+pending.length+'</strong> notices to review</span></div><h3>Priority notices</h3>'+(pending.length?pending.slice(0,20).map(d=>'<article class="secretary-card"><small>'+E(dateText(d.scheduled_at))+' · '+E(d.kind)+' · '+E(d.push_state==='accepted'?'Push request accepted':d.push_state==='not_enabled'?'Saved in Messages; device alerts not enabled':d.push_state==='unknown'?'Push delivery unconfirmed':'Saved in Messages')+'</small><pre>'+E(d.body)+'</pre><div class="secretary-actions"><button type="button" data-secretary-ack="'+E(d.id)+'" data-choice="done">'+E(['reminder','followup'].includes(d.kind)?'Done today':'Reviewed')+'</button>'+(['reminder','followup'].includes(d.kind)?'<button type="button" data-secretary-ack="'+E(d.id)+'" data-choice="snooze">Snooze 15 minutes</button><button type="button" data-secretary-ack="'+E(d.id)+'" data-choice="skipped">Skip this occurrence</button>':'')+'</div></article>').join(''):'<p>No new scheduled notices are waiting. Your next scheduled notice will also be saved in Eleanor’s Messages conversation.</p>')+'<details><summary>Recent notice history</summary>'+state.deliveries.slice(0,30).map(d=>'<p>'+E(dateText(d.scheduled_at))+' · '+E(d.kind)+' · '+E(d.status)+' · '+E(d.action_state)+'</p>').join('')+'</details>';
 else if(['reminders','workouts','tasks','meetings'].includes(tab))body='<div class="secretary-section-heading"><h3>'+E({reminders:'Daily reminders',workouts:'Weekly workout plan',tasks:'Active tasks',meetings:'Meeting preparation'}[tab])+'</h3><button type="button" data-secretary-add="'+E({reminders:'reminder',workouts:'workout',tasks:'task',meetings:'meeting'}[tab])+'">Add '+E({reminders:'reminder',workouts:'workout or rest day',tasks:'task',meetings:'meeting'}[tab])+'</button></div>'+(tab==='reminders'?'<p>Marking today done keeps tomorrow’s reminder. Pause and Stop affect the recurring schedule.</p>':tab==='workouts'?'<p>Save your actual exercises, sets, repetitions and targets. A rest day can be saved as a plan entry. Eleanor will use this plan in your daily briefing.</p>':tab==='meetings'?'<p>Briefs are scheduled 30 minutes before meetings saved here. Live calendar sync is not connected. Attach the purpose, preparation notes and intended outcomes; Gmail excerpts require the separate permission in Settings.</p>':'<p>One-time tasks stay open until you mark them complete or stop them.</p>')+(list.length?'<div class="secretary-grid">'+list.map(itemCard).join('')+'</div>':'<p>No entries yet. Add the first one or tell Eleanor in Messages.</p>')+(tab==='workouts'?'<details><summary>Fitness log</summary>'+state.workout_log.map(w=>'<p>'+E(w.local_date)+' · '+E(state.items.find(i=>i.id===w.item_id)?.title||'Saved workout')+' · '+E(w.status)+(w.notes?' — '+E(w.notes):'')+'</p>').join('')+'</details>':'');
 else if(tab==='checkin'||tab==='notes')body=renderEleanorCoordination(tab,state,localDate(),E);
  else if(tab==='goals')body=renderEleanorGoals(state,E);
  else if(tab==='initiatives')body=renderEleanorInitiatives(state,E);
  else if(tab==='boards')body=renderEleanorBoards(state,E);
  else if(tab==='settings')body='<form data-secretary-settings class="secretary-card"><h3>Daily briefing</h3><label>Briefing time<input type="time" name="brief_time" value="'+E(s.brief_time.slice(0,5))+'" required></label><label>Briefing timezone<input name="timezone" value="'+E(s.timezone)+'" required></label><label class="secretary-check"><input type="checkbox" name="brief_enabled" '+(s.brief_enabled?'checked':'')+'> Send the briefing every day</label><p>Existing reminders keep the timezone saved on each item. Change those individually when needed.</p><label class="secretary-check"><input type="checkbox" name="email_for_meetings" '+(s.email_for_meetings?'checked':'')+(!state.gmail_connected?' disabled':'')+'> Allow Eleanor to read relevant connected Gmail for meeting briefs</label><p>'+E(state.gmail_connected?'Email access is limited to recent messages matching the attendee email addresses supplied with a meeting. No messages are sent.':'Connect Gmail through Email Center before enabling this permission.')+'</p><button type="submit">Save secretary settings</button><p>Briefing and Gmail permissions are saved when changed, and will retain their settings when you return.</p></form><section class="secretary-card"><h3>Device notifications</h3><p>Notices are always saved in Eleanor’s conversation. Device alerts require permission. On iPhone or iPad, open Agent HQ from its Home Screen icon first.</p><p>Lock-screen alerts contain a generic notice, without medication names or other private details.</p>'+pushUI()+'<div class="secretary-agent-settings"><label class="secretary-check"><input type="checkbox" data-secretary-agent-alert-toggle '+(s.agent_alerts_enabled?'checked':'')+'> Alert me when agents need decisions, information or final review</label><p>'+E(s.agent_alerts_enabled?'Enabled ✓ — Eleanor will notify registered devices when the team needs your attention.':'Off — Eleanor will not send agent-work notifications until you turn this on.')+'</p><button type="button" data-secretary-open-alerts>View agent attention inbox</button></div>'+state.devices.map(d=>'<div class="secretary-device"><strong>'+E(d.label)+'</strong><span>'+E(d.active?'Registered; delivery depends on the device':'Disabled')+'</span><small>'+E(d.last_success_at?'Last push request accepted: '+dateText(d.last_success_at):'No accepted push request recorded yet.')+'</small>'+(d.last_error?'<p>'+E(d.last_error)+'</p>':'')+(d.active?'<button type="button" data-secretary-disable-push="'+E(d.id)+'">Disable this registration</button>':'')+'</div>').join('')+'</section><section class="secretary-card"><h3>Eleanor’s AI administrative capabilities</h3><p><strong>Built into Eleanor ✓</strong> — administrative reasoning, task planning, verified reminder updates, meeting preparation and internal coordination use her existing AI service and the same Messages thread. No extra worker is created.</p><p><strong>External calendar:</strong> '+E(state.calendar_sync_connected?'Connected and available to Eleanor.':'Not connected. She cannot read or change your actual phone calendar yet.')+'</p><p><strong>ChatGPT:</strong> Manual project handoff is supported; waking a live ChatGPT conversation automatically is not connected. Authorized background AI must use a callable model API and its own approved calendar connection.</p></section><section class="secretary-card"><h3>Scheduling status</h3><p>'+E(s.last_scheduler_at?'Last automatic scheduler check: '+dateText(s.last_scheduler_at):'The first automatic scheduler check has not yet been recorded.')+'</p><button type="button" data-secretary-check-due>Check due notices now</button></section>';
 else body='<article class="secretary-card"><h3>Eleanor’s work ethic and instructions</h3><pre>'+E(ELEANOR_ETHICS)+'</pre></article>';
 if(tab==='today')body=renderEleanorTodaySummary(state,localDate(),E)+renderEleanorGoals(state,E,true)+renderEleanorInitiatives(state,E,true)+body;
 root.innerHTML='<section class="secretary-desk"><header class="secretary-heading"><div><h2>Eleanor</h2><p>Personal Executive Secretary · '+E(s.brief_enabled?s.brief_time.slice(0,5)+' daily briefing · '+s.timezone:'Daily briefing paused')+'</p></div><div class="secretary-actions"><button type="button" data-secretary-chat>Message Eleanor</button><button type="button" data-secretary-refresh>Refresh</button></div></header><nav class="secretary-tabs" aria-label="Secretary sections">'+[['today','Today'],['goals','Goals'],['initiatives','AI Initiatives'],['boards','My Boards'],['checkin','Daily check-in'],['notes','Notes review'],['alerts','Agent alerts'],['reminders','Daily reminders'],['workouts','Workout plan'],['tasks','Tasks'],['meetings','Meetings'],['settings','Settings'],['ethics','Work ethics']].map(([id,label])=>'<button type="button" data-secretary-tab="'+id+'" aria-pressed="'+(tab===id)+'">'+label+'</button>').join('')+'</nav><p data-secretary-notice role="status">'+E(notice)+'</p>'+body+'</section>';bind();bindEleanorCoordination(root,state,localDate(),{apply,load,message},E);bindEleanorGoals(root,state,{apply,load,message},E);if(tab==='initiatives')bindEleanorInitiatives(root,{message});if(tab==='boards')bindEleanorBoards(root,state,{load,message},E);
}
function showForm(kind,item){
 const generation=epoch,version=state.settings.version,d=document.createElement('dialog');d.className='secretary-dialog';
 const fields='<label>Name<input name="title" maxlength="180" required value="'+E(item?.title||'')+'"></label><label>Instructions, exercises or notes<textarea name="details" rows="4" maxlength="4000" '+(kind==='workout'?'required':'')+'>'+E(item?.details||'')+'</textarea></label><label>Timezone<input name="timezone" required value="'+E(item?.timezone||state.settings.timezone)+'"></label>';
 const weekdays='<fieldset><legend>Days</legend>'+DAYS.map((day,n)=>'<label class="secretary-check"><input type="checkbox" name="weekday" value="'+n+'" '+((item?.weekdays||(kind==='reminder'?[0,1,2,3,4,5]:[])).includes(n)?'checked':'')+(n===6?' disabled aria-label="Saturday rest day"':'')+'>'+day+(n===6?' · rest day':'')+'</label>').join('')+'</fieldset>';
 const meeting='<label>Meeting start<input type="datetime-local" name="local_start" required value="'+E(item?.scheduled_at?toLocalInput(item.scheduled_at,item.timezone):'')+'"></label><label>Attendees — one per line: name | email | role<textarea name="attendees" rows="3">'+E((item?.data?.attendees||[]).map(a=>[a.name,a.email,a.role].join(' | ')).join('\n'))+'</textarea></label><label>Purpose<textarea name="purpose" rows="2">'+E(item?.data?.purpose||'')+'</textarea></label><label>Preparation assets and historical notes<textarea name="notes" rows="3">'+E(item?.data?.notes||'')+'</textarea></label><label>Target outcomes and open questions<textarea name="objectives" rows="3">'+E(item?.data?.objectives||'')+'</textarea></label>';
 d.innerHTML='<form><header><h2>'+E(item?'Edit '+item.title:'Add '+kind)+'</h2><button type="button" data-close aria-label="Close">×</button></header>'+fields+(kind==='reminder'?'<label for="secretary-intake-type">Intake type</label><select id="secretary-intake-type" name="intake_type">'+[['routine','Routine'],['supplement','Supplement'],['medication','Medication']].map(([id,label])=>'<option value="'+id+'" '+(item?.data?.intake_type===id?'selected':'')+'>'+label+'</option>').join('')+'</select><label>Reminder time<input type="time" name="local_time" required value="'+E(item?.local_time?.slice(0,5)||'')+'"></label>'+weekdays:kind==='workout'?weekdays:kind==='task'?'<label>Deadline, if any<input type="datetime-local" name="local_due" value="'+E(item?.due_at?toLocalInput(item.due_at,item.timezone):'')+'"></label><label>Next action<input name="next_action" maxlength="500" value="'+E(item?.data?.next_action||'')+'"></label>':meeting)+'<p role="status"></p><button type="submit">Save '+E(kind)+'</button></form>';
 d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});d.querySelector('form').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.currentTarget),button=d.querySelector('[type=submit]'),status=d.querySelector('[role=status]');button.disabled=true;const entry={kind,title:f.get('title'),details:f.get('details'),timezone:f.get('timezone'),data:item?.data?{...item.data}:{}};if(['workout','reminder'].includes(kind)){entry.weekdays=f.getAll('weekday').map(Number);if(!entry.weekdays.length){status.textContent='Choose at least one weekday.';button.disabled=false;return;}}if(kind==='reminder'){entry.local_time=f.get('local_time');entry.data.intake_type=f.get('intake_type');}if(kind==='task'){entry.local_due=f.get('local_due')||undefined;entry.data.next_action=f.get('next_action');}if(kind==='meeting'){entry.local_start=f.get('local_start');entry.data.attendees=String(f.get('attendees')||'').split('\n').filter(x=>x.trim()).map(line=>{const [name='',email='',role='']=line.split('|').map(s=>s.trim());return {name,email,role};});for(const key of ['purpose','notes','objectives'])entry.data[key]=f.get(key);}
  try{await api('apply',{request_id:crypto.randomUUID(),version,operations:[{op:'save_item',...(item?{id:item.id}:{}),item:entry}]});if(generation!==epoch)return;d.close();await load();message('Saved. Eleanor’s schedule uses the verified record.');}catch(e){status.textContent=e.message;button.disabled=false;}};document.body.append(d);d.showModal();
}
function toLocalInput(value,zone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;}
async function enablePush(){
 if(pushBusy)return;
 if(isIOS()&&!isInstalled()){pushState={code:'install',deviceId:null};message('Install Agent HQ to your iPhone Home Screen and open its icon to enable notifications.');render();return;}
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||typeof Notification==='undefined'){pushState={code:'unsupported',deviceId:null};render();return;}
 if(Notification.permission==='denied'){pushState={code:'blocked',deviceId:null};message('Device notifications are blocked. Change this in iPhone Settings first.');render();return;}
 // The browser permission prompt must be requested directly from this user tap.
 let permission;
 try{permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();}
 catch(error){message('Device permission could not be requested: '+String(error?.message||error));return;}
 if(permission!=='granted'){pushState={code:permission==='denied'?'blocked':'permission',deviceId:null};message('Notifications were not enabled. No device registration was saved.');render();return;}
 pushBusy=true;render();
 try{
  const config=publicKey?{public_key:publicKey}:await api('push_config');publicKey=config.public_key;
  let reg=await navigator.serviceWorker.getRegistration('./');
  if(!reg)reg=await navigator.serviceWorker.register('./agent-secretary-sw.js?v=20261102-agent-work-notifications-1',{scope:'./'});
  if(!reg?.pushManager)throw Error('The device push manager is unavailable');
  const ready=await navigator.serviceWorker.ready;
  let sub=await ready.pushManager.getSubscription();
  if(!sub){
   const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));
   sub=await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});
  }
  const saved=await api('subscribe_push',{subscription:sub.toJSON(),label:'My Agent HQ device'});
  if(!saved.registered||!saved.device_id)throw Error('Your account did not confirm this device registration');
  pushState={code:'connected',deviceId:saved.device_id};await load();
  message('Connected ✓ — this device is registered for Eleanor’s private alerts. A test notification can verify the on-device display.');
 }catch(error){pushState={code:'error',deviceId:null};message('Could not enable alerts: '+String(error?.message||error));}
 finally{pushBusy=false;render();}
}
async function disableCurrent(){
 if(pushBusy||pushState.code!=='connected'||!pushState.deviceId)return;
 pushBusy=true;render();
 try{
  const id=pushState.deviceId;
  await api('unsubscribe_push',{device_id:id});
  const reg=await navigator.serviceWorker.getRegistration('./');
  const sub=await reg?.pushManager?.getSubscription();
  if(sub)await sub.unsubscribe();
  pushState={code:'disabled',deviceId:null};
  await load();
  message('Alerts disabled for this device. Your saved reminders are unchanged.');
 }catch(error){message('Could not fully disable this device: '+String(error?.message||error));}
 finally{pushBusy=false;render();}
}
async function testCurrentNotification(){
 if(pushState.code!=='connected')return message('Enable this device first.');
 try{
  if(Notification.permission!=='granted')throw Error('Notification permission is no longer granted');
  const reg=await navigator.serviceWorker.getRegistration('./');
  if(!reg)throw Error('The notification service worker is unavailable');
  await reg.showNotification('Eleanor · Test alert',{body:'This is an on-device test from Agent HQ.',tag:'eleanor-local-test',icon:'./icon.svg'});
  message('Test notification requested on this device. This does not prove background push delivery.');
 }catch(error){message('Test notification failed: '+String(error?.message||error));}
}
function bind(){
 root.querySelectorAll('[data-secretary-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.secretaryTab;notice='';render();if(tab==='settings')void refreshDeviceStatus();});root.querySelector('[data-secretary-refresh]')?.addEventListener('click',load);
 root.querySelector('[data-secretary-chat]')?.addEventListener('click',()=>window.agentHQOpenBotMessage?.(state.settings.bot_id));
 root.querySelectorAll('[data-secretary-add]').forEach(b=>b.onclick=()=>showForm(b.dataset.secretaryAdd));root.querySelectorAll('[data-secretary-edit]').forEach(b=>b.onclick=()=>{const i=state.items.find(i=>i.id===b.dataset.secretaryEdit);if(i)showForm(i.kind,i);});
 root.querySelectorAll('[data-secretary-control]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await apply([{op:'control_item',id:b.dataset.secretaryControl,status:b.dataset.choice}]);message('Saved: '+b.dataset.choice+'.');}catch(e){message(e.message);b.disabled=false;}});
 root.querySelectorAll('[data-secretary-today]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await apply([{op:'ack_item_today',id:b.dataset.secretaryToday,choice:'done'}]);message('Today’s reported completion is recorded. Tomorrow’s reminder remains active.');}catch(e){message(e.message);b.disabled=false;}});
 root.querySelectorAll('[data-secretary-ack]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('act_delivery',{delivery_id:b.dataset.secretaryAck,choice:b.dataset.choice,request_id:crypto.randomUUID()});await load();message('This occurrence was updated. The recurring schedule is unchanged.');}catch(e){message(e.message);b.disabled=false;}});
 root.querySelectorAll('[data-secretary-workout]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await apply([{op:'workout_log',id:b.dataset.secretaryWorkout,local_date:localDate(),status:b.dataset.workoutChoice||'completed',notes:'Owner recorded today’s workout outcome.'}]);message('Today’s workout outcome is recorded. The weekly plan remains active.');}catch(e){message(e.message);b.disabled=false;}});
 root.querySelectorAll('[data-secretary-project]').forEach(b=>b.onclick=()=>window.agentHQOpenProjects?.(b.dataset.secretaryProject));
 const settingsForm=root.querySelector('[data-secretary-settings]');
 const saveSettings=async(form)=>{
  if(busy)return;
  busy=true;const submit=form.querySelector('[type="submit"]');if(submit){submit.disabled=true;submit.textContent='Saving…';}
  const f=new FormData(form);
  try{
   const wasGmailAllowed=Boolean(state?.settings?.email_for_meetings);
   await apply([{op:'settings',brief_time:f.get('brief_time'),timezone:f.get('timezone'),
    brief_enabled:f.has('brief_enabled'),email_for_meetings:state.gmail_connected?f.has('email_for_meetings'):wasGmailAllowed}]);
   message('Saved ✓ — your preferences will remain until you change them.');
  }catch(error){message('Could not save settings: '+String(error?.message||error));render();}
  finally{busy=false;if(submit?.isConnected){submit.disabled=false;submit.textContent='Save secretary settings';}}
 };
 settingsForm?.addEventListener('submit',event=>{event.preventDefault();void saveSettings(event.currentTarget);});
 settingsForm?.querySelectorAll('input[type="checkbox"]').forEach(input=>input.addEventListener('change',()=>void saveSettings(settingsForm)));
 root.querySelector('[data-secretary-agent-alert-toggle]')?.addEventListener('change',async event=>{
  const enabled=Boolean(event.currentTarget.checked);
  event.currentTarget.disabled=true;
  try{
   const saved=await api('set_agent_alerts',{enabled});
   if(!saved.saved||saved.enabled!==enabled)throw Error('Preference was not verified');
   await load();message('Saved ✓ — agent attention alerts '+(enabled?'enabled':'disabled')+'.');
  }catch(error){event.currentTarget.checked=!enabled;message('Alert preference could not be saved: '+String(error?.message||error));}
  finally{if(event.currentTarget.isConnected)event.currentTarget.disabled=false;}
 });
 root.querySelector('[data-secretary-open-alerts]')?.addEventListener('click',()=>{tab='alerts';render();});
 root.querySelectorAll('[data-secretary-open-agent]').forEach(button=>button.addEventListener('click',()=>{
  const row=(state.agent_alerts||[]).find(a=>a.id===button.dataset.secretaryOpenAgent);
  if(!row)return message('This alert has changed. Refresh the inbox.');
  if(window.agentHQOpenAgentAlert){window.agentHQOpenAgentAlert(row);return;}
  if(row.project_id&&window.agentHQOpenProjects){window.agentHQOpenProjects(row.project_id);return;}
  if(window.agentHQOpenApprovals){window.agentHQOpenApprovals();return;}
  message('Open Approvals from the Agent HQ home screen to review this request.');
 }));
 root.querySelectorAll('[data-secretary-dismiss-agent]').forEach(button=>button.addEventListener('click',async()=>{
  button.disabled=true;
  try{const result=await api('dismiss_agent_alert',{alert_id:button.dataset.secretaryDismissAgent});
    if(!result.dismissed)throw Error('The alert has already changed');
    await load();message('Alert dismissed. This did not approve or reject the request.');
  }catch(error){message('Could not dismiss alert: '+String(error?.message||error));button.disabled=false;}
 }));
 root.querySelector('[data-secretary-enable-push]')?.addEventListener('click',enablePush);
 root.querySelector('[data-secretary-recheck-push]')?.addEventListener('click',()=>void refreshDeviceStatus());
 root.querySelector('[data-secretary-disable-current]')?.addEventListener('click',()=>void disableCurrent());
 root.querySelector('[data-secretary-test-push]')?.addEventListener('click',()=>void testCurrentNotification());
 root.querySelectorAll('[data-secretary-disable-push]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const deviceId=b.dataset.secretaryDisablePush;if(deviceId===pushState.deviceId){b.disabled=false;await disableCurrent();return;}await api('unsubscribe_push',{device_id:deviceId});await load();message('That device registration is disabled.');}catch(e){message(e.message);b.disabled=false;}});
 root.querySelector('[data-secretary-check-due]')?.addEventListener('click',async()=>{try{await api('check_due');await load();await window.agentHQBotStudioCloud?.refresh?.();message('Due notices checked.');}catch(e){message(e.message);}});
}
window.addEventListener('agenthq-home-notes-changed',()=>{if(root&&state&&(tab==='notes'||tab==='today'))render()});
window.addEventListener('agenthq-checkins-changed',()=>{if(root&&state&&(tab==='checkin'||tab==='today'))render()});
window.addEventListener('agenthq-goals-changed',()=>{if(root&&state&&(tab==='goals'||tab==='today')&&!document.activeElement?.closest('form[data-goal-new-home],form[data-goal-budget],form[data-goal-add-step]'))render()});
window.addEventListener('agenthq-initiatives-changed',()=>{if(root&&state&&(tab==='initiatives'||tab==='today')&&!document.activeElement?.closest('[data-initiative-settings]'))render()});
window.addEventListener('agenthq-secretary-show-initiatives',()=>{tab='initiatives';render()});
window.addEventListener('agenthq-secretary-show-goals',()=>{tab='goals';render();});
window.addEventListener('agenthq-secretary-show-boards',()=>{tab='boards';render();});
window.addEventListener('agenthq-secretary-show-alerts',()=>{tab='alerts';render();});
window.addEventListener('agenthq-notes-decision',()=>{if(owner)void load();});
window.addEventListener('agenthq-secretary-show-notes',()=>{tab='notes';render();});
window.addEventListener('agenthq-secretary-show-checkin',()=>{tab='checkin';render();});
window.addEventListener('agenthq-secretary-show-meetings',()=>{tab='meetings';render();});
function mount(){if(pendingOpen&&window.agentHQOpenSecretary){pendingOpen=false;window.agentHQOpenSecretary();}const next=host();if(next===root)return;root=next;if(root){render();if(owner)void load();}}
new MutationObserver(mount).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
agentCloud.auth.onAuthStateChange((_event,session)=>{const next=session?.user?.id||null;if(next!==owner){owner=next;epoch++;state=null;publicKey=null;pushState={code:'checking',deviceId:null};notice=next?'Loading your private registers…':'Sign in under Settings → Account to open Eleanor’s desk.';document.querySelectorAll('dialog.secretary-dialog').forEach(d=>d.close());render();if(!next&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&'PushManager' in window&&navigator.serviceWorker?.getRegistration)void navigator.serviceWorker.getRegistration('./').then(r=>r?.pushManager?.getSubscription()).then(s=>s?.unsubscribe()).catch(()=>{});if(next)void load();}if(next&&'serviceWorker' in navigator){registration??=navigator.serviceWorker.register('./agent-secretary-sw.js?v=20261102-agent-work-notifications-1',{scope:'./'}).catch(()=>null);void api('push_config').then(r=>publicKey=r.public_key).catch(()=>{});}});
window.addEventListener('focus',()=>{if(owner&&root)void load();});setInterval(()=>{if(document.hidden||!owner)return;if(root&&!document.activeElement?.closest('input,textarea,select,dialog'))void load();const id=state?.settings?.bot_id||window.agentHQBotStudioSnapshot?.rows?.find(b=>b.template_key==='eleanor-secretary-v1')?.id;if(id&&document.querySelector('#studio-message-form')?.dataset.studioThread===id)void window.agentHQBotStudioUI?.refreshChat?.(id);},45000);
mount();
