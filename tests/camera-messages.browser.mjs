// Run with Playwright installed. Set AGENTHQ_TEST_CHROME to use an existing Chromium.
// This harness uses only synthetic images and an in-memory Supabase mock.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(new URL('..',import.meta.url).pathname);
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/')&&path!==root)throw Error();const data=await readFile(path===root?root+'/index.html':path);res.setHeader('Content-Type',extname(path)==='.css'?'text/css':extname(path)==='.js'?'text/javascript':'text/html');res.end(data)}catch{res.statusCode=404;res.end('Not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.AGENTHQ_TEST_CHROME?{executablePath:process.env.AGENTHQ_TEST_CHROME}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results=[];
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
const core=new Set(['agent-research-status.js','app.js','agent-camera-cloud.js','agent-photo-library.js','agent-message-controls.js','agent-home-layout.js','agent-bot-studio-ui.js','agent-voice-ui.js','icons.js']);
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());if(!url.origin.startsWith(base)){await route.abort();return}
 const name=url.pathname.split('/').at(-1);
 if(name==='agent-cloud-auth.js'){await route.fulfill({contentType:'text/javascript',body:'export const agentCloud=window.__cloud;'});return}
 if(name.endsWith('.js')&&!core.has(name)){await route.fulfill({contentType:'text/javascript',body:''});return}
 await route.continue();
});
await page.addInitScript(()=>{
 const owner='00000000-0000-4000-8000-000000000001';
 const bot='00000000-0000-4000-8000-000000000003';
 window.webkitSpeechRecognition=class{start(){}stop(){this.onend?.()}};
 const authListeners=[],photos=[],customPhotos=[],roll=[],objects=new Map(),conversations=[],customMessages=[];
 const mock=window.__mock={owner,bot,photos,customPhotos,roll,objects,conversations,customMessages,uploads:0,visionCalls:0,mediaCalls:0,tracks:[],failInsert:false,denyCamera:false,holdCamera:false};
 const testImage=document.createElement('canvas');testImage.width=600;testImage.height=800;const c=testImage.getContext('2d');c.fillStyle='#98a9ce';c.fillRect(0,0,600,800);c.fillStyle='#e9c8ad';c.fillRect(50,250,500,220);c.fillStyle='#5e826d';c.fillRect(90,500,150,230);mock.image=testImage.toDataURL('image/png');
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(){mock.mediaCalls++;if(mock.denyCamera)throw new DOMException('Denied','NotAllowedError');const stream=testImage.captureStream(10);const timer=setInterval(()=>{c.fillRect(0,0,1,1);stream.getVideoTracks()[0]?.requestFrame?.();if(stream.getTracks().every(t=>t.readyState==='ended'))clearInterval(timer)},50);mock.tracks.push(...stream.getTracks());if(mock.holdCamera)await new Promise(r=>mock.releaseCamera=r);return stream}}});
 mock.authChange=id=>{mock.owner=id;authListeners.forEach(fn=>fn('SIGNED_IN',{user:{id}}))};
 const table=name=>name==='agent_message_photos'?photos:name==='agent_custom_message_photos'?customPhotos:name==='agent_camera_photos'?roll:name==='agent_conversations'?conversations:customMessages;
 window.__cloud={auth:{getUser:async()=>({data:{user:{id:mock.owner}}}),onAuthStateChange:fn=>authListeners.push(fn)},from(name){let filters=[],operation='select',value,single=false;
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},range(){return q},upsert(v){operation='upsert';value=v;return q},insert(v){operation='insert';value=v;return q},delete(){operation='delete';return q},maybeSingle(){single=true;return execute()},single(){single=true;return execute()},then(resolve,reject){return execute().then(resolve,reject)}};
  async function execute(){const rows=table(name);let data=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   if(operation==='insert'){const row={...value,created_at:new Date().toISOString(),analysis_status:'pending'};rows.push(row);data=[row];if(mock.failInsert){mock.failInsert=false;return {error:{message:'Connection lost after save'}}}}
   if(operation==='upsert'){let row=rows.find(r=>r.owner_id===value.owner_id&&r.employee_id===value.employee_id);if(!row){row={...value,id:crypto.randomUUID()};rows.push(row)}data=[row]}
   if(operation==='delete'){for(const row of data)rows.splice(rows.indexOf(row),1)}
   return {data:single?data[0]||null:data,error:null};
  }return q;
 },storage:{from(){return {async upload(path,blob){if(objects.has(path))return {error:{statusCode:'409',message:'Already exists'}};mock.uploads++;objects.set(path,blob);return {data:{path}}},async createSignedUrl(path){return {data:{signedUrl:mock.image}}},async download(path){return {data:objects.get(path)||null}},async remove(paths){paths.forEach(p=>objects.delete(p));return {data:[]}}}}},functions:{async invoke(name,options){mock.visionCalls++;if(mock.holdVision)await new Promise(r=>mock.releaseVision=r);return {data:{ok:true}}}},rpc:async()=>({data:[]})};
 window.__testBot={id:bot,name:'Custom designer',role:'Design',mission:'Help with visual ideas',status:'active',starting_message:'What can I help you with?'};
 window.agentHQBotStudioCloud={history:async()=>customMessages,send:async()=>({history:customMessages}),refresh:async()=>{}};
 window.agentHQChatCloud={markRead:async()=>{},refresh:async()=>{}};
});
async function check(name,fn){if(process.env.AGENTHQ_BROWSER_TEST&&!name.includes(process.env.AGENTHQ_BROWSER_TEST))return;await fn();results.push(name);console.log('PASS:',name)}
async function openCamera(){const index=await page.locator('[data-nav="camera"]').evaluate(el=>el.closest('[data-home-slide]')?.dataset.homeSlide);if(index!==undefined){await page.locator('[data-home-page="'+index+'"]').click();await page.waitForTimeout(480)}await page.locator('[data-nav="camera"]').click()}
async function openThread(id){await page.evaluate(id=>window.agentHQCameraReturnToChat(id),id);await page.locator('#composer').waitFor()}
async function addPhoto(){await page.locator('[data-camera-open-chat]').click();await page.locator('[data-photo-choice="library"]').click();const png=await page.evaluate(()=>__mock.image.split(',')[1]);await page.locator('#agent-camera-file').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('.photo-draft-tray img').waitFor();}
try{
 await page.goto(base+'/index.html');await page.waitForFunction(()=>!!window.agentHQCamera);
 await check('Camera opens as a full screen with an unobstructed X and no worker picker',async()=>{
  await openCamera();await page.locator('[data-camera-close]').waitFor();assert.equal(await page.locator('#camera-recipient,select').count(),0);assert.equal(await page.locator('.main-navigation').count(),0);
  const close=await page.locator('[data-camera-close]').boundingBox();assert(close.y>=0&&close.x+close.width<=390);assert.equal(await page.evaluate(()=>__mock.mediaCalls),1);
  await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);await page.waitForTimeout(100);await page.screenshot({path:'/tmp/agenthq-camera-tests/camera-iphone.png'});
  await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);
  await page.locator('[data-camera-shutter]').click();await page.getByText('Saved to your private Agent HQ Photos.').waitFor();
  assert.equal(await page.evaluate(()=>__mock.photos.length+__mock.customPhotos.length),0);assert.equal(await page.evaluate(()=>__mock.roll.length),1);assert.equal(await page.evaluate(()=>__mock.visionCalls),0);
  await page.locator('[data-camera-close]').click();assert.equal(await page.locator('.home-pages').count(),1);
 });
 await check('A saved capture can be attached within Riley, captioned and sent without choosing a recipient',async()=>{
  await openThread('riley');await page.locator('[data-camera-open-chat]').click();await page.locator('.photo-attachment-sheet').waitFor();await page.waitForTimeout(250);await page.screenshot({path:'/tmp/agenthq-camera-tests/attachment-options.png'});await page.locator('[data-photo-choice="saved"]').click();await page.locator('[data-camera-album-pick]').waitFor();await page.locator('[data-camera-album-pick]').click();await page.locator('.photo-draft-tray img').waitFor();assert.equal(await page.evaluate(()=>__mock.photos.length),0);
  await page.locator('#draft').fill('Use these colors for a flyer.');await page.screenshot({path:'/tmp/agenthq-camera-tests/message-photo-draft.png'});await page.locator('#send-message').click();await page.locator('.ios-photo-message img').waitFor();await page.waitForFunction(()=>!window.agentHQCamera.hasDrafts('riley'));const rows=await page.evaluate(()=>__mock.photos);assert.equal(rows.length,1);assert.equal(rows[0].employee_id,'riley');assert.equal(rows[0].caption,'Use these colors for a flyer.');
 });
 await check('Existing microphone stays inside the text field without overlapping Send',async()=>{
  await page.locator('.voice-dictate').waitFor();const field=await page.locator('#draft').boundingBox(),mic=await page.locator('.voice-dictate').boundingBox(),send=await page.locator('#send-message').boundingBox();assert(mic.x>=field.x&&mic.x+mic.width<=field.x+field.width);assert(mic.x+mic.width<send.x);
 });
 await check('Photo selection controls remain available alongside per-photo X buttons',async()=>{
  await page.locator('[data-chat-enter-select]').click();await page.locator('[data-chat-select-kind="photo"]').click();assert.equal(await page.locator('[data-chat-select-kind="photo"]').getAttribute('aria-pressed'),'true');await page.locator('[data-chat-cancel-select]').click();assert(await page.locator('[data-photo-delete]').isVisible());
 });
 await check('Every built-in contact and Company HQ accepts in-thread uploads',async()=>{
  for(const id of ['alex','maya','jordan','taylor','casey','morgan','avery','jamie','quinn','hq']){await openThread(id);await addPhoto();await page.locator('#send-message').click();await page.waitForFunction(id=>!window.agentHQCamera.hasDrafts(id),id);assert.equal(await page.evaluate(id=>__mock.photos.filter(p=>p.employee_id===id).length,id),1)}
 });
 await check('Selecting/removing photos preserves typed text and does not upload until Send',async()=>{
  await openThread('jordan');await page.locator('#draft').fill('Keep this caption');const before=await page.evaluate(()=>__mock.uploads);await addPhoto();assert.equal(await page.locator('#draft').inputValue(),'Keep this caption');await page.locator('[data-photo-remove]').click();assert.equal(await page.locator('.photo-draft-tray').count(),0);assert.equal(await page.locator('#draft').inputValue(),'Keep this caption');assert.equal(await page.evaluate(()=>__mock.uploads),before);
 });
 await check('Taking a photo from the composer returns to the same conversation with a draft',async()=>{
  await openThread('casey');await page.locator('[data-camera-open-chat]').click();await page.locator('[data-photo-choice="camera"]').click();await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);await page.locator('[data-camera-shutter]').click();await page.locator('[data-camera-use]:not(:disabled)').waitFor();await page.locator('[data-camera-use]').click();assert.equal(await page.locator('.ios-contact-name').innerText().then(x=>x.split('\n')[0]),'Casey');assert.equal(await page.locator('.photo-draft-tray img').count(),1);await page.locator('[data-photo-remove]').click();
 });
 await check('Uncertain upload retry does not duplicate a photo; slow vision does not block the composer',async()=>{
  await openThread('taylor');await addPhoto();await page.evaluate(()=>{__mock.failInsert=true;__mock.holdVision=true});const before=await page.evaluate(()=>__mock.photos.length);await page.locator('#send-message').click();await page.getByText(/Photo delivery was not confirmed/).waitFor();assert.equal(await page.locator('.photo-draft-tray img').count(),1);await page.locator('#send-message').click();await page.waitForFunction(()=>!window.agentHQCamera.hasDrafts('taylor'));assert.equal(await page.evaluate(()=>__mock.photos.length),before+1);assert.equal(await page.locator('#send-message').isEnabled(),true);await page.evaluate(()=>{__mock.holdVision=false;__mock.releaseVision?.()});
 });
 await check('Custom-worker conversations have the same attachment picker and photo send flow',async()=>{
  await page.evaluate(()=>window.agentHQBotStudioSync([__testBot],'Ready',[__testBot.id],[]));await page.evaluate(()=>document.querySelector('[data-nav="messages"]')?.click());await page.locator('[data-studio-worker]').click();await page.locator('#studio-message-form').waitFor();await addPhoto();await page.locator('#studio-message-form textarea').fill('A new design idea');await page.locator('#studio-message-form [type="submit"]').click();await page.locator('.ios-photo-message img').waitFor();assert.equal(await page.evaluate(()=>__mock.customPhotos.length),1);assert.equal(await page.evaluate(()=>__mock.customPhotos[0].bot_id),await page.evaluate(()=>__mock.bot));
 });
 await check('Custom-worker research has a saved report attachment and working source links',async()=>{
  await page.evaluate(()=>window.agentHQResearchSync([{id:'custom-research',employee_id:__mock.bot,bot_id:__mock.bot,role_research:true,delivered_message_id:'custom-research-reply',query:'Current design guidance',status:'completed',created_at:new Date().toISOString(),report:'Design research\nRetrieved: 2026-10-24\nSource: https://example.com/design'}],'Synced'));
  const report=page.locator('.ios-research-attachment');await report.getByText('Read findings and sources').click();assert.equal(await report.locator('a[href="https://example.com/design"]').count(),1);assert.equal(await report.locator('[data-chat-dismiss="bot"]').count(),1);
 });
 await check('Photo messages have an X, and deleting one removes only that attachment',async()=>{
  await openThread('riley');page.once('dialog',d=>d.accept());await page.locator('[data-photo-delete]').click();await page.waitForFunction(()=>__mock.photos.filter(p=>p.employee_id==='riley').length===0);assert.equal(await page.locator('.ios-photo-message').count(),0);
 });
 await check('Camera permission failure exposes native capture; late permission cannot keep a camera running',async()=>{
  await page.evaluate(()=>window.agentHQCameraReturnToChat());await page.evaluate(()=>__mock.denyCamera=true);await openCamera();await page.getByText(/Camera access was not allowed/).waitFor();assert(await page.locator('[data-camera-native]').isVisible());await page.locator('[data-camera-close]').click();
  await page.evaluate(()=>{__mock.denyCamera=false;__mock.holdCamera=true});await openCamera();await page.locator('[data-camera-close]').click();await page.evaluate(()=>{__mock.holdCamera=false;__mock.releaseCamera()});await page.waitForFunction(()=>__mock.tracks.every(t=>t.readyState==='ended'));
 });
 await check('Home icons track the finger using transforms and persist a unique order after drop',async()=>{
  await page.locator('[data-home-page="0"]').click();await page.waitForTimeout(500);const first=page.locator('[data-home-item="office"]'),last=page.locator('[data-home-item="contacts"]');await first.scrollIntoViewIfNeeded();const a=await first.boundingBox(),b=await last.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.waitForTimeout(500);await page.locator('.home-drag-ghost').waitFor();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.waitForTimeout(40);assert.match(await page.locator('.home-drag-ghost').evaluate(el=>el.style.transform),/translate3d/);await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.home-drag-ghost'));const order=await page.evaluate(()=>JSON.parse(localStorage.getItem('agenthq-home-layout-v1')).pages[0].apps);assert.equal(order[3],'office');assert.equal(new Set(order).size,order.length);await page.locator('[data-home-edit]').click();await page.screenshot({path:'/tmp/agenthq-camera-tests/home-iphone.png'});
 });
 await check('Native touch drag crosses pages and a swipe glides back without losing app order',async()=>{
  const cdp=await context.newCDPSession(page);await page.locator('[data-home-page="0"]').click();await page.waitForTimeout(500);
  await page.locator('[data-home-item="office"]').scrollIntoViewIfNeeded();const box=await page.locator('[data-home-item="office"]').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(520);await page.locator('.home-drag-ghost').waitFor();
  await page.evaluate(()=>window.agentHQUnreadSync({riley:3}));assert.equal(await page.locator('.home-drag-ghost').count(),1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:386,y}]});await page.waitForTimeout(650);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('agenthq-home-layout-v1')).current),1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:245}]});await page.waitForTimeout(500);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.querySelector('.home-drag-ghost'));
  let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('agenthq-home-layout-v1')));assert(state.pages[1].apps.includes('office'));assert.equal(new Set(state.pages.flatMap(p=>p.apps)).size,16);await page.locator('[data-home-edit]').click();await page.waitForTimeout(400);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:60,y:410}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:320,y:410}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('agenthq-home-layout-v1')));assert.equal(state.current,0);assert.equal(await page.locator('.home-pages').count(),1);
 });
 await check('Saved photos remain after reload; a different account cannot see the album or pending drafts',async()=>{
  await page.reload();await page.waitForFunction(()=>!!window.agentHQCamera);await openThread('riley');await addPhoto();await page.evaluate(()=>__mock.authChange('00000000-0000-4000-8000-000000000099'));await page.waitForFunction(()=>!window.agentHQCamera.hasDrafts('riley'));await page.locator('[data-camera-open-chat]').click();await page.locator('[data-photo-choice="saved"]').click();await page.getByText('No saved photos yet').waitFor();assert.equal(await page.locator('[data-camera-album-pick]').count(),0);await page.locator('[data-camera-close]').click();
 });
 await check('Camera closes cleanly on iPad and landscape; reduced motion removes optional animation',async()=>{
  await page.evaluate(()=>window.agentHQCameraReturnToChat());await page.setViewportSize({width:820,height:1180});await openCamera();await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);await page.waitForTimeout(100);await page.screenshot({path:'/tmp/agenthq-camera-tests/camera-ipad.png'});const close=await page.locator('[data-camera-close]').boundingBox();assert(close.y>=0);await page.setViewportSize({width:844,height:390});await page.screenshot({path:'/tmp/agenthq-camera-tests/camera-landscape.png'});const shutter=await page.locator('[data-camera-shutter]').boundingBox();assert(shutter.x>=0&&shutter.x+shutter.width<=844&&shutter.y+shutter.height<=390);await page.locator('[data-camera-close]').click();await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.home-pages .tile').first().evaluate(el=>getComputedStyle(el).animationName),'none');
 });
 assert.deepEqual(pageErrors,[],'No unhandled browser errors');console.log('Browser checks passed:',results.length);
}catch(e){await page.screenshot({path:'/tmp/agenthq-camera-tests/failure.png'});console.error(JSON.stringify({pageErrors,body:await page.locator('body').innerText(),state:await page.evaluate(()=>({calls:__mock.mediaCalls,tracks:__mock.tracks.map(t=>t.readyState),videos:[...document.querySelectorAll('video')].map(v=>({width:v.videoWidth,height:v.videoHeight,paused:v.paused,source:!!v.srcObject,ready:v.readyState}))}))}));throw e}finally{await browser.close();await new Promise(r=>server.close(r))}
