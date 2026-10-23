import {agentCloud} from './agent-cloud-auth.js';
let generation=0,rows=[],fingerprint='',formDraft=null;
const busy=new Set(),captures=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fb='https://www.facebook.com/';
function profileUrl(handle){try{if(/^https:\/\//i.test(handle)){const u=new URL(handle);if(['facebook.com','www.facebook.com','m.facebook.com'].includes(u.hostname))return u.href}if(/^[\w.]{2,120}$/.test(String(handle).replace(/^@/,'')))return fb+encodeURIComponent(String(handle).replace(/^@/,''))}catch{}return ''}
function readerHelp(){return '<details class="social-reader-help"><summary>Set up the free Safari reader</summary><ol><li>Install <a href="https://apps.apple.com/us/app/userscripts/id1463298887" target="_blank" rel="noopener noreferrer">Userscripts</a> on your iPhone or iPad. Open it once.</li><li>Enable Userscripts in Safari Extensions and allow it for Facebook and Messenger only.</li><li>Open <a href="./safari/agent-hq-reader.user.js" target="_blank" rel="noopener noreferrer">Agent HQ Safari reader</a>, then open the Userscripts extension menu to install the script.</li><li>Open the approved Facebook page in Safari. Tap Read for Agent HQ, review the visible text, then Copy capture. Return to Riley’s thread and paste it into that approved request.</li></ol><p>The reader does not send anything to Facebook or automatically upload page text. Mobile Facebook or Messenger may not display every message, comment or metric.</p></details>'}
window.agentHQFacebookReadAccount=account=>'<section class="personal-browser-setup"><h4>Facebook in Safari</h4><a class="social-read-link" href="'+fb+'" target="_blank" rel="noopener noreferrer">Sign in to Facebook ↗</a><button type="button" class="back" data-facebook-copy-link>Copy Facebook link</button><p class="personal-muted">Facebook keeps its own Safari session and may ask you to sign in again. Agent HQ does not store your Facebook password or verify that session. If the link opens the Facebook app, copy the link and paste it into Safari.</p><form data-fb-read-request="'+esc(account.id)+'"><label>Page to review<input name="source_url" type="url" required maxlength="1200" value="'+esc(profileUrl(account.handle))+'" placeholder="Paste the exact Facebook page address"></label><label>Research task<textarea name="purpose" required minlength="5" maxlength="1000" rows="3" placeholder="Review this page and suggest ways to improve engagement."></textarea></label><button class="personal-primary" type="submit">Ask Riley for reading approval</button><p data-social-read-feedback role="status"></p></form>'+readerHelp()+'</section>';
function requestForm(draft){return '<div class="ios-message-row incoming"><section class="ios-message-bubble theirs social-read-card"><strong>Riley · Choose the page to read</strong><p>Select your saved Facebook profile and the exact page. I’ll ask for approval before analysis.</p><form data-social-chat-request><label>Saved profile<select name="account_id" required>'+draft.accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.label)+' · '+esc(a.handle)+'</option>').join('')+'</select></label><label>Page URL<input type="url" name="source_url" required maxlength="1200" value="'+esc(draft.url)+'" placeholder="Paste the exact page URL from Safari"></label><label>Task<textarea name="purpose" required minlength="5" maxlength="1000">'+esc(draft.purpose)+'</textarea></label><button type="submit" class="personal-primary">Request reading approval</button><p data-social-read-feedback role="status"></p></form></section></div>'}
function stateOf(r){return ['pending','approved','analyzing'].includes(r.status)&&Date.parse(r.expires_at)<=Date.now()?'expired':r.status}
window.agentHQSocialReadThread=worker=>{
 if(worker!=='riley')return '';
 return (formDraft?requestForm(formDraft):'')+rows.slice(0,10).reverse().map(r=>{
  const status=stateOf(r),disabled=busy.has(r.id)?' disabled':'';
  let actions='';
  if(status==='pending')actions='<div class="social-read-actions"><button type="button" class="personal-primary" data-social-decision="approve" data-social-id="'+esc(r.id)+'"'+disabled+'>Approve reading</button><button type="button" class="back" data-social-decision="deny" data-social-id="'+esc(r.id)+'"'+disabled+'>Deny</button></div><p>One page, one analysis using Agent HQ’s Groq connection. You review and share the text. The report is saved in this private thread. No posting or replying permission.</p>';
  if(status==='approved')actions='<p>Approved until '+esc(new Date(r.expires_at).toLocaleTimeString())+'. Open this exact page in Safari and use Read for Agent HQ.</p><a href="'+esc(r.source_url)+'" target="_blank" rel="noopener noreferrer">Open approved page ↗</a>'+readerHelp()+'<form data-social-analyze="'+esc(r.id)+'"><label>Paste the Safari capture<textarea name="capture" required maxlength="90000" rows="5" placeholder="Paste the capture copied by Read for Agent HQ.">'+esc(captures.get(r.id)||'')+'</textarea></label><button type="submit" class="personal-primary"'+disabled+'>Share approved text &amp; analyze</button><p data-social-read-feedback role="status"></p></form>';
  if(status==='analyzing')actions='<p>Analyzing the approved text you shared…</p>';
  if(['approved','analyzing'].includes(status))actions+='<button type="button" class="back" data-social-decision="revoke" data-social-id="'+esc(r.id)+'"'+disabled+'>Revoke reading permission</button>';
  if(status==='completed')actions='<p>Report saved in this thread. This permission has been used.</p>';
  if(status==='failed')actions='<p>'+esc(r.error||'Analysis could not finish. Create a new request to try again.')+'</p>';
  return '<div class="ios-message-row incoming"><section class="ios-message-bubble theirs social-read-card" data-social-read-card="'+esc(r.id)+'"><strong>Riley · Facebook reading request</strong><span class="social-read-status">'+esc(status)+'</span><p>'+esc(r.purpose)+'</p><p class="social-read-source">'+esc(r.source_url)+'</p>'+actions+'</section></div>';
 }).join('');
};
async function user(){const {data,error}=await agentCloud.auth.getUser();if(error||!data?.user)throw Error('Sign into Agent HQ under Settings first.');return data.user}
async function invoke(body){const current=generation;await user();if(current!==generation)throw Error('Your account changed. Try again.');const {data,error}=await agentCloud.functions.invoke('agent-social-read',{body});if(current!==generation)throw Error('Your account changed.');if(error||!data?.success){let reason=data?.error;try{if(!reason&&error?.context?.clone)reason=(await error.context.clone().json())?.error}catch{}throw Error(reason||'Reading request could not finish.')}return data}
async function refresh(){
 const current=generation;let owner;try{owner=await user()}catch{if(current===generation&&(rows.length||formDraft||captures.size)){rows=[];fingerprint='';formDraft=null;captures.clear();window.agentHQSocialReadSync?.()}return}
 const {data,error}=await agentCloud.from('agent_social_read_requests').select('id,account_id,employee_id,source_url,purpose,status,created_at,expires_at,error').eq('owner_id',owner.id).order('created_at',{ascending:false}).limit(20);
 if(current!==generation)return;if(error)throw Error(error.message);
 const next=JSON.stringify(data||[]);if(next!==fingerprint){rows=data||[];fingerprint=next;for(const id of captures.keys())if(!rows.some(r=>r.id===id&&r.status==='approved'))captures.delete(id);window.agentHQSocialReadSync?.()}
}
async function updateAfter(){await Promise.all([refresh(),window.agentHQChatCloud?.refresh()])}
async function request(accountId,url,purpose){await invoke({action:'request',account_id:accountId,source_url:url,purpose});formDraft=null;await updateAfter();window.agentHQSocialReadOpen?.();return {success:true}}
async function requestFromChat(text){
 const current=generation,owner=await user();if(current!==generation)throw Error('Your account changed.');const {data,error}=await agentCloud.from('agent_personal_accounts').select('id,label,handle').eq('owner_id',owner.id).eq('platform','facebook');
 if(current!==generation)throw Error('Your account changed.');
 if(error)throw Error(error.message);const accounts=data||[];if(!accounts.length)throw Error('Save your Facebook profile in My Accounts first.');
 const t=text.toLowerCase(),matches=accounts.filter(a=>t.includes(a.handle.toLowerCase())||t.includes(a.label.toLowerCase()));const chosen=matches.length===1?matches[0]:accounts.length===1?accounts[0]:null;
 const url=text.match(/https:\/\/(?:[\w.-]+\.)?(?:facebook|messenger)\.com\/[^\s<>]*/i)?.[0]||'';
 if(chosen&&!/\b(messages?|inbox|conversation)\b/i.test(text)&&text.length<=1000)return request(chosen.id,url||profileUrl(chosen.handle),text);
 await window.agentHQChatCloud.send('riley',text);
 if(current!==generation)throw Error('Your account changed.');
 formDraft={accounts,url:url||(chosen&&!/\b(messages?|inbox|conversation)\b/i.test(text)?profileUrl(chosen.handle):''),purpose:text.slice(0,1000)};
 await window.agentHQChatCloud.refresh();window.agentHQSocialReadSync?.();return {success:true};
}
window.agentHQSocialReadCloud={refresh,requestFromChat,matches:(worker,text)=>worker==='riley'&&/\b(facebook|messenger)\b/i.test(text)&&/\b(read|research|review|check|analy[sz]e|audit|look|engagement|repl(?:y|ies))\b/i.test(text)};
document.addEventListener('input',e=>{const form=e.target.closest?.('[data-social-analyze]');if(form&&e.target.name==='capture')captures.set(form.dataset.socialAnalyze,e.target.value)});
document.addEventListener('click',async e=>{
 const copy=e.target.closest?.('[data-facebook-copy-link]');if(copy){try{await navigator.clipboard.writeText(fb);copy.textContent='Link copied — paste into Safari'}catch{copy.textContent=fb}return}
 const button=e.target.closest?.('[data-social-decision]');if(!button)return;const id=button.dataset.socialId;if(busy.has(id))return;busy.add(id);button.disabled=true;
 try{await invoke({action:button.dataset.socialDecision,id});await updateAfter()}catch(err){const card=button.closest('[data-social-read-card]');if(card){let p=card.querySelector('[data-social-read-error]');if(!p){p=document.createElement('p');p.dataset.socialReadError='';p.setAttribute('role','status');card.append(p)}p.textContent=err.message}}
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
agentCloud.auth.onAuthStateChange(()=>{generation++;rows=[];fingerprint='';formDraft=null;captures.clear();busy.clear();window.agentHQSocialReadSync?.();setTimeout(load,0)});
window.addEventListener('focus',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});setInterval(()=>{if(!document.hidden)load()},30000);load();
