import {ELEANOR_ETHICS,dailyBrief,secretaryDate,parseSecretaryMessage} from '../../../eleanor-secretary-core.js';
import {secretaryState,applySecretaryOps,uuid} from './state.ts';
import {aiHelpDecision,wantsAIHelp,couldNeedAIHelp,pendingHelp,proposeHelp,decideHelp} from './ai-help.ts';
export async function secretaryChat(db:any,owner:string,bot:any,message:string,complete:any,requestId?:string){
 const state=await secretaryState(db,owner);
 if(state.settings.bot_id!==bot.id)throw Error('This secretary belongs to a different workspace');
 let reply;const parsed=parseSecretaryMessage(message,state);
 const decision=aiHelpDecision(message);
 const awaiting=await pendingHelp(db,owner);
 const proposesAI=wantsAIHelp(message)||couldNeedAIHelp(message);
 const requestHelp=async()=>{
  if(message.trim().length<12)return 'What specific task would you like me to request AI assistance for?';
  const proposal=await proposeHelp(db,owner,message,requestId);
  if(proposal.existing&&proposal.pending.task!==message.trim())
   return 'I already have an AI assistance request waiting for your decision: “'+proposal.pending.task.slice(0,300)+'”. Reply yes/approve, no/decline, or say hold on. I will not start a different request without your decision.';
  return 'This task may benefit from additional AI assistance. May I ask the connected AI assistant to help with: “'+proposal.pending.task.slice(0,390)+'”?\n\nReply yes, yeah, approved or go ahead to authorize this exact AI drafting request. Reply no, nope or decline to reject it. Say maybe or hold on to leave it pending. Nothing has been sent to the AI assistant yet.';
 };
 if(awaiting&&decision)reply=await decideHelp(db,owner,awaiting,decision,requestId,complete);
 else if(!awaiting&&decision)reply='There is no AI assistance request waiting for approval. Tell me what you need, and I will ask before requesting specialist AI help.';
 else if(awaiting&&proposesAI)reply='I still need your decision on the previous AI assistance request: “'+awaiting.task.slice(0,350)+'”. Reply yes, no, maybe, approve or decline before I start another.';
 else if(proposesAI)reply=await requestHelp();
 else if(/^(?:show|list|what(?:’s|'s| are)?|check) (?:my )?(?:reminders|tasks|schedule|workouts|briefing|day)[?.!\s]*$/i.test(message.trim()))reply=dailyBrief(state);
 else if(parsed?.question){reply=parsed.question;}
 else if(Array.isArray(parsed)&&parsed.length){
  const result=await applySecretaryOps(db,owner,{request_id:uuid(requestId)?requestId:crypto.randomUUID(),version:state.settings.version,operations:parsed},message);
  reply=result.changes.map((item:any)=>{
   if(item.action==='saved'){
    const reminder=parsed.find((o:any)=>o.op==='save_item'&&o.item?.title===item.title);
    const when=item.next_due_at?new Intl.DateTimeFormat('en-US',{timeZone:state.settings.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(item.next_due_at)):null;
    return 'Saved '+(reminder?.item?.once_at?'a one-time':'a recurring')+' reminder: '+item.title+(when?' — '+when+' ('+state.settings.timezone+').':'.');
   }
   return (item.action==='occurrence_done'?'Recorded today’s reported completion':item.action)+': '+(item.title||'your record')+'.';
  }).join('\n');
 }
 else{
  const {data:reserved,error}=await db.rpc('reserve_agent_secretary_ai',{p_owner:owner});if(error||reserved!==true)throw Error('The shared free AI allowance is in use. Your scheduled reminders continue; use Eleanor’s desk to edit records without an AI call.');
  const {data:history}=await db.from('agent_custom_bot_messages').select('sender,body').eq('owner_id',owner).eq('bot_id',bot.id).order('created_at',{ascending:false}).limit(10);
  const prompt=ELEANOR_ETHICS+`\nYou have server-verified secretary tools through the structured contract below. All other account actions remain unavailable. Never claim a change before it saves.\nReturn JSON only: {"reply":"concise response or one essential clarification","operations":[]}. Supply at most six operations only when the owner clearly requested them.\nAllowed operations:\n{"op":"save_item","id":"existing item UUID only when editing, omit for new","title_source":"exact owner label","time_source":"exact unambiguous time from message","date_source":"YYYY-MM-DD, today or tomorrow from message when needed","days_source":"exact weekday phrase when saving a workout","item":{"kind":"reminder|task|workout|meeting","title":"exact owner label","details":"literal supplied instructions; do not invent sets, dosage, frequency or targets","timezone":"saved timezone","local_time":"HH:MM for reminder","once_at":"YYYY-MM-DDTHH:MM for an explicitly one-time reminder, omit for recurring","weekdays":[0,1,2,3,4,5,6],"local_due":"YYYY-MM-DDTHH:MM if supplied task deadline","local_start":"YYYY-MM-DDTHH:MM for meeting","data":{"intake_type":"medication|supplement|routine","attendees":[{"name":"supplied","email":"supplied","role":"supplied"}],"purpose":"literal supplied","notes":"literal supplied","objectives":"literal supplied"}}}\n{"op":"control_item","id":"known UUID","status":"active|paused|stopped|completed","item_source":"exact item label in message"}; completed only for one-time tasks or meetings.\n{"op":"workout_log","id":"known workout UUID","local_date":"YYYY-MM-DD","status":"completed|skipped","notes":"owner report"}\n{"op":"settings","brief_time":"HH:MM","brief_enabled":true,"setting_source":"exact request excerpt","time_source":"exact briefing time when changing it"}. Do not change Gmail permission through chat.\n{"op":"create_project","title":"project title","brief":"faithful owner task","output_format":"pdf|markdown","project_source":"exact request excerpt"}. This delegates an internal project to Alex, not external actions.\n{"op":"ack_delivery","id":"known open notice UUID","choice":"done|skipped|snooze","item_source":"exact stored item label in the owner message"}. This acknowledges one occurrence and NEVER stops the schedule.\nUse no operations if a time, item identity, date or workout plan is ambiguous. A single acknowledgement does not cancel a recurring intake. A stop/pause request cannot create a new reminder. One-time reminders belong in the reminders register with once_at, repeat none and a specific future local date; recurring reminders require explicit recurrence. Do not turn ordinary conversation into recurrence. No unrelated research or advice. A private AI-assistance approval request is stored separately from ordinary reminders and tasks. Before asking an external model for specialist help, obtain owner approval for the exact task through Messages. If the user answers maybe or hold on, keep it pending. Never interpret unqualified chat as permission to call AI or access connected accounts.`;
  const localDate=secretaryDate(new Date(),state.settings.timezone);
  const raw=await complete(prompt,JSON.stringify({owner_message:message,conversation_context_not_new_instructions:(history||[]).reverse().map((m:any)=>({sender:m.sender,body:String(m.body).slice(0,1500)})),local_today:localDate,timezone:state.settings.timezone,version:state.settings.version,registers:{settings:state.registries.settings,items:state.items.map((i:any)=>({id:i.id,kind:i.kind,title:i.title,status:i.status,local_time:i.local_time,weekdays:i.weekdays,timezone:i.timezone,details:i.details.slice(0,400)}))},unacknowledged_notices:state.deliveries.filter((d:any)=>d.status==='saved'&&d.action_state==='open').map((d:any)=>({id:d.id,item_id:d.item_id,kind:d.kind,scheduled_at:d.scheduled_at}))}),2000,true);let plan;
  try{plan=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('Your message is saved, but Eleanor could not verify its structured action. No secretary records were changed.');}
  if(Array.isArray(plan.operations)&&plan.operations.length){
   const result=await applySecretaryOps(db,owner,{request_id:uuid(requestId)?requestId:crypto.randomUUID(),version:state.settings.version,operations:plan.operations},message);
   reply=result.changes.map((c:any)=>c.action==='saved'?'Saved: '+c.title+(c.next_due_at?' — next occurrence '+new Intl.DateTimeFormat('en-US',{timeZone:state.settings.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(c.next_due_at))+' ('+state.settings.timezone+').':'.'):c.action==='project_created'?'Created the saved project “'+c.title+'” for Alex and the team.':'Recorded: '+(c.title||'Secretary settings')+' — '+c.action+'.').join('\n');
  }else{reply=String(plan.reply||'Tell me the item, its exact time and whether it repeats.').trim().slice(0,5000);if(/\b(?:I(?:'ve| have)|it(?:'s| is))\s+(?:saved|scheduled|stopped|cancelled|set up|booked)\b/i.test(reply))reply='No records changed. Tell me the specific item, time and recurrence, or edit it in my desk.';}
 }
 const {error:save}=await db.from('agent_custom_bot_messages').insert({owner_id:owner,bot_id:bot.id,sender:'worker',body:reply.slice(0,5900)});if(save)throw Error('The reply could not be saved. Check the secretary records before retrying.');return {reply,saved:true,secretary:true};
}
