// Agent HQ's first-party, owner-private Notes store.
// The Supabase table belongs to Agent HQ, not to Apple Notes or another app.
import {agentCloud} from './agent-cloud-auth.js';
const KEY='agenthq-home-notes-v1:';
let owner=null,items=[],loaded=false,epoch=0,inFlight=null;
const notify=()=>window.dispatchEvent(new CustomEvent('agenthq-home-notes-changed',{detail:{owner_id:owner,loaded}}));
const normalize=row=>({
 id:row.id,client_key:row.client_key,text:row.content,
 date:new Date(row.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}),
 created_at:row.created_at,updated_at:row.updated_at,
 review_kind:row.review_kind,review_status:row.review_status,
 review_summary:row.review_summary,revision:row.revision
});
function owned(){if(!owner)throw Error('Sign in to Agent HQ to use private Notes.');return owner;}
function check(result,label){
 if(result.error)throw Error(label+': '+result.error.message);
 return result.data;
}
async function readServer(){
 const id=owned(),ticket=epoch;
 const {data,error}=await agentCloud.from('agent_hq_notes')
  .select('id,client_key,content,created_at,updated_at,review_kind,review_status,review_summary,revision')
  .eq('owner_id',id).order('updated_at',{ascending:false}).limit(100);
 if(error)throw Error('Could not load private Agent HQ Notes: '+error.message);
 if(ticket!==epoch||id!==owner)return items;
 items=(data||[]).map(normalize);loaded=true;notify();return items;
}
async function refresh(){
 if(inFlight)return inFlight;
 const work=readServer().finally(()=>{if(inFlight===work)inFlight=null});
 inFlight=work;return work;
}
async function create(text,clientKey=crypto.randomUUID()){
 const id=owned(),body=String(text||'').trim();
 if(!body||body.length>2000)throw Error('A note must be 1–2,000 characters.');
 const {data,error}=await agentCloud.from('agent_hq_notes')
  .upsert({owner_id:id,client_key:clientKey,content:body},{onConflict:'owner_id,client_key'})
  .select('id').single();
 if(error||!data)throw Error('Note was not saved in Agent HQ: '+(error?.message||'unknown error'));
 await refresh();return data.id;
}
async function update(noteId,text){
 const id=owned(),body=String(text||'').trim();
 if(!body||body.length>2000)throw Error('A note must be 1–2,000 characters.');
 const existing=items.find(n=>n.id===noteId);if(!existing)throw Error('Refresh Notes before editing.');
 const {data,error}=await agentCloud.from('agent_hq_notes').update({content:body})
  .eq('owner_id',id).eq('id',noteId).eq('revision',existing.revision).select('id').maybeSingle();
 if(error||!data)throw Error('This note has changed or could not be saved; refresh Notes.');
 await refresh();return true;
}
async function remove(noteId){
 const id=owned();const note=items.find(n=>n.id===noteId);
 if(!note)throw Error('Refresh Notes before deleting this entry.');
 const {data,error}=await agentCloud.from('agent_hq_notes').delete()
  .eq('owner_id',id).eq('id',noteId).select('id').maybeSingle();
 if(error||!data)throw Error('The note could not be deleted; refresh and try again.');
 await refresh();return true;
}
async function decide(noteId,revision,decision){
 const id=owned();if(!['approved','declined'].includes(decision))throw Error('Choose approve or decline.');
 const {data,error}=await agentCloud.from('agent_hq_notes')
  .update({review_status:decision})
  .eq('owner_id',id).eq('id',noteId).eq('revision',revision).eq('review_status','pending')
  .select('id').maybeSingle();
 if(error||!data)throw Error('Eleanor’s proposal changed. Refresh Notes and review the current version.');
 window.dispatchEvent(new CustomEvent('agenthq-secretary-state-invalidated',{detail:{owner_id:id}}));
 await refresh();window.dispatchEvent(new Event('agenthq-notes-decision'));return true;
}
async function migrateDeviceNotes(id){
 const key=KEY+id;let old;
 try{old=JSON.parse(localStorage.getItem(key)||'[]')}catch{return}
 if(!Array.isArray(old)||!old.length)return;
 for(const note of old.slice(0,100)){
  if(id!==owner)return;
  if(!note||!String(note.text||'').trim())continue;
  const clientKey=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(note.client_key||'')?note.client_key:crypto.randomUUID();
  note.client_key=clientKey;
  try{localStorage.setItem(key,JSON.stringify(old))}catch{}
  try{await create(note.text,clientKey)}catch{return} // Keep any unsynced entries for retry.
  old=old.filter(n=>n!==note);
  try{localStorage.setItem(key,JSON.stringify(old))}catch{}
 }
}
async function authenticate(next){
 if(next===owner&&loaded)return;
 owner=next||null;epoch++;items=[];loaded=false;inFlight=null;notify();
 if(!owner)return;
 const id=owner,ticket=epoch;
 try{await refresh();if(ticket===epoch)await migrateDeviceNotes(id)}catch(error){
  if(ticket===epoch)window.dispatchEvent(new CustomEvent('agenthq-notes-error',{detail:{message:String(error?.message||error)}}));
 }
}
window.agentHQNotesCloud={list:()=>items.slice(),loaded:()=>loaded,owner:()=>owner,refresh,create,update,remove,decide};
agentCloud.auth.onAuthStateChange((_event,session)=>{void authenticate(session?.user?.id||null)});
agentCloud.auth.getUser().then(({data})=>authenticate(data?.user?.id||null)).catch(()=>{});
window.addEventListener('focus',()=>{if(owner)void refresh().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&owner)void refresh().catch(()=>{})});
