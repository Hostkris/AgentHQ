import {mountChatGPTHandoff} from './agent-chatgpt-handoff.js?v=20261102-chatgpt-handoff-1';
import {agentCloud} from './agent-cloud-auth.js';
import {preparePhoto} from './agent-photo-library.js?v=20261024-camera-messages-2';
import {escapeProjectText as esc,projectStatus,projectMatches,projectFileType,finalReviewAvailable,fileRole,downloadedBlob,saveProjectBlob} from './agent-projects-app-core.js?v=20261101-projects-app-1';
const PDF_BASE='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/';
let epoch=0,ownerId=null,root=null,projects=[],cursor=null,selected=null,details=null,filter='all',search='',notice='',busy=false,loading=false,serial=0,selectedFile=null,isReference=false;
let activeAsset=null,assetBlob=null,assetURL=null,pdfDoc=null,pdfTask=null,pdfRender=null,pdfPage=1,pdfZoom=1,refreshTimer=null;
const feedback=new Map();let pdfLibrary=null;
const currentRoot=()=>document.getElementById('agent-projects-app-root');
async function api(action,extra={}){
 const generation=epoch,{data:auth,error:ae}=await agentCloud.auth.getUser();if(ae||!auth.user)throw Error('Sign in under Settings to open your private Projects.');
 const {data,error}=await agentCloud.functions.invoke('agent-project-workspace',{body:{action,...extra}});
 if(generation!==epoch)throw Error('The signed-in account changed. Reopen Projects.');
 if(error||data?.error){let reason=data?.error;if(!reason&&error?.context?.clone)try{reason=(await error.context.clone().json())?.error}catch{}throw Error(reason||error?.message||'The project request failed');}return data;
}
function cleanAsset(){pdfRender?.cancel?.();pdfRender=null;pdfTask?.destroy?.().catch?.(()=>{});pdfTask=null;pdfDoc=null;if(assetURL)URL.revokeObjectURL(assetURL);assetURL=null;assetBlob=null;activeAsset=null;}
const toolbar=()=>'<div class="projects-toolbar"><button type="button" data-workspace-new>New project</button><button type="button" data-workspace-books>Handbooks</button><button type="button" data-p-refresh>Refresh</button></div>';
function render(){
 if(!root||root!==currentRoot())return;
 if(selected&&details){renderDetail();return;}
 const visible=projects.filter(p=>projectMatches(p,filter,search));
 root.innerHTML='<section class="projects-library">'+toolbar()+'<p class="projects-intro">See your finished work, add reference photos, and review the final version.</p><div class="projects-filter" role="group" aria-label="Project filters">'+[['all','All'],['ready','Ready for review'],['working','In progress'],['approved','Approved']].map(([id,label])=>'<button type="button" data-p-filter="'+id+'" aria-pressed="'+(filter===id)+'">'+label+'</button>').join('')+'</div><label class="projects-search">Find a project<input type="search" value="'+esc(search)+'" data-p-search placeholder="Project name"></label><p class="projects-notice" role="status">'+esc(loading?'Loading your projects…':notice)+'</p><div class="projects-grid">'+visible.map(p=>{
  const s=p.session||{},files=p.files||[],pdf=files.find(f=>f.artifact_kind==='final'&&f.mime_type==='application/pdf');
  return '<button type="button" class="project-card" data-p-open="'+esc(p.id)+'"><div class="project-card-cover">'+(p.cover_url?'<img loading="lazy" src="'+esc(p.cover_url)+'" alt="'+esc(p.cover_kind==='reference'?'Reference photo for '+p.title:'Finished image for '+p.title)+'"><span>'+esc(p.cover_kind==='reference'?'Reference photo':'Finished image')+'</span>':'<span class="project-cover-document" aria-hidden="true">'+(pdf?'PDF':'▤')+'</span>')+'</div><div class="project-card-copy"><small class="project-state project-state--'+esc(s.phase||'planning')+'">'+esc(projectStatus(p))+'</small><strong>'+esc(p.title)+'</strong><span>Version '+esc(s.revision||1)+' · '+files.length+' saved '+(files.length===1?'file':'files')+(p.photo_count?' · '+p.photo_count+' reference photos':'')+'</span></div></button>';
 }).join('')+'</div>'+(!visible.length&&!loading?'<div class="projects-empty"><h2>'+esc(projects.length?'No matching projects':'Your work will appear here')+'</h2><p>Start a project, then add pictures or notes showing what you want. Completed files stay with that project.</p></div>':'')+(cursor!==null?'<button type="button" data-p-more-projects>Load more projects</button>':'')+'</section>';
 bind();
}
function renderDetail(){
 const d=details,s=d.session||{},files=d.artifacts||[],photos=d.photos||[],p=projects.find(p=>p.id===selected),current=files.filter(f=>f.revision===s.revision),old=files.filter(f=>f.revision!==s.revision);
 const fileButton=f=>'<button type="button" class="project-file-item'+(!isReference&&selectedFile?.id===f.id?' selected':'')+'" data-p-file="'+esc(f.id)+'"><span class="project-file-icon">'+esc(projectFileType(f)==='image'?'Image':projectFileType(f)==='pdf'?'PDF':'File')+'</span><span><strong>'+esc(f.filename)+'</strong><small>'+esc(fileRole(f))+' · v'+esc(f.revision)+' · '+Math.max(1,Math.round(f.size_bytes/1024))+' KB</small></span></button>';
 const canReview=finalReviewAvailable(s,selectedFile,isReference),done=['review','approved'].includes(s.phase),draft=feedback.get(selected)||'';
 root.innerHTML='<section class="project-detail"><div class="project-detail-heading"><button type="button" data-p-back>‹ All projects</button>'+toolbar()+'</div><header class="project-title"><div><h2>'+esc(d.project.title)+'</h2><p>'+esc(projectStatus({...p,session:s}))+' · Version '+esc(s.revision)+'</p></div><button type="button" data-project-open="'+esc(selected)+'">View progress in Messages</button></header><p class="projects-notice" role="status">'+esc(notice)+'</p><div class="project-workspace-grid"><aside class="project-sidebar"><section><h3>Finished files and handoffs</h3>'+(current.length?current.map(fileButton).join(''):'<p>No verified files yet. The team’s work will appear here when saved.</p>')+(old.length?'<details><summary>Earlier versions</summary>'+old.map(fileButton).join('')+'</details>':'')+(d.next_files_cursor!==null?'<button type="button" data-p-more-files>More saved files</button>':'')+'</section><section class="project-references"><h3>Reference photos</h3><p>Pictures and style direction for this project.</p><div class="project-reference-grid">'+photos.map(photo=>'<button type="button" data-p-reference="'+esc(photo.id)+'" aria-label="View reference '+esc(photo.filename)+'"><img src="'+esc(photo.url)+'" alt="'+esc(photo.filename)+'" loading="lazy"><span>'+esc(photo.analysis_status==='completed'?'Reviewed by the team':'Queued for image review')+'</span></button>').join('')+'</div><div class="project-photo-drop" data-p-drop><strong>Drop reference photos here</strong><p>Choose photos on iPhone or iPad.</p><label class="project-photo-picker">Add reference photos<input type="file" data-p-photo-input accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" multiple></label></div><button type="button" data-p-notes>Add notes or change requirements</button></section><details class="project-brief"><summary>Goal and finished criteria</summary><p>'+esc(d.context.metadata?.goal||d.project.title)+'</p><p>'+esc(d.context.metadata?.completion_criteria||'Complete the saved project brief.')+'</p></details></aside><div class="project-preview-column"><section class="chatgpt-handoff-panel" data-project-chatgpt-handoff></section><section class="project-preview"><div class="project-preview-head"><h3>'+esc(isReference?'Reference photo':selectedFile?selectedFile.filename:'Finished work')+'</h3><div class="project-preview-actions">'+(selectedFile?'<button type="button" data-p-download>Download '+esc(projectFileType(selectedFile)==='pdf'?'PDF':projectFileType(selectedFile)==='image'?'image':'file')+'</button>':'')+(done?'<button type="button" data-p-export>Export final text as PDF</button>':'')+'</div></div><div class="project-preview-body" data-p-preview>'+(selectedFile?'<p role="status">Opening the saved file…</p>':'<pre>'+esc(done?s.final_output:'The finished work will be available here. Reference photos help the team understand your direction; they remain in the reference section.')+'</pre>')+'</div><p class="project-save-hint">On iPhone or iPad, if a preview opens, use Share → Save to Files or Save Image.</p></section>'+(isReference&&selectedFile?'<section class="project-reference-direction"><h3>Your direction</h3><p>'+esc(selectedFile.caption||'No additional direction supplied.')+'</p><details><summary>What the team sees in this photo</summary><p>'+esc(selectedFile.analysis||'Image review is queued within the existing worker allowance. The saved photo and your note will be used by the team.')+'</p></details></section>':'')+'<section class="project-final-review"><h3>'+esc(s.phase==='approved'?'Final version approved':canReview?'Review final version '+s.revision:'Final review')+'</h3>'+(s.phase==='approved'?'<p>This finished version is approved and remains available to download.</p>':canReview?'<p>Approve this finished version or describe the changes you want.</p><label>Requested changes<textarea data-p-feedback maxlength="10000" rows="3" placeholder="Tell the team what to revise">'+esc(draft)+'</textarea></label><div class="project-review-buttons"><button type="button" class="primary" data-p-approve '+(busy?'disabled':'')+'>Approve final version</button><button type="button" data-p-changes '+(busy?'disabled':'')+'>Request changes</button></div>':'<p>'+esc(isReference?'This is a reference photo. Open the current final deliverable to approve the finished work.':selectedFile&&!['final','original'].includes(selectedFile.artifact_kind)?'This is a worker handoff. Open the current final deliverable for final approval.':selectedFile&&selectedFile.revision!==s.revision?'This file belongs to an earlier version. Open the current final deliverable for approval.':'The team will bring the completed version here for review.')+'</p>')+'<small>Approval covers this deliverable. Publishing, sending and spending keep their existing authorization requirements.</small></section></div></div></section>';
 bind();void mountChatGPTHandoff(root.querySelector('[data-project-chatgpt-handoff]'),selected,s.revision,()=>openProject(selected,true));if(selectedFile)void showAsset();
}
function bind(){
 root.querySelectorAll('[data-p-open]').forEach(b=>b.onclick=()=>openProject(b.dataset.pOpen));
 root.querySelectorAll('[data-p-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.pFilter;render()});
 const searchBox=root.querySelector('[data-p-search]');if(searchBox)searchBox.oninput=()=>{search=searchBox.value;const position=searchBox.selectionStart;render();const next=root.querySelector('[data-p-search]');next?.focus();next?.setSelectionRange?.(position,position)};
 root.querySelector('[data-p-back]')?.addEventListener('click',()=>{serial++;selected=null;details=null;selectedFile=null;cleanAsset();render()});
 root.querySelectorAll('[data-p-refresh]').forEach(b=>b.onclick=()=>refresh(false));
 root.querySelector('[data-p-more-projects]')?.addEventListener('click',()=>loadProjects(true));
 root.querySelector('[data-p-more-files]')?.addEventListener('click',async()=>{try{const r=await api('files',{project_id:selected,cursor:details.next_files_cursor});details.artifacts.push(...r.artifacts);details.next_files_cursor=r.next_files_cursor;render()}catch(e){status(e.message)}});
 root.querySelectorAll('[data-p-file]').forEach(b=>b.onclick=()=>selectAsset(details.artifacts.find(f=>f.id===b.dataset.pFile),false));
 root.querySelectorAll('[data-p-reference]').forEach(b=>b.onclick=()=>selectAsset(details.photos.find(f=>f.id===b.dataset.pReference),true));
 root.querySelector('[data-p-download]')?.addEventListener('click',downloadSelected);
 root.querySelector('[data-p-export]')?.addEventListener('click',async()=>{try{const r=await api('export_project',{project_id:selected,output_version:details.session.output_version,format:'pdf'});saveProjectBlob(downloadedBlob(r),r.filename);status(r.note||'PDF download opened.')}catch(e){status(e.message)}});
 root.querySelector('[data-p-feedback]')?.addEventListener('input',e=>feedback.set(selected,e.target.value));
 root.querySelector('[data-p-approve]')?.addEventListener('click',()=>review('approve'));
 root.querySelector('[data-p-changes]')?.addEventListener('click',()=>review('changes'));
 root.querySelector('[data-p-photo-input]')?.addEventListener('change',e=>choosePhotos([...e.target.files]));
 root.querySelector('[data-p-notes]')?.addEventListener('click',()=>{document.dispatchEvent(new CustomEvent('agenthq-project-update',{detail:{id:selected}}))});
 const drop=root.querySelector('[data-p-drop]');if(drop){drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging')};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');void choosePhotos([...e.dataTransfer.files])};}
}
function status(message){notice=message;const p=root?.querySelector('.projects-notice');if(p)p.textContent=message;}
async function loadProjects(more=false){if(loading)return;loading=true;try{const r=await api('library',{cursor:more?cursor:0});projects=more?[...projects,...r.projects]:r.projects;cursor=r.next_cursor;notice='';}catch(e){notice=e.message;}finally{loading=false;render();}}
async function refresh(quiet=true){
 if(!currentRoot()||loading||busy)return;
 if(root?.querySelector('[data-p-feedback]')===document.activeElement&&quiet){status('Project updates are available. Refresh when you finish writing your changes.');return;}
 if(selected)return openProject(selected,true);return loadProjects();
}
async function openProject(id,preserve=false){
 const request=++serial,generation=epoch;try{const r=await api('details',{project_id:id});if(request!==serial||generation!==epoch)return;
  selected=id;details=r;notice='';const oldId=preserve&&!isReference?selectedFile?.id:null,refId=preserve&&isReference?selectedFile?.id:null;
  selectedFile=refId?r.photos.find(p=>p.id===refId):oldId?r.artifacts.find(f=>f.id===oldId):null;isReference=!!refId&&!!selectedFile;
  if(!selectedFile){selectedFile=r.artifacts.find(f=>f.revision===r.session.revision&&f.artifact_kind==='final')||null;isReference=false;}
  cleanAsset();render();
 }catch(e){status(e.message);if(!selected)render();}
}
function selectAsset(file,reference){if(!file)return;serial++;cleanAsset();selectedFile=file;isReference=reference;pdfPage=1;pdfZoom=1;render();}
async function getAsset(){
 if(activeAsset?.id===selectedFile?.id&&assetBlob)return {file:activeAsset,blob:assetBlob};
 const request=serial,generation=epoch,id=selectedFile?.id,project=selected,reference=isReference;
 const file=await api(reference?'photo_asset':'asset',{project_id:project,file_id:id});
 const response=await fetch(file.url,{credentials:'omit'});if(!response.ok)throw Error('The file could not be opened. Refresh and try again.');const blob=await response.blob();
 if(request!==serial||generation!==epoch||selectedFile?.id!==id)throw Error('The selected file changed.');
 activeAsset=file;assetBlob=blob;assetURL=URL.createObjectURL(blob);return {file,blob};
}
async function showAsset(){
 const request=serial,target=root?.querySelector('[data-p-preview]');if(!target)return;
 try{const {file,blob}=await getAsset();if(request!==serial||!target.isConnected)return;
  const type=projectFileType(file);
  if(type==='image'){target.innerHTML='<a class="project-full-image" href="'+esc(assetURL)+'" target="_blank" rel="noopener"><img src="'+esc(assetURL)+'" alt="'+esc(file.filename)+'"></a><p>Tap the picture to open it at full size.</p>';}
  else if(type==='pdf'){target.innerHTML='<div class="project-pdf-toolbar"><button type="button" data-pdf-prev aria-label="Previous PDF page">‹</button><span data-pdf-page-status>Loading PDF…</span><button type="button" data-pdf-next aria-label="Next PDF page">›</button><button type="button" data-pdf-zoom="-1" aria-label="Zoom PDF out">−</button><button type="button" data-pdf-zoom="1" aria-label="Zoom PDF in">+</button><a href="'+esc(assetURL)+'" target="_blank" rel="noopener">Open full PDF</a></div><div class="project-pdf-scroll"><canvas aria-label="PDF page"></canvas></div><details><summary>Read page text</summary><pre data-pdf-text></pre></details>';
   pdfLibrary??=import(PDF_BASE+'build/pdf.min.mjs');const lib=await pdfLibrary;if(request!==serial||!target.isConnected)return;
   lib.GlobalWorkerOptions.workerSrc=PDF_BASE+'build/pdf.worker.min.mjs';pdfTask=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,standardFontDataUrl:PDF_BASE+'standard_fonts/'});pdfDoc=await pdfTask.promise;if(request!==serial||!target.isConnected)return;
   target.querySelector('[data-pdf-prev]').onclick=()=>{if(pdfPage>1){pdfPage--;void renderPDF(target)}};target.querySelector('[data-pdf-next]').onclick=()=>{if(pdfPage<pdfDoc.numPages){pdfPage++;void renderPDF(target)}};target.querySelectorAll('[data-pdf-zoom]').forEach(b=>b.onclick=()=>{pdfZoom=Math.max(.75,Math.min(2,pdfZoom+Number(b.dataset.pdfZoom)*.25));void renderPDF(target)});await renderPDF(target);
  }else if(type==='text'){const text=await blob.text();if(request!==serial)return;target.innerHTML='<pre></pre>';target.querySelector('pre').textContent=text;}
  else target.innerHTML='<p>This saved file is available to download.</p>';
 }catch(e){pdfLibrary=null;if(request===serial&&target.isConnected)target.innerHTML='<p class="projects-error">'+esc(e.message)+'</p>'+(assetURL&&projectFileType(selectedFile)==='pdf'?'<p><a href="'+esc(assetURL)+'" target="_blank" rel="noopener">Open full PDF</a></p>':'')+'<p>Use Download or refresh this project to try again.</p>';}
}
async function renderPDF(target){
 const request=serial,doc=pdfDoc;if(!doc)return;pdfRender?.cancel?.();const pageNumber=pdfPage;
 try{const page=await doc.getPage(pageNumber);if(request!==serial||!target.isConnected||pageNumber!==pdfPage)return;
  const canvas=target.querySelector('canvas'),base=page.getViewport({scale:1}),width=Math.max(220,Math.min(960,target.clientWidth-24)),scale=width/base.width*pdfZoom,viewport=page.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,1.5);
  canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=Math.floor(viewport.width)+'px';canvas.style.height=Math.floor(viewport.height)+'px';
  target.querySelector('[data-pdf-page-status]').textContent='Page '+pageNumber+' of '+doc.numPages;target.querySelector('[data-pdf-prev]').disabled=pageNumber===1;target.querySelector('[data-pdf-next]').disabled=pageNumber===doc.numPages;
  pdfRender=page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null});await pdfRender.promise;
  const text=await page.getTextContent();if(request===serial&&pageNumber===pdfPage)target.querySelector('[data-pdf-text]').textContent=text.items.map(item=>item.str).join(' ');
 }catch(e){if(e.name!=='RenderingCancelledException'&&request===serial)status('The PDF page could not render. You can still download the full file.');}
}
async function downloadSelected(){try{const {file,blob}=await getAsset();saveProjectBlob(blob,file.filename);status('Download opened. On iPhone or iPad, use Share → Save to Files or Save Image if a preview appears.');}catch(e){status(e.message);}}
async function review(decision){
 if(busy||!finalReviewAvailable(details?.session,selectedFile,isReference))return;
 const id=selected,version=details.session.output_version,note=(feedback.get(id)||'').trim();if(decision==='changes'&&note.length<5){status('Describe the changes you want before sending them to the team.');root.querySelector('[data-p-feedback]')?.focus();return;}
 busy=true;root.querySelectorAll('[data-p-approve],[data-p-changes]').forEach(b=>b.disabled=true);
 try{const reviewResult=await window.agentHQProjects.review(id,version,decision,note);feedback.delete(id);await openProject(id);status(decision==='approve'?'This final version is approved. Your files remain available here.':reviewResult?.chatgpt_handoff?'Your changes are saved. Use the ChatGPT handoff below to start the revised files.':'Your changes are saved. The team will revise this same project and return a new version here.');}catch(e){status(e.message);}finally{busy=false;root?.querySelectorAll('[data-p-approve],[data-p-changes]').forEach(b=>b.disabled=false);}
}
async function choosePhotos(files){
 if(busy||!selected)return;if(!files.length)return;if(files.length>4){status('Choose up to four reference photos at a time.');return;}
 const project=selected,revision=details.session.revision,generation=epoch;let prepared=[];
 try{status('Preparing reference photos…');for(const file of files){const p=await preparePhoto(file);if(generation!==epoch)return;prepared.push({...p,name:(file.name||'Reference photo').replace(/\.[^.]*$/,'')+'.jpg',url:URL.createObjectURL(p.blob)});}}
 catch(e){prepared.forEach(p=>URL.revokeObjectURL(p.url));status(e.message);return;}
 if(generation!==epoch||selected!==project||!currentRoot()){prepared.forEach(p=>URL.revokeObjectURL(p.url));return;}
 const dialog=document.createElement('dialog');dialog.className='project-photo-dialog';dialog.innerHTML='<form><header><h2>Add reference photos</h2><button type="button" data-close aria-label="Close photo upload">×</button></header><div class="project-upload-previews">'+prepared.map(p=>'<img src="'+esc(p.url)+'" alt="Photo to add">').join('')+'</div><label>What should the team follow?<textarea name="caption" maxlength="3000" rows="4" placeholder="Use these colors, this layout, or this style of branding. Keep my product packaging unchanged."></textarea></label><p>The photos and your direction will be saved privately in this project. The team will review visible details within its existing worker allowance.</p><p role="status"></p><button type="submit" class="primary">Save reference photos</button></form>';
 document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{prepared.forEach(p=>URL.revokeObjectURL(p.url));dialog.remove()},{once:true});
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();const button=dialog.querySelector('[type=submit]'),status=dialog.querySelector('[role=status]'),caption=String(new FormData(event.currentTarget).get('caption')||'');button.disabled=true;busy=true;let currentRevision=revision;
  try{for(const p of prepared){if(generation!==epoch)throw Error('The account changed.');const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('The photo could not be read'));reader.readAsDataURL(p.blob)});const r=await api('photo',{project_id:project,photo_id:p.id,filename:p.name,base64:encoded,width:p.width,height:p.height,caption,revision:currentRevision});if(r.revision)currentRevision=r.revision;status.textContent='Saved '+p.name;}
   dialog.close();await window.agentHQProjects.refresh();await openProject(project);notice='Reference photos saved. The team will use their visible details and your direction.';
  }catch(e){status.textContent=e.message;}finally{busy=false;button.disabled=false;}
 };dialog.showModal();
}
function mount(){const next=currentRoot();if(next===root)return;serial++;cleanAsset();root=next;if(root){render();if(selected)void openProject(selected,true);else if(!loading)void loadProjects();}}
new MutationObserver(mount).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
document.addEventListener('agenthq-project-activity',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(true),1200)});
document.addEventListener('agenthq-project-created',event=>{if(currentRoot())void openProject(event.detail.id)});
document.addEventListener('agenthq-open-project-app',event=>{selected=null;details=null;selectedFile=null;void openProject(event.detail.id)});
agentCloud.auth.onAuthStateChange((_event,session)=>{const next=session?.user?.id||null;if(next!==ownerId){epoch++;serial++;ownerId=next;projects=[];cursor=null;selected=null;details=null;selectedFile=null;feedback.clear();cleanAsset();document.querySelectorAll('dialog.project-photo-dialog').forEach(d=>d.close());notice='';if(currentRoot())void loadProjects();}});
window.agentHQProjectsApp={refresh:()=>refresh(true)};
mount();
