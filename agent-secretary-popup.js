// Eleanor's owner-private foreground contact window.
// Restoring saved notices never completes, stops or approves their underlying work.
import {AGENT_HQ_SUPABASE_URL} from './agent-cloud-config.js';
import {savedSecretaryOwner,readSecretarySnapshot,saveSecretarySnapshot,clearSecretarySnapshot} from './agent-secretary-snapshot.js?v=20261107-chatgpt-desk-1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const POPUP_ID='agenthq-eleanor-popup',MAX_DISMISSED=80;
const AUTH_KEY='sb-'+new URL(AGENT_HQ_SUPABASE_URL).hostname.split('.')[0]+'-auth-token';
let storage;try{storage=window.localStorage;}catch{}
let owner=null,botId=null,activeKey=null,inFlight=null,sendTicket=null,sequence=0,lastCheck=0,latestSnapshot=null,latestSource='saved',renderedNotices='';
let cloudReady;
const node=()=>document.getElementById(POPUP_ID);
const dismissedKey=()=>owner?'agenthq-eleanor-popup-dismissed-v1:'+owner:'';
function dismissed(){
 try{const value=JSON.parse(storage?.getItem(dismissedKey())||'[]');return Array.isArray(value)?value:[];}catch{return [];}
}
function remember(key){
 if(!owner||!key)return;
 try{const keys=dismissed().filter(x=>x!==key);keys.push(key);storage?.setItem(dismissedKey(),JSON.stringify(keys.slice(-MAX_DISMISSED)));}catch{}
}
function closePopup(rememberThis=true,immediate=false){
 const panel=node();
 if(rememberThis&&activeKey)remember(activeKey);
 activeKey=null;renderedNotices='';
 if(!panel)return;
 if(immediate){panel.remove();return;}
 panel.classList.add('eleanor-pop-exit');
 setTimeout(()=>{if(panel.isConnected)panel.remove();presentLatest();},190);
}
function alertGroup(snapshot){
 return {key:'notices:'+snapshot.notices.map(n=>n.id).sort().join(':'),notices:snapshot.notices,total:snapshot.notices.length};
}
function heading(alert){
 if(alert.total&&alert.notices.every(n=>n.chatgpt))return alert.total===1?'A ChatGPT update from Eleanor':'ChatGPT requests and results';
 if(alert.total===1&&alert.notices.some(n=>/Eleanor daily check-in/i.test(n.body||'')))return 'Eleanor’s daily check-in';
 return alert.total===1?'A reminder from Eleanor':alert.total>1?'Eleanor has '+alert.total+' items for you':'You’re up to date';
}
function alertHTML(alert){
 return alert.notices.map(n=>'<div class="eleanor-pop-alert-item"><small>'+esc(n.kind||'Reminder')+'</small><p>'+esc(n.body||'You have a saved reminder.')+'</p></div>').join('')||
  '<p>Your saved reminders have been updated. You can continue your conversation here.</p>';
}
function sourceText(){
 return latestSource==='fresh'?'Personal Executive Secretary · Private message':
  latestSource==='offline'?'Saved reminders · Connection unavailable':'Saved reminders · Checking for updates…';
}
function paintPopup(alert){
 const panel=node();if(!panel)return;
 const html=alertHTML(alert);
 if(html!==renderedNotices){
  const content=panel.querySelector('.eleanor-pop-content'),top=content.scrollTop;
  panel.querySelector('[data-eleanor-pop-alerts]').innerHTML=html;
  renderedNotices=html;content.scrollTop=top;
 }
 panel.querySelector('[data-eleanor-pop-heading]').textContent=heading(alert);
 panel.querySelector('[data-eleanor-pop-source]').textContent=sourceText();
 panel.querySelector('[data-eleanor-pop-desk]').textContent=alert.notices.some(n=>n.chatgpt)?'Open ChatGPT requests':alert.notices.some(n=>/Eleanor daily check-in/i.test(n.body||''))?'Answer daily check-in':alert.notices.some(n=>n.agent)?'Review agent alerts':'Open secretary desk';
 activeKey=alert.total?alert.key:null;
}
async function appAction(getAction,account,panel){
 await cloudReady;
 const until=Date.now()+5000;
 while(account===owner&&panel.isConnected){
  const action=getAction();if(typeof action==='function')return action;
  if(Date.now()>=until)break;
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 throw Error('Agent HQ is still connecting. Please try again; your reply is kept.');
}
function popup(alert){
 if(!owner||document.hidden||node()||document.querySelector('dialog[open]'))return;
 const el=document.createElement('div');
 el.id=POPUP_ID;el.className='eleanor-pop-overlay';
 el.innerHTML='<section class="eleanor-pop-card" role="dialog" aria-modal="true" aria-labelledby="eleanor-pop-title" tabindex="-1">'+
  '<header class="eleanor-pop-header"><span class="eleanor-pop-face" aria-hidden="true">👩🏽‍💼</span>'+
  '<div class="eleanor-pop-ident"><strong id="eleanor-pop-title">Eleanor</strong><small data-eleanor-pop-source></small></div>'+
  '<button type="button" class="eleanor-pop-close" aria-label="Close Eleanor popup" title="Close">×</button></header>'+
  '<div class="eleanor-pop-content"><h2 data-eleanor-pop-heading></h2><div data-eleanor-pop-alerts></div>'+
  '<div class="eleanor-pop-conversation" role="log" aria-live="polite" data-eleanor-pop-history></div></div>'+
  '<form class="eleanor-pop-compose"><label for="eleanor-pop-reply">Reply to Eleanor</label>'+
  '<div class="eleanor-pop-compose-row"><textarea id="eleanor-pop-reply" name="message" rows="2" maxlength="4500" placeholder="Message Eleanor right here…" required></textarea>'+
  '<button class="eleanor-pop-send" type="submit" aria-label="Send reply to Eleanor">Send</button></div>'+
  '<p class="eleanor-pop-status" role="status"></p></form>'+
  '<footer class="eleanor-pop-footer"><button type="button" data-eleanor-pop-desk></button><span>Closing this window does not approve or cancel any request.</span></footer></section>';
 document.body.append(el);paintPopup(alert);
 el.querySelector('.eleanor-pop-card').focus({preventScroll:true});
 el.querySelector('.eleanor-pop-close').onclick=()=>closePopup();
 el.addEventListener('click',event=>{if(event.target===el)closePopup();});
 el.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closePopup();}});
 el.querySelector('[data-eleanor-pop-desk]').onclick=async event=>{
  const account=owner,button=event.currentTarget,status=el.querySelector('.eleanor-pop-status');
  button.disabled=true;status.textContent='Opening your secretary desk…';
  try{
   const chatgpt=latestSnapshot?.notices.some(n=>n.chatgpt);
   const open=await appAction(()=>chatgpt?window.agentHQOpenChatGPT:window.agentHQOpenSecretary,account,el);
   if(account!==owner||!el.isConnected)return;
   const agent=latestSnapshot?.notices.some(n=>n.agent),notes=latestSnapshot?.notices.some(n=>/Eleanor reviewed an Agent HQ Note/.test(n.body||'')),checkin=latestSnapshot?.notices.some(n=>/Eleanor daily check-in/i.test(n.body||''));closePopup();open();
   if(checkin&&!chatgpt)window.dispatchEvent(new Event('agenthq-secretary-show-checkin'));
   else if(notes&&!chatgpt)window.dispatchEvent(new Event('agenthq-secretary-show-notes'));
   else if(agent&&!chatgpt)window.dispatchEvent(new Event('agenthq-secretary-show-alerts'));
  }catch(error){if(account===owner&&el.isConnected)status.textContent=String(error?.message||error);}
  finally{if(el.isConnected)button.disabled=false;}
 };
 const form=el.querySelector('form');
 form.onsubmit=async event=>{
  event.preventDefault();
  if(sendTicket?.owner===owner||!botId)return;
  const field=form.elements.namedItem('message'),message=String(field?.value||'').trim();
  if(!message)return;
  const ticket={owner};sendTicket=ticket;
  const status=el.querySelector('.eleanor-pop-status'),send=el.querySelector('.eleanor-pop-send');
  send.disabled=true;send.textContent='Sending…';status.textContent='Sending to Eleanor…';
  try{
   const sendMessage=await appAction(()=>window.agentHQBotStudioCloud?.send,ticket.owner,el);
   if(ticket.owner!==owner||!el.isConnected)return;
   const result=await sendMessage(botId,message);
   if(ticket.owner!==owner||!el.isConnected)return;
   const log=el.querySelector('[data-eleanor-pop-history]');
   const reply=result?.result?.reply||result?.history?.filter(x=>x.sender==='worker').at(-1)?.body;
   if(!reply)throw Error('Your message was sent but Eleanor’s reply is not available yet. Check her conversation.');
   log.insertAdjacentHTML('beforeend','<p class="eleanor-pop-mine">'+esc(message)+'</p><p class="eleanor-pop-theirs">'+esc(reply)+'</p>');
   field.value='';status.textContent='Eleanor’s reply is saved in your conversation.';log.scrollTop=log.scrollHeight;
   invalidate();void check(true);
  }catch(error){if(ticket.owner===owner&&el.isConnected)status.textContent='Could not confirm reply: '+String(error?.message||error);}
  finally{if(sendTicket===ticket)sendTicket=null;if(el.isConnected){send.disabled=false;send.textContent='Send';}}
 };
}
function presentLatest(){
 if(!owner||!latestSnapshot||latestSnapshot.owner_id!==owner)return;
 const panel=node(),alert=alertGroup(latestSnapshot),hidden=dismissed().includes(alert.key);
 if(panel?.classList.contains('eleanor-pop-exit'))return;
 if(panel){
  if(!alert.total||hidden){
   if(sendTicket?.owner===owner||panel.querySelector('textarea').value.trim()||panel.querySelector('[data-eleanor-pop-history]').children.length)
    paintPopup({key:null,notices:[],total:0});
   else closePopup(false,true);
  }else paintPopup(alert);
 }else if(alert.total&&!hidden)popup(alert);
}
function restoreSaved(){
 if(!owner||savedSecretaryOwner(storage,AUTH_KEY)!==owner)return;
 const snapshot=readSecretarySnapshot(storage,owner);
 if(snapshot){botId=snapshot.bot_id;latestSnapshot=snapshot;latestSource='saved';presentLatest();}
}
function setOwner(next){
 if(next===owner)return;
 const previous=owner;
 sequence++;owner=next;lastCheck=0;botId=null;latestSnapshot=null;
 closePopup(false,true);clearSecretarySnapshot(storage,previous);
 if(next)restoreSaved();
}
function receiveState(data,ticketOwner,show=true){
 if(ticketOwner!==owner)return false;
 if(latestSnapshot?.bot_id===data?.settings?.bot_id&&data?.settings?.version<latestSnapshot.version)return false;
 const snapshot=saveSecretarySnapshot(storage,owner,data);
 if(!snapshot)return false;
 botId=snapshot.bot_id;latestSnapshot=snapshot;latestSource='fresh';lastCheck=Date.now();
 if(show||node())presentLatest();return true;
}
function invalidate(){
 sequence++;lastCheck=0;latestSnapshot=null;clearSecretarySnapshot(storage,owner);
}
function offline(){
 if(latestSource!=='fresh')latestSource='offline';
 const panel=node();if(panel)panel.querySelector('[data-eleanor-pop-source]').textContent=sourceText();
}
async function check(force=false){
 if(!owner||document.hidden||inFlight?.owner===owner&&inFlight.generation===sequence)return;
 if(!force&&Date.now()-lastCheck<15000)return;
 const ticket={owner,generation:sequence};inFlight=ticket;
 const current=()=>ticket.owner===owner&&ticket.generation===sequence;
 try{
  const client=await cloudReady;if(!current())return;
  const result=await client.functions.invoke('agent-secretary',{body:{action:'state'}});
  if(!current())return;
  if(result.error||result.data?.error){
   if([401,403].includes(result.error?.context?.status)){setOwner(null);}else offline();
   return;
  }
  const data=result.data;
  if(!receiveState(data,ticket.owner))return;
  // Present existing notices first. Processing a newly due item must not delay reading.
  const due=(data.items||[]).some(i=>i.status==='active'&&i.kind!=='workout'&&i.next_due_at&&Date.parse(i.next_due_at)<=Date.now());
  if(due){
   const run=await client.functions.invoke('agent-secretary',{body:{action:'check_due'}});
   if(!current())return;
   if(!run.error&&!run.data?.error){
    const refreshed=await client.functions.invoke('agent-secretary',{body:{action:'state'}});
    if(current()&&!refreshed.error&&!refreshed.data?.error)receiveState(refreshed.data,ticket.owner);
   }
  }
 }catch{if(current())offline();}
 finally{if(inFlight===ticket)inFlight=null;}
}
window.agentHQEleanorPopup={check:()=>check(true),close:closePopup};
window.addEventListener('agenthq-secretary-state',event=>{
 if(event.detail?.owner_id===owner)receiveState(event.detail.state,owner,false);
});
window.addEventListener('agenthq-secretary-state-invalidated',event=>{if(event.detail?.owner_id===owner)invalidate();});
window.addEventListener('storage',event=>{
 if(event.key===AUTH_KEY||event.key===null){setOwner(savedSecretaryOwner(storage,AUTH_KEY));void check(true);}
});
window.addEventListener('focus',()=>{presentLatest();void check(true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){presentLatest();void check(true);}});
document.addEventListener('close',()=>presentLatest(),true);
setInterval(()=>void check(),20000);

// This local path runs before the SDK or either authentication/server request finishes.
owner=savedSecretaryOwner(storage,AUTH_KEY);restoreSaved();
cloudReady=import('./agent-cloud-auth.js').then(({agentCloud})=>{
 agentCloud.auth.onAuthStateChange((_event,session)=>{
  const next=session?.user?.id||null;
  if(!next&&owner===null){latestSnapshot=null;closePopup(false,true);}
  setOwner(next);
  // Leave the auth callback immediately; no fixed startup delay or nested auth request.
  if(next)setTimeout(()=>void check(true),0);
 });
 return agentCloud;
});
void cloudReady.then(()=>check(true)).catch(()=>offline());

window.addEventListener('agenthq-chatgpt-requests-updated',event=>{if(event.detail?.owner_id===owner){invalidate();void check(true);}});
