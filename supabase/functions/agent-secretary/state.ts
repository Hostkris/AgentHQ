import {ELEANOR_SPEC,SECRETARY_KINDS,secretaryTime,stateSummary,secretaryDate,smartReminderTime} from '../../../eleanor-secretary-core.js';
import {consultingRequested} from '../../../agent-consulting-policy.js';
export const uuid=(v:any)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
const bounded=(v:any,n:number)=>typeof v==='string'?v.trim().slice(0,n):'';
export async function ensureSecretary(db:any,owner:string,enabled=false){const {data,error}=await db.rpc('ensure_agent_secretary',{p_owner:owner,p_spec:ELEANOR_SPEC,p_enable_brief:enabled});if(error)throw Error('Could not prepare Eleanor’s private records');return data;}
export async function secretaryState(db:any,owner:string){
 const [s,i,d,w,p,g,a,c,checkins,noteProposals,socialAccounts]=await Promise.all([
  db.from('agent_secretary_settings').select('*').eq('owner_id',owner).maybeSingle(),
  db.from('agent_secretary_items').select('*').eq('owner_id',owner).order('status').order('updated_at',{ascending:false}).limit(300),
  db.from('agent_secretary_deliveries').select('id,item_id,item_version,kind,scheduled_at,status,action_state,body,push_state,last_error,saved_at').eq('owner_id',owner).order('scheduled_at',{ascending:false}).limit(100),
  db.from('agent_secretary_workout_log').select('item_id,local_date,status,notes').eq('owner_id',owner).order('local_date',{ascending:false}).limit(100),
  db.from('agent_secretary_push_subscriptions').select('id,label,active,created_at,last_success_at,last_error').eq('owner_id',owner).order('created_at',{ascending:false}).limit(10),
  db.from('agent_gmail_connections').select('status,scopes').eq('owner_id',owner).maybeSingle(),
  db.from('agent_secretary_agent_alerts').select('id,event_key,alert_kind,actor,title,body,project_id,request_id,status,push_state,created_at').eq('owner_id',owner).in('status',['open','dismissed']).order('created_at',{ascending:false}).limit(80),
  db.from('agent_chatgpt_requests').select('id,worker_key,requester_label,question,reason,status,approved_by,money_related,project_id,handoff_id,updated_at').eq('owner_id',owner).in('status',['owner_required','ready','in_progress','blocked','review']).order('updated_at',{ascending:false}).limit(50),
  db.from('agent_hq_daily_checkins').select('local_date,fields,submitted_at').eq('owner_id',owner).order('local_date',{ascending:false}).limit(10),
  db.from('agent_hq_notes').select('id,review_kind,review_summary,review_status').eq('owner_id',owner).eq('review_status','pending').order('created_at',{ascending:false}).limit(20),
  db.from('agent_personal_accounts').select('platform,integration_status').eq('owner_id',owner).limit(20)
 ]);if([s,i,d,w,p,g,a,c,checkins,noteProposals,socialAccounts].some(x=>x.error)||!s.data)throw Error('Could not load the secretary registers');
 const state={settings:s.data,items:i.data||[],deliveries:d.data||[],workout_log:w.data||[],devices:p.data||[],agent_alerts:a.data||[],chatgpt_requests:c.data||[],gmail_connected:g.data?.status==='active'&&(g.data.scopes||[]).some((x:string)=>['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.modify','https://mail.google.com/'].includes(x)),calendar_sync_connected:false,daily_checkins:checkins.data||[],pending_note_proposals:noteProposals.data||[],social_accounts:socialAccounts.data||[]};
 return {...state,registries:stateSummary(state)};
}
function dateSource(source:string,localToday:string){if(/^\d{4}-\d{2}-\d{2}$/.test(source))return source;if(['today','tonight'].includes(source.toLowerCase()))return localToday;if(source.toLowerCase()==='tomorrow'){const d=new Date(localToday+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}return null;}
export function validateSecretaryOps(ops:any,state:any,message?:string){
 if(!Array.isArray(ops)||!ops.length||ops.length>6)throw Error('Use one to six secretary updates');const fromChat=typeof message==='string',body=(message||'').toLowerCase(),known=new Map(state.items.map((i:any)=>[i.id,i]));
 const localToday=secretaryDate(new Date(),state.settings.timezone);
 const source=(v:any)=>{if(typeof v!=='string'||!v.trim()||!body.includes(v.trim().toLowerCase()))throw Error('A requested change was not supported by the owner’s words');return v.trim();};
 return ops.map((raw:any)=>{
  if(!raw||typeof raw!=='object')throw Error('Invalid secretary update');const op=raw.op;
  if(op==='save_item'){
   const i=raw.item;if(!i||!SECRETARY_KINDS.includes(i.kind)||typeof i.title!=='string'||!i.title.trim()||i.title.length>180||typeof i.details!=='string'||i.details.length>4000)throw Error('Provide an item name and its saved instructions');
   const result:any={op,item:{kind:i.kind,title:i.title.trim(),details:i.details,timezone:bounded(i.timezone,80)||state.settings.timezone,weekdays:Array.isArray(i.weekdays)?i.weekdays:[0,1,2,3,4,5,6],data:i.data||{}}};
   if(raw.id){if(!uuid(raw.id)||!known.has(raw.id))throw Error('Choose an existing secretary item');result.id=raw.id;}
   try{new Intl.DateTimeFormat('en-US',{timeZone:result.item.timezone}).format()}catch{throw Error('Use a valid timezone');}
   if(!result.item.weekdays.length||result.item.weekdays.some((n:any)=>!Number.isInteger(n)||n<0||n>6))throw Error('Choose valid weekdays');
   if(i.kind==='reminder'){
    const t=secretaryTime(i.local_time);if(!t)throw Error('Give an unambiguous reminder time, such as 8 AM or 20:00');result.item.local_time=t;
    if(i.once_at!==undefined){
     if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(i.once_at))||i.once_at.slice(11)!==t||i.data?.repeat!=='none'||i.data?.once_at!==i.once_at)
      throw Error('One-time reminders need one verified date and time');
     result.item.once_at=i.once_at;
    }
    if(!['medication','supplement','routine'].includes(result.item.data.intake_type||'routine'))throw Error('Choose medication, supplement or routine');
   }
   if(i.kind==='meeting'){
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(i.local_start||''))throw Error('Give the meeting’s exact date and local time');result.item.local_start=i.local_start;
    if(!Array.isArray(result.item.data.attendees)||result.item.data.attendees.length>20)throw Error('Use at most twenty meeting attendees');
    result.item.data.attendees=result.item.data.attendees.map((a:any)=>({name:bounded(a.name,100),email:bounded(a.email,200),role:bounded(a.role,100)}));
   }
   if(i.kind==='task'&&i.local_due){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(i.local_due))throw Error('Give the task’s exact due date and local time');result.item.local_due=i.local_due;}
   if(typeof result.item.data!=='object'||Array.isArray(result.item.data)||JSON.stringify(result.item.data).length>9000)throw Error('The item details are too large');
   if(fromChat){
    if(/\b(stop|cancel|pause)\b|don['’]t remind|do not remind/.test(body))throw Error('A stop or pause request cannot create a new reminder');
    if(source(raw.title_source).toLowerCase()!==i.title.trim().toLowerCase())throw Error('Use the owner’s actual item label');
    if(i.details&&!body.includes(i.details.toLowerCase()))throw Error('Do not invent or expand intake instructions or workout targets');
    if(i.kind==='reminder'){
     if(/\b(?:until|through|starting|beginning|for \d+ days)\b/.test(body))throw Error('Confirm the reminder start and end boundaries before making it permanent');
     const autoTime=raw.auto_time_selected===true&&i.data?.auto_time_selected===true;
     if(autoTime&&(!/\b(?:daily|every day|each day|everyday|weekdays|every (?:sunday|monday|tuesday|wednesday|thursday|friday))\b/.test(body)||smartReminderTime(i.title)!==result.item.local_time||/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/.test(body)))
      throw Error('Only safe recurring routines can receive an automatically chosen time.');
     const statedTime=autoTime?'':source(raw.time_source),directTime=autoTime?result.item.local_time:secretaryTime(statedTime);
     const inferredTonight=raw.date_source==='tonight'&&!/[ap]\.?\s*m\.?$/i.test(statedTime)&&secretaryTime(statedTime+' pm')===result.item.local_time;
     if(directTime!==result.item.local_time&&!inferredTonight)throw Error('The reminder time does not match the owner’s words');
     const everyday=/\b(daily|every day|each day|everyday)\b/.test(body),weekdays=/\bweekdays\b/.test(body),names=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
     const selected=everyday?(autoTime?[0,1,2,3,4,5]:[0,1,2,3,4,5,6]):weekdays?[1,2,3,4,5]:names.flatMap((n,index)=>new RegExp('\\bevery\\s+'+n+'\\b','i').test(body)?[index]:[]);
     if(result.item.once_at){
      if(selected.length)throw Error('A one-time reminder must not repeat');
      const fromSource=raw.date_source==='implicit'?'implicit':source(raw.date_source);
      const targetDate=result.item.once_at.slice(0,10);
      if(fromSource==='implicit'){
       if(/\b(?:today|tonight|tomorrow)\b/i.test(body))throw Error('Please use the date you requested');
       const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:result.item.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
       const nowMin=Number(p.hour)*60+Number(p.minute),requestedMin=Number(t.slice(0,2))*60+Number(t.slice(3,5));
       const day=secretaryDate(new Date(),result.item.timezone);const d=new Date(day+'T12:00:00Z');if(requestedMin<=nowMin)d.setUTCDate(d.getUTCDate()+1);
       if(targetDate!==d.toISOString().slice(0,10))throw Error('The one-time reminder date does not match the requested time');
      }else if(dateSource(fromSource,localToday)!==targetDate)throw Error('The one-time reminder date must match the owner request');
     }else{
      if(!selected.length||JSON.stringify([...new Set(result.item.weekdays)].sort())!==JSON.stringify(selected.sort()))throw Error('Confirm which days the reminder should repeat');
     }
    }
    if(i.kind==='meeting'||i.local_due){const date=dateSource(source(raw.date_source),localToday),time=secretaryTime(source(raw.time_source)),target=i.kind==='meeting'?i.local_start:i.local_due;if(!date||!time||target!==date+'T'+time)throw Error('Confirm the meeting or deadline date and time');}
    if(i.kind==='workout'){source(raw.days_source);if(!i.details.trim())throw Error('Give the actual workout plan, sets and targets, or explicitly save a rest day');}
    // Meeting descriptions may be supplied as a literal source excerpt, not invented biographies.
    if(i.kind==='meeting')for(const key of ['purpose','notes','objectives'])if(result.item.data[key]&&!body.includes(String(result.item.data[key]).toLowerCase()))throw Error('Use only supplied meeting preparation details');
   }
   return result;
  }
  if(op==='control_item'){
   if(!uuid(raw.id)||!known.has(raw.id)||!['active','paused','stopped','completed'].includes(raw.status))throw Error('Choose an existing item and a valid action');
   if(raw.status==='completed'&&!['task','meeting'].includes(known.get(raw.id).kind))throw Error('A recurring routine is acknowledged by occurrence, not permanently completed');
   if(fromChat){if(/don['’]t (?:stop|cancel|pause)|do not (?:stop|cancel|pause)/.test(body))throw Error('This instruction does not authorize stopping a reminder');if(source(raw.item_source).toLowerCase()!==String(known.get(raw.id).title).toLowerCase())throw Error('The named item does not match the selected record');const verbs={stopped:/\b(stop|cancel)\b|don['’]t remind|do not remind/,paused:/\b(pause|hold)\b/,active:/\b(resume|restart)\b|start again/,completed:/\b(done|finished|complete|completed)\b/};if(!verbs[raw.status].test(body)||raw.status==='completed'&&/not done|not completed|didn['’]t|did not/.test(body))throw Error('An explicit matching administrative action is required');}
   return {op,id:raw.id,status:raw.status};
  }
  if(op==='ack_item_today'){
   const item=known.get(raw.id);if(!item||item.kind!=='reminder'||item.status!=='active'||!['done','skipped'].includes(raw.choice))throw Error('Choose an active reminder and today’s reported outcome');
   if(fromChat){if(source(raw.item_source).toLowerCase()!==item.title.toLowerCase()||!/took|taken|finished|done|completed|skip/i.test(body)||raw.choice==='done'&&/not taken|haven['’]t|have not|didn['’]t|did not/.test(body))throw Error('The owner must report today’s outcome');}return {op,id:raw.id,choice:raw.choice};
  }
  if(op==='ack_delivery'){
   const d=state.deliveries.find((d:any)=>d.id===raw.id&&d.status==='saved'&&d.action_state==='open');if(!d||!['done','skipped','snooze'].includes(raw.choice))throw Error('Choose an unacknowledged saved occurrence');
   if(fromChat){const item=known.get(d.item_id);if(!item||source(raw.item_source).toLowerCase()!==item.title.toLowerCase()||!/taken|took|done|finished|complete|skip|snooze/i.test(body)||raw.choice==='done'&&/not taken|haven['’]t|have not|didn['’]t|did not/.test(body))throw Error('Confirm which occurrence you actually handled');}
   return {op,id:raw.id,choice:raw.choice};
  }
  if(op==='workout_log'){
   if(!known.has(raw.id)||!/^\d{4}-\d{2}-\d{2}$/.test(raw.local_date)||!['completed','skipped'].includes(raw.status))throw Error('Choose a saved workout and completion date');
   if(fromChat&&(!/\b(did|done|finished|completed|skipped)\b/.test(body)||raw.status==='completed'&&/didn['’]t|did not|not done|not completed/.test(body)))throw Error('The owner must report the actual workout outcome');return {op,id:raw.id,local_date:raw.local_date,status:raw.status,notes:bounded(raw.notes,2000)};
  }
  if(op==='settings'){
   const result:any={op};for(const key of ['brief_time','brief_enabled','timezone','email_for_meetings'])if(raw[key]!==undefined)result[key]=raw[key];
   if(fromChat){if(raw.email_for_meetings!==undefined)throw Error('Grant or revoke Eleanor’s Gmail access in her desk settings');source(raw.setting_source);if(!/brief(?:ing)?/.test(body))throw Error('Request the briefing setting explicitly');if(raw.brief_time!==undefined&&secretaryTime(source(raw.time_source))!==secretaryTime(raw.brief_time))throw Error('The briefing time must match the owner request');if(raw.brief_enabled===false&&!/stop|pause|disable|cancel/.test(body)||raw.brief_enabled===true&&!/enable|resume|start|turn on/.test(body))throw Error('Request the briefing state explicitly');}
   if(result.brief_time!==undefined&&!secretaryTime(result.brief_time))throw Error('Choose a briefing time');return result;
  }
  if(op==='create_project'){
   if(typeof raw.brief!=='string'||raw.brief.length<5||raw.brief.length>10000||!raw.title)throw Error('Provide the project goal and title');
   if(fromChat){source(raw.project_source);if(!/\b(project|delegate|assign|team|workers)\b/.test(body)&&!consultingRequested(message))throw Error('The owner must request an internal project handoff or practical consulting guide');}
   return {op,title:bounded(raw.title,180),brief:raw.brief,metadata:{project_kind:'personal',output_format:raw.output_format==='pdf'?'pdf':'markdown'}};
  }
  throw Error('This secretary operation is not supported');
 });
}
export async function applySecretaryOps(db:any,owner:string,input:any,message?:string){
 if(!uuid(input.request_id)||!Number.isSafeInteger(input.version))throw Error('A saved request identifier and current record version are required');
 const state=await secretaryState(db,owner),operations=validateSecretaryOps(input.operations,state,message);
 const {data,error}=await db.rpc('apply_agent_secretary_ops',{p_owner:owner,p_request:input.request_id,p_ops:operations,p_expected_version:input.version});if(error)throw Error(error.message);return data;
}
