// One owner-scoped delete control for every conversation renderer.
let agentCloud;
let generation=0,hidden=new Set(),ownerId=null;
const busy=new Set();
const keyOf=(kind,id)=>kind+':'+id;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const messageIsDeleted=(kind,id)=>hidden.has(keyOf(kind,id));
export function messageDeleteButton(kind,id,pending=false){
 return '<div class="chat-delete-bar"><button type="button" class="chat-delete-button" data-chat-dismiss="'+esc(kind)+'" data-chat-item="'+esc(id)+'" aria-label="Delete message" title="'+(pending?'Available after sending':'Delete message')+'"'+(pending?' disabled':'')+'><span aria-hidden="true">×</span></button></div>';
}
const notify=()=>document.dispatchEvent(new CustomEvent('agenthq-message-deletions'));
async function user(){if(!agentCloud)throw Error('Message service is loading. Try again shortly.');const {data,error}=await agentCloud.auth.getUser();if(error||!data?.user)throw Error('Sign in to delete saved messages.');return data.user}
async function refresh(){
 const current=generation,owner=await user();if(current!==generation)return;
 if(ownerId!==owner.id){ownerId=owner.id;hidden.clear();notify()}
 // Page the full dismissal ledger so older dismissed cards do not reappear.
 const next=new Set();let offset=0;
 while(true){
  const {data,error}=await agentCloud.from('agent_chat_dismissals').select('kind,item_key').eq('owner_id',owner.id).order('kind').order('item_key').range(offset,offset+999);
  if(current!==generation)return;if(error)throw Error(error.message);
  for(const row of data||[])next.add(keyOf(row.kind,row.item_key));
  if(!data||data.length<1000)break;offset+=1000;
 }
 if(current!==generation)return;
 // Keep successful deletions that completed while this refresh was in flight.
 for(const id of hidden)next.add(id);
 if([...next].sort().join('|')!==[...hidden].sort().join('|')){hidden=next;notify()}
}
async function dismiss(kind,id){
 const current=generation,owner=await user();if(current!==generation)throw Error('Your account changed. Try again.');
 const {data,error}=await agentCloud.rpc('dismiss_agent_chat_item',{p_kind:kind,p_key:id});
 if(current!==generation)throw Error('Your account changed.');
 if(error||data!==true)throw Error(error?.message||'Message could not be deleted.');
 ownerId=owner.id;hidden.add(keyOf(kind,id));await refresh().catch(()=>{});notify();
 // Refresh affected data after the durable deletion; failures do not undo it.
 await Promise.allSettled([window.agentHQChatCloud?.refresh(),window.agentHQSocialReadCloud?.refresh(),window.agentHQCloudApprovals?.refresh()]);
 return true;
}
window.agentHQMessageControls={button:messageDeleteButton,isDeleted:messageIsDeleted,refresh,dismiss};
document.addEventListener('click',async event=>{
 const button=event.target.closest?.('[data-chat-dismiss]');if(!button)return;
 event.preventDefault();event.stopPropagation();
 const kind=button.dataset.chatDismiss,id=button.dataset.chatItem,key=keyOf(kind,id);
 if(busy.has(key))return;
 const prompt=kind==='social'?'Delete this reading request? Any active reading permission will be cancelled.':kind==='work'?'Remove this update from Messages? The assignment and its saved work will remain.':'Delete this message from your conversation?';
 if(!window.confirm(prompt))return;
 busy.add(key);button.disabled=true;
 const container=button.closest('.ios-message-bubble,.ios-work-card,.team-message,.studio-chat-bubble,.studio-chat-tip');
 try{await dismiss(kind,id)}catch(error){
  if(container?.isConnected){let note=container.querySelector('.chat-delete-error');if(!note){note=document.createElement('p');note.className='chat-delete-error';note.setAttribute('role','alert');container.append(note)}note.textContent='Could not delete message: '+error.message}
 }finally{busy.delete(key);if(button.isConnected)button.disabled=false}
});
const load=()=>refresh().catch(()=>{});
export function connectMessageControls(client){
 if(agentCloud)return;agentCloud=client;
 agentCloud.auth.onAuthStateChange(()=>{generation++;ownerId=null;hidden.clear();busy.clear();notify();setTimeout(load,0)});
 load();
}
window.addEventListener('focus',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
setInterval(()=>{if(!document.hidden)load()},30000);
