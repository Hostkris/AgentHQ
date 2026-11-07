import {agentCloud} from './agent-cloud-auth.js';
import {chatGPTStatusLabel,chatGPTPrompt} from './agent-chatgpt-app-core.js?v=20261107-chatgpt-desk-1';
import {openChatGPTConnection} from './agent-chatgpt-handoff.js?v=20261102-auto-handoff-sync-1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let root=null,owner=null,epoch=0,data=null,busy=false,loading=false,notice='',draft={worker:'eleanor',project:'',question:'',reason:''};
const host=()=>document.getElementById('agent-chatgpt-app-root');
async function api(action,extra={}){
 const ticket=epoch,{data:auth,error:ae}=await agentCloud.auth.getUser();if(ae||!auth.user)throw Error('Sign in under Settings → Account to open ChatGPT requests.');
 const {data:r,error}=await agentCloud.functions.invoke('agent-chatgpt-bridge',{body:{action,...extra}});
 if(ticket!==epoch)throw Error('The signed-in account changed.');
 let reason=r?.error;if(error?.context?.clone&&!reason)try{reason=(await error.context.clone().json())?.error}catch{}
 if(error||reason)throw Error(reason||error.message||'The ChatGPT request could not be saved.');
 if(!['chatgpt_desk','status'].includes(action))window.dispatchEvent(new CustomEvent('agenthq-chatgpt-requests-updated',{detail:{owner_id:auth.user.id}}));
 return r;
}
async function load(){
 if(loading)return;loading=true;const ticket=epoch;
 try{const next=await api('chatgpt_desk');if(ticket!==epoch)return;data=next;notice='';}
 catch(e){if(ticket===epoch)notice=e.message;}
 finally{if(ticket===epoch){loading=false;if(!document.activeElement?.closest('#agent-chatgpt-app-root form'))render();}}
}
function requestCard(r){
 const active=['ready','in_progress','blocked'].includes(r.status),review=r.status==='review';
 return '<article class="chatgpt-request" data-chatgpt-card="'+esc(r.id)+'"><header><h3>'+esc(r.requester_label)+'</h3><span class="chatgpt-request-status">'+esc(chatGPTStatusLabel(r))+'</span></header>'+
 '<p><strong>Why:</strong> '+esc(r.reason)+'</p><pre>'+esc(r.question)+'</pre>'+(r.revision_instructions?'<p><strong>Requested revision:</strong></p><pre>'+esc(r.revision_instructions)+'</pre>':'')+
 (r.money_related?'<p class="chatgpt-money-note">Money-related work requires your approval before sharing with ChatGPT. Request approval permits advice and drafting; it does not permit payments or account changes.</p>':'')+
 (r.blocker?'<p role="status">'+esc(r.blocker)+'</p>':'')+
 (r.response_summary?'<details data-chatgpt-disclosure="answer:'+esc(r.id)+':'+esc(r.output_version||'')+'" '+(review?'open':'')+'><summary>Read ChatGPT’s returned answer</summary><pre>'+esc(r.response_summary)+'</pre></details>':'')+
 (r.handoff_id&&active?'<details data-chatgpt-disclosure="start:'+esc(r.id)+'"><summary>Start this request in ChatGPT</summary><p>Eleanor has cleared this request. Copy the prompt, open ChatGPT with the Agent HQ connector, then send it. The session must open the handoff before it is marked in use.</p><textarea readonly aria-label="Prompt for '+esc(r.requester_label)+'">'+esc(chatGPTPrompt(r.handoff_id))+'</textarea><div class="chatgpt-desk-actions"><button type="button" data-chatgpt-copy="'+esc(r.id)+'">Copy request</button><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT ↗</a></div></details>':'')+
 '<div class="chatgpt-desk-actions">'+(r.status==='owner_required'?'<button type="button" data-chatgpt-decision="approve" data-id="'+esc(r.id)+'">Approve ChatGPT request</button><button type="button" data-chatgpt-decision="decline" data-id="'+esc(r.id)+'">Decline request</button>':'')+
 (active?'<button type="button" data-chatgpt-decision="cancel" data-id="'+esc(r.id)+'">Cancel request</button>':'')+
 '<button type="button" data-chatgpt-project="'+esc(r.project_id)+'">Open project and files</button>'+
 (review?'<button type="button" data-chatgpt-review="approve" data-id="'+esc(r.id)+'">Approve final result</button><button type="button" data-chatgpt-review="changes" data-id="'+esc(r.id)+'">Request changes</button>':'')+'</div>'+
 (review?'<label>Changes for this returned version<textarea data-chatgpt-feedback="'+esc(r.id)+'" maxlength="10000" placeholder="Tell ChatGPT what to change"></textarea></label>':'')+'</article>';
}
function render(){
 if(!root||root!==host())return;
 if(!data){root.innerHTML='<section class="chatgpt-desk"><h2>ChatGPT</h2><p role="status">'+esc(notice||'Loading your private requests…')+'</p></section>';return;}
 const disclosures=new Map([...root.querySelectorAll('details[data-chatgpt-disclosure]')].map(d=>[d.dataset.chatgptDisclosure,d.open]));
 const rows=data.requests||[],active=rows.filter(r=>!['approved','cancelled'].includes(r.status)),history=rows.filter(r=>['approved','cancelled'].includes(r.status));
 root.innerHTML='<section class="chatgpt-desk"><header class="chatgpt-desk-heading"><div><h2>ChatGPT</h2><p>Requests managed by Eleanor</p></div><div class="chatgpt-desk-actions"><button type="button" data-chatgpt-setup>Connection setup</button><button type="button" data-chatgpt-refresh>Refresh</button><button type="button" data-chatgpt-eleanor>Message Eleanor</button></div></header>'+
 '<p class="chatgpt-transport">ChatGPT handoff · No paid API calls. Eleanor can clear routine requests. Open ChatGPT to start the approved handoff; returned work stays unapproved until you review it.</p><p role="status" data-chatgpt-notice>'+esc(notice)+'</p>'+
 '<form data-chatgpt-preferences><label><input type="checkbox" name="delegate" '+(data.settings?.chatgpt_delegate_nonfinancial?'checked':'')+'> Eleanor may approve nonfinancial ChatGPT requests</label><label><input type="checkbox" name="notifications" '+(data.settings?.chatgpt_notifications_enabled!==false?'checked':'')+'> Show agent names and reasons in Eleanor’s pop-ups</label><button type="submit">Save preferences</button></form>'+
 '<details class="chatgpt-new-request" data-chatgpt-disclosure="new"><summary>Ask ChatGPT for a worker</summary><form data-chatgpt-new><label for="chatgpt-request-worker">Worker</label><select id="chatgpt-request-worker" name="worker">'+(data.workers||[]).map(w=>'<option value="'+esc(w.id)+'" '+(draft.worker===w.id?'selected':'')+'>'+esc(w.name)+'</option>').join('')+'</select>'+
 '<label for="chatgpt-request-project">Project</label><select id="chatgpt-request-project" name="project"><option value="">Create a saved request project</option>'+(data.projects||[]).filter(p=>p.revision).map(p=>'<option value="'+esc(p.id)+'" '+(draft.project===p.id?'selected':'')+'>'+esc(p.title)+'</option>').join('')+'</select>'+
 '<label>What should ChatGPT answer or create?<textarea name="question" required minlength="12" maxlength="4000">'+esc(draft.question)+'</textarea></label><label>Why is ChatGPT needed?<textarea name="reason" required minlength="8" maxlength="1000">'+esc(draft.reason)+'</textarea></label><button type="submit">Send request to Eleanor</button></form></details>'+
 '<h3>Requests and results</h3>'+(active.length?active.map(requestCard).join(''):'<p>No active ChatGPT requests. Ask a worker to request ChatGPT help, or create a request above.</p>')+
 (history.length?'<details data-chatgpt-disclosure="history"><summary>Approved and cancelled requests</summary>'+history.map(requestCard).join('')+'</details>':'')+'</section>';
 root.querySelectorAll('details[data-chatgpt-disclosure]').forEach(d=>{if(disclosures.has(d.dataset.chatgptDisclosure))d.open=disclosures.get(d.dataset.chatgptDisclosure)});
 bind();
 const selected=window.agentHQChatGPTSelection;if(selected&&/^[a-f0-9-]{36}$/i.test(selected)){root.querySelector('[data-chatgpt-card="'+selected+'"]')?.scrollIntoView({block:'nearest'});window.agentHQChatGPTSelection=null;}
}
async function mutate(fn){
 if(busy)return;const ticket=epoch;busy=true;root?.querySelectorAll('button[type=submit],[data-chatgpt-decision],[data-chatgpt-review]').forEach(b=>b.disabled=true);
 try{await fn();if(ticket!==epoch)return;notice='Saved. Eleanor’s ChatGPT records are up to date.';data=await api('chatgpt_desk');}
 catch(e){if(ticket===epoch)notice=e.message;}
 finally{if(ticket===epoch){busy=false;render();}}
}
function bind(){
 root.querySelector('[data-chatgpt-refresh]').onclick=load;
 root.querySelector('[data-chatgpt-setup]').onclick=openChatGPTConnection;
 root.querySelector('[data-chatgpt-eleanor]').onclick=()=>{const b=window.agentHQBotStudioSnapshot?.rows?.find(b=>b.template_key==='eleanor-secretary-v1'&&b.status==='active');if(b)window.agentHQOpenBotMessage?.(b.id);else window.agentHQOpenSecretary?.();};
 root.querySelector('[data-chatgpt-preferences]').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate(()=>api('chatgpt_preferences',{delegate:f.has('delegate'),notifications:f.has('notifications')}));};
 const form=root.querySelector('[data-chatgpt-new]');form.oninput=()=>{const f=new FormData(form);for(const key of ['worker','project','question','reason'])draft[key]=String(f.get(key)||'');};
 form.onsubmit=e=>{e.preventDefault();if(busy)return;const p=data.projects.find(p=>p.id===draft.project),request_id=crypto.randomUUID();void mutate(async()=>{await api('request_chatgpt',{worker:draft.worker,project_id:draft.project||null,revision:p?.revision,question:draft.question,reason:draft.reason,request_id});draft={worker:'eleanor',project:'',question:'',reason:''};});};
 root.querySelectorAll('[data-chatgpt-project]').forEach(b=>b.onclick=()=>window.agentHQOpenProjects?.(b.dataset.chatgptProject));
 root.querySelectorAll('[data-chatgpt-copy]').forEach(b=>b.onclick=async()=>{const r=data.requests.find(r=>r.id===b.dataset.chatgptCopy);try{await navigator.clipboard.writeText(chatGPTPrompt(r.handoff_id));root.querySelector('[data-chatgpt-notice]').textContent='Copied. Open ChatGPT with Agent HQ selected and send this prompt.';}catch{root.querySelector('[data-chatgpt-notice]').textContent='Select and copy the prompt above.';}});
 root.querySelectorAll('[data-chatgpt-decision]').forEach(b=>b.onclick=()=>{const r=data.requests.find(r=>r.id===b.dataset.id);void mutate(()=>api('decide_chatgpt_request',{request_id:r.id,revision:r.project_revision,decision:b.dataset.chatgptDecision}));});
 root.querySelectorAll('[data-chatgpt-review]').forEach(b=>b.onclick=()=>{const r=data.requests.find(r=>r.id===b.dataset.id),feedback=root.querySelector('[data-chatgpt-feedback="'+r.id+'"]').value;if(b.dataset.chatgptReview==='changes'&&feedback.trim().length<5){root.querySelector('[data-chatgpt-notice]').textContent='Describe what to change in this returned version.';return;}void mutate(()=>api('review_chatgpt_result',{request_id:r.id,output_version:r.output_version,decision:b.dataset.chatgptReview,feedback}));});
}
function mount(){const next=host();if(next===root)return;root=next;if(root){render();void load();}}
new MutationObserver(mount).observe(document.getElementById('app')||document.body,{childList:true,subtree:false});
agentCloud.auth.onAuthStateChange((_event,session)=>{const next=session?.user?.id||null;if(next===owner)return;owner=next;epoch++;data=null;busy=false;loading=false;draft={worker:'eleanor',project:'',question:'',reason:''};notice=next?'':'Sign in under Settings → Account to open ChatGPT requests.';render();if(next&&root)void load();});
setInterval(()=>{if(root&&!document.hidden&&!busy)void load();},12000);
mount();

window.addEventListener('agenthq-chatgpt-requests-updated',event=>{if(root&&!busy&&event.detail?.owner_id===owner)void load();});
