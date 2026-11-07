import {agentCloud} from './agent-cloud-auth.js';
import {condition as weatherCondition} from './agent-weather-conditions.js?v=20261107-conditions-1';
import {routineDue} from './agent-reading-schedule.js?v=20261107-eligible-days-1';
import './agent-hq-notes-cloud.js?v=20261107-native-notes-2';
// Agent HQ Home: iPhone-like swipe navigation and uninterrupted long-press dragging.
// Preferences are local; no external account data is stored here.
const KEY="agenthq-home-layout-v1";
const DOCK_KEY='agenthq-home-dock-v2';
const DEFAULT_DOCK=['messages','email','assignments','camera'];
const APPS=[
 ["office","Office","🏢"],["messages","Messages","💬"],["email","Email Center","✉️"],
 ["contacts","Contacts","👥"],["accounts","My Accounts","🔐"],["studio","Worker Studio","🧬"],
 ["assignments","Assignments","📋"],["operations","Operations","📈"],
 ["projects","Projects","🗂️"],["creative","Creative Desk","🎨"],["hq","Company HQ","🧑‍💼"],
 ["approvals","Approvals","🔐"],["research","Research","🔎"],
 ["chatgpt","ChatGPT","✦"],["browser","Browser","🌐"],["reminders","Reminders","📅"],["camera","Camera","📷"],["settings","Settings","⚙️"]
];
const LABELS={office:"Office",messages:"Messages",email:"Email",contacts:"Contacts",accounts:"Accounts",studio:"Studio",assignments:"Assignments",projects:"Projects",operations:"Operations",creative:"Creative",hq:"Company HQ",approvals:"Approvals",research:"Research",chatgpt:"ChatGPT",browser:"Browser",reminders:"Reminders",camera:"Camera",settings:"Settings"};
const valid=new Set(APPS.map(p=>p[0])),kinds=["inbox","approvals","work","research","notes","calendar","weather","clock","status"];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const empty=()=>({apps:[],widgets:[],order:[]});
function rowsUsed(order,columns){const occupied=[];let max=0;for(const id of order){const size=id.startsWith('widget:')?2:1;let placed=false;for(let row=0;!placed;row++)for(let col=0;col<=columns-size;col++){let free=true;for(let y=row;y<row+size;y++)for(let x=col;x<col+size;x++)if(occupied[y]?.[x])free=false;if(!free)continue;for(let y=row;y<row+size;y++){occupied[y]||=[];for(let x=col;x<col+size;x++)occupied[y][x]=true}max=Math.max(max,row+size);placed=true;break}}return max}
function rebalancePages(pages){const columns=innerWidth>=1000||(innerWidth>=700&&innerWidth>innerHeight)?8:innerWidth>=700?6:4,limit=innerWidth>=700?6:5;for(let i=0;i<pages.length;i++){const p=pages[i],items=[...p.apps,...p.widgets.map(k=>'widget:'+k)];p.order=[...new Set((p.order||[]).filter(id=>items.includes(id)).concat(items))];while(rowsUsed(p.order,columns)>limit&&i<5){const displaced=p.order.pop();if(!pages[i+1])pages.push(empty());pages[i+1].order=[displaced,...(pages[i+1].order||[])];p.apps=p.order.filter(x=>valid.has(x));p.widgets=p.order.filter(x=>x.startsWith('widget:')).map(x=>x.slice(7));const next=pages[i+1];if(displaced.startsWith('widget:'))next.widgets.unshift(displaced.slice(7));else next.apps.unshift(displaced)}}return pages}
const defaultLayout=()=>innerWidth<700?{pages:[{apps:APPS.slice(0,12).map(p=>p[0]),widgets:['weather','calendar']},{apps:APPS.slice(12).map(p=>p[0]),widgets:['notes','clock','status']}],current:0}:{pages:[{apps:APPS.slice(0,12).map(p=>p[0]),widgets:['weather','calendar','notes','clock','status']},{apps:APPS.slice(12).map(p=>p[0]),widgets:[]}],current:0};
function load(){
 try{
  const data=JSON.parse(localStorage.getItem(KEY)||"null");
  if(!data||!Array.isArray(data.pages)||!data.pages.length)return defaultLayout();
  const seen=new Set(),pages=data.pages.slice(0,6).map(p=>({
   apps:(Array.isArray(p.apps)?p.apps:[]).filter(id=>{if(!valid.has(id)||seen.has(id))return false;seen.add(id);return true}).slice(0,24),
   widgets:(Array.isArray(p.widgets)?p.widgets:[]).filter(k=>kinds.includes(k)).slice(0,9),
   order:Array.isArray(p.order)?p.order.filter(x=>typeof x==='string'):[]
  }));
  for(const [id] of APPS)if(!seen.has(id))pages[0].apps.push(id);
  // One-screen legacy installations could not swipe; migrate overfilled layouts.
  if(pages.length===1&&pages[0].apps.length>12)pages.push({apps:pages[0].apps.splice(12),widgets:[]});
  if(!localStorage.getItem('agenthq-home-widgets-seeded-v1')){
   for(const kind of ['weather','calendar','notes','clock','status'])if(!pages.some(p=>p.widgets.includes(kind)))(innerWidth<700?pages[1]:pages[0]).widgets.push(kind);
   localStorage.setItem('agenthq-home-widgets-seeded-v1','1');
  }
  if(innerWidth<700&&pages[0].apps.length>=10&&pages[0].widgets.length>2){if(!pages[1])pages.push(empty());while(pages[0].widgets.length>2)pages[1].widgets.unshift(pages[0].widgets.pop());pages[0].order=[];pages[1].order=[]}
  for(const p of pages){const available=[...p.apps,...p.widgets.map(k=>'widget:'+k)];p.order=[...new Set(p.order.filter(x=>available.includes(x)).concat(available))]}
  return {pages:rebalancePages(pages),current:Math.min(pages.length-1,Math.max(0,Number(data.current)||0))};
 }catch{return defaultLayout()}
}
function readDock(){
 try{const a=JSON.parse(localStorage.getItem(DOCK_KEY)||'null');
  if(Array.isArray(a)&&a.length===4&&a.every(id=>valid.has(id))&&new Set(a).size===4)return a;
 }catch{}
 return DEFAULT_DOCK.slice();
}
let dock=readDock();
function saveDock(){try{localStorage.setItem(DOCK_KEY,JSON.stringify(dock))}catch{}}
function replaceDock(slot,id){
 if(!Number.isInteger(slot)||slot<0||slot>3||!valid.has(id))return false;
 const current=dock.indexOf(id);if(current>=0){[dock[slot],dock[current]]=[dock[current],dock[slot]];}
 else dock[slot]=id;
 saveDock();return true;
}
let state=load(),editing=false,menu=false,change=()=>{};
const widgetKey='agenthq-home-personal-widgets-v1';
const noteKey=owner=>'agenthq-home-notes-v1:'+owner;
let homeNoteOwner=null;
function savedHomeNotes(){
 if(!homeNoteOwner)return [];
 const cloud=window.agentHQNotesCloud;
 if(cloud?.owner?.()===homeNoteOwner&&cloud.loaded?.())return cloud.list();
 try{const list=JSON.parse(localStorage.getItem(noteKey(homeNoteOwner))||'[]');return Array.isArray(list)?list.slice(0,100):[]}catch{return []}
}
function personal(){
 try{const p=JSON.parse(localStorage.getItem(widgetKey)||'{}')||{};return {...p,notes:savedHomeNotes()}}catch{return {notes:savedHomeNotes()}}
}
function putPersonal(part){
 try{
  if(Object.hasOwn(part,'notes')){
   if(!homeNoteOwner){window.alert('Sign in to Agent HQ before saving private Notes.');return}
   localStorage.setItem(noteKey(homeNoteOwner),JSON.stringify(part.notes));
   window.dispatchEvent(new Event('agenthq-home-notes-changed'));
  }else localStorage.setItem(widgetKey,JSON.stringify({...personal(),...part,notes:undefined}));
 }catch{}
}
function setHomeNoteOwner(owner){
 homeNoteOwner=owner||null;
 if(homeNoteOwner){
  try{
   const legacy=JSON.parse(localStorage.getItem(widgetKey)||'{}')||{};
   if(Array.isArray(legacy.notes)&&legacy.notes.length){
    const current=JSON.parse(localStorage.getItem(noteKey(homeNoteOwner))||'[]');
    if(!Array.isArray(current)||!current.length)localStorage.setItem(noteKey(homeNoteOwner),JSON.stringify(legacy.notes.slice(0,100)));
    delete legacy.notes;
    localStorage.setItem(widgetKey,JSON.stringify(legacy));
   }
  }catch{}
 }
 change();
}
agentCloud.auth.onAuthStateChange((_event,session)=>setHomeNoteOwner(session?.user?.id||null));
agentCloud.auth.getUser().then(({data})=>setHomeNoteOwner(data?.user?.id||null)).catch(()=>{});
const dateLabel=()=>new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(new Date());
const timeLabel=()=>new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date());
function clockFace(){const now=new Date(),hour=(now.getHours()%12+now.getMinutes()/60)*30,minute=now.getMinutes()*6;return `<span class="widget-analog" role="img" aria-label="${esc(timeLabel())}"><i class="widget-hour" style="transform:translateX(-50%) rotate(${hour}deg)"></i><i class="widget-minute" style="transform:translateX(-50%) rotate(${minute}deg)"></i><b></b></span>`}
let activeWidget=null,editingNoteId=null,weatherPending=false,calendarOffset=0;
let secretaryCalendarItems=[],secretaryReminders=[],secretaryCalendarZone='America/New_York',secretaryCalendarNote='Open Calendar to load Eleanor’s saved appointments.';
function calendarWhen(item){
 const v=item.kind==='meeting'?item.scheduled_at:item.due_at;
 return v?new Date(v).getTime():Infinity;
}
function calendarEntries(){
 const now=Date.now()-3600000;
 const upcoming=secretaryCalendarItems.filter(i=>Number.isFinite(calendarWhen(i))&&calendarWhen(i)>=now).slice(0,12);
 const tasks=secretaryCalendarItems.filter(i=>i.kind==='task').slice(0,12);
 const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:secretaryCalendarZone,weekday:'short'}).format(new Date()));
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:secretaryCalendarZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const routines=secretaryReminders.filter(i=>routineDue(i,today)&&(i.data?.repeat==='none'?Boolean(i.next_due_at)&&new Intl.DateTimeFormat('en-CA',{timeZone:secretaryCalendarZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(i.next_due_at))===today:true)).slice(0,12);
 const proposals=window.agentHQNotesCloud?.list?.().filter(n=>n.review_status==='pending').length||0;
 const fmt=when=>new Intl.DateTimeFormat('en-US',{timeZone:secretaryCalendarZone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(when));
 const appointments=upcoming.length?'<div class="widget-secretary-events"><h3>Upcoming on Agent HQ Calendar</h3>'+
   upcoming.map(i=>'<p><strong>'+esc(i.title)+'</strong><small>'+esc(fmt(calendarWhen(i)))+' · '+esc(i.kind==='meeting'?'Appointment':'Task deadline')+'</small></p>').join('')+'</div>':
   '<p class="widget-secretary-events">'+esc(secretaryCalendarNote)+'</p>';
 const actionList='<div class="widget-secretary-events"><h3>Open work Eleanor can track</h3>'+
   (tasks.length?tasks.map(i=>'<p><strong>'+esc(i.title)+'</strong><small>'+esc(i.due_at?'Due '+fmt(calendarWhen(i)):'No deadline specified')+'</small><button type="button" data-calendar-task-complete="'+esc(i.id)+'">Mark completed</button></p>').join(''):'<p>No open internal tasks.</p>')+'</div>';
 const daily='<div class="widget-secretary-events"><h3>Today’s Agent HQ reminders</h3>'+(routines.length?routines.map(i=>'<p><strong>'+esc(i.title)+'</strong><small>'+esc(String(i.local_time||'').slice(0,5))+' · '+esc(i.timezone||secretaryCalendarZone)+'</small>'+(i.title.toLowerCase()==='eleanor daily check-in'?'<button type="button" data-home-internal-checkin>Answer Eleanor’s check-in</button>':'')+'</p>').join(''):'<p>No scheduled reminders today.</p>')+'</div>';
 return appointments+daily+actionList+(proposals?'<p>'+proposals+' Note proposal(s) need your decision. <button type="button" data-home-internal-notes-review>Review with Eleanor</button></p>':'')+
 '<p class="personal-muted">These are saved Agent HQ appointments and tasks. Marking completed updates Eleanor’s internal register, not an outside calendar.</p>';
}
async function completeCalendarTask(id){
 if(!confirm('Have you completed this task? Marking it done updates Eleanor’s Agent HQ records.'))return;
 const {data:auth}=await agentCloud.auth.getUser();
 if(!auth?.user)throw Error('Sign into Agent HQ before updating the Calendar.');
 const {data:current,error}=await agentCloud.functions.invoke('agent-secretary',{body:{action:'state'}});
 if(error||current?.error||current?.settings?.owner_id!==auth.user.id)throw Error('Could not verify the current Agenda.');
 const task=(current.items||[]).find(i=>i.id===id&&i.kind==='task'&&i.status==='active');
 if(!task)throw Error('This task is no longer open.');
 const {data:saved,error:saveError}=await agentCloud.functions.invoke('agent-secretary',{body:{action:'apply',request_id:crypto.randomUUID(),version:current.settings.version,operations:[{op:'control_item',id,status:'completed'}]}});
 if(saveError||saved?.error)throw Error(saved?.error||'Eleanor could not confirm that task was completed.');
 window.dispatchEvent(new CustomEvent('agenthq-secretary-state-invalidated',{detail:{owner_id:auth.user.id}}));
 await refreshSecretaryCalendar();
}
async function refreshSecretaryCalendar(){
 try{
  const {data:auth,error:authError}=await agentCloud.auth.getUser();
  if(authError||!auth?.user)throw Error('Sign in to see your private calendar entries.');
  const {data,error}=await agentCloud.functions.invoke('agent-secretary',{body:{action:'state'}});
  if(error||data?.error||!data?.settings||data.settings.owner_id!==auth.user.id)throw Error('Could not verify Eleanor’s saved calendar.');
  secretaryCalendarZone=data.settings.timezone||'America/New_York';
  secretaryReminders=(data.items||[]).filter(i=>i.status==='active'&&i.kind==='reminder').sort((a,b)=>String(a.local_time||'').localeCompare(String(b.local_time||'')));
  secretaryCalendarItems=(data.items||[]).filter(i=>i.status==='active'&&(i.kind==='meeting'||i.kind==='task')).sort((a,b)=>calendarWhen(a)-calendarWhen(b)).slice(0,40);
  secretaryCalendarNote='No upcoming saved appointments or task deadlines.';
 }catch(error){secretaryCalendarItems=[];secretaryReminders=[];secretaryCalendarNote=String(error?.message||'Calendar could not load.');}
 if(activeWidget==='calendar')change();
}
window.addEventListener('agenthq-secretary-state',event=>{
 const data=event.detail?.state;
 if(!data?.settings?.owner_id)return;
 secretaryCalendarZone=data.settings.timezone||'America/New_York';
 secretaryReminders=(data.items||[]).filter(i=>i.status==='active'&&i.kind==='reminder').sort((a,b)=>String(a.local_time||'').localeCompare(String(b.local_time||'')));
 secretaryCalendarItems=(data.items||[]).filter(i=>i.status==='active'&&(i.kind==='meeting'||i.kind==='task')).sort((a,b)=>calendarWhen(a)-calendarWhen(b)).slice(0,40);
 secretaryCalendarNote='No upcoming saved appointments or task deadlines.';
 if(activeWidget==='calendar')change();
});
agentCloud.auth.onAuthStateChange(()=>{secretaryCalendarItems=[];secretaryReminders=[];secretaryCalendarNote='Open Calendar to load Eleanor’s saved appointments.';if(activeWidget==='calendar')change();});
function monthView(){const today=new Date(),first=new Date(today.getFullYear(),today.getMonth()+calendarOffset,1),offset=first.getDay(),days=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();return `<div class="widget-month-head"><button type="button" data-widget-month="-1" aria-label="Previous month">‹</button><strong>${esc(new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(first))}</strong><button type="button" data-widget-month="1" aria-label="Next month">›</button></div><div class="widget-month-grid">${['S','M','T','W','T','F','S'].map(d=>`<small>${d}</small>`).join('')}${Array.from({length:offset},()=>'<span></span>').join('')}${Array.from({length:days},(_,i)=>`<span class="${calendarOffset===0&&i+1===today.getDate()?'today':''}">${i+1}</span>`).join('')}</div>`}
function weatherLabel(){const w=personal().weather;if(!Number.isFinite(w?.temperature))return 'Choose a city';const c=weatherCondition(w.code,w.isDay);return c.icon+' '+Math.round(w.temperature)+'° · '+c.label+' · '+w.city;}
function weatherForecast(days){return (days||[]).map(d=>'<div class="home-forecast-day"><span>'+esc(d.day)+'</span><span class="home-forecast-symbol" role="img" aria-label="'+esc(weatherCondition(d.code).label)+'">'+weatherCondition(d.code).icon+'</span><strong>'+Math.round(d.high)+'°</strong><small>'+Math.round(d.low)+'° low'+(Number.isFinite(d.rainChance)?' · '+Math.round(d.rainChance)+'% rain':'')+'</small></div>').join('')}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
const update=()=>{rebalancePages(state.pages);save();change()};
function tile(id,renderButton){
 const def=APPS.find(p=>p[0]===id);if(!def)return "";
 const html=renderButton(def[1],def[0],def[2])
  .replace('class="tile"','class="tile" data-home-tile="'+id+'"')
  .replace(/(<span class="tile-label">)[\s\S]*?(<\/span>)/,(_f,a,b)=>a+esc(LABELS[id]||def[1])+b);
 return '<div class="home-tile-wrap" data-home-item="'+id+'">'+html+'</div>';
}
function widget(kind,values){
 const p=personal();
 if(['notes','calendar','weather','clock','status'].includes(kind)){
  const titles={notes:'Notes',calendar:'Calendar',weather:'Weather',clock:'Clock',status:'Status'};
  const bodies={notes:p.notes?.length?esc(p.notes[0].text.slice(0,90)):'Tap to write a note',calendar:dateLabel(),weather:esc(weatherLabel()),clock:p.analog?clockFace():timeLabel(),status:`${Number(values.assignments||0)} assignments · ${Number(values.messages||0)} messages`};
  const forecast=kind==='weather'&&p.weather?.days?.length?'<span class="home-weather-days">'+p.weather.days.slice(0,4).map(d=>`<span>'+weatherCondition(d.code).icon+' '+esc(d.day)+'<br>'+Math.round(d.high)+'°</span>`).join('')+'</span>':'';
  return `<div class="home-widget home-widget--${kind}">${editing?`<button class="home-widget-remove" type="button" data-home-remove-widget="${kind}" aria-label="Remove ${titles[kind]} widget">×</button>`:''}<button type="button" class="home-widget-open" data-home-widget-open="${kind}" data-home-widget-tile="${kind}"><span class="home-widget-name">${titles[kind]}</span><strong class="home-widget-summary" data-widget-summary="${kind}">${bodies[kind]}</strong>${forecast}<small>${kind==='weather'?'Weather: Open-Meteo':kind==='notes'?`${p.notes?.length||0} saved notes`:kind==='calendar'?'Tap for assignments':kind==='clock'?'Tap to change clock':'Tap for current work'}</small></button></div>`;
 }
 const c={
  inbox:["Messages","💬",values.messages||0,"Unread messages and approvals","messages"],
  approvals:["Approvals","✅",values.approvals||0,"Requests waiting for your decision","approvals"],
  work:["Assignments","📋",values.assignments||0,"Tasks needing attention","assignments"],
  research:["Research","🔎",values.research||0,"Completed saved research reports","research"]
 }[kind];if(!c)return "";
 return '<div class="home-widget">'+(editing?'<button class="home-widget-remove" type="button" data-home-remove-widget="'+kind+'" aria-label="Remove '+c[0]+' widget">×</button>':"")+
 '<button type="button" class="home-widget-open" data-home-widget-nav="'+c[4]+'" data-home-widget-tile="'+kind+'"><span class="home-widget-name">'+c[1]+' '+c[0]+'</span><strong class="home-widget-count">'+Number(c[2])+'</strong><small>'+c[3]+'</small></button></div>';
}
function slide(index,renderButton,values){
 const page=state.pages[index]||empty();
 const available=[...page.apps,...page.widgets.map(k=>'widget:'+k)],order=[...new Set((page.order||[]).filter(x=>available.includes(x)).concat(available))];
 return '<section class="home-slide" data-home-slide="'+index+'" aria-label="Home page '+(index+1)+'"><div class="grid home-dashboard'+(editing?" home-is-editing":"")+'" role="navigation" aria-label="Home apps and widgets">'+order.map(id=>id.startsWith('widget:')?'<div class="home-tile-wrap home-widget-wrap" data-home-item="'+id+'">'+widget(id.slice(7),values)+'</div>':tile(id,renderButton)).join("")+'</div></section>';
}
let lastRenderButton=null,lastValues={};
export function renderHomeScreen(renderButton,values={}){
 lastRenderButton=renderButton;lastValues=values;
 const paging=state.pages.map((_p,i)=>'<button type="button" data-home-page="'+i+'" class="home-page-dot'+(i===state.current?" active":"")+'" aria-label="Home page '+(i+1)+'" aria-current="'+(i===state.current?"page":"false")+'"></button>').join("");
 return '<section class="home-pages" aria-label="Home Screen">'+
 (editing?'<div class="home-toolbar is-editing"><button type="button" data-home-widget-menu class="home-add-widget-circle" aria-label="Add a widget">+</button><button type="button" data-home-edit class="home-edit-toggle">Done</button></div>':"")+
 '<div class="home-slide-viewport"><div class="home-slide-track" style="transform:translate3d(-'+(state.current*100)+'%,0,0)">'+state.pages.map((_p,i)=>slide(i,renderButton,values)).join("")+'</div></div>'+
 (editing?'<div class="home-widget-picker">'+
 (menu?'<div class="home-widget-choices">'+kinds.map(k=>'<button type="button" data-home-add-widget="'+k+'">'+esc(({work:'Assignments',inbox:'Messages',research:'Research',approvals:'Approvals',notes:'Notes',calendar:'Calendar',weather:'Weather',clock:'Clock',status:'Status'})[k])+'</button>').join("")+'</div>':"")+
 (state.pages.length<6?'<button type="button" data-home-add-page>+ Add Home Page</button>':"")+
 (state.pages.length>1?'<button type="button" data-home-remove-page>Remove Empty Page</button>':"")+'</div>':"")+
 '<div class="home-page-navigation"><div class="home-page-dots">'+paging+'</div></div><nav class="home-dock" aria-label="Favorite apps">'+dock.map(id=>'<button type="button" data-nav="'+id+'" aria-label="'+esc(LABELS[id])+'"><span class="app-icon app-icon--'+id+'">'+(window.AgentHQIcons?.svg(id)||APPS.find(a=>a[0]===id)?.[2]||'')+'</span></button>').join('')+'</nav>'+
 (editing?'<div class="home-dock-editor"><strong>Customize bottom apps</strong><p>Choose any app for each position. Choosing one already on the dock swaps its position.</p>'+dock.map((id,slot)=>'<label>Position '+(slot+1)+' <select data-home-dock-slot="'+slot+'">'+APPS.map(a=>'<option value="'+a[0]+'"'+(id===a[0]?' selected':'')+'>'+esc(a[1])+'</option>').join('')+'</select></label><div class="home-dock-move">'+(slot>0?'<button type="button" data-home-dock-move="'+slot+'" data-home-dock-direction="-1" aria-label="Move app left">←</button>':'')+(slot<3?'<button type="button" data-home-dock-move="'+slot+'" data-home-dock-direction="1" aria-label="Move app right">→</button>':'')+'</div>').join('')+'</div>':'')+widgetPanel()+'</section>';
}
function widgetPanel(){if(!activeWidget)return '';
 const p=personal(),kind=activeWidget,heading=esc(kind[0].toUpperCase()+kind.slice(1));let body='';
 if(kind==='notes')body=`<form data-widget-note-form><label for="home-note">New Agent HQ note</label><textarea id="home-note" maxlength="2000" required placeholder="What do you want Eleanor to help you remember or work on?"></textarea><button type="submit">Save note</button></form><p class="personal-muted">Private Agent HQ Notes sync across your signed-in devices. Eleanor proposes tasks, calendar entries or projects when a note suggests work.</p>${editingNoteId?(()=>{const n=(p.notes||[]).find(x=>x.id===editingNoteId);return n?'<form data-widget-edit-note-form="'+esc(n.id)+'"><label>Edit saved note<textarea name="text" maxlength="2000" required>'+esc(n.text)+'</textarea></label><button type="submit">Save changes</button><button type="button" data-widget-edit-cancel>Cancel</button></form>':''})():''}<div class="widget-note-list">${(p.notes||[]).map((n,i)=>`<div class="widget-note"><p>${esc(n.text)}</p><small>${esc(n.date)}${n.review_status==='pending'?' · Eleanor has a proposal':''}</small><button type="button" data-widget-edit-note="${esc(n.id||'')}" aria-label="Edit note">Edit</button><button type="button" data-widget-delete-note="${i}" aria-label="Delete note">×</button></div>`).join('')}</div><button type="button" data-home-internal-notes-review>Review Eleanor’s notes proposals</button>`;
 if(kind==='calendar')body=`<div class="widget-date">Today: ${esc(new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date()))}</div>${monthView()}${calendarEntries()}<button type="button" data-home-widget-nav="assignments">View assignments (${Number(lastValues.assignments||0)})</button><button type="button" data-home-internal-calendar>Open Agent HQ Calendar</button>`;
 if(kind==='weather')body=`<form data-widget-weather-form><label for="home-weather-city">City or ZIP code</label><input id="home-weather-city" name="city" autocomplete="address-level2" required value="${esc(p.city||'Columbus, Ohio')}" placeholder="Columbus, Ohio"><button type="submit">Update weather</button></form><button type="button" data-widget-location>Use my location</button><div class="home-weather-conditions" data-weather-result role="status"><span class="home-weather-large" role="img" aria-label="${esc(weatherCondition(p.weather?.code,p.weather?.isDay).label)}">${p.weather?weatherCondition(p.weather.code,p.weather.isDay).icon:'🌤️'}</span><strong>${p.weather?Math.round(p.weather.temperature)+'°F':'Weather'}</strong><span>${esc(p.weather?weatherCondition(p.weather.code,p.weather.isDay).label+' · '+p.weather.city:'Choose a city for current weather')}</span>${Number.isFinite(p.weather?.wind)?'<small>Wind '+Math.round(p.weather.wind)+' mph</small>':''}</div><div class="widget-forecast">${weatherForecast(p.weather?.days)}</div><small>Open-Meteo forecast · condition symbols follow its weather codes. Refresh for current conditions.</small>`;
 if(kind==='clock')body=`<div class="widget-clock-face" data-widget-clock-face>${p.analog?clockFace():timeLabel()}</div><button type="button" data-widget-clock-toggle>Switch to ${p.analog?'digital':'analog'}</button>`;
 if(kind==='status')body=`<p>${Number(lastValues.assignments||0)} assignments need attention</p><p>${Number(lastValues.messages||0)} unread messages</p><p>${Number(lastValues.approvals||0)} approvals waiting</p><button type="button" data-home-widget-nav="operations">Open Operations</button>`;
 return `<div class="widget-sheet-backdrop" data-widget-close><section class="widget-sheet" role="dialog" aria-modal="true" aria-label="${heading}"><header><h2>${heading}</h2><button type="button" data-widget-close aria-label="Close ${heading}">Done</button></header>${body}</section></div>`;
}
const root=()=>document.querySelector(".home-pages");
const track=()=>root()?.querySelector(".home-slide-track");
const gridAt=i=>root()?.querySelector('[data-home-slide="'+i+'"] .home-dashboard');
const clock=()=>Date.now();
let gesture=null,drag=null,holdTimer=null,edgeTimer=null,edgeDirection=0,ignoreClicksUntil=0,swipe=null,frame=0;
const reflows=new WeakMap();let dropping=false;
const reducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
export const homeDragInProgress=()=>Boolean(gesture||drag||dropping||swipe?.moving);
function clearHold(){if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null}}
function clearEdge(){if(edgeTimer!==null){clearTimeout(edgeTimer);edgeTimer=null}edgeDirection=0}
function setTrackPosition(page,animate=true,offset=0){
 const el=track();if(!el)return;
 el.style.transition=animate&&!reducedMotion()?"transform .46s cubic-bezier(.22,.72,.22,1)":"none";
 el.style.transform='translate3d(calc(-'+(page*100)+'% + '+offset+'px),0,0)';
}
function showPage(index,animated=true){
 state.current=Math.max(0,Math.min(state.pages.length-1,index));save();
 setTrackPosition(state.current,animated);
 for(const dot of root()?.querySelectorAll("[data-home-page]")||[]){
  const current=Number(dot.dataset.homePage)===state.current;
  dot.classList.toggle("active",current);
  dot.setAttribute("aria-current",current?"page":"false");
 }
}
function action(target){
 if(target.closest('[data-home-edit]')){finishDrag();editing=false;menu=false;update();return true}
 const page=target.closest('[data-home-page]');
 if(page){if(!drag)showPage(Number(page.dataset.homePage));return true}
 const add=target.closest('[data-home-add-page]');
 if(add){if(state.pages.length<6){state.pages.push(empty());state.current=state.pages.length-1;update()}return true}
 if(target.closest('[data-home-remove-page]')){
  const page=state.pages[state.current];
  if(state.pages.length<=1)return true;
  if(page.apps.length||page.widgets.length){window.alert('Move the apps and remove widgets before removing this page.');return true}
  state.pages.splice(state.current,1);state.current=Math.min(state.current,state.pages.length-1);update();return true
 }
 if(target.closest('[data-home-widget-menu]')){menu=!menu;update();return true}
 const addWidget=target.closest('[data-home-add-widget]');
 if(addWidget){const kind=addWidget.dataset.homeAddWidget,p=state.pages[state.current];if(kinds.includes(kind)&&p.widgets.length<9&&!p.widgets.includes(kind)){p.widgets.push(kind);(p.order||(p.order=[])).push('widget:'+kind)}menu=false;update();return true}
 const removeWidget=target.closest('[data-home-remove-widget]');
 if(removeWidget){const p=state.pages[state.current],kind=removeWidget.dataset.homeRemoveWidget;p.widgets=p.widgets.filter(k=>k!==kind);p.order=(p.order||[]).filter(x=>x!=='widget:'+kind);update();return true}
 const openWidget=target.closest('[data-home-widget-open]');
 if(openWidget){if(!editing){activeWidget=openWidget.dataset.homeWidgetOpen;change();if(activeWidget==='calendar')void refreshSecretaryCalendar();if(activeWidget==='weather'){const p=personal(),w=p.weather;if(!w?.updatedAt||Date.now()-w.updatedAt>45*60000){if(w?.lat!==undefined&&w?.lon!==undefined)void fetchWeather(w.lat,w.lon,w.city);else void findWeather(p.city||'Columbus, Ohio')}}}return true}
 if(target.matches('[data-widget-close]')){activeWidget=null;change();return true}
 if(target.closest('[data-widget-edit-note]')){editingNoteId=target.closest('[data-widget-edit-note]').dataset.widgetEditNote;change();return true}
 if(target.closest('[data-widget-edit-cancel]')){editingNoteId=null;change();return true}
 if(target.closest('[data-widget-delete-note]')){
  const i=Number(target.closest('[data-widget-delete-note]').dataset.widgetDeleteNote),note=personal().notes?.[i];
  if(!note?.id){window.alert('This note is still syncing. Try again after it has saved to Agent HQ.');return true}
  window.agentHQNotesCloud?.remove(note.id).catch(error=>window.alert(String(error?.message||error)));
  return true;
 }
 const dockMove=target.closest('[data-home-dock-move]');
 if(dockMove&&editing){const slot=Number(dockMove.dataset.homeDockMove),next=slot+Number(dockMove.dataset.homeDockDirection);if(next>=0&&next<4){[dock[slot],dock[next]]=[dock[next],dock[slot]];saveDock();change()}return true;}
 if(target.closest('[data-widget-clock-toggle]')){putPersonal({analog:!personal().analog});change();return true}
 const finished=target.closest('[data-calendar-task-complete]');
 if(finished){void completeCalendarTask(finished.dataset.calendarTaskComplete).catch(error=>window.alert(String(error?.message||error)));return true;}
 if(target.closest('[data-widget-month]')){calendarOffset+=Number(target.closest('[data-widget-month]').dataset.widgetMonth);change();return true}
 if(target.closest('[data-widget-location]')){navigator.geolocation?.getCurrentPosition(pos=>fetchWeather(pos.coords.latitude,pos.coords.longitude,'Current location'),()=>{const el=root()?.querySelector('[data-weather-result]');if(el)el.textContent='Location unavailable. Enter a city instead.'},{timeout:10000});return true}
 if(target.closest('[data-home-internal-notes-review]')){
  if(!editing){activeWidget=null;window.dispatchEvent(new Event('agenthq-secretary-show-notes'));
   const button=document.createElement('button');button.dataset.nav='reminders';document.querySelector('#app')?.append(button);button.click();button.remove()}
  return true;
 }
 if(target.closest('[data-home-internal-checkin]')){
  if(!editing){activeWidget=null;window.dispatchEvent(new Event('agenthq-secretary-show-checkin'));
   const button=document.createElement('button');button.dataset.nav='reminders';document.querySelector('#app')?.append(button);button.click();button.remove()}
  return true;
 }
 if(target.closest('[data-home-internal-calendar]')){
  if(!editing){activeWidget=null;window.dispatchEvent(new Event('agenthq-secretary-show-meetings'));
   const button=document.createElement('button');button.dataset.nav='reminders';document.querySelector('#app')?.append(button);button.click();button.remove()}
  return true;
 }
 const widgetLink=target.closest('[data-home-widget-nav]');
 if(widgetLink){if(!editing){activeWidget=null;const button=document.createElement('button');button.dataset.nav=widgetLink.dataset.homeWidgetNav;document.querySelector('#app')?.append(button);button.click();button.remove()}return true}
 return Boolean(editing&&target.closest('[data-home-tile]'));
}
let lastWeatherRefresh=0;
async function fetchWeather(lat,lon,city){
 if(weatherPending)return;weatherPending=true;
 const el=root()?.querySelector('[data-weather-result]');if(el)el.textContent='Updating actual conditions…';
 try{
  const response=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lon)+
   '&current=temperature_2m,weather_code,is_day,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max'+
   '&forecast_days=5&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph');
  if(!response.ok)throw Error('Weather service unavailable');
  const data=await response.json();if(!Number.isFinite(data.current?.temperature_2m))throw Error('Weather data not returned.');
  const days=(data.daily?.time||[]).map((date,i)=>({day:new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')),
   high:Number(data.daily.temperature_2m_max?.[i]),low:Number(data.daily.temperature_2m_min?.[i]),
   code:data.daily.weather_code?.[i],rainChance:Number(data.daily.precipitation_probability_max?.[i])}))
   .filter(d=>Number.isFinite(d.high)&&Number.isFinite(d.low));
  lastWeatherRefresh=Date.now();
  putPersonal({weather:{temperature:data.current.temperature_2m,code:data.current.weather_code,
   isDay:data.current.is_day,wind:Number(data.current.wind_speed_10m),city,lat,lon,days,updatedAt:lastWeatherRefresh}});
  change();
 }catch(error){const target=root()?.querySelector('[data-weather-result]');if(target)target.textContent=String(error.message||'Weather could not load.')}
 finally{weatherPending=false}
}
async function findWeather(city){const result=root()?.querySelector('[data-weather-result]');if(result)result.textContent='Finding city…';try{const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name='+encodeURIComponent(city));if(!response.ok)throw Error();const place=(await response.json()).results?.[0];if(!place)throw Error();putPersonal({city});await fetchWeather(place.latitude,place.longitude,place.name)}catch{const el=root()?.querySelector('[data-weather-result]');if(el)el.textContent='City not found. Try a city and state.'}}
function sourceTile(){return drag?.source||null}
function animateReflow(grid,before){
 for(const el of grid.querySelectorAll(':scope > [data-home-item]')){
  if(el===sourceTile())continue;
  const first=before.get(el);if(!first)continue;
  const previous=reflows.get(el);if(previous)previous.cancel();
  const next=el.getBoundingClientRect();
  const dx=first.left-next.left,dy=first.top-next.top;
  if(Math.abs(dx)+Math.abs(dy)<1)continue;
  if(!reducedMotion()&&typeof el.animate==='function'){
   const animation=el.animate([{transform:'translate3d('+dx+'px,'+dy+'px,0)'},{transform:'translate3d(0,0,0)'}],
    {duration:330,easing:'cubic-bezier(.2,.75,.2,1)'});
   reflows.set(el,animation);
  }
 }
}
function animateGhost(){
 frame=0;if(!drag)return;
 drag.ghost.style.transform='translate3d('+(drag.x-drag.offsetX)+'px,'+(drag.y-drag.offsetY)+'px,0) scale(1.07)';
 reorderAt(drag.x,drag.y);edgeAt(drag.x);
}
function setGhostPosition(x,y){if(!drag)return;drag.x=x;drag.y=y;if(!frame)frame=requestAnimationFrame(animateGhost)}
function activateHeld(){
 if(!gesture||swipe?.moving)return;
 clearHold();editing=true;menu=false;ignoreClicksUntil=clock()+800;
 const id=gesture.id,source=gesture.element;
 if(!id||!source?.isConnected){update();return}
 const rect=source.getBoundingClientRect(),ghost=source.cloneNode(true);
 ghost.removeAttribute('data-home-item');ghost.querySelector('[data-home-tile]')?.removeAttribute('data-home-tile');ghost.querySelector('[data-home-widget-tile]')?.removeAttribute('data-home-widget-tile');
 ghost.classList.add('home-drag-ghost');ghost.setAttribute('aria-hidden','true');
 ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';
 document.body.append(ghost);
 // Do not redraw the held element: Safari would cancel its original touch stream.
 root()?.querySelectorAll('.home-dashboard').forEach(g=>g.classList.add('home-is-editing'));
 drag={id,source,ghost,offsetX:gesture.startX-rect.left,offsetY:gesture.startY-rect.top,x:gesture.x,y:gesture.y};
 source.classList.add('home-drag-placeholder');
 setGhostPosition(gesture.x,gesture.y);
 if(navigator.vibrate)try{navigator.vibrate(10)}catch{}
}
function reorderAt(x,y){
 if(!drag)return;
 const grid=gridAt(state.current),source=sourceTile();if(!grid||!grid.contains(source))return;
 const under=document.elementFromPoint(x,y);
 const hovered=under?.closest?.('.home-dashboard [data-home-item]');
 const bounds=grid.getBoundingClientRect();
 if(x<bounds.left-12||x>bounds.right+12||y<bounds.top-12||y>bounds.bottom+12)return;
 const all=[...grid.querySelectorAll(':scope > [data-home-item]')];
 // Ignore neighbors' temporary animation transforms when choosing a drop slot.
 let target=hovered,distance=Infinity;
 for(const item of all){
  if(!item.offsetWidth)continue;
  const cx=bounds.left+item.offsetLeft+item.offsetWidth/2,cy=bounds.top+item.offsetTop+item.offsetHeight/2;
  const d=Math.hypot(x-cx,y-cy);if(d<distance){target=item;distance=d}
 }
 if(!target||target===source||!grid.contains(target))return;
 const from=all.indexOf(source),to=all.indexOf(target);if(from<0||to<0)return;
 const before=new Map(all.map(el=>[el,el.getBoundingClientRect()]));
 if(from<to)target.after(source);else target.before(source);
 animateReflow(grid,before);
}
function commitGridOrders(){
 for(let i=0;i<state.pages.length;i++){
  const grid=gridAt(i);if(grid){const ids=[...grid.querySelectorAll(':scope > [data-home-item]')].map(e=>e.dataset.homeItem);state.pages[i].order=ids;state.pages[i].apps=ids.filter(id=>valid.has(id));state.pages[i].widgets=ids.filter(id=>id.startsWith('widget:')).map(id=>id.slice(7)).filter(k=>kinds.includes(k))}
 }
}
function switchDragPage(direction){
 if(!drag)return;
 const next=state.current+direction;
 if(next<0||next>=6)return;
 if(next===state.pages.length){
  state.pages.push(empty());
  const slideDOM=document.createElement('section');
  slideDOM.className='home-slide';slideDOM.dataset.homeSlide=String(next);slideDOM.setAttribute('aria-label','Home page '+(next+1));
  slideDOM.innerHTML='<div class="grid home-dashboard home-is-editing" role="navigation" aria-label="Home apps"></div>';
  track()?.append(slideDOM);
 }
 const src=gridAt(state.current),dst=gridAt(next),source=sourceTile();
 if(!src||!dst||!source)return;
 const before=new Map([...dst.children].map(el=>[el,el.getBoundingClientRect()]));
 if(direction>0)dst.prepend(source);else dst.append(source);
 animateReflow(dst,before);
 commitGridOrders();
 showPage(next,true);setGhostPosition(drag.x,drag.y);
}
function edgeAt(x){
 if(!drag)return;
 const w=window.innerWidth||390,band=Math.max(30,Math.min(55,w*.12));
 const wanted=x<band?-1:x>w-band?1:0;
 if(!wanted){clearEdge();return}
 if(wanted===edgeDirection)return;
 clearEdge();edgeDirection=wanted;
 if((wanted<0&&state.current===0)||(wanted>0&&state.current>=5))return;
 edgeTimer=setTimeout(()=>{const direction=edgeDirection;clearEdge();if(direction) switchDragPage(direction)},550);
}
function moveHeld(x,y){
 if(!gesture)return;
 gesture.x=x;gesture.y=y;
 if(drag){setGhostPosition(x,y);return}
 const dx=x-gesture.startX,dy=y-gesture.startY;
 if(holdTimer!==null&&Math.hypot(dx,dy)>10)clearHold();
}
function finishDrag(){
 clearHold();clearEdge();
 if(frame){cancelAnimationFrame(frame);frame=0}
 if(drag){
  reorderAt(drag.x,drag.y);commitGridOrders();const held=drag,slot=held.source.getBoundingClientRect();
  drag=null;dropping=true;ignoreClicksUntil=clock()+350;gesture=null;
  const finish=()=>{held.source.classList.remove('home-drag-placeholder');held.ghost.remove();dropping=false;update()};
  if(!reducedMotion()&&typeof held.ghost.animate==='function'){
   held.ghost.animate([{transform:held.ghost.style.transform},{transform:'translate3d('+slot.left+'px,'+slot.top+'px,0) scale(1)'}],{duration:210,easing:'cubic-bezier(.22,.85,.25,1)',fill:'forwards'}).finished.then(finish,finish);
  }else finish();
  return;
 }
 gesture=null;
}
function startHold(tile,x,y){
 if(gesture||drag||dropping)return;
 gesture={id:tile?.dataset.homeTile||tile?.dataset.homeWidgetTile||null,element:tile?.closest('[data-home-item]')||null,startX:x,startY:y,x,y};
 if(editing&&gesture.id)activateHeld();
 else if(!editing&&gesture.id)holdTimer=setTimeout(activateHeld,480);
}
function cancelHold(){clearHold();gesture=null}
function startSwipe(x,y){
 swipe={x,y,lastX:x,lastY:y,lastTime:clock(),moving:false};
}
function progressSwipe(x,y,event){
 if(!swipe||drag||editing)return;
 const dx=x-swipe.x,dy=y-swipe.y;
 if(!swipe.moving){
  if(Math.abs(dx)<9&&Math.abs(dy)<9)return;
  if(Math.abs(dx)<=Math.abs(dy)*1.15){swipe=null;return}
  swipe.moving=true;cancelHold();
 }
 if(event?.cancelable)event.preventDefault();
 const w=root()?.clientWidth||window.innerWidth||390;
 let offset=dx;
 if((state.current===0&&dx>0)||(state.current===state.pages.length-1&&dx<0))offset=dx*.24;
 setTrackPosition(state.current,false,offset);
 swipe.lastX=x;swipe.lastTime=clock();
}
function finishSwipe(x,y){
 if(!swipe)return;
 const s=swipe;swipe=null;
 if(!s.moving)return;
 const dx=x-s.x,w=root()?.clientWidth||window.innerWidth||390;
 const direction=Math.abs(dx)>Math.min(60,w*.17)?(dx<0?1:-1):0;
 showPage(state.current+direction,true);
 ignoreClicksUntil=clock()+350;
}
let connected=false;
function init(){
 if(connected)return;connected=true;
 document.addEventListener('submit',async event=>{
  if(event.target.matches('[data-widget-note-form]')){
  event.preventDefault();const form=event.target,field=form.querySelector('textarea'),text=field?.value.trim();
  if(!text)return;const button=form.querySelector('[type=submit]');
  if(button.disabled)return;button.disabled=true;
  try{
   if(!window.agentHQNotesCloud?.create)throw Error('Agent HQ Notes service has not loaded.');
   await window.agentHQNotesCloud.create(text);
   change();
  }catch(error){let status=form.querySelector('[data-note-error]');if(!status){status=document.createElement('p');status.dataset.noteError='';form.append(status)}status.textContent=String(error?.message||error);}
  finally{button.disabled=false}
 }
  if(event.target.matches('[data-widget-edit-note-form]')){
   event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]'),text=form.querySelector('textarea')?.value.trim();
   if(!text||button.disabled)return;button.disabled=true;
   try{await window.agentHQNotesCloud.update(form.dataset.widgetEditNoteForm,text);editingNoteId=null;change()}
   catch(error){let p=form.querySelector('[data-note-error]');if(!p){p=document.createElement('p');p.dataset.noteError='';form.append(p)}p.textContent=String(error?.message||error)}
   finally{button.disabled=false}
  }
  if(event.target.matches('[data-widget-weather-form]')){event.preventDefault();const city=event.target.querySelector('input')?.value.trim();if(city)findWeather(city)}
 },true);
 setInterval(()=>{if(!root())return;const p=personal();for(const el of root().querySelectorAll('[data-widget-summary="clock"], [data-widget-clock-face]')){if(p.analog)el.innerHTML=clockFace();else el.textContent=timeLabel()}for(const el of root().querySelectorAll('[data-widget-summary="calendar"]'))el.textContent=dateLabel()},30000);
 document.addEventListener('change',event=>{const selector=event.target.closest?.('[data-home-dock-slot]');if(selector&&editing){if(replaceDock(Number(selector.dataset.homeDockSlot),selector.value))change();event.stopPropagation();}},true);
 document.addEventListener('click',event=>{
  if(!event.target.closest?.('.home-pages'))return;
  if(clock()<ignoreClicksUntil&&!event.target.closest?.('[data-home-edit]')){event.preventDefault();event.stopImmediatePropagation();return}
  if(action(event.target)){event.preventDefault();event.stopImmediatePropagation()}
 },true);
 document.addEventListener('touchstart',event=>{
  if(!event.target.closest?.('.home-pages'))return;
  if(event.touches.length!==1){finishDrag();swipe=null;return}
  const t=event.touches[0],tile=event.target.closest?.('[data-home-tile],[data-home-widget-tile]');
  const interactive=event.target.closest?.('input,textarea,select,summary,.widget-sheet,.home-dock,[data-home-edit],[data-home-add-page],[data-home-page],[data-home-widget-menu],[data-home-widget-nav],[data-home-add-widget],[data-home-remove-widget],[data-home-remove-page]');
  if(interactive)return;
  startSwipe(t.clientX,t.clientY);
  if(tile)startHold(tile,t.clientX,t.clientY);
 },{passive:true});
 document.addEventListener('touchmove',event=>{
  const t=event.touches[0];if(!t)return;
  if(drag){if(event.cancelable)event.preventDefault();moveHeld(t.clientX,t.clientY)}
  else{if(gesture)moveHeld(t.clientX,t.clientY);progressSwipe(t.clientX,t.clientY,event)}
 },{passive:false});
 document.addEventListener('touchend',event=>{
  const t=event.changedTouches[0],hadDrag=!!drag;
  if(hadDrag){finishDrag();swipe=null;return}
  if(gesture)cancelHold();
  if(t)finishSwipe(t.clientX,t.clientY);else swipe=null;
 },{passive:true});
 document.addEventListener('touchcancel',()=>{finishDrag();swipe=null;setTrackPosition(state.current,true)},{passive:true});
 document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0||!event.target.closest?.('.home-pages'))return;
  const tile=event.target.closest('[data-home-tile],[data-home-widget-tile]');if(tile)startHold(tile,event.clientX,event.clientY);
 });
 document.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch')return;if(gesture)moveHeld(event.clientX,event.clientY);
 });
 document.addEventListener('pointerup',event=>{if(event.pointerType==='touch')return;if(drag)finishDrag();else cancelHold()});
 document.addEventListener('pointercancel',event=>{if(event.pointerType!=='touch')finishDrag()});
 document.addEventListener('contextmenu',event=>{
  const tile=event.target.closest?.('.home-pages [data-home-tile],.home-pages [data-home-widget-tile]');if(!tile)return;
  event.preventDefault();if(!drag){if(!gesture)startHold(tile,event.clientX,event.clientY);activateHeld()}
 });
 document.addEventListener('dragstart',event=>{if(event.target.closest?.('.home-pages [data-home-tile],.home-pages [data-home-widget-tile]'))event.preventDefault()});
 document.addEventListener('keydown',event=>{
  if(!root())return;
  if(event.key==='Escape'){if(activeWidget){activeWidget=null;change();return}finishDrag();editing=false;menu=false;update();return}
  const tile=event.target.closest?.('[data-home-tile]');
  if(!tile||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const grid=gridAt(state.current),element=tile.closest('[data-home-item]'),items=[...grid.children],from=items.indexOf(element);
  const columns=Math.max(1,getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
  const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key],to=Math.max(0,Math.min(items.length-1,from+step));
  if(from<to)items[to].after(element);else if(from>to)items[to].before(element);
  commitGridOrders();save();tile.focus();
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){finishDrag();swipe=null}});
}
window.addEventListener('agenthq-home-notes-changed',()=>{if(root())change()});
export function connectHomeScreen(onChange){change=onChange;init()}


