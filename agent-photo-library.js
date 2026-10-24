// Local, account-scoped camera roll. Files leave the device only on Send/Share.
const DB='agenthq-photos-v1';
export const MAX_PHOTO_BYTES=3*1024*1024;
export const BUILTIN_PHOTO_TARGETS=new Set(['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq']);
export const isPhotoTarget=id=>BUILTIN_PHOTO_TARGETS.has(id)||/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(String(id));
export async function preparePhoto(file){
 if(!file||!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type))throw Error('Choose a JPEG, HEIC, PNG or WebP photo.');
 if(file.size>18*1024*1024)throw Error('Choose a photo under 18 MB.');
 let image;
 try{image=await createImageBitmap(file,{imageOrientation:'from-image'})}catch{
  image=await new Promise((resolve,reject)=>{
   const img=new Image(),url=URL.createObjectURL(file);
   img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('This photo cannot be opened. Try a JPEG or a screenshot.'))};img.src=url;
  });
 }
 const scale=Math.min(1,1600/Math.max(image.width,image.height));
 const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Photo processing is unavailable.');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);image.close?.();
 let blob;
 for(const quality of [.9,.8,.66,.5]){blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(blob&&blob.size<=MAX_PHOTO_BYTES)break}
 if(!blob||blob.size>MAX_PHOTO_BYTES)throw Error('This photo is too large to send. Try a smaller photo.');
 return {id:crypto.randomUUID(),blob,width,height,createdAt:new Date().toISOString()};
}
function database(){return new Promise((resolve,reject)=>{
 if(!globalThis.indexedDB){reject(Error('Photo storage is unavailable in this browser. Use Share to save the picture.'));return}
 const request=indexedDB.open(DB,1);
 request.onupgradeneeded=()=>{const photos=request.result.createObjectStore('photos',{keyPath:'id'});photos.createIndex('owner','owner')};
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(Error('Cannot open saved photos. Use Share to save the picture.'));
 request.onblocked=()=>reject(Error('Close other Agent HQ tabs, then try saving again.'));
})}
async function transact(mode,fn){
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('photos',mode),request=fn(tx.objectStore('photos'));
  tx.oncomplete=()=>{db.close();resolve(request.result)};
  tx.onerror=()=>{db.close();reject(Error('Photo storage is full or unavailable. Use Share to save the picture.'))};
  tx.onabort=()=>{db.close();reject(Error('The photo could not be saved. Use Share to save the picture.'))};
 });
}
export const saveLocalPhoto=(owner,photo)=>transact('readwrite',store=>store.put({id:photo.id,owner,blob:photo.blob,width:photo.width,height:photo.height,createdAt:photo.createdAt}));
export const listLocalPhotos=owner=>transact('readonly',store=>store.index('owner').getAll(owner)).then(rows=>rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)));
export async function deleteLocalPhoto(owner,id){
 const row=await transact('readonly',store=>store.get(id));
 if(row?.owner!==owner)throw Error('Photo not found.');
 await transact('readwrite',store=>store.delete(id));
}
