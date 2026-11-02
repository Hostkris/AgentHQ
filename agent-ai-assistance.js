// AI assistance for existing Alex and Eleanor. This is the Agent HQ provider,
// not a live ChatGPT subscription/chat session and not an account action.
import {agentCloud} from './agent-cloud-auth.js';
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let currentDialog=null,currentWorker=null,working=false;
const cache=new Map(),pending=new Map();
const allowed=new Set(['alex','eleanor']);
const username=w=>w==='eleanor'?'Eleanor':'Alex';
async function invoke(action,body={}){
 const {data:user,error:authError}=await agentCloud.auth.getUser();
 if(authError||!user?.user)throw Error('Sign in to Agent HQ first.');
 const {data,error}=await agentCloud.functions.invoke('agent-bot-studio',{body:{action,...body}});
 let failure=data?.error;
 if(error&&!failure&&typeof error.context?.clone==='function'){
  try{failure=(await error.context.clone().json())?.error}catch{}
 }
 if(error||failure)throw Error(failure||error.message||'The assistance service is unavailable.');
 return data||{};
}
async function refresh(worker){
 if(!allowed.has(worker))return [];
 if(pending.has(worker))return pending.get(worker);
 const promise=invoke('ai_assistance_history',{worker}).then(data=>{
  const rows=data.requests||[];
  cache.set(worker,rows);renderHistory(worker);return rows;
 }).finally(()=>pending.delete(worker));
 pending.set(worker,promise);return promise;
}
function historyHTML(worker){
 const rows=cache.get(worker)||[];
 const label=username(worker);
 return '<section class="agent-ai-help-history"><h3>Saved requests · '+label+'</h3>'+
 (rows.length?rows.map(row=>
  '<article class="agent-ai-help-record"><div class="agent-ai-help-record-head"><strong>'+
  escapeHTML(row.status==='completed'?'Completed ✓':row.status==='failed'?'Needs attention':'Processing…')+
  '</strong><small>'+escapeHTML(new Date(row.created_at).toLocaleString())+'</small></div>'+
  '<p class="agent-ai-help-task">'+escapeHTML(row.task)+'</p>'+
  (row.status==='completed'?'<pre>'+escapeHTML(row.response)+'</pre>':
    row.status==='failed'?'<p role="alert">'+escapeHTML(row.error_summary||'The model provider could not finish this request.')+'</p>':
    '<p>The request was saved. Reopen later to check its outcome.</p>')+
  '</article>').join(''):
  '<p>No saved AI assistance requests yet.</p>')+'</section>';
}
function renderHistory(worker){
 if(!currentDialog?.isConnected||worker!==currentWorker)return;
 const area=currentDialog.querySelector('[data-ai-assist-history]');if(area)area.innerHTML=historyHTML(worker);
}
function close(){
 if(!currentDialog)return;
 const d=currentDialog;currentDialog=null;currentWorker=null;
 if(d.open)d.close();d.remove();
}
function open(worker){
 if(!allowed.has(worker))return;
 close();currentWorker=worker;
 const d=document.createElement('dialog');
 d.className='agent-ai-help-dialog';currentDialog=d;
 d.innerHTML='<div class="agent-ai-help-shell"><header><div><small>AGENT HQ · INTERNAL AI</small><h2>Request AI Assistance</h2><p>For '+username(worker)+' · Uses your configured AI model, not this live ChatGPT conversation.</p></div><button type="button" data-ai-assist-close aria-label="Close request">×</button></header>'+
 '<form data-ai-assist-form><label>What does '+username(worker)+' need help with?<textarea name="task" rows="4" minlength="12" maxlength="2500" required placeholder="Example: Prepare a three-post launch plan and list what needs my approval."></textarea></label>'+
 '<p class="agent-ai-help-disclosure">Drafting and analysis only. No calendar access, posting, email, payment, or external account changes. Requests are saved under '+username(worker)+' and count toward the 12-request daily allowance.</p>'+
 '<div class="agent-ai-help-buttons"><button type="submit" class="agent-ai-help-submit">Send AI request</button><button type="button" data-ai-assist-recheck>Refresh history</button></div></form>'+
 '<p data-ai-assist-status role="status" aria-live="polite">Loading saved assistance history…</p><div data-ai-assist-history></div></div>';
 document.body.append(d);
 d.addEventListener('close',()=>{if(currentDialog===d){currentDialog=null;currentWorker=null;}d.remove();},{once:true});
 d.showModal();
 void refresh(worker).then(()=>{if(d===currentDialog){const el=d.querySelector('[data-ai-assist-status]');if(el)el.textContent='Previous AI requests are shown below.';}}).catch(error=>{if(d===currentDialog)d.querySelector('[data-ai-assist-status]').textContent='Could not load history: '+error.message;});
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest?.('[data-ai-assist-open]');
 if(trigger){
  event.preventDefault();open(trigger.dataset.aiAssistOpen);return;
 }
 if(event.target.closest?.('[data-ai-assist-close]')){event.preventDefault();if(!working)close();return;}
 if(event.target.closest?.('[data-ai-assist-recheck]')){
  event.preventDefault();
  const el=currentDialog?.querySelector('[data-ai-assist-status]');if(el)el.textContent='Checking saved requests…';
  void refresh(currentWorker).then(()=>{if(el?.isConnected)el.textContent='History refreshed.';}).catch(error=>{if(el?.isConnected)el.textContent=error.message});
 }
});
document.addEventListener('submit',event=>{
 const form=event.target.closest?.('[data-ai-assist-form]');
 if(!form)return;event.preventDefault();
 if(working||!currentDialog)return;
 const worker=currentWorker,task=String(form.elements.namedItem('task')?.value||'').trim(),d=currentDialog;
 if(task.length<12)return;
 working=true;
 const button=form.querySelector('[type=submit]'),status=d.querySelector('[data-ai-assist-status]'),requestId=crypto.randomUUID();
 button.disabled=true;button.textContent='Requesting AI…';d.querySelector('[data-ai-assist-close]').disabled=true;
 status.textContent='Request saved and being sent to the configured model. Please wait for a verified response.';
 void (async()=>{
  try{
   const res=await invoke('ai_assistance',{worker,task,request_id:requestId});
   if(!res.request?.id)throw Error('The server did not confirm a saved request.');
   status.textContent=res.request.status==='completed'?'AI response saved for '+username(worker)+'.':'Request saved. Refresh history to check the result.';
   form.elements.namedItem('task').value='';
  }catch(error){status.textContent='AI request could not finish: '+String(error.message||error)+'. Check saved history before resubmitting.';}
  finally{
   working=false;
   if(button.isConnected){button.disabled=false;button.textContent='Send AI request';}
   const closeButton=d.querySelector('[data-ai-assist-close]');if(closeButton)closeButton.disabled=false;
   await refresh(worker).catch(()=>{});
  }
 })();
});
window.agentHQAssistance={open,refresh,historyHTML};
