// Private iPhone-like Agent HQ Camera. Capturing saves to Camera Roll, NEVER sends by itself.
import {agentCloud} from './agent-cloud-auth.js';
const BUCKET='agent-hq-camera';
const WORKERS=['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq'];
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let facing='environment',stream=null,starting=false,attempted=false,error='',notice='',capturing=false;
let saved=[],roll=[],generation=0,returnTo=null,sending=false,pickerWorker=null,pickerChoice=null;
const label=id=>id==='hq'?'Company HQ':id.charAt(0).toUpperCase()+id.slice(1);
async function user(){
 const {data,error:e}=await agentCloud.auth.getUser();
 if(e||!data?.user)throw Error('Sign in under Settings to save and share Agent HQ photos.');
 return data.user;
}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}}
async function startCamera(){
 if(starting||stream)return;
 attempted=true;starting=true;error='';
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Use the iPhone Take Photo option below.');
  const live=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}},audio:false});
  if(!document.querySelector('#agent-camera-video')){live.getTracks().forEach(t=>t.stop());return}
  stream=live;
  const video=document.querySelector('#agent-camera-video');
  video.srcObject=live;await video.play();
 }catch(e){
  stopCamera();
  error=e?.name==='NotAllowedError'?'Allow camera access in iPhone Settings → Safari, or use Take Photo.':
   'Live camera unavailable. Tap Take Photo to use the iPhone camera.';
  syncNotice();
 }finally{starting=false}
}
function afterRender(){
 const video=document.querySelector('#agent-camera-video');
 if(!video)return;
 if(stream){video.srcObject=stream;video.play().catch(()=>{});}
 else if(!attempted&&!starting)startCamera().catch(()=>{});
 syncNotice();
}
function syncNotice(){
 const el=document.querySelector('#agent-camera-status');
 if(el)el.textContent=capturing?'Saving photo…':error||notice||'';
}
async function compress(input){
 if(!input||!String(input.type).startsWith('image/'))throw Error('Choose a photo.');
 if(input.size>18*1024*1024)throw Error('Choose a photo under 18 MB.');
 let img,temporary;
 try{img=await createImageBitmap(input,{imageOrientation:'from-image'});}
 catch{
  img=await new Promise((resolve,reject)=>{
   const node=new Image();temporary=URL.createObjectURL(input);
   node.onload=()=>resolve(node);node.onerror=()=>reject(Error('Could not read this photo.'));
   node.src=temporary;
  });
 }
 let width=img.width,height=img.height,ratio=Math.min(1,1600/Math.max(width,height));
 width=Math.max(1,Math.round(width*ratio));height=Math.max(1,Math.round(height*ratio));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo processing unavailable.');
 ctx.drawImage(img,0,0,width,height);img.close?.();if(temporary)URL.revokeObjectURL(temporary);
 let blob;
 for(const quality of [.87,.75,.58]){blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(blob&&blob.size<=3*1024*1024)break}
 if(!blob||blob.size>3*1024*1024)throw Error('Photo could not fit the private upload limit.');
 return {blob,width,height};
}
async function saveToCameraRoll(input){
 if(capturing)throw Error('The previous photo is still saving.');
 capturing=true;notice='';error='';syncNotice();
 try{
  const u=await user(),photo=await compress(input);
  const path=u.id+'/camera/'+crypto.randomUUID()+'.jpg';
  const upload=await agentCloud.storage.from(BUCKET).upload(path,photo.blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
  if(upload.error)throw Error('Could not save camera photo: '+upload.error.message);
  const inserted=await agentCloud.from('agent_camera_photos').insert({owner_id:u.id,storage_path:path,width:photo.width,height:photo.height}).select('id').single();
  if(inserted.error||!inserted.data){await agentCloud.storage.from(BUCKET).remove([path]);throw Error('Camera Roll save failed: '+(inserted.error?.message||'Try again'))}
  notice='Saved to Agent HQ Photos';await refresh();return inserted.data;
 }catch(e){error=e.message;throw e}
 finally{capturing=false;syncNotice()}
}
async function snapshot(){
 if(!stream){document.querySelector('#agent-camera-native')?.click();return}
 const video=document.querySelector('#agent-camera-video');
 if(!video?.videoWidth)throw Error('Camera is starting.');
 const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
 canvas.getContext('2d')?.drawImage(video,0,0);
 const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));
 if(!blob)throw Error('Could not capture the photo.');
 await saveToCameraRoll(blob);
}
function renderCamera(){
 const latest=roll[0]?.url;
 return '<section class="agent-camera-app" aria-label="Camera">'+
 '<header class="camera-top"><button type="button" data-camera-close aria-label="Close Camera">✕</button><span>PHOTO</span><span class="camera-top-space"></span></header>'+
 '<div class="camera-viewfinder"><video id="agent-camera-video" autoplay muted playsinline aria-label="Live camera preview"></video>'+
 (!navigator.mediaDevices?.getUserMedia||error?'<button type="button" class="camera-native-fallback" data-camera-native>Take Photo</button>':'')+'</div>'+
 '<div class="camera-controls"><button type="button" class="camera-gallery-thumbnail" data-camera-gallery aria-label="Open Agent HQ Photos">'+
 (latest?'<img alt="Last saved photo" src="'+safe(latest)+'">':'<span aria-hidden="true">▦</span>')+'</button>'+
 '<button type="button" class="camera-shutter" data-camera-shutter aria-label="Take picture"'+(capturing?' disabled':'')+'><span></span></button>'+
 '<button type="button" class="camera-flip" data-camera-flip aria-label="Flip camera">↻</button></div>'+
 '<p id="agent-camera-status" class="camera-live-status" role="status">'+safe(capturing?'Saving photo…':error||notice)+'</p>'+
 '<input id="agent-camera-native" type="file" accept="image/*" capture="environment" hidden></section>';
}
async function refresh(){
 const current=++generation;
 try{
  const u=await user();
  const [cameraRows,threadRows]=await Promise.all([
   agentCloud.from('agent_camera_photos').select('id,storage_path,width,height,created_at').eq('owner_id',u.id).order('created_at',{ascending:false}).limit(300),
   agentCloud.from('agent_message_photos').select('id,employee_id,storage_path,caption,width,height,created_at').eq('owner_id',u.id).order('created_at',{ascending:false}).limit(300)
  ]);
  if(cameraRows.error||threadRows.error)throw Error(cameraRows.error?.message||threadRows.error?.message);
  const sign=async row=>{
   const {data,error:e}=await agentCloud.storage.from(BUCKET).createSignedUrl(row.storage_path,600);
   return {...row,url:e?'':data?.signedUrl||''};
  };
  const [pictures,attachments]=await Promise.all([
   Promise.all((cameraRows.data||[]).map(sign)),Promise.all((threadRows.data||[]).map(sign))
  ]);
  if(current!==generation)return;
  roll=pictures;saved=attachments;
  if(document.querySelector('#agent-camera-video')){
   const thumb=document.querySelector('.camera-gallery-thumbnail');
   if(thumb)thumb.innerHTML=roll[0]?.url?'<img src="'+safe(roll[0].url)+'" alt="Last saved photo">':'<span>▦</span>';
  }
  if(document.querySelector('#agent-camera-picker'))drawPicker();
  window.agentHQCameraRefreshUI?.();
 }catch(e){if(current===generation)window.agentHQCameraNotice?.('Photos unavailable: '+e.message)}
}
function getThreadItems(employee){
 return saved.filter(p=>p.employee_id===employee&&p.url).map(p=>({
  id:p.id,employeeId:employee,type:'photo',sender:'owner',createdAt:p.created_at,
  caption:p.caption,url:p.url,width:p.width,height:p.height
 }));
}
function renderPhotoItem(item){
 return '<div class="ios-message-row outgoing" data-chat-kind="photo" data-chat-item="'+safe(item.id)+'">'+
 '<figure class="ios-photo-message"><img src="'+safe(item.url)+'" loading="lazy" alt="Photo shared in conversation">'+
 (item.caption?'<figcaption>'+safe(item.caption)+'</figcaption>':'')+'</figure></div>';
}
function drawPicker(){
 const overlay=document.querySelector('#agent-camera-picker');if(!overlay)return;
 const worker=pickerWorker,photo=roll.find(p=>p.id===pickerChoice);
 const thumbnails=roll.map(p=>'<button type="button" data-camera-choose="'+safe(p.id)+'" class="camera-picker-item'+(p.id===pickerChoice?' selected':'')+'" aria-label="Choose photo">'+
 '<img src="'+safe(p.url)+'" loading="lazy" alt="Agent HQ photo"></button>').join('');
 overlay.innerHTML='<div class="camera-picker-backdrop" data-camera-picker-close></div>'+
 '<section class="camera-picker-card" role="dialog" aria-modal="true" aria-label="Agent HQ Photos">'+
 '<div class="camera-picker-head"><strong>Agent HQ Photos</strong><button type="button" data-camera-picker-close aria-label="Close Photos">Done</button></div>'+
 '<div class="camera-picker-grid">'+(thumbnails||'<p>No saved photos yet. Open Camera and take one.</p>')+'</div>'+
 '<div class="camera-picker-actions"><button type="button" data-camera-import>+ Add from iPhone Photos</button>'+
 (!worker?'<label>Send to worker<select id="camera-share-worker">'+WORKERS.map(id=>'<option value="'+id+'">'+safe(label(id))+'</option>').join('')+'</select></label>':'')+
 (photo?'<div class="camera-picker-preview"><img src="'+safe(photo.url)+'" alt="Selected photo"/></div>'+
 '<textarea id="camera-share-caption" rows="2" maxlength="1000" placeholder="Describe your idea (optional)"></textarea>'+
 '<button type="button" class="camera-picker-send" data-camera-send-saved="'+safe(photo.id)+'" '+(sending?'disabled':'')+'>'+(sending?'Sending…':'Send in Messages')+'</button>':'')+
 '<p class="camera-picker-feedback" role="status"></p></div>'+
 '<input type="file" id="agent-camera-import" accept="image/*" hidden></section>';
}
function openPickerForChat(worker){
 pickerWorker=WORKERS.includes(worker)?worker:null;pickerChoice=null;
 let overlay=document.querySelector('#agent-camera-picker');
 if(!overlay){overlay=document.createElement('div');overlay.id='agent-camera-picker';overlay.className='agent-camera-picker';document.body.append(overlay)}
 drawPicker();refresh().catch(()=>{});
}
function closePicker(){document.querySelector('#agent-camera-picker')?.remove();pickerChoice=null}
async function sendSaved(id,worker,caption){
 if(sending)throw Error('A photo is already sending.');
 const item=roll.find(p=>p.id===id);
 if(!item||!WORKERS.includes(worker))throw Error('Select a saved photo and a worker.');
 sending=true;const overlay=document.querySelector('#agent-camera-picker'),button=overlay?.querySelector('[data-camera-send-saved]');
 if(button){button.disabled=true;button.textContent='Sending…'}
 try{
  const u=await user();
  const {data:file,error:downloadError}=await agentCloud.storage.from(BUCKET).download(item.storage_path);
  if(downloadError||!file)throw Error('Could not load saved photo: '+(downloadError?.message||'Unavailable'));
  const path=u.id+'/'+worker+'/'+crypto.randomUUID()+'.jpg';
  const upload=await agentCloud.storage.from(BUCKET).upload(path,file,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
  if(upload.error)throw Error('Photo upload failed: '+upload.error.message);
  const {data:conversation,error:conversationError}=await agentCloud.from('agent_conversations').upsert({owner_id:u.id,employee_id:worker},{onConflict:'owner_id,employee_id'}).select('id').single();
  if(conversationError||!conversation){await agentCloud.storage.from(BUCKET).remove([path]);throw Error('Could not open worker Messages.')}
  const {data:photo,error:e}=await agentCloud.from('agent_message_photos').insert({
   owner_id:u.id,conversation_id:conversation.id,employee_id:worker,storage_path:path,
   caption:String(caption||'').slice(0,1000),width:item.width,height:item.height
  }).select('id').single();
  if(e||!photo){await agentCloud.storage.from(BUCKET).remove([path]);throw Error('Attachment not saved: '+(e?.message||'Unknown'))}
  closePicker();await refresh();window.agentHQCameraReturnToChat?.(worker);
  const {data:answer,error:visionError}=await agentCloud.functions.invoke('agent-hq-image-review',{body:{attachment_id:photo.id}});
  if(visionError||answer?.error)window.agentHQCameraNotice?.('Photo sent, but AI image review is unavailable: '+(answer?.error||visionError?.message||'Provider access required.'));
  await window.agentHQChatCloud?.refresh?.().catch(()=>{});
  return photo;
 }finally{sending=false}
}
async function deletePhoto(id){
 const u=await user();
 const {data:photo,error:e}=await agentCloud.from('agent_message_photos').select('id,storage_path').eq('id',id).eq('owner_id',u.id).single();
 if(e||!photo)throw Error('Photo not found or you do not have access.');
 const result=await agentCloud.storage.from(BUCKET).remove([photo.storage_path]);
 if(result.error)throw Error('Could not remove the photo: '+result.error.message);
 const removed=await agentCloud.from('agent_message_photos').delete().eq('id',id).eq('owner_id',u.id);
 if(removed.error)throw Error('Photo record could not be removed: '+removed.error.message);
 saved=saved.filter(p=>p.id!==id);await refresh();return true;
}
async function clearThread(employee){
 const u=await user();let from=0;
 while(true){
  const result=await agentCloud.from('agent_message_photos').select('id,storage_path').eq('owner_id',u.id).eq('employee_id',employee).order('created_at',{ascending:true}).range(from,from+199);
  if(result.error)throw Error(result.error.message);
  const rows=result.data||[];if(!rows.length)break;
  const files=await agentCloud.storage.from(BUCKET).remove(rows.map(p=>p.storage_path));
  if(files.error)throw Error('Cannot remove private photos: '+files.error.message);
  const deleted=await agentCloud.from('agent_message_photos').delete().eq('owner_id',u.id).in('id',rows.map(p=>p.id));
  if(deleted.error)throw Error('Could not remove photo records: '+deleted.error.message);
  if(rows.length<200)break;
  // Query starts at zero because each batch is permanently removed.
 }
 await refresh();
}
function onScreenChange(next){
 if(next!=='camera'){stopCamera();attempted=false;error='';notice=''}
}
function openForChat(employee){returnTo=WORKERS.includes(employee)?employee:null;attempted=false;error='';notice='';window.agentHQCameraOpenScreen?.()}
function connect(){
 document.addEventListener('click',async e=>{
  const action=e.target.closest?.('[data-camera-close],[data-camera-shutter],[data-camera-flip],[data-camera-native],[data-camera-gallery],[data-camera-open-chat],[data-camera-pick-chat],[data-camera-picker-close],[data-camera-choose],[data-camera-import],[data-camera-send-saved]');
  if(!action)return;
  e.preventDefault();
  try{
   if(action.hasAttribute('data-camera-open-chat')){openForChat(action.dataset.cameraOpenChat);return}
   if(action.hasAttribute('data-camera-pick-chat')){openPickerForChat(action.dataset.cameraPickChat);return}
   if(action.hasAttribute('data-camera-close')){window.agentHQCameraReturnToChat?.(returnTo);return}
   if(action.hasAttribute('data-camera-shutter')){await snapshot();return}
   if(action.hasAttribute('data-camera-flip')){facing=facing==='user'?'environment':'user';stopCamera();attempted=false;await startCamera();return}
   if(action.hasAttribute('data-camera-native')){document.querySelector('#agent-camera-native')?.click();return}
   if(action.hasAttribute('data-camera-gallery')){openPickerForChat(returnTo);return}
   if(action.hasAttribute('data-camera-picker-close')){closePicker();return}
   if(action.hasAttribute('data-camera-choose')){pickerChoice=action.dataset.cameraChoose;drawPicker();return}
   if(action.hasAttribute('data-camera-import')){document.querySelector('#agent-camera-import')?.click();return}
   if(action.hasAttribute('data-camera-send-saved')){
    const worker=pickerWorker||document.querySelector('#camera-share-worker')?.value;
    const caption=document.querySelector('#camera-share-caption')?.value||'';
    await sendSaved(action.dataset.cameraSendSaved,worker,caption);
   }
  }catch(err){
   const message=err.message||'Camera action failed.';
   const status=document.querySelector('.camera-picker-feedback');
   if(status)status.textContent=message;else{error=message;syncNotice()}
  }
 });
 document.addEventListener('change',async e=>{
  if(!['agent-camera-import','agent-camera-native'].includes(e.target?.id))return;
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{await saveToCameraRoll(file);if(document.querySelector('#agent-camera-picker'))drawPicker()}
  catch(err){const box=document.querySelector('.camera-picker-feedback');if(box)box.textContent=err.message;else{error=err.message;syncNotice()}}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera()});
 window.addEventListener('pagehide',stopCamera);
 agentCloud.auth.onAuthStateChange(()=>setTimeout(()=>refresh(),0));
 window.addEventListener('focus',()=>{if(!document.hidden)refresh()});
 refresh();
}
window.agentHQCamera={renderCamera,afterRender,onScreenChange,openForChat,openPickerForChat,getThreadItems,renderPhotoItem,
 hasPhotos:id=>saved.some(p=>p.employee_id===id),refresh,clearThread,deletePhoto,stopCamera};
connect();
