// A small, owner-bound copy of notices already returned by Eleanor's authenticated API.
// It is a reading aid while the app refreshes, never authority for completing a task.
const PREFIX='agenthq-eleanor-pending-v1:';
const MAX_AGE=7*24*60*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function savedSecretaryOwner(storage,authKey){
 try{
  const session=JSON.parse(storage?.getItem(authKey)||'null');
  return session?.access_token&&session?.refresh_token&&UUID.test(session.user?.id||'')?session.user.id:null;
 }catch{return null;}
}

export function secretaryPendingNotices(state){
 const active=new Map((state.items||[]).filter(i=>i.status==='active').map(i=>[i.id,i]));
 const reminders=(state.deliveries||[]).filter(d=>d.status==='saved'&&d.action_state==='open'&&
  (!d.item_id||(active.has(d.item_id)&&active.get(d.item_id).version===d.item_version)))
  .map(d=>({id:d.id,kind:d.kind,body:d.body,agent:false}));
 const work=state.settings?.agent_alerts_enabled?(state.agent_alerts||[]).filter(a=>a.status==='open')
  .map(a=>({id:a.id,kind:'Agent '+a.alert_kind,body:a.actor+': '+a.title+'. '+a.body,agent:true})):[];
 return [...work,...reminders];
}

function validSnapshot(value,owner,now){
 return UUID.test(owner||'')&&value?.owner_id===owner&&UUID.test(value.bot_id||'')&&
  Number.isSafeInteger(value.version)&&value.version>0&&Number.isFinite(value.saved_at)&&value.saved_at<=now+60000&&now-value.saved_at<=MAX_AGE&&
  Array.isArray(value.notices)&&value.notices.length<=200&&value.notices.every(n=>
   typeof n.id==='string'&&n.id.length>0&&n.id.length<=100&&typeof n.kind==='string'&&n.kind.length<=100&&
   typeof n.body==='string'&&n.body.length<=6000&&typeof n.agent==='boolean');
}

export function readSecretarySnapshot(storage,owner,now=Date.now()){
 if(!UUID.test(owner||''))return null;
 try{
  const value=JSON.parse(storage?.getItem(PREFIX+owner)||'null');
  if(validSnapshot(value,owner,now))return value;
  storage?.removeItem(PREFIX+owner);
 }catch{}
 return null;
}

export function saveSecretarySnapshot(storage,owner,state,now=Date.now()){
 if(!UUID.test(owner||'')||state?.settings?.owner_id!==owner||!UUID.test(state.settings.bot_id||''))return null;
 const value={owner_id:owner,bot_id:state.settings.bot_id,version:state.settings.version,saved_at:now,notices:secretaryPendingNotices(state)
  .map(n=>({id:String(n.id||''),kind:String(n.kind||'Reminder'),body:String(n.body||''),agent:n.agent===true}))};
 if(!validSnapshot(value,owner,now))return null;
 try{storage?.setItem(PREFIX+owner,JSON.stringify(value));}catch{}
 return value;
}

export function clearSecretarySnapshot(storage,owner){
 if(!UUID.test(owner||''))return;
 try{storage?.removeItem(PREFIX+owner);}catch{}
}
