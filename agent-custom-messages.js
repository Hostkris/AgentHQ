// One private conversation per custom worker. Worker Studio creates/configures workers;
// this module owns their chats inside Agent HQ Messages.
import {agentCloud} from './agent-cloud-auth.js';
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let activeId=null,ownerId=null,root=null,generation=0,loading=false,sending=false,history=[],feedback='',textDraft='',lastLoaded=0;
const deleting=new Set();
const host=()=>document.getElementById('agent-custom-chat-root');
const cloud=()=>window.agentHQBotStudioCloud;
function bot(){
 return window.agentHQBotStudioSnapshot?.rows?.find(b=>b.id===activeId&&b.status==='active');
}
function render(){
 if(!root||root!==host()||!activeId)return;
 const b=bot();
 if(!b){
  root.innerHTML='<section class="custom-msg-state" role="status">This worker is not active. Open Worker Studio to activate it, or return to Messages.</section>';
  return;
 }
 const existing=root.querySelector('[name=message]');
 if(existing)textDraft=existing.value;
 const combined=[...history.filter(x=>!window.agentHQMessageControls?.isDeleted('bot',x.id)),
 ...(window.agentHQCamera?.getThreadItems?.(activeId)||[])].sort((a,c)=>Date.parse(a.created_at||a.createdAt)-Date.parse(c.created_at||c.createdAt));
 root.innerHTML='<div class="custom-msg-conversation"><div class="custom-msg-scroll" data-custom-msg-scroll>'+
 (combined.length?combined.map(m=>m.type==='photo'?window.agentHQCamera?.renderPhotoItem?.(m)||'':
  '<div class="custom-msg-row '+(m.sender==='owner'?'mine':'theirs')+'"><div class="custom-msg-bubble">'+
  (window.agentHQMessageControls?.button?.('bot',m.id)||'')+escapeHTML(m.body||'')+'</div></div>').join(''):
  (window.agentHQMessageControls?.isDeleted?.('welcome',b.id)?'':'<div class="custom-msg-welcome">'+(window.agentHQMessageControls?.button?.('welcome',b.id)||'')+escapeHTML(b.starting_message||'Send a message to '+b.name+'.')+'</div>'))+
 (window.agentHQRenderResearchForWorker?.(activeId)||'')+
 '</div><div class="agent-thread-activity" data-agent-activity-thread="'+escapeHTML(activeId)+'" data-agent-activity-name="'+escapeHTML(b.name)+'" role="status" aria-live="polite">'+(window.agentHQActivity?.render?.(activeId)||'')+'</div>'+
 '<form class="custom-msg-form photo-enabled-composer" data-custom-message-form>'+
 '<div class="photo-composer-drafts" data-photo-drafts="'+escapeHTML(activeId)+'">'+(window.agentHQCamera?.renderDrafts?.(activeId)||'')+'</div>'+
 '<button type="button" class="custom-msg-photo ios-camera-attach" data-camera-open-chat="'+escapeHTML(activeId)+'" aria-label="Attach a photo">+</button>'+
 '<textarea name="message" aria-label="Message '+escapeHTML(b.name)+'" placeholder="Message '+escapeHTML(b.name)+'…" rows="2" maxlength="4500" '+(sending?'disabled':'')+'></textarea>'+
 '<button type="submit" aria-label="Send message" '+(sending?'disabled':'')+'>'+(sending?'…':'↑')+'</button></form>'+
 '<p class="custom-msg-status" role="status">'+escapeHTML(feedback)+'</p>'+
 (b.template_key==='eleanor-secretary-v1'?'<button type="button" class="agent-ai-help-open" data-ai-assist-open="eleanor">✦ Request AI Assistance · Eleanor</button>':'')+
 (b.template_key==='eleanor-secretary-v1'?'<button type="button" class="custom-msg-desk" data-custom-secretary-desk>Open Eleanor’s reminders, goals and appointments</button>':'')+
 '</div>';
 root.querySelector('[name=message]').value=textDraft;
 const scroller=root.querySelector('[data-custom-msg-scroll]');
 if(scroller)scroller.scrollTop=scroller.scrollHeight;
}
async function reload({force=false}={}){
 const b=bot(),id=activeId,ticket=generation;
 if(!b||!cloud()?.history)return;
 if(loading||(!force&&Date.now()-lastLoaded<7000))return;
 loading=true;
 try{
  const rows=await cloud().history(id);
  if(ticket!==generation||activeId!==id)return;
  history=rows||[];feedback='';lastLoaded=Date.now();render();
 }catch(error){if(ticket===generation){feedback='Unable to load conversation: '+String(error?.message||error);render()}}
 finally{loading=false}
}
async function send(event){
 event.preventDefault();
 if(sending||!activeId)return;
 const form=event.target,id=activeId,b=bot(),ticket=generation;
 if(!b)return;
 const message=String(form.elements.namedItem('message')?.value||'').trim();
 if(!message&&!window.agentHQCamera?.hasDrafts?.(id)){feedback='Write a message first.';render();return;}
 sending=true;feedback='Sending to '+b.name+'…';render();
 try{
  if(window.agentHQCamera?.hasDrafts?.(id)){
   await window.agentHQCamera.sendDraft(id,message);
   if(ticket!==generation)return;
   history=await cloud().history(id);
   feedback='Photo saved to your private conversation.';
  }else{
   const response=await cloud().send(id,message);
   if(ticket!==generation)return;
   history=response.history||[];
   feedback='Message saved in Messages.';
  }
  if(ticket!==generation)return;
  textDraft='';if(root?.querySelector('[name=message]'))root.querySelector('[name=message]').value='';lastLoaded=Date.now();render();
 }catch(error){
  if(ticket===generation){
   const reason=String(error?.message||error);
   try{
    // Some server errors occur after an owner's message was saved.
    // Re-read before offering retry, so the owner knows whether it arrived.
    const recent=await cloud().history(id);
    if(ticket!==generation)return;
    history=recent||[];
    const recentOwner=history.filter(row=>row.sender==='owner').at(-1);
    if(recentOwner?.body?.trim()===message){
     textDraft='';const field=root?.querySelector('[name=message]');if(field)field.value='';
     feedback='Eleanor received your message but did not finish replying. No reminder or other change has been confirmed. '+reason;
    }else feedback='Your message could not be sent: '+reason;
   }catch{feedback='Could not confirm whether your message was saved. Check the conversation before retrying. '+reason}
   render();
  }
 }finally{sending=false;if(ticket===generation)render()}
}
function mount(){
 const next=host(),id=next?.dataset.botId||null;
 if(next===root&&id===activeId)return;
 root=next;activeId=id;generation++;history=[];feedback='';textDraft='';lastLoaded=0;loading=false;sending=false;
 if(root){render();void reload({force:true})}
}
document.addEventListener('submit',event=>{
 if(!event.target.matches('[data-custom-message-form]'))return;
 void send(event);
});
// Custom-worker threads use one-tap delete, matching their visible X controls.
// Intercept before the legacy handler, which otherwise uses a native confirm
// and cannot show errors in custom-message bubbles.
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-chat-dismiss]');
 if(!button||!root?.contains(button))return;
 const kind=button.dataset.chatDismiss,id=button.dataset.chatItem;
 if(!['bot','welcome'].includes(kind)||!id)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(deleting.has(kind+':'+id))return;
 const control=window.agentHQMessageControls;
 if(!control?.dismiss){
  feedback='Message deletion is not ready. Refresh Agent HQ and retry.';
  render();return;
 }
 const generationAtTap=generation,thread=activeId;
 deleting.add(kind+':'+id);
 button.disabled=true;
 button.setAttribute('aria-busy','true');
 button.querySelector('span')?.replaceChildren(document.createTextNode('…'));
 const status=root.querySelector('.custom-msg-status');
 if(status)status.textContent='Deleting message…';
 void (async()=>{
  try{
   // The existing owner-scoped RPC actually deletes the stored bot message.
   await control.dismiss(kind,id);
   if(generationAtTap!==generation||thread!==activeId)return;
   if(kind==='bot'){
    history=history.filter(m=>m.id!==id);
    try{history=await cloud().history(thread)}
    catch{/* The durable delete succeeded; keep the deleted row hidden. */}
   }
   if(generationAtTap===generation){
    feedback='Message deleted.';
    lastLoaded=Date.now();
    render();
   }
  }catch(error){
   if(generationAtTap===generation){
    feedback='Could not delete message: '+String(error?.message||error);
    render();
   }
  }finally{
   deleting.delete(kind+':'+id);
   if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');}
  }
 })();
},true);
document.addEventListener('click',event=>{
 if(event.target.closest('[data-custom-secretary-desk]')){window.agentHQOpenSecretary?.();return}
 if(event.target.closest('[data-bot-reload]')){event.preventDefault();void reload({force:true})}
});
new MutationObserver(mount).observe(document.getElementById('app')||document.body,{childList:true,subtree:false});
agentCloud.auth.onAuthStateChange((_event,session)=>{
 const user=session?.user?.id||null;
 if(ownerId===user)return;
 ownerId=user;generation++;history=[];lastLoaded=0;textDraft='';feedback='';render();
 if(root&&user)void reload({force:true});
});
document.addEventListener('agenthq-message-deletions',()=>{if(root)render()});
window.addEventListener('focus',()=>{if(root&&!document.hidden)void reload({force:true})});
document.addEventListener('visibilitychange',()=>{if(root&&!document.hidden)void reload({force:true})});
setInterval(()=>{if(root&&!document.hidden&&!document.activeElement?.closest('textarea,input'))void reload()},25000);
mount();
