// Eleanor's owner-private foreground contact window.
// Saved notices are not marked done, stopped or approved when this popup is dismissed.
import {agentCloud} from './agent-cloud-auth.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const POPUP_ID='agenthq-eleanor-popup';
const MAX_DISMISSED=80;
let owner=null,botId=null,activeKey=null,checking=false,sendBusy=false,sequence=0,lastCheck=0,latestState=null;
const dismissedKey=()=>owner?'agenthq-eleanor-popup-dismissed-v1:'+owner:'';
function dismissed(){
 try{const v=JSON.parse(localStorage.getItem(dismissedKey())||'[]');return Array.isArray(v)?v:[]}
 catch{return []}
}
function remember(key){
 if(!owner||!key)return;
 try{const v=dismissed().filter(x=>x!==key);v.push(key);localStorage.setItem(dismissedKey(),JSON.stringify(v.slice(-MAX_DISMISSED)))}catch{}
}
const node=()=>document.getElementById(POPUP_ID);
function closePopup(rememberThis=true){
 const panel=node();
 if(rememberThis&&activeKey)remember(activeKey);
 activeKey=null;
 if(!panel)return;
 panel.classList.add('eleanor-pop-exit');
 setTimeout(()=>{if(panel.isConnected)panel.remove()},190);
}
function noticeList(state){
 const active=new Map((state.items||[]).filter(i=>i.status==='active').map(i=>[i.id,i]));
 return (state.deliveries||[]).filter(d=>d.status==='saved'&&d.action_state==='open'&&(!d.item_id||(active.has(d.item_id)&&active.get(d.item_id).version===d.item_version)));
}
function alertGroup(notices){
 const ids=notices.map(d=>d.id).sort();
 // One consolidated popup per pending-notice group; do not flood the owner.
 return {key:'notices:'+ids.join(':'),notices:notices.slice(0,4),total:notices.length};
}
function popup(alert){
 if(!owner||document.hidden||node()||document.querySelector('dialog[open]'))return;
 activeKey=alert.key;
 const itemCount=alert.total;
 const heading=itemCount===1?'A reminder from Eleanor':itemCount>1?'Eleanor has '+itemCount+' items for you':'Eleanor has a message';
 const lines=itemCount?alert.notices.map(d=>'<div class="eleanor-pop-alert-item"><small>'+esc(d.kind||'Reminder')+'</small><p>'+esc(String(d.body||'You have a saved reminder.').slice(0,1000))+'</p></div>').join(''):'<div class="eleanor-pop-alert-item"><p>'+esc(alert.text||'Eleanor has a new message.')+'</p></div>';
 const el=document.createElement('div');
 el.id=POPUP_ID;
 el.className='eleanor-pop-overlay';
 el.innerHTML='<section class="eleanor-pop-card" role="dialog" aria-modal="true" aria-labelledby="eleanor-pop-title" tabindex="-1">'+
  '<header class="eleanor-pop-header"><span class="eleanor-pop-face" aria-hidden="true">👩🏽‍💼</span>'+
  '<div class="eleanor-pop-ident"><strong id="eleanor-pop-title">Eleanor</strong><small>Personal Executive Secretary · Private message</small></div>'+
  '<button type="button" class="eleanor-pop-close" aria-label="Close Eleanor popup" title="Close">×</button></header>'+
  '<div class="eleanor-pop-content"><h2>'+esc(heading)+'</h2>'+lines+
  (itemCount>4?'<p class="eleanor-pop-more">And '+(itemCount-4)+' more saved notices in Eleanor’s desk.</p>':'')+
  '<div class="eleanor-pop-conversation" role="log" aria-live="polite" data-eleanor-pop-history></div></div>'+
  '<form class="eleanor-pop-compose"><label for="eleanor-pop-reply">Reply to Eleanor</label>'+
  '<div class="eleanor-pop-compose-row"><textarea id="eleanor-pop-reply" name="message" rows="2" maxlength="4500" placeholder="Message Eleanor right here…" required></textarea>'+
  '<button class="eleanor-pop-send" type="submit" aria-label="Send reply to Eleanor">Send</button></div>'+
  '<p class="eleanor-pop-status" role="status"></p></form>'+
  '<footer class="eleanor-pop-footer"><button type="button" data-eleanor-pop-desk>Open secretary desk</button><span>Closing this window does not cancel reminders.</span></footer></section>';
 document.body.append(el);
 el.querySelector('.eleanor-pop-card').focus({preventScroll:true});
 el.querySelector('.eleanor-pop-close').onclick=()=>closePopup();
 el.addEventListener('click',event=>{if(event.target===el)closePopup()});
 el.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closePopup()}
 });
 el.querySelector('[data-eleanor-pop-desk]').onclick=()=>{
  closePopup();
  window.agentHQOpenSecretary?.();
 };
 const form=el.querySelector('form');
 form.onsubmit=async event=>{
  event.preventDefault();
  if(sendBusy||!botId)return;
  const field=form.elements.namedItem('message'),message=String(field?.value||'').trim();
  if(!message)return;
  sendBusy=true;
  const status=el.querySelector('.eleanor-pop-status'),send=el.querySelector('.eleanor-pop-send');
  send.disabled=true;send.textContent='Sending…';status.textContent='Sending to Eleanor…';
  try{
   if(!window.agentHQBotStudioCloud?.send)throw Error('Eleanor’s chat is not ready; please open her conversation.');
   const result=await window.agentHQBotStudioCloud.send(botId,message);
   const log=el.querySelector('[data-eleanor-pop-history]');
   if(!el.isConnected)return;
   const reply=result?.result?.reply||result?.history?.filter(x=>x.sender==='worker').at(-1)?.body;
   if(!reply)throw Error('Your message was sent but Eleanor’s reply is not available yet. Check her conversation.');
   log.insertAdjacentHTML('beforeend','<p class="eleanor-pop-mine">'+esc(message)+'</p><p class="eleanor-pop-theirs">'+esc(reply)+'</p>');
   field.value='';status.textContent='Eleanor’s reply is saved in your conversation.';
   log.scrollTop=log.scrollHeight;
  }catch(error){if(el.isConnected)status.textContent='Could not confirm reply: '+String(error?.message||error)}
  finally{sendBusy=false;if(el.isConnected){send.disabled=false;send.textContent='Send'}}
 };
}
async function check(force=false){
 if(checking||document.hidden||node())return;
 if(!force&&Date.now()-lastCheck<15000)return;
 checking=true;const ticket=++sequence;
 try{
  const {data:auth,error:authError}=await agentCloud.auth.getUser();
  if(authError||!auth?.user){if(owner!==null){closePopup(false);owner=null;botId=null;latestState=null}return}
  if(owner!==auth.user.id){closePopup(false);owner=auth.user.id;botId=null;latestState=null}
  const {data,error}=await agentCloud.functions.invoke('agent-secretary',{body:{action:'state'}});
  if(ticket!==sequence||error||!data?.settings)return;
  botId=data.settings.bot_id;
  latestState=data;
  lastCheck=Date.now();
  const notices=noticeList(data);
  if(!notices.length)return;
  const alert=alertGroup(notices);
  if(!dismissed().includes(alert.key))popup(alert);
 }catch(error){/* Unavailable network/sign-in never creates an invented alert. */}
 finally{checking=false}
}
window.agentHQEleanorPopup={check:()=>check(true),close:closePopup};
agentCloud.auth.onAuthStateChange((event,session)=>{
 if(!session?.user){closePopup(false);owner=null;botId=null;latestState=null;sequence++;lastCheck=0}
 setTimeout(()=>void check(true),700);
});
window.addEventListener('focus',()=>void check(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check(true)});
setInterval(()=>void check(),20000);
setTimeout(()=>void check(true),1500);
