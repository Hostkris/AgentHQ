import {agentCloud} from './agent-cloud-auth.js';
import {PROJECT_FORMATS,PROJECT_WORKERS,validateReference} from './agent-project-workspace-core.js?v=20261101-workspaces-1';
import {downloadedBlob,saveProjectBlob} from './agent-projects-app-core.js?v=20261101-projects-app-1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let epoch=0,currentOwner=null;
async function api(action,extra={}){
 const generation=epoch,{data:auth,error:ae}=await agentCloud.auth.getUser();
 if(ae||!auth.user)throw Error('Sign in to Agent HQ to use project files and handbooks.');
 const {data,error}=await agentCloud.functions.invoke('agent-project-workspace',{body:{action,...extra}});
 if(generation!==epoch)throw Error('The signed-in account changed. Reopen this project.');
 if(error||data?.error){let reason=data?.error;if(!reason&&error?.context?.clone){try{reason=(await error.context.clone().json())?.error}catch{}}throw Error(reason||error?.message||'The workspace request failed.');}
 return data;
}
function project(id){return window.agentHQProjects?.all?.().find(s=>s.assignment_id===id);}
async function refresh(id){await Promise.allSettled([window.agentHQProjects?.refresh?.(),window.agentHQTeamCloud?.refresh?.(),window.agentHQChatCloud?.refresh?.()]);if(id)await window.agentHQProjects?.start?.(id);}
function modal(title,html,onSubmit){
 document.querySelectorAll('dialog.ah-workspace').forEach(d=>d.remove());
 const dialog=document.createElement('dialog');dialog.className='ah-workspace';
 dialog.innerHTML='<form method="dialog"><header><h2>'+esc(title)+'</h2><button type="button" data-w-close aria-label="Close">×</button></header>'+html+'<p role="status" data-w-status></p></form>';
 document.body.append(dialog);dialog.querySelector('[data-w-close]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('form').addEventListener('submit',async e=>{if(!onSubmit)return;e.preventDefault();const form=e.currentTarget,status=form.querySelector('[data-w-status]');const button=form.querySelector('[type=submit]');if(button)button.disabled=true;
  try{await onSubmit(new FormData(form),status,dialog);}catch(err){status.textContent=err.message;}finally{if(button)button.disabled=false;}});
 dialog.showModal();return dialog;
}
const formats=value=>'<label>Output format<select name="output_format">'+PROJECT_FORMATS.map(f=>'<option value="'+f+'"'+(value===f?' selected':'')+'>'+esc(f==='ics'?'Calendar import file (.ics)':f.toUpperCase())+'</option>').join('')+'</select></label>';
const capabilityLabels={reference_photo_analysis:'Read reference photos',create_image:'Create new artwork',public_research:'Public research',calculate:'Verified calculations',create_document:'Create files',calendar_write:'Calendar events',send_email:'Send email',publish_content:'Publish content',shopify_change:'Store changes'};
const statusLabels={available:'Available',connection_required:'Needs a connection',scoped_approval_required:'Needs specific approval'};
const restartChoices=(id)=>'<label>Restart affected work from<select name="from_worker"><option value="">First assigned step</option><option value="alex">Replan the team</option>'+(project(id)?.team_order||[]).map(w=>'<option value="'+esc(w)+'">'+esc(w.charAt(0).toUpperCase()+w.slice(1))+'</option>').join('')+'</select></label>';
async function newProject(){
 modal('New project','<label>Describe the goal, requirements and what finished should include<textarea name="brief" required minlength="5" rows="7" placeholder="Create a study plan from my reference files. Return a printable PDF."></textarea></label>'+formats('markdown')+'<label>Finished means (optional)<textarea name="completion_criteria" maxlength="3000" rows="3" placeholder="A four-week plan with source links and no Saturday assignments."></textarea></label><button class="primary" type="submit">Start project</button>',async(data,status,dialog)=>{
  const r=await api('create',{brief:data.get('brief'),output_format:data.get('output_format'),completion_criteria:data.get('completion_criteria')});status.textContent='Project saved. Alex is preparing the handoffs.';await refresh(r.project_id);dialog.close();window.agentHQProjects?.select?.(r.project_id);if(document.getElementById('agent-projects-app-root'))document.dispatchEvent(new CustomEvent('agenthq-project-created',{detail:{id:r.project_id}}));else document.querySelector('[data-project-open="'+r.project_id+'"]')?.click();
 });
}
async function handbooks(){
 const {handbooks}=await api('handbooks');
 const dialog=modal('Shared handbooks','<p>Approved general handbooks are available to every worker. A business handbook is loaded only when linked to that project. These records grant no account permissions.</p><div class="ah-book-list">'+(handbooks||[]).map(b=>'<div class="ah-book-download-row"><button type="button" data-w-book="'+esc(b.handbook_key)+'">'+esc(b.title)+' · v'+b.version+' · '+(b.approved?'Approved':'Draft')+'</button><button type="button" data-w-book-export="'+esc(b.handbook_key)+'" data-format="pdf">Download PDF</button><button type="button" data-w-book-export="'+esc(b.handbook_key)+'" data-format="markdown">Download text</button></div>').join('')+'</div><button type="button" data-w-new-book>Create handbook</button>');
 const edit=book=>{
  dialog.close();modal(book?'Edit handbook':'New handbook','<label>Title<input name="title" required maxlength="180" value="'+esc(book?.title||'')+'"></label><label>Scope<select name="scope"><option value="business">Business — link to a project</option><option value="general"'+(book?.scope==='general'?' selected':'')+'>General — all projects</option></select></label><label>Approved facts, voice, policies and source dates<textarea name="content" required minlength="10" maxlength="24000" rows="12">'+esc(book?.content||'Business identity:\nProducts and approved claims:\nVerified prices, currency, sources and effective dates:\nIntended customers and regions:\nVoice and approved examples:\nShipping, returns and offers:\nUnknowns and next review date:')+'</textarea></label><label class="ah-check"><input type="checkbox" name="approved"'+(book?.approved?' checked':'')+'> Approve this handbook for worker reference</label><button class="primary" type="submit">Save handbook</button>',async(data,status,d)=>{
   const title=String(data.get('title')),key=book?.handbook_key||title.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,120);
   if(!key)throw Error('Use a title with letters or numbers.');
   await api('save_handbook',{key,title,scope:data.get('scope'),content:data.get('content'),approved:data.has('approved'),version:book?.version??null});status.textContent='Handbook saved. Affected active projects will use the new version.';await refresh();d.close();
  });
 };
 dialog.querySelector('[data-w-new-book]').onclick=()=>edit(null);
 dialog.querySelectorAll('[data-w-book]').forEach(b=>b.onclick=()=>edit(handbooks.find(h=>h.handbook_key===b.dataset.wBook)));
 dialog.querySelectorAll('[data-w-book-export]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const book=handbooks.find(b=>b.handbook_key===button.dataset.wBookExport),r=await api('export_handbook',{key:book.handbook_key,version:book.version,format:button.dataset.format});saveProjectBlob(downloadedBlob(r),r.filename);dialog.querySelector('[data-w-status]').textContent=r.note||'Download opened.';}catch(e){dialog.querySelector('[data-w-status]').textContent=e.message;}finally{button.disabled=false;}});
}
async function updateProject(id){
 const r=await api('details',{project_id:id}),books=await api('handbooks'),meta=r.context.metadata;
 modal('Update project','<label>New information or changed requirements<textarea name="note" required minlength="5" rows="5"></textarea></label>'+restartChoices(id)+formats(meta?.output_format||'markdown')+'<label>Business handbook (optional)<select name="business_key"><option value="">No business handbook</option>'+books.handbooks.filter(b=>b.scope==='business'&&b.approved).map(b=>'<option value="'+esc(b.handbook_key)+'"'+(meta?.business_key===b.handbook_key?' selected':'')+'>'+esc(b.title)+'</option>').join('')+'</select></label><p>Earlier completed steps are kept when you choose a later affected worker. Old revisions remain in history.</p><button class="primary" type="submit">Save and continue</button>',async(data,status,d)=>{
  await api('update',{project_id:id,note:data.get('note'),from_worker:data.get('from_worker')||null,revision:r.revision,output_format:data.get('output_format'),business_key:data.get('business_key')});await refresh(id);d.close();
 });
}
async function addReference(id){
 const snapshot=await api('details',{project_id:id});
 const d=modal('Add project reference','<p>TXT, Markdown, CSV or JSON, up to 512 KB. Source text is shared with the assigned workers for this project. PDF and office-file extraction are not installed.</p><label>Reference file<input name="file" type="file" accept=".txt,.md,.csv,.json" required></label>'+restartChoices(id)+'<button class="primary" type="submit">Add and continue</button>',async(data,status,dialog)=>{
  const file=data.get('file');if(!file||!file.name)throw Error('Choose a reference file.');const item=validateReference(file.name,await file.text());
  await api('reference',{project_id:id,...item,from_worker:data.get('from_worker')||null,revision:snapshot.revision});await refresh(id);dialog.close();
 });
}
async function details(id){
 const {context,artifacts}=await api('details',{project_id:id}),s=project(id);
 const d=modal('Project details and files','<p><strong>Goal:</strong> '+esc(context.metadata?.goal||'Existing project brief')+'</p><p><strong>Finished means:</strong> '+esc(context.metadata?.completion_criteria||'Complete the saved brief')+'</p><p><strong>Output:</strong> '+esc(context.metadata?.output_format||'Written work')+'</p><h3>Loaded handbooks</h3>'+context.handbooks.map(b=>'<p>'+esc(b.title)+' · v'+b.version+'</p>').join('')+'<h3>References</h3>'+context.references.map(r=>'<details><summary>'+esc(r.filename)+(r.excerpt?' (excerpt)':'')+'</summary><pre>'+esc(r.content)+'</pre></details>').join('')+'<h3>Worker handoffs</h3>'+context.handoffs.map(h=>'<details><summary>'+esc(h.employee_id)+' · '+esc(h.status)+(h.excerpt?' (excerpt)':'')+'</summary><p>'+esc(h.title)+'</p><pre>'+esc(h.work_product||'Work not yet saved')+'</pre></details>').join('')+'<h3>Files</h3>'+(!artifacts.length?'<p>No verified output files yet.</p>':artifacts.map(a=>'<p><button type="button" data-w-download="'+esc(a.id)+'">'+esc(a.filename)+'</button> · '+(a.revision===s?.revision?'Current':'Earlier')+' version '+a.revision+' · '+a.size_bytes+' bytes'+(a.note?'<br>'+esc(a.note):'')+'</p>').join(''))+'<h3>Available capabilities</h3>'+context.capabilities.map(c=>'<p><strong>'+esc(capabilityLabels[c.id]||c.id)+'</strong> · '+esc(statusLabels[c.status]||c.status)+'<br>'+esc(c.scope)+'</p>').join(''));
 d.querySelectorAll('[data-w-download]').forEach(button=>button.onclick=async()=>{
  try{const file=await api('asset',{project_id:id,file_id:button.dataset.wDownload});window.location.assign(file.download_url);}catch(e){d.querySelector('[data-w-status]').textContent=e.message;}
 });
}
function mount(){
 document.querySelectorAll('[data-project-workspace]').forEach(root=>{
  if(root.dataset.mounted)return;root.dataset.mounted='true';
  root.innerHTML='<div class="ah-workspace-toolbar"><button type="button" data-w-action="new">New project</button><button type="button" data-w-action="details">Details & files</button><button type="button" data-w-action="reference">Add reference</button><button type="button" data-w-action="update">Update project</button><button type="button" data-w-action="books">Handbooks</button></div><p data-w-message role="status"></p>';
  root.querySelectorAll('[data-w-action]').forEach(b=>b.onclick=async()=>{try{const id=root.dataset.projectWorkspace;await ({new:newProject,details:()=>details(id),reference:()=>addReference(id),update:()=>updateProject(id),books:handbooks}[b.dataset.wAction])();}catch(e){root.querySelector('[data-w-message]').textContent=e.message;}});
 });
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-workspace-new],[data-workspace-books],[data-workspace-project-id]');if(b?.hasAttribute('data-workspace-project-id')){window.agentHQOpenProjects?.(b.dataset.workspaceProjectId);return;}if(b)(b.hasAttribute('data-workspace-new')?newProject():handbooks()).catch(err=>window.alert(err.message));});
document.addEventListener('agenthq-project-update',event=>{updateProject(event.detail.id).catch(err=>window.alert(err.message))});
new MutationObserver(mount).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
agentCloud.auth.onAuthStateChange((_event,session)=>{if(currentOwner!==session?.user?.id){epoch++;currentOwner=session?.user?.id;document.querySelectorAll('dialog.ah-workspace').forEach(d=>d.close());}});
mount();
