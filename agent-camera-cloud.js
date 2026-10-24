// Camera is a camera. Messages owns the recipient and the final Send action.
import {agentCloud} from './agent-cloud-auth.js';
import {preparePhoto,saveLocalPhoto,listLocalPhotos,deleteLocalPhoto,isPhotoTarget,BUILTIN_PHOTO_TARGETS} from './agent-photo-library.js?v=20261024-camera-messages-2';
const BUCKET='agent-hq-camera',MAX_DRAFTS=4;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const glyphs={camera:'<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/>',photos:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="2"/><path d="m4 18 5-5 4 3 4-6 4 7"/>',flip:'<path d="M4 8a9 9 0 0 1 15-2l2 2M21 3v5h-5M20 16a9 9 0 0 1-15 2l-2-2M3 21v-5h5"/>',share:'<path d="M8 9H4v13h16V9h-4M12 16V2m-4 4 4-4 4 4"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L20 5"/>',back:'<path d="m15 5-7 7 7 7"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+glyphs[name]+'</svg>';
const drafts=new Map(),sending=new Set(),processing=new Set(),urls=new Set();
let generation=0,refreshSerial=0,owner=null,saved=[],album=[],albumURLs=[],albumOwner='',stream=null,cameraToken=0;
let lastShot=null,attempted=false,pickerEpoch=0;
let overlay=null,intent=null,preview=null,view='capture',facing='environment',error='',notice='',working=false,returnFocus=null,lastScreen='',fileContext=null,zoom=1,zoomRange=null;
function objectURL(blob){const url=URL.createObjectURL(blob);urls.add(url);return url}
function release(url){if(url){URL.revokeObjectURL(url);urls.delete(url)}}
function cleanPreview(){release(preview?.url);preview=null}
function stopCamera(){cameraToken++;stream?.getTracks().forEach(t=>t.stop());stream=null;zoomRange=null}
async function currentUser(required=true){const {data,error:e}=await agentCloud.auth.getUser();if(e||!data?.user){if(required)throw Error('Sign in under Settings to send photos.');return null}return data.user}
function still(current){if(current!==generation)throw Error('Your account changed. Choose the photo again.');}
const currentScope=()=>owner?.id||'device';
function draftList(target){return drafts.get(target)||[]}
function draftHTML(target){const photos=draftList(target);return photos.length?'<div class="photo-draft-tray" aria-label="Photos ready to send">'+photos.map(p=>'<figure><img src="'+safe(p.url)+'" alt="Photo ready to send"><button type="button" data-photo-remove="'+safe(p.id)+'" data-photo-target="'+safe(target)+'" aria-label="Remove photo" '+(sending.has(target)?'disabled':'')+'>'+icon('close')+'</button></figure>').join('')+'</div>':''}
function updateDraftUI(){for(const el of document.querySelectorAll('[data-photo-drafts]'))el.innerHTML=draftHTML(el.dataset.photoDrafts);document.dispatchEvent(new CustomEvent('agenthq-photo-drafts'));}
function announce(text,target){window.agentHQCameraNotice?.(text,target);notice=text;const el=document.querySelector('[data-camera-notice]');if(el)el.textContent=text}
function notifySaved(){window.agentHQCameraRefreshUI?.();window.agentHQBotStudioUIRefresh?.()}
async function loadAlbum(){
 const scope=currentScope(),current=generation;
 const local=await listLocalPhotos(scope).catch(()=>[]);still(current);
 let cloud=[];
 if(owner){
  const result=await agentCloud.from('agent_camera_photos').select('id,storage_path,width,height,created_at').eq('owner_id',owner.id).order('created_at',{ascending:false}).limit(300);still(current);
  if(result.error&&!local.length)throw Error('Saved photos could not sync. Try again.');
  cloud=await Promise.all((result.data||[]).map(async p=>{const link=await agentCloud.storage.from(BUCKET).createSignedUrl(p.storage_path,600);return {...p,cloud:true,createdAt:p.created_at,url:link.data?.signedUrl||''}}));still(current);
 }
 if(scope!==currentScope())return;
 albumURLs.forEach(release);albumURLs=[];
 const merged=new Map(cloud.map(p=>[p.id,p]));
 for(const p of local)merged.set(p.id,{...merged.get(p.id),...p,local:true});
 album=[...merged.values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));albumOwner=scope;
}
function albumThumbnail(row){if(!row.blob)return row.url||'';const url=objectURL(row.blob);albumURLs.push(url);return url}
async function albumPhoto(row){
 if(row.blob)return row;
 const current=generation,u=await currentUser();still(current);
 if(u.id!==albumOwner||!row.storage_path?.startsWith(u.id+'/camera/'))throw Error('Photo not found in this account.');
 const {data:blob,error:e}=await agentCloud.storage.from(BUCKET).download(row.storage_path);still(current);
 if(e||!blob)throw Error('The saved photo could not be opened.');
 const photo=await preparePhoto(blob);still(current);return {...row,blob:photo.blob,width:photo.width,height:photo.height};
}
async function saveToCameraRoll(photo,current=generation){
 const scope=currentScope();await saveLocalPhoto(scope,photo);still(current);photo.local=true;photo.saved=true;
 if(!owner){notice='Saved in Agent HQ on this device.';return photo}
 const u=await currentUser();still(current);if(u.id!==scope)throw Error('Your account changed.');
 const path=u.id+'/camera/'+photo.id+'.jpg';
 try{
  const existing=await agentCloud.from('agent_camera_photos').select('id').eq('owner_id',u.id).eq('id',photo.id).maybeSingle();still(current);
  if(existing.error)throw Error();
  if(!existing.data){
   const upload=await agentCloud.storage.from(BUCKET).upload(path,photo.blob,{contentType:'image/jpeg',upsert:false});still(current);
   if(upload.error&&!/already exists|duplicate/i.test(upload.error.message||'')&&String(upload.error.statusCode)!=='409')throw Error();
   const result=await agentCloud.from('agent_camera_photos').insert({id:photo.id,owner_id:u.id,storage_path:path,width:photo.width,height:photo.height}).select('id').single();still(current);if(result.error)throw Error();
  }
  photo.cloud=true;photo.storage_path=path;notice='Saved to your private Agent HQ Photos.';
 }catch(e){still(current);notice='Saved on this device. Private photo sync is unavailable right now.'}
 return photo;
}
function albumHTML(){return '<section class="camera-album" aria-label="Saved Agent HQ photos"><div class="camera-album-heading"><h2>Recents</h2><p>Your private Agent HQ photo collection</p></div>'+(album.length?'<div class="camera-photo-grid">'+album.map(p=>'<button type="button" data-camera-album-pick="'+safe(p.id)+'" aria-label="'+(intent?'Attach photo':'View photo')+' from '+safe(new Date(p.createdAt).toLocaleDateString())+'"><img src="'+safe(albumThumbnail(p))+'" alt="Saved photo" loading="lazy"></button>').join('')+'</div>':'<div class="camera-album-empty">'+icon('photos')+'<h3>No saved photos yet</h3><p>Photos you save in Camera appear here. Use Photo Library for pictures on your iPhone or iPad.</p></div>')+'</section>'}
function renderCamera(){
 const reviewing=!!preview,photos=view==='album';
 return '<section class="agent-camera-app" data-camera-root aria-label="Camera">'+
 '<header class="camera-top"><button type="button" class="camera-glass-button" data-camera-close aria-label="'+(intent?'Cancel photo':'Close Camera')+'">'+icon('close')+'</button><span>'+(photos?'Photos':reviewing?'Preview':'Camera')+'</span><button type="button" class="camera-glass-button" '+(photos?'data-camera-back aria-label="Back to Camera"':reviewing?'data-camera-share aria-label="Share or save to Photos"':'data-camera-library aria-label="Open Photo Library"')+'>'+icon(photos?'camera':reviewing?'share':'photos')+'</button></header>'+
 (photos?albumHTML():'<div class="camera-viewfinder" data-camera-viewfinder>'+(reviewing?'<img class="camera-preview" src="'+safe(preview.url)+'" alt="Captured photo">':'<video id="agent-camera-video" autoplay muted playsinline class="'+(facing==='user'?'camera-mirrored':'')+'" aria-label="Live camera view"></video>'+(!stream?'<div class="camera-overlay-empty">'+icon('camera')+'<button type="button" data-camera-start>Open Camera</button><button type="button" class="camera-native-capture" data-camera-native>Take Photo</button><p>Allow camera access when Safari asks.</p></div>':''))+'<div class="camera-flash" aria-hidden="true"></div></div>')+
 '<div class="camera-bottom">'+(photos?'':reviewing?'<div class="camera-preview-actions"><button type="button" data-camera-retake>Retake</button><button type="button" class="camera-use-photo" '+(intent?'data-camera-use':'data-camera-save')+' '+(working||preview.saved&&!intent?'disabled':'')+'>'+(working?'Saving…':intent?'Use Photo':preview.saved?'Saved '+icon('check'):'Save Photo')+'</button>'+(preview.saved&&!intent?'<button type="button" data-camera-delete-saved aria-label="Delete saved photo">'+icon('trash')+'</button>':'')+'</div>':'<div class="camera-mode" aria-label="Camera mode">PHOTO</div><div class="camera-controls"><button type="button" class="camera-library-action camera-glass-button" data-camera-album aria-label="Open saved photos">'+(lastShot?'<img src="'+safe(lastShot.url)+'" alt="Last captured photo">':icon('photos'))+'</button><button type="button" data-camera-shutter class="camera-shutter" aria-label="Take photo" '+(working?'disabled':'')+'><span></span></button><button type="button" data-camera-flip class="camera-flip camera-glass-button" aria-label="Switch camera">'+icon('flip')+'</button></div>')+
 '<p class="camera-notice'+(error?' camera-error':'')+'" data-camera-notice role="status">'+safe(error||notice)+'</p></div></section>';
}
function cameraRoot(){return document.querySelector('[data-camera-root]')}
function renderCapture(){
 albumURLs.forEach(release);albumURLs=[];
 if(overlay){overlay.innerHTML=renderCamera()}else window.agentHQCameraRerender?.();
 afterRender();
}
function afterRender(){const video=document.querySelector('#agent-camera-video');if(video&&stream){video.srcObject=stream;video.play().catch(()=>{})}if(!overlay&&lastScreen==='camera'&&!attempted&&!preview&&view==='capture'){attempted=true;startCamera().catch(e=>setError(e.message))}}
function setupOverlay(html,sheet=false){
 if(!overlay){returnFocus=document.activeElement;overlay=document.createElement('div');overlay.id='agent-camera-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');document.body.append(overlay);document.getElementById('app')?.setAttribute('inert','');document.documentElement.classList.add('camera-modal-open')}
 overlay.className=sheet?'camera-sheet-backdrop':'camera-fullscreen-overlay';overlay.setAttribute('aria-label',sheet?'Add a photo':'Camera');overlay.innerHTML=html;overlay.querySelector('button')?.focus({preventScroll:true});
}
function closeOverlay(){pickerEpoch++;stopCamera();cleanPreview();overlay?.remove();overlay=null;intent=null;view='capture';attempted=false;error='';notice='';document.getElementById('app')?.removeAttribute('inert');document.documentElement.classList.remove('camera-modal-open');if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null}
function closeCamera(){if(overlay)closeOverlay();else{stopCamera();cleanPreview();window.agentHQCameraReturnToChat?.()}}
function openForChat(target){
 if(!isPhotoTarget(target))return;
 intent=target;error='';notice='';
 setupOverlay('<section class="photo-attachment-sheet"><div class="photo-sheet-grabber"></div><header><h2>Add to Message</h2><button type="button" data-camera-close aria-label="Close photo options">'+icon('close')+'</button></header><button type="button" data-photo-choice="camera"><span class="photo-option-symbol">'+icon('camera')+'</span><span>Camera</span></button><button type="button" data-photo-choice="library"><span class="photo-option-symbol">'+icon('photos')+'</span><span>Photo Library</span></button><button type="button" data-photo-choice="saved"><span class="photo-option-symbol photo-option-saved">'+icon('photos')+'</span><span>Saved Photos<small>From Agent HQ Camera</small></span></button><p class="photo-sheet-note">Add up to four photos, then send your message.</p></section>',true);
}
function openCapture(target=null){attempted=false;intent=target;view='capture';error='';notice='';cleanPreview();if(target)setupOverlay(renderCamera());else renderCapture();}
async function startCamera(){
 attempted=true;stopCamera();cleanPreview();error='';notice='';view='capture';const token=cameraToken,current=generation;
 if(!navigator.mediaDevices?.getUserMedia){error='Use Take Photo or Photo Library.';renderCapture();return}
 try{
  const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1440}},audio:false});
  if(token!==cameraToken||current!==generation||!cameraRoot()||document.hidden){next.getTracks().forEach(t=>t.stop());return}
  stream=next;const caps=stream.getVideoTracks()[0]?.getCapabilities?.();zoomRange=caps?.zoom||null;zoom=zoomRange?.min||1;renderCapture();
 }catch(e){if(token!==cameraToken)return;error=e.name==='NotAllowedError'?'Camera access was not allowed. Try Take Photo or Photo Library.':'Camera unavailable. Try Take Photo or Photo Library.';renderCapture()}
}
async function stage(target,photo,current=generation){
 still(current);if(!isPhotoTarget(target))throw Error('Open a conversation first.');
 const list=draftList(target);if(sending.has(target))throw Error('Wait for this photo message to finish sending.');if(list.length>=MAX_DRAFTS)throw Error('Send these four photos before adding more.');
 drafts.set(target,[...list,{...photo,url:objectURL(photo.blob)}]);updateDraftUI();
}
async function snapshot(){
 if(working)return;if(!stream){nativePicker(true);return}
 const video=document.querySelector('#agent-camera-video');if(!video?.videoWidth)throw Error('The camera is still starting.');
 const current=generation,token=cameraToken;working=true;
 try{
  const canvas=document.createElement('canvas'),ratio=window.matchMedia?.('(orientation: landscape)').matches?4/3:3/4,w=video.videoWidth,h=video.videoHeight;
  const sw=Math.min(w,h*ratio),sh=Math.min(h,w/ratio);canvas.width=Math.round(sw);canvas.height=Math.round(sh);
  canvas.getContext('2d').drawImage(video,(w-sw)/2,(h-sh)/2,sw,sh,0,0,canvas.width,canvas.height);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.94));if(!blob)throw Error('Could not take the photo.');
  const photo=await preparePhoto(blob);still(current);if(token!==cameraToken)return;
  if(intent){stopCamera();cleanPreview();preview={...photo,url:objectURL(photo.blob),saved:false};renderCapture()}else{
   await saveToCameraRoll(photo,current);still(current);release(lastShot?.url);lastShot={...photo,url:objectURL(photo.blob)};
   const flash=cameraRoot()?.querySelector('.camera-flash');if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)flash?.animate?.([{opacity:.7},{opacity:0}],{duration:140});
   renderCapture();
  }
 }finally{working=false;if(current===generation&&cameraRoot())renderCapture()}
}
function nativePicker(capture=false){
 const field=document.getElementById(capture?'agent-camera-capture':'agent-camera-file');
 fileContext={target:intent,current:generation,epoch:++pickerEpoch,kind:capture?'capture':'library'};field.value='';field.click();
}
async function handleFiles(files,context){
 if(!context||context.current!==generation||context.epoch!==pickerEpoch)return;
 const target=context.target,selected=[...files];if(!selected.length)return;
 if(target&&processing.has(target))throw Error('Photos are still being prepared.');
 if(target)processing.add(target);
 try{
  const room=target?MAX_DRAFTS-draftList(target).length:1;
  if(selected.length>room)throw Error(target?'You can attach up to four photos per message.':'Choose one photo.');
  const prepared=[];for(const file of selected){prepared.push(await preparePhoto(file));still(context.current);if(context.epoch!==pickerEpoch)return}
  if(target){for(const photo of prepared)await stage(target,photo,context.current);closeOverlay();}
  else{stopCamera();cleanPreview();preview={...prepared[0],url:objectURL(prepared[0].blob),saved:false};view='capture';renderCapture()}
 }finally{if(target)processing.delete(target)}
}
async function savePreview(){
 if(!preview||working)return;const current=generation,scope=currentScope(),photo=preview;working=true;error='';
 try{await saveToCameraRoll(photo,current);still(current);if(preview!==photo)return;renderCapture()}finally{working=false;renderCapture()}
}
async function showAlbum(){stopCamera();error='';await loadAlbum();view='album';if(intent)setupOverlay(renderCamera());else renderCapture()}
async function sharePreview(){
 if(!preview)return;
 const file=new File([preview.blob],'Agent-HQ-photo.jpg',{type:'image/jpeg'});
 if(navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file]})}catch(e){if(e.name!=='AbortError')throw Error('Sharing did not open. Try again.')}return}
 const a=document.createElement('a');a.href=preview.url;a.download='Agent-HQ-photo.jpg';document.body.append(a);a.click();a.remove();
 notice='Photo download opened.';renderCapture();
}
async function refresh(){
 const serial=++refreshSerial,current=generation;
 try{
  const u=await currentUser();still(current);
  const columns='id,employee_id,storage_path,caption,width,height,created_at,analysis_status';
  const [regular,custom]=await Promise.all([
   agentCloud.from('agent_message_photos').select(columns).eq('owner_id',u.id).order('created_at',{ascending:false}).limit(300),
   agentCloud.from('agent_custom_message_photos').select(columns+',bot_id').eq('owner_id',u.id).order('created_at',{ascending:false}).limit(300)
  ]);
  if(regular.error)throw Error(regular.error.message);
  if(custom.error)throw Error(custom.error.message);
  const data=[...(regular.data||[]),...(custom.data||[]).map(p=>({...p,custom:true}))];
  const results=await Promise.all((data||[]).map(async p=>{const {data:link,error:se}=await agentCloud.storage.from(BUCKET).createSignedUrl(p.storage_path,600);return {...p,url:se?'':link?.signedUrl||''}}));
  if(serial!==refreshSerial||current!==generation)return;owner=u;saved=results;notifySaved();
 }catch(e){if(serial===refreshSerial&&current===generation){if(!owner){saved=[];notifySaved()}}}
}
function getThreadItems(target){return saved.filter(p=>p.employee_id===target).map(p=>({...p,type:'photo',employeeId:target,sender:'owner',createdAt:p.created_at}))}
function renderPhotoItem(p,selecting=false,selected=false){return '<div class="ios-message-row outgoing" data-chat-kind="photo" data-chat-item="'+safe(p.id)+'">'+(selecting?'<button type="button" class="ios-chat-select-button" data-chat-select-kind="photo" data-chat-select-id="'+safe(p.id)+'" aria-label="Select photo message" aria-pressed="'+(selected?'true':'false')+'">'+(selected?'✓':'')+'</button>':'')+'<figure class="ios-photo-message"><button class="photo-message-delete" type="button" data-photo-delete="'+safe(p.id)+'" aria-label="Delete photo message" '+(selecting?'hidden':'')+'>'+icon('close')+'</button>'+(p.url?'<button type="button" class="photo-message-open" data-photo-open="'+safe(p.id)+'" aria-label="View photo"><img src="'+safe(p.url)+'" loading="lazy" alt="Photo sent in this conversation" width="'+Number(p.width)+'" height="'+Number(p.height)+'"></button>':'<p class="photo-link-unavailable">Photo unavailable <button type="button" data-photo-refresh>Retry</button></p>')+(p.caption?'<figcaption>'+safe(p.caption)+'</figcaption>':'')+'</figure></div>'}
async function uploadOne(target,p,caption,current,u){
 const path=u.id+'/'+target+'/'+p.id+'.jpg',custom=!BUILTIN_PHOTO_TARGETS.has(target),table=custom?'agent_custom_message_photos':'agent_message_photos';
 // Keep the same attachment ID on a retry after an uncertain network response.
 const found=await agentCloud.from(table).select('id').eq('owner_id',u.id).eq('id',p.id).maybeSingle();still(current);if(found.error)throw Error(found.error.message);if(found.data)return found.data;
 const store=agentCloud.storage.from(BUCKET),upload=await store.upload(path,p.blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});still(current);
 if(upload.error&&String(upload.error.statusCode)!=='409'&&!/already exists|duplicate/i.test(upload.error.message||''))throw Error('Could not upload photo: '+upload.error.message);
 let conversation=null;
 if(BUILTIN_PHOTO_TARGETS.has(target)){
  const result=await agentCloud.from('agent_conversations').upsert({owner_id:u.id,employee_id:target},{onConflict:'owner_id,employee_id'}).select('id').single();still(current);if(result.error||!result.data)throw Error('Could not open this conversation.');conversation=result.data.id;
 }
 const result=await agentCloud.from(table).insert({id:p.id,owner_id:u.id,...(custom?{bot_id:target}:{conversation_id:conversation}),employee_id:target,storage_path:path,caption,width:p.width,height:p.height}).select('id').single();still(current);
 if(result.error)throw Error('Photo delivery was not confirmed. Your photo is kept. Check the thread, then try again.');return result.data;
}
async function reviewPhoto(id,target,current){
 const {data,error:e}=await agentCloud.functions.invoke('agent-hq-image-review',{body:{attachment_id:id,target_id:target}});still(current);
 if(e||data?.error)return 'Photo delivered. Image understanding is unavailable right now.';return '';
}
async function sendDraft(target,caption=''){
 if(!isPhotoTarget(target)||!draftList(target).length)throw Error('Add a photo first.');
 if(sending.has(target)||processing.has(target))throw Error('Please wait for the current photos.');
 if(String(caption).length>1000)throw Error('Keep the photo message under 1,000 characters.');
 const current=generation,delivered=[]; sending.add(target);updateDraftUI();
 try{
  const u=await currentUser();still(current);const batch=draftList(target).slice();
  for(let i=0;i<batch.length;i++){
   const p=batch[i];p.caption??=i===0?String(caption).trim():'';
   const row=await uploadOne(target,p,p.caption,current,u);still(current);delivered.push(row.id);
   drafts.set(target,draftList(target).filter(item=>item.id!==p.id));release(p.url);updateDraftUI();
  }
  await refresh();still(current);
  announce('Photo sent.',target);return {delivered:delivered.length};
 }finally{
  sending.delete(target);updateDraftUI();
  if(delivered.length&&current===generation){
   refresh();
   // Delivery completes promptly. Only the sent attachments are reviewed; the
   // server independently enforces authentication, ownership and one-use claims.
   (async()=>{let warning='';for(const id of delivered){still(current);warning=await reviewPhoto(id,target,current)||warning}if(current===generation){await Promise.allSettled([window.agentHQChatCloud?.refresh(),window.agentHQBotStudioUI?.refreshChat?.(target)]);window.agentHQCameraRefreshUI?.();if(warning)announce(warning,target)}})().catch(()=>{if(current===generation)announce('Photo delivered. The worker could not finish reviewing it.',target)});
  }
 }
}
async function deletePhoto(id){
 const current=generation,u=await currentUser();still(current);const p=saved.find(x=>x.id===id);if(!p)throw Error('Photo not found. Refresh this conversation.');
 const {error:e}=await agentCloud.storage.from(BUCKET).remove([p.storage_path]);still(current);if(e)throw Error('Could not delete the private photo. Try again.');
 const result=await agentCloud.from(p.custom?'agent_custom_message_photos':'agent_message_photos').delete().eq('owner_id',u.id).eq('id',id);still(current);if(result.error)throw Error('Could not delete the photo message. Try again.');
 saved=saved.filter(x=>x.id!==id);notifySaved();
}
async function clearThread(target){
 if(!isPhotoTarget(target))throw Error('Unknown conversation.');
 const current=generation,u=await currentUser();still(current);
 const table=BUILTIN_PHOTO_TARGETS.has(target)?'agent_message_photos':'agent_custom_message_photos';
 try{while(true){
  const rows=await agentCloud.from(table).select('id,storage_path').eq('owner_id',u.id).eq('employee_id',target).limit(100);still(current);
  if(rows.error)throw Error(rows.error.message);if(!rows.data?.length)break;
  const files=await agentCloud.storage.from(BUCKET).remove(rows.data.map(p=>p.storage_path));still(current);if(files.error)throw Error('Could not remove private photos. Try again.');
  const deleted=await agentCloud.from(table).delete().eq('owner_id',u.id).in('id',rows.data.map(p=>p.id));still(current);if(deleted.error)throw Error('Could not remove photo messages. Try again.');
 }}finally{if(current===generation)await refresh()}
}
function onScreenChange(next){if(lastScreen!==next){if(lastScreen==='camera'){pickerEpoch++;stopCamera();cleanPreview();view='capture';attempted=false}if(overlay&&!['chat','studio'].includes(next))closeOverlay();if(next==='camera'){attempted=false;error='';notice='';}lastScreen=next}}
function setError(text,target){
 error=String(text||'');
 const panel=overlay?.querySelector('.photo-attachment-sheet,.photo-full-view');
 if(panel){let note=panel.querySelector('[role="alert"]');if(!note){note=document.createElement('p');note.setAttribute('role','alert');note.className='photo-sheet-error';panel.append(note)}note.textContent=error;return}
 if(cameraRoot())renderCapture();else announce(error,target);
}
function reset(){generation++;refreshSerial++;stopCamera();closeOverlay();for(const url of urls)URL.revokeObjectURL(url);urls.clear();drafts.clear();sending.clear();processing.clear();saved=[];album=[];albumOwner='';owner=null;lastShot=null;attempted=false;fileContext=null;working=false;cleanPreview();attempted=true;window.agentHQCameraRerender?.();updateDraftUI();notifySaved();}
function ensureInputs(){if(document.getElementById('agent-camera-file'))return;const host=document.createElement('div');host.hidden=true;host.innerHTML='<input id="agent-camera-file" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/avif" multiple><input id="agent-camera-capture" type="file" accept="image/*" capture="environment">';document.body.append(host)}
ensureInputs();
document.addEventListener('click',async event=>{
 const b=event.target.closest?.('[data-camera-open-chat],[data-photo-choice],[data-camera-close],[data-camera-start],[data-camera-shutter],[data-camera-native],[data-camera-flip],[data-camera-library],[data-camera-retake],[data-camera-use],[data-camera-save],[data-camera-share],[data-camera-album],[data-camera-album-pick],[data-camera-back],[data-camera-delete-saved],[data-photo-remove],[data-photo-delete],[data-photo-open],[data-photo-refresh]');
 if(!b){if(event.target===overlay&&overlay?.classList.contains('camera-sheet-backdrop'))closeOverlay();return}event.preventDefault();
 try{
  if(b.hasAttribute('data-camera-open-chat')){openForChat(b.dataset.cameraOpenChat);return}
  if(b.hasAttribute('data-camera-close')){closeCamera();return}
  if(b.dataset.photoChoice){if(b.dataset.photoChoice==='camera'){const target=intent;openCapture(target);await startCamera()}else if(b.dataset.photoChoice==='saved')await showAlbum();else nativePicker();return}
  if(b.hasAttribute('data-camera-start'))await startCamera();
  else if(b.hasAttribute('data-camera-native'))nativePicker(true);
  else if(b.hasAttribute('data-camera-shutter'))await snapshot();
  else if(b.hasAttribute('data-camera-flip')){facing=facing==='user'?'environment':'user';await startCamera()}
  else if(b.hasAttribute('data-camera-library'))nativePicker();
  else if(b.hasAttribute('data-camera-retake')||b.hasAttribute('data-camera-back')){cleanPreview();view='capture';await startCamera()}
  else if(b.hasAttribute('data-camera-use')){await stage(intent,preview);closeOverlay()}
  else if(b.hasAttribute('data-camera-save'))await savePreview();
  else if(b.hasAttribute('data-camera-share'))await sharePreview();
  else if(b.hasAttribute('data-camera-delete-saved')){if(preview?.saved&&window.confirm('Delete this saved Agent HQ photo? Sent copies in Messages stay in their conversations.')){const p=preview,u=await currentUser(false);if(p.cloud&&u){const removed=await agentCloud.storage.from(BUCKET).remove([p.storage_path]);if(removed.error)throw Error('Could not remove this saved photo.');const row=await agentCloud.from('agent_camera_photos').delete().eq('owner_id',u.id).eq('id',p.id);if(row.error)throw Error('Could not remove the saved photo record.')}if(p.local)await deleteLocalPhoto(currentScope(),p.id);if(lastShot?.id===p.id){release(lastShot.url);lastShot=null}cleanPreview();await showAlbum()}}
  else if(b.hasAttribute('data-camera-album'))await showAlbum();
  else if(b.dataset.cameraAlbumPick){if(albumOwner!==currentScope())return;const row=album.find(x=>x.id===b.dataset.cameraAlbumPick);if(!row)return;const p=await albumPhoto(row);if(intent){await stage(intent,{...p,id:crypto.randomUUID()});closeOverlay()}else{cleanPreview();preview={...p,url:objectURL(p.blob),saved:true};view='capture';renderCapture()}}
  else if(b.dataset.photoRemove){const target=b.dataset.photoTarget;if(sending.has(target))return;const p=draftList(target).find(x=>x.id===b.dataset.photoRemove);release(p?.url);drafts.set(target,draftList(target).filter(x=>x.id!==b.dataset.photoRemove));updateDraftUI()}
  else if(b.dataset.photoDelete){if(window.confirm('Delete this photo from the conversation?'))await deletePhoto(b.dataset.photoDelete)}
  else if(b.dataset.photoOpen){const p=saved.find(x=>x.id===b.dataset.photoOpen);if(!p?.url)return;setupOverlay('<div class="photo-full-view"><button type="button" class="camera-glass-button" data-camera-close aria-label="Close photo">'+icon('close')+'</button><img src="'+safe(p.url)+'" alt="Photo from this conversation">'+(p.caption?'<p>'+safe(p.caption)+'</p>':'')+'</div>')}
  else if(b.hasAttribute('data-photo-refresh'))await refresh();
 }catch(e){setError(e.message,b.dataset.photoTarget)}
});
document.addEventListener('change',async event=>{if(!['agent-camera-file','agent-camera-capture'].includes(event.target?.id))return;const context=fileContext;fileContext=null;const files=[...(event.target.files||[])];event.target.value='';try{await handleFiles(files,context)}catch(e){setError(e.message,context?.target)}});
document.addEventListener('keydown',event=>{
 if(!overlay)return;if(event.key==='Escape'){event.preventDefault();closeOverlay();return}
 if(event.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled),[tabindex="0"]')];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else if(cameraRoot()&&!preview&&view==='capture')renderCapture()});
window.addEventListener('pagehide',stopCamera);
agentCloud.auth.onAuthStateChange((event,session)=>{if(event==='TOKEN_REFRESHED')return;if((session?.user?.id||null)!==(owner?.id||null)){reset();owner=session?.user||null;}setTimeout(()=>refresh(),0)});
window.addEventListener('focus',()=>{if(!document.hidden)refresh()});
setInterval(()=>{if(!document.hidden)refresh()},8*60*1000);
window.agentHQCamera={renderCamera,afterRender,onScreenChange,openForChat,getThreadItems,renderPhotoItem,renderDrafts:draftHTML,hasDrafts:id=>draftList(id).length>0,isSending:id=>sending.has(id),sendDraft,hasPhotos:id=>saved.some(p=>p.employee_id===id),refresh,clearThread,deletePhoto,stopCamera};
refresh();
