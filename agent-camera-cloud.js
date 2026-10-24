// Owner-private iPhone-inspired Camera + Photos for Agent HQ.
// No third-party camera code, tracking scripts, or public image URLs.
import {agentCloud} from './agent-cloud-auth.js';
const BUCKET='agent-hq-camera';
const WORKERS=['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq'];
const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let chosen='jordan',facing='environment',stream=null,preview=null,photoURL='',sending=false,error='',success='';
let saved=[],photoGeneration=0,photoReady=false;
const picker=()=>document.querySelector('#agent-camera-file');
function cleanPreview(){
 if(photoURL)URL.revokeObjectURL(photoURL);
 photoURL='';preview=null;
}
function stopCamera(){
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
}
async function user(){
 const {data,error:authError}=await agentCloud.auth.getUser();
 if(authError||!data?.user)throw Error('Sign in under Settings before sharing pictures.');
 return data.user;
}
async function startCamera(){
 stopCamera();cleanPreview();error='';
 if(!navigator.mediaDevices?.getUserMedia){
  // Native image capture is the Safari fallback for unsupported browser modes.
  document.querySelector('#agent-camera-capture')?.click();return;
 }
 try{
  stream=await navigator.mediaDevices.getUserMedia({
   video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:1080}},audio:false
  });
  const vid=document.querySelector('#agent-camera-video');
  if(vid){vid.srcObject=stream;await vid.play();}
  afterRender();
 }catch(err){
  stopCamera();error=err.name==='NotAllowedError'?'Allow camera access in Safari, or choose Take Photo below.':
   'Camera unavailable. Use Take Photo or Photo Library instead.';
  afterRender();
 }
}
async function loadBlob(file){
 if(!file||!String(file.type).startsWith('image/'))throw Error('Choose an image file.');
 if(file.size>18*1024*1024)throw Error('Choose a photo under 18 MB.');
 let bitmap;
 try{
  bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 }catch{
  bitmap=await new Promise((resolve,reject)=>{
   const img=new Image(),url=URL.createObjectURL(file);
   img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Cannot read this photo.'))};
   img.src=url;
  });
 }
 let width=bitmap.width,height=bitmap.height;
 const factor=Math.min(1,1600/Math.max(width,height));width=Math.max(1,Math.round(width*factor));height=Math.max(1,Math.round(height*factor));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('Image processing is unavailable.');
 ctx.drawImage(bitmap,0,0,width,height);
 if(bitmap.close)bitmap.close();
 let output=null;
 for(const quality of [.87,.74,.57]){
  output=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));
  if(output&&output.size<3*1024*1024)break;
 }
 if(!output||output.size>3*1024*1024)throw Error('Could not compress this photo to the upload size limit.');
 cleanPreview();preview={blob:output,width,height};photoURL=URL.createObjectURL(output);
 stopCamera();afterRender();
}
async function takeSnapshot(){
 if(!stream){document.querySelector('#agent-camera-capture')?.click();return}
 const video=document.querySelector('#agent-camera-video');
 if(!video?.videoWidth)throw Error('The camera is still starting.');
 const cv=document.createElement('canvas');cv.width=video.videoWidth;cv.height=video.videoHeight;
 cv.getContext('2d')?.drawImage(video,0,0);
 const b=await new Promise(r=>cv.toBlob(r,'image/jpeg',.88));if(!b)throw Error('Could not capture an image.');
 await loadBlob(b);
}
function setError(msg){error=String(msg||'');afterRender()}
function renderCamera(){
 return '<section class="agent-camera-app" aria-label="Agent HQ Camera">'+
  '<div class="camera-top"><span>CAMERA</span><button type="button" data-camera-close aria-label="Close camera">×</button></div>'+
  '<div class="camera-viewfinder">'+
  (photoURL?'<img class="camera-preview" src="'+safe(photoURL)+'" alt="Photo ready to send"/>':
   '<video id="agent-camera-video" autoplay muted playsinline aria-label="Live camera view"></video>')+
  (!photoURL&&!stream?'<div class="camera-overlay-empty"><span class="camera-lens-icon">◎</span><button type="button" data-camera-start>Open Camera</button><small>Camera access is requested only when you tap Open Camera.</small></div>':'')+
  '</div>'+
  '<div class="camera-controls">'+
   (!photoURL?'<button type="button" data-camera-library class="camera-library-action">Photos</button>'+
    '<button type="button" data-camera-shutter class="camera-shutter" aria-label="Take a snapshot"><span></span></button>'+
    '<button type="button" data-camera-flip class="camera-flip" aria-label="Switch front and back cameras">↺</button>':
    '<button type="button" data-camera-retake class="camera-retake">Retake</button>')+
  '</div>'+
  '<div class="camera-share-panel">'+
  '<label for="camera-recipient">Send to worker</label><select id="camera-recipient" aria-label="Choose employee">'+
  WORKERS.map(id=>'<option value="'+id+'"'+(chosen===id?' selected':'')+'>'+
    (id==='hq'?'Company HQ':id.charAt(0).toUpperCase()+id.slice(1))+'</option>').join('')+'</select>'+
  '<label for="camera-note">Describe your idea (optional)</label>'+
  '<textarea id="camera-note" maxlength="1000" rows="2" placeholder="I like these colors. Can you create a flyer inspired by this?"></textarea>'+
  (photoURL?'<button type="button" class="camera-send" data-camera-send '+(sending?'disabled':'')+'>'+
   (sending?'Sending…':'Send Photo')+'</button>':'<p class="camera-helper">Take a photo or choose one from your library. Only the photo you send is shared with that worker.</p>')+
  (error?'<p class="camera-error" role="alert">'+safe(error)+'</p>':'')+
  (success?'<p class="camera-status" role="status">'+safe(success)+'</p>':'')+
  '</div>'+
  '<input id="agent-camera-file" type="file" accept="image/*" hidden>'+
  '<input id="agent-camera-capture" type="file" accept="image/*" capture="environment" hidden>'+
  '</section>';
}
function afterRender(){
 const video=document.querySelector('#agent-camera-video');
 if(video&&stream){video.srcObject=stream;video.play().catch(()=>{})}
 const err=document.querySelector('.camera-error');
 if(err)err.textContent=error;
 const status=document.querySelector('.camera-status');if(status)status.textContent=success;
}
async function refresh(){
 const generation=++photoGeneration;
 try{
  const u=await user();
  const {data,error:e}=await agentCloud.from('agent_message_photos').select('id,employee_id,storage_path,caption,width,height,created_at')
   .eq('owner_id',u.id).order('created_at',{ascending:false}).limit(100);
  if(e)throw Error(e.message);
  const results=await Promise.all((data||[]).map(async item=>{
   const {data:link,error:se}=await agentCloud.storage.from(BUCKET).createSignedUrl(item.storage_path,600);
   return {...item,url:se?'':(link?.signedUrl||'')};
  }));
  if(generation!==photoGeneration)return;
  saved=results;photoReady=true;
  window.agentHQCameraRefreshUI?.();
 }catch(e){
  if(generation===photoGeneration){photoReady=false;window.agentHQCameraNotice?.(e.message)}
 }
}
function getThreadItems(id){
 return saved.filter(p=>p.employee_id===id&&p.url).map(p=>({
  id:p.id,employeeId:id,type:'photo',sender:'owner',
  createdAt:p.created_at,caption:p.caption,url:p.url,width:p.width,height:p.height
 }));
}
function renderPhotoItem(item){
 return '<div class="ios-message-row outgoing"><figure class="ios-photo-message">'+
  '<img src="'+safe(item.url)+'" loading="lazy" alt="Photo reference shared with worker"/>'+
  (item.caption?'<figcaption>'+safe(item.caption)+'</figcaption>':'')+
  '</figure></div>';
}
async function send(){
 if(!preview||sending)throw Error('Take or choose a photo before sending.');
 const u=await user();
 sending=true;error='';afterRender();
 const caption=(document.querySelector('#camera-note')?.value||'').trim().slice(0,1000);
 const employee=document.querySelector('#camera-recipient')?.value||chosen;
 if(!WORKERS.includes(employee))throw Error('Choose an Agent HQ worker.');
 const id=crypto.randomUUID(),path=u.id+'/'+employee+'/'+id+'.jpg';
 try{
  const {error:uploadError}=await agentCloud.storage.from(BUCKET).upload(path,preview.blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
  if(uploadError)throw Error('Photo upload failed: '+uploadError.message);
  const {data:conversation,error:conversationError}=await agentCloud.from('agent_conversations')
   .upsert({owner_id:u.id,employee_id:employee},{onConflict:'owner_id,employee_id'}).select('id').single();
  if(conversationError||!conversation){
   await agentCloud.storage.from(BUCKET).remove([path]);
   throw Error('Could not open your private Messages thread.');
  }
  const {data:photo,error:attachError}=await agentCloud.from('agent_message_photos').insert({
   owner_id:u.id,conversation_id:conversation.id,employee_id:employee,
   storage_path:path,caption,width:preview.width,height:preview.height
  }).select('id').single();
  if(attachError||!photo){
   await agentCloud.storage.from(BUCKET).remove([path]);
   throw Error('Photo was not attached to the conversation: '+(attachError?.message||'Save failed'));
  }
  chosen=employee;
  stopCamera();cleanPreview();
  await refresh();
  window.agentHQCameraReturnToChat?.(employee);
  // Model access is limited to the exact image the owner chose to send.
  // A vision error NEVER makes the app claim that an employee actually saw it.
  const {data:answer,error:visionError}=await agentCloud.functions.invoke('agent-hq-image-review',{
   body:{attachment_id:photo.id}
  });
  if(visionError||answer?.error){
   window.agentHQCameraNotice?.('Photo delivered. AI image understanding is unavailable: '+(answer?.error||visionError?.message||'Check provider access.'));
  }
  await window.agentHQChatCloud?.refresh?.().catch(()=>{});
  return photo;
 }finally{sending=false}
}
async function clearThread(employee){
 const owned=saved.filter(p=>p.employee_id===employee);
 if(!owned.length)return;
 const paths=owned.map(p=>p.storage_path);
 const {error:removeError}=await agentCloud.storage.from(BUCKET).remove(paths);
 if(removeError)throw Error('Cannot remove private photos: '+removeError.message);
 const u=await user();
 const {error:rowsError}=await agentCloud.from('agent_message_photos').delete().eq('owner_id',u.id).eq('employee_id',employee);
 if(rowsError)throw Error('Could not delete photo records: '+rowsError.message);
 await refresh();
}
function onScreenChange(next){if(next!=='camera'){stopCamera();cleanPreview()}}
function openForChat(employee){
 if(WORKERS.includes(employee))chosen=employee;
 error='';success='';
 window.agentHQCameraOpenScreen?.();
}
function connect(){
 document.addEventListener('click',async e=>{
  const action=e.target.closest?.('[data-camera-start],[data-camera-close],[data-camera-shutter],[data-camera-flip],[data-camera-library],[data-camera-retake],[data-camera-send],[data-camera-open-chat]');
  if(!action)return;
  e.preventDefault();
  try{
   if(action.hasAttribute('data-camera-open-chat')){openForChat(action.dataset.cameraOpenChat);return}
   if(action.hasAttribute('data-camera-close')){onScreenChange('messages');window.agentHQCameraReturnToChat?.(chosen);return}
   if(action.hasAttribute('data-camera-start')){await startCamera();return}
   if(action.hasAttribute('data-camera-shutter')){await takeSnapshot();return}
   if(action.hasAttribute('data-camera-flip')){facing=facing==='user'?'environment':'user';if(stream)await startCamera();return}
   if(action.hasAttribute('data-camera-library')){picker()?.click();return}
   if(action.hasAttribute('data-camera-retake')){cleanPreview();afterRender();window.agentHQCameraRerender?.();return}
   if(action.hasAttribute('data-camera-send'))await send();
  }catch(err){setError(err.message)}
 });
 document.addEventListener('change',async e=>{
  if(e.target?.id==='camera-recipient'){chosen=e.target.value;return}
  if(e.target?.id==='agent-camera-file'||e.target?.id==='agent-camera-capture'){
   const file=e.target.files?.[0];e.target.value='';
   if(file)try{await loadBlob(file);window.agentHQCameraRerender?.()}catch(err){setError(err.message)}
  }
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera()});
 window.addEventListener('pagehide',stopCamera);
 agentCloud.auth.onAuthStateChange(()=>setTimeout(()=>refresh(),0));
 window.addEventListener('focus',()=>{if(!document.hidden)refresh()});
 refresh();
}
window.agentHQCamera={
 renderCamera,afterRender,onScreenChange,openForChat,getThreadItems,renderPhotoItem,
 hasPhotos:id=>saved.some(p=>p.employee_id===id),refresh,clearThread,stopCamera
};
connect();
