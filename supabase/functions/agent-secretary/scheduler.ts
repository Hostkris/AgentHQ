import {dailyBrief,meetingBrief,reminderText} from '../../../eleanor-secretary-core.js';
import {secretaryState} from './state.ts';
export async function scopedMeetingEmail(state:any,event:any,deps:any){
 if(!state.settings.email_for_meetings)return {state:'not_enabled',messages:[]};
 const addresses=(event.data?.attendees||[]).map((a:any)=>String(a.email||'').trim().toLowerCase()).filter((a:string)=>/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(a)).slice(0,8);
 if(!addresses.length)return {state:'no_attendees',messages:[]};
 try{return {state:'read',messages:await deps.readMeetingEmail(state.settings.owner_id,addresses,event.scheduled_at)}}catch{return {state:'failed',messages:[]};}
}
export async function processSecretaryDue(db:any,owners:string[],deps:any,scheduled=false){
 const {error:prepareError}=await db.rpc('prepare_agent_secretary_deliveries',{p_owners:owners});if(prepareError)throw Error('The secretary schedule could not be read');let saved=0;
 for(let n=0;n<12;n++){
  const {data:d,error}=await db.rpc('claim_agent_secretary_delivery',{p_owners:owners});if(error)throw Error('A secretary notice could not be claimed');if(!d)break;
  try{
   const state=await secretaryState(db,d.owner_id);const item=state.items.find((i:any)=>i.id===d.item_id);let body;
   if(d.kind==='brief')body=dailyBrief(state,new Date());
   else if(d.kind==='meeting'){
    if(!item)throw Error('The meeting was removed');let notes='';const project=item.data?.project_id;
    if(project){const {data:a,error:ae}=await db.from('agent_team_assignments').select('title,instructions,manager_summary').eq('id',project).eq('owner_id',d.owner_id).maybeSingle();if(ae)throw Error('Related project notes are unavailable');if(a)notes=a.title+'\n'+String(a.manager_summary||a.instructions||'').slice(0,1200);}
    body=meetingBrief(item,await scopedMeetingEmail(state,item,deps),notes);
   }else if(item)body=reminderText(item,d.scheduled_at,d.kind==='followup');else throw Error('The scheduled item was removed');
   const {data:result,error:saveError}=await db.rpc('complete_agent_secretary_delivery',{p_owner:d.owner_id,p_delivery:d.id,p_lease:d.lease_id,p_body:body});if(saveError)throw Error('The secretary notice could not be saved');if(result?.state==='saved')saved++;
  }catch{
   const delay=Math.min(1800,15*2**Math.min(d.attempts||1,7));await db.from('agent_secretary_deliveries').update({status:'queued',lease_id:null,lease_until:new Date(Date.now()+delay*1000).toISOString(),last_error:'A source or delivery failed. The saved notice will retry automatically.'}).eq('id',d.id).eq('owner_id',d.owner_id).eq('lease_id',d.lease_id);
  }
 }
 if(scheduled)await db.from('agent_secretary_settings').update({last_scheduler_at:new Date().toISOString()}).in('owner_id',owners);
 if(deps.deliverPush)await deps.deliverPush(db,owners);return {saved,state:saved?'processed':'idle'};
}
