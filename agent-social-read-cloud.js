import {agentCloud} from './agent-cloud-auth.js';
let generation=0,rows=[],fingerprint='';
const bootTime=Date.now();let returnChecked=false,lastOwner=null;const connectionNotes=new Map();
const busy=new Set(),captures=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fb='https://www.facebook.com/';
function profileUrl(handle){try{if(/^https:\/\//i.test(handle)){const u=new URL(handle);if(['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))return u.href}if(/^[\w.]{2,120}$/.test(String(handle).replace(/^@/,'')))return fb+encodeURIComponent(String(handle).replace(/^@/,''))}catch{}return ''}
function readerHelp(){return '<details class="social-reader-help"><summary>Connect Safari on iPhone or iPad</summary><ol><li>Install <a href="https://apps.apple.com/us/app/userscripts/id1463298887" target="_blank" rel="noopener noreferrer">Userscripts</a>. Open it once, then enable its Safari extension.</li><li>Allow the extension for hostkris.github.io and the Facebook/Messenger sites you use.</li><li>Open <a href="./safari/agent-hq-connected-reader.user.js" target="_blank" rel="noopener noreferrer">Connected Safari reader</a> in Safari, then use the Userscripts extension menu to install it.</li><li>Open Agent HQ in Safari, sign in, ask Riley to review Facebook, then reply approved to Riley’s specific reading request.</li></ol><p>The approved page opens in Safari. After a five-second stop window, the connector sends loaded page text to Riley through Agent HQ’s Groq connection and saves the report in this thread. Keep Safari open. It excludes form fields and editable drafts. It cannot read hidden messages, post, reply or control another app.</p><p>For a manual preview instead, use the <a href="./safari/agent-hq-reader.user.js" target="_blank" rel="noopener noreferrer">original copy-and-paste reader</a> and the manual capture option below.</p></details>'}

window.agentHQFacebookReadAccount=account=>'<section class="personal-browser-setup"><h4>Facebook in Safari</h4><a class="social-read-link" href="'+fb+'" target="_blank" rel="noopener noreferrer">Sign in to Facebook ↗</a><button type="button" class="back" data-facebook-copy-link>Copy Facebook link</button><p class="personal-muted">Facebook keeps its own Safari session and may ask you to sign in again. Agent HQ does not store your Facebook password or verify that session. If the link opens the Facebook app, copy the link and paste it into Safari.</p><form data-fb-read-request="'+esc(account.id)+'"><label>Page to review<input name="source_url" type="url" required maxlength="1200" value="'+esc(profileUrl(account.handle))+'" placeholder="Paste the exact Facebook page address"></label><label>Research task<textarea name="purpose" required minlength="5" maxlength="1000" rows="3" placeholder="Review this page and suggest ways to improve engagement."></textarea></label><button class="personal-primary" type="submit">Ask Riley for reading approval</button><p data-social-read-feedback role="status"></p></form>'+readerHelp()+'</section>';

function stateOf(r){return ['pending','approved','analyzing'].includes(r.status)&&Date.parse(r.expires_at)<=Date.now()?'expired':r.status}
function requestBubble(r){
 const status=stateOf(r),disabled=busy.has(r.id)?' disabled':'';let actions='';
 if(status==='pending')actions='<p>Reply <strong>approved</strong> to start this one-page review, or <strong>denied</strong> to decline. One page analysis through Agent HQ’s Groq connection, with permission lasting 15 minutes after approval. Safari opens the page while reading; the report returns here. No posting or sending permission.</p><details><summary>Approval buttons</summary><div class="social-read-actions"><button type="button" class="personal-primary" data-social-decision="approve" data-social-id="'+esc(r.id)+'"'+disabled+'>Approve reading</button><button type="button" class="back" data-social-decision="deny" data-social-id="'+esc(r.id)+'"'+disabled+'>Deny</button></div></details>';
 if(status==='approved')actions='<p>Approved for this page until '+esc(new Date(r.expires_at).toLocaleTimeString())+'. Reply <strong>continue</strong> to reconnect the reader, or <strong>stop</strong> to revoke permission.</p><p data-safari-feedback role="status">'+esc(connectionNotes.get(r.id)||'')+'</p><details><summary>Reader options</summary><button type="button" class="personal-primary" data-safari-connect="'+esc(r.id)+'"'+disabled+'>Retry Safari reader</button><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener noreferrer">Open approved page ↗</a>'+readerHelp()+'<form data-social-analyze="'+esc(r.id)+'"><label>Manual Safari capture<textarea name="capture" required maxlength="90000" rows="5">'+esc(captures.get(r.id)||'')+'</textarea></label><button type="submit" class="personal-primary"'+disabled+'>Share approved text &amp; analyze</button><p data-social-read-feedback role="status"></p></form></details>';
 if(status==='analyzing')actions='<p>Analyzing the approved page text. The report will appear in this thread.</p>';
 if(['approved','analyzing'].includes(status))actions+='<button type="button" class="back" data-social-decision="revoke" data-social-id="'+esc(r.id)+'"'+disabled+'>Stop this review</button>';
 if(status==='completed')actions='<p>Report saved in this thread. This permission has been used.</p>';
 if(status==='failed')actions='<p>'+esc(r.error||'Analysis could not finish. Ask Riley for a new review to try again.')+'</p>';
 return '<div class="ios-message-row incoming"><section class="ios-message-bubble theirs social-read-card" data-social-read-card="'+esc(r.id)+'"><strong>Riley · Facebook review</strong><span class="social-read-status">'+esc(status)+'</span><p>'+esc(r.purpose)+'</p><p class="social-read-source">'+esc(r.source_url)+'</p>'+actions+'</section></div>';
}
window.agentHQSocialReadMessage=(worker,messageId)=>worker==='riley'&&messageId?rows.filter(r=>r.prompt_message_id===messageId).map(requestBubble).join(''):'';
window.agentHQSocialReadThread=worker=>worker==='riley'?rows.filter(r=>!r.prompt_message_id).slice(0,10).reverse().map(requestBubble).join(''):'';

async function user(){const {data,error}=await agentCloud.auth.getUser();if(error||!data?.user)throw Error('Sign into Agent HQ under Settings first.');lastOwner=data.user.id;return data.user}
async function invoke(body){const current=generation;await user();if(current!==generation)throw Error('Your account changed. Try again.');const {data,error}=await agentCloud.functions.invoke('agent-social-read',{body});if(current!==generation)throw Error('Your account changed.');if(error||!data?.success){let reason=data?.error;try{if(!reason&&error?.context?.clone)reason=(await error.context.clone().json())?.error}catch{}throw Error(reason||'Reading request could not finish.')}return data}
async function refresh(){
 const current=generation;let owner;try{owner=await user()}catch{if(current===generation&&(rows.length||captures.size)){rows=[];fingerprint='';captures.clear();window.agentHQSocialReadSync?.()}return}
 if(!returnChecked){returnChecked=true;try{const key='agenthq_riley_read_return:'+owner.id,back=JSON.parse(localStorage.getItem(key)||'null');if(back&&back.created_at<bootTime&&Date.now()-back.created_at<20*60000){localStorage.removeItem(key);window.agentHQSocialReadOpen?.()}}catch{}}
 const {data,error}=await agentCloud.from('agent_social_read_requests').select('id,account_id,employee_id,source_url,purpose,status,created_at,expires_at,error,prompt_message_id').eq('owner_id',owner.id).order('created_at',{ascending:false}).limit(20);
 if(current!==generation)return;if(error)throw Error(error.message);
 const next=JSON.stringify(data||[]);if(next!==fingerprint){rows=data||[];fingerprint=next;for(const id of captures.keys())if(!rows.some(r=>r.id===id&&r.status==='approved'))captures.delete(id);window.agentHQSocialReadSync?.()}
}
async function updateAfter(){await Promise.all([refresh(),window.agentHQChatCloud?.refresh()])}
async function request(accountId,url,purpose){await invoke({action:'request',account_id:accountId,source_url:url,purpose});await updateAfter();window.agentHQSocialReadOpen?.();return {success:true}}
async function startRead(id){
 const current=generation;
 if(busy.has(id))return false;busy.add(id);connectionNotes.delete(id);window.agentHQSocialReadSync?.();
 try{
  await safariCommand('ping',undefined,1500);if(current!==generation)return false;
  const data=await invoke({action:'handoff',id});if(current!==generation)return false;
  const owner=await user();if(current!==generation)return false;
  try{localStorage.setItem('agenthq_riley_read_return:'+owner.id,JSON.stringify({created_at:Date.now(),id}))}catch{}
  const result=await safariCommand('connect',data.handoff);if(current!==generation)return false;
  connectionNotes.set(id,result.message);return true;
 }catch(err){
  if(current===generation){connectionNotes.set(id,err.message);await invoke({action:'chat_notice',id}).catch(()=>{});await updateAfter().catch(()=>{})}
  return false;
 }finally{busy.delete(id);if(current===generation)window.agentHQSocialReadSync?.()}
}
async function handleChat(text){
 if(text.length>1000)return {handled:false};
 const current=generation,data=await invoke({action:'chat',text});if(current!==generation)throw Error('Your account changed.');
 if(!data.handled)return data;
 await updateAfter();
 if(current===generation&&data.start_read_id)await startRead(data.start_read_id);
 return {...data,success:true};
}
window.agentHQSocialReadCloud={refresh,handleChat,requestFromChat:handleChat,matches:worker=>worker==='riley'};

document.addEventListener('input',e=>{const form=e.target.closest?.('[data-social-analyze]');if(form&&e.target.name==='capture')captures.set(form.dataset.socialAnalyze,e.target.value)});
function safariCommand(action,handoff,timeout=8000){return new Promise((resolve,reject)=>{
 const nonce=crypto.randomUUID();let timer;
 const done=()=>{clearTimeout(timer);document.removeEventListener('agenthq-safari-result',listener)};
 const listener=event=>{let r;try{r=JSON.parse(event.detail)}catch{return}if(r.nonce!==nonce)return;done();r.ok?resolve(r):reject(Error(r.message||'Safari connection failed.'))};
 document.addEventListener('agenthq-safari-result',listener);
 timer=setTimeout(()=>{done();reject(Error('Open Agent HQ in Safari and install/enable the Connected Safari reader using the setup instructions below. The Home Screen app may not run Safari extensions.'))},timeout);
 document.dispatchEvent(new CustomEvent('agenthq-safari-command',{detail:JSON.stringify({action,nonce,handoff})}));
})}
document.addEventListener('click',async e=>{
 const connect=e.target.closest?.('[data-safari-connect]');if(connect){await startRead(connect.dataset.safariConnect);return}

 const copy=e.target.closest?.('[data-facebook-copy-link]');if(copy){try{await navigator.clipboard.writeText(fb);copy.textContent='Link copied — paste into Safari'}catch{copy.textContent=fb}return}
 const button=e.target.closest?.('[data-social-decision]');if(!button)return;const id=button.dataset.socialId;if(busy.has(id))return;busy.add(id);button.disabled=true;
 try{const decision=button.dataset.socialDecision;await invoke({action:decision,id});await updateAfter();if(decision==='approve'){busy.delete(id);await startRead(id)}}catch(err){const card=button.closest('[data-social-read-card]');if(card){let p=card.querySelector('[data-social-read-error]');if(!p){p=document.createElement('p');p.dataset.socialReadError='';p.setAttribute('role','status');card.append(p)}p.textContent=err.message}}
 finally{busy.delete(id);document.querySelectorAll('[data-social-id]').forEach(b=>{if(b.dataset.socialId===id)b.disabled=false})}
});
document.addEventListener('submit',async e=>{
 const f=e.target.closest?.('[data-fb-read-request],[data-social-chat-request],[data-social-analyze]');if(!f)return;e.preventDefault();if(f.dataset.busy)return;f.dataset.busy='yes';const b=f.querySelector('button[type=submit]'),note=f.querySelector('[data-social-read-feedback]');b.disabled=true;const current=generation;
 try{const input=new FormData(f);
  if(f.hasAttribute('data-social-analyze')){const id=f.dataset.socialAnalyze;let capture;try{capture=JSON.parse(String(input.get('capture')||''))}catch{throw Error('Paste the full capture copied by Read for Agent HQ.')}await invoke({action:'analyze',id,capture});if(current===generation){captures.delete(id);await updateAfter()}}
  else await request(f.dataset.fbReadRequest||String(input.get('account_id')),String(input.get('source_url')),String(input.get('purpose')));
 }catch(err){if(current===generation&&note?.isConnected)note.textContent=err.message;await refresh().catch(()=>{})}
 finally{delete f.dataset.busy;if(b.isConnected)b.disabled=false}
});
const load=()=>refresh().catch(()=>{});
agentCloud.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'&&lastOwner){try{localStorage.removeItem('agenthq_riley_read_return:'+lastOwner)}catch{}}connectionNotes.clear();if(['SIGNED_OUT','SIGNED_IN'].includes(event))safariCommand('clear',undefined,500).catch(()=>{});generation++;rows=[];fingerprint='';captures.clear();busy.clear();window.agentHQSocialReadSync?.();setTimeout(load,0)});
window.addEventListener('focus',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});setInterval(()=>{if(!document.hidden)load()},30000);load();

