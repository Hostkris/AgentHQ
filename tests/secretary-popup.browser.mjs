// Real startup HTML and popup, with intentionally blocked SDK/API responses.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {AGENT_HQ_SUPABASE_URL} from '../agent-cloud-config.js';
import {saveSecretarySnapshot} from '../agent-secretary-snapshot.js';

const require=createRequire(import.meta.url),{webkit}=require('playwright');
const root=resolve(new URL('..',import.meta.url).pathname),wide=process.env.AGENTHQ_TEST_DEVICE==='mac';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',bot='33333333-3333-4333-8333-333333333333';
const authKey='sb-'+new URL(AGENT_HQ_SUPABASE_URL).hostname.split('.')[0]+'-auth-token';
const out='/tmp/agenthq-secretary-browser';await mkdir(out,{recursive:true});
const deadline=setTimeout(()=>{console.error('Secretary popup startup check timed out');process.exit(1);},60000);deadline.unref();
const server=createServer(async(req,res)=>{
 try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.setHeader('Cache-Control','no-store');res.end(await readFile(path));}
 catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await webkit.launch({headless:true});
function state(account=owner,version=1,label='Saved'){
 return {settings:{owner_id:account,bot_id:bot,version,agent_alerts_enabled:true},items:[],agent_alerts:[],deliveries:Array.from({length:6},(_,i)=>({
  id:'notice-'+i,kind:'reminder',status:'saved',action_state:'open',body:label+' reminder '+(i+1)+(i===5?' — '+('Full supplied instructions. '.repeat(50)):i===0?' <script>window.__unsafeNotice=true</script>':'')
 }))};
}
function gate(){let release;const promise=new Promise(r=>release=r);return {promise,release};}
async function fixture({saved=state(),sessionOwner=owner,fresh=state(owner,2,'Fresh'),holdState=true,due=false}={}){
 const context=await browser.newContext({viewport:wide?{width:1180,height:900}:{width:390,height:844},isMobile:!wide,hasTouch:!wide,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let authGate=gate();const gates=[authGate];
 const records=new Map(),store={setItem:(k,v)=>records.set(k,v)};
 if(saved)saveSecretarySnapshot(store,saved.settings.owner_id,saved);
 if(due)fresh.items.push({id:'due-item',kind:'reminder',status:'active',next_due_at:new Date(Date.now()-60000).toISOString()});
 await page.addInitScript(({authKey,sessionOwner,entries,fresh,holdState})=>{
  const session=id=>({access_token:'fixture-access',refresh_token:'fixture-refresh',user:{id}});
  if(!localStorage.getItem('popup-fixture-seeded')){
   if(sessionOwner)localStorage.setItem(authKey,JSON.stringify(session(sessionOwner)));
   for(const [key,value] of entries)localStorage.setItem(key,value);
   localStorage.setItem('popup-fixture-seeded','yes');
  }
  const callbacks=[],mock=window.__popupFixture={owner:sessionOwner,data:fresh,holdState,stateRequests:0,dueRequests:0,calls:[],appearedAt:null};
  new MutationObserver(()=>{if(mock.appearedAt===null&&document.getElementById('agenthq-eleanor-popup'))mock.appearedAt=performance.now();}).observe(document,{childList:true,subtree:true});
  mock.changeOwner=id=>{mock.owner=id;if(id)localStorage.setItem(authKey,JSON.stringify(session(id)));else localStorage.removeItem(authKey);callbacks.forEach(fn=>fn(id?'SIGNED_IN':'SIGNED_OUT',id?session(id):null));};
  window.__popupCloud={auth:{onAuthStateChange(fn){callbacks.push(fn);queueMicrotask(()=>fn('INITIAL_SESSION',mock.owner?session(mock.owner):null));}},functions:{async invoke(_name,{body}){
   mock.calls.push(body.action);
   if(body.action==='state'){mock.stateRequests++;const snapshot=structuredClone(mock.data);if(mock.holdState)await new Promise(resolve=>mock.releaseState=resolve);return {data:snapshot};}
   if(body.action==='check_due'){mock.dueRequests++;await new Promise(resolve=>mock.releaseDue=resolve);return {data:{saved:1}};}
   throw Error('Unexpected write: '+body.action);
  }}};
 },{authKey,sessionOwner,entries:[...records],fresh,holdState});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url()),name=u.pathname.split('/').at(-1);
  if(u.origin!==base){await route.abort();return;}
  if(name==='agent-cloud-auth.js'){
   const waiting=authGate;await waiting.promise;
   await route.fulfill({body:'window.__popupSdkReady=true; export const agentCloud=window.__popupCloud;',contentType:'text/javascript',headers:{'Cache-Control':'no-store'}}).catch(()=>{});return;
  }
  if(name==='agent-activity-cloud.js'){await route.fulfill({body:"import './agent-cloud-auth.js';",contentType:'text/javascript'});return;}
  if(name.endsWith('.js')&&!['agent-secretary-popup.js','agent-secretary-snapshot.js','agent-cloud-config.js','icons.js'].includes(name)){
   await route.fulfill({body:'',contentType:'text/javascript'});return;
  }
  await route.continue();
 });
 return {page,errors,releaseAuth:()=>authGate.release(),blockAuth(){authGate=gate();gates.push(authGate);},async close(){gates.forEach(g=>g.release());await context.close();}};
}
const popup=page=>page.locator('#agenthq-eleanor-popup');
try{
 const f=await fixture();
 try{
  await f.page.goto(base+'/index.html',{waitUntil:'commit'});await popup(f.page).waitFor({timeout:1500});
  assert.equal(await f.page.evaluate(()=>window.__popupSdkReady===true),false);
  assert.equal(await f.page.locator('.eleanor-pop-alert-item').count(),6);
  assert.ok((await f.page.locator('.eleanor-pop-alert-item').last().textContent()).endsWith('Full supplied instructions. '.repeat(50)));
  assert.equal(await f.page.evaluate(()=>window.__unsafeNotice===true),false);
  console.log('PASS: all saved reminder cards appear before the auth SDK or API is released ('+Math.round(await f.page.evaluate(()=>__popupFixture.appearedAt))+'ms)');
  const field=f.page.locator('#eleanor-pop-reply');await field.fill('Keep this reply while reminders update');await field.evaluate(el=>el.setSelectionRange(5,12));
  f.releaseAuth();await f.page.waitForFunction(()=>__popupFixture.stateRequests===1);
  await f.page.evaluate(()=>{__popupFixture.holdState=false;__popupFixture.releaseState();});
  await f.page.waitForFunction(()=>document.querySelector('[data-eleanor-pop-alerts]')?.textContent.includes('Fresh reminder 1'));
  assert.equal(await field.inputValue(),'Keep this reply while reminders update');assert.deepEqual(await field.evaluate(el=>[el.selectionStart,el.selectionEnd]),[5,12]);
  assert.equal(await field.evaluate(el=>document.activeElement===el),true);assert.equal(await popup(f.page).count(),1);
  console.log('PASS: fresh reminder contents update without replacing the card, reply or caret');
  f.blockAuth();await f.page.reload({waitUntil:'commit'});await popup(f.page).waitFor({timeout:1500});
  assert.equal(await f.page.evaluate(()=>window.__popupSdkReady===true),false);assert.match(await f.page.locator('[data-eleanor-pop-alerts]').textContent(),/Fresh reminder 1/);
  f.releaseAuth();await f.page.waitForFunction(()=>__popupFixture.stateRequests===1);
  await f.page.screenshot({path:out+'/eleanor-instant-'+(wide?'desktop':'iphone')+'.png',timeout:5000});
  assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await f.page.getByRole('button',{name:'Close Eleanor popup',exact:true}).click();await popup(f.page).waitFor({state:'detached'});
  await f.page.evaluate(()=>{__popupFixture.holdState=false;__popupFixture.releaseState();});
  await f.page.evaluate(()=>window.agentHQEleanorPopup.check());
  assert.equal(await popup(f.page).count(),0);assert.equal(await f.page.evaluate(()=>__popupFixture.data.deliveries.every(d=>d.action_state==='open')),true);
  assert.equal(await f.page.evaluate(()=>__popupFixture.calls.every(a=>a==='state')),true);assert.deepEqual(f.errors,[]);
  console.log('PASS: returning to the app restores the latest saved card; closing it retains dismissal and does not acknowledge work');
 }finally{await f.close();}

 const b=await fixture();
 try{
  await b.page.goto(base+'/index.html',{waitUntil:'commit'});await popup(b.page).waitFor({timeout:1500});b.releaseAuth();await b.page.waitForFunction(()=>__popupFixture.stateRequests===1);
  await b.page.evaluate(()=>__popupFixture.changeOwner(null));assert.equal(await popup(b.page).count(),0);
  await b.page.evaluate(()=>{__popupFixture.holdState=false;__popupFixture.releaseState();});
  const next=state(other,1,'Other account');await b.page.evaluate(({other,next})=>{__popupFixture.data=next;__popupFixture.changeOwner(other);},{other,next});
  await popup(b.page).waitFor();await b.page.waitForFunction(()=>document.querySelector('[data-eleanor-pop-alerts]')?.textContent.includes('Other account reminder 1'));
  assert.doesNotMatch(await popup(b.page).textContent(),/Saved reminder|Fresh reminder/);assert.deepEqual(b.errors,[]);
  console.log('PASS: sign-out removes the private card immediately; late replies and another account cannot replay it');
 }finally{await b.close();}

 const c=await fixture({saved:state(),sessionOwner:other,fresh:state(other,1,'Current account'),holdState:false});
 try{
  await c.page.goto(base+'/index.html',{waitUntil:'commit'});await c.page.waitForFunction(()=>window.agentHQEleanorPopup);
  assert.equal(await popup(c.page).count(),0);c.releaseAuth();await popup(c.page).waitFor();assert.match(await popup(c.page).textContent(),/Current account reminder/);assert.deepEqual(c.errors,[]);
  console.log('PASS: a saved card from a different remembered account is never shown');
 }finally{await c.close();}

 const d=await fixture({saved:null,holdState:false,due:true});
 try{
  await d.page.goto(base+'/index.html',{waitUntil:'commit'});await d.page.waitForFunction(()=>window.agentHQEleanorPopup);
  assert.equal(await popup(d.page).count(),0);d.releaseAuth();await popup(d.page).waitFor();await d.page.waitForFunction(()=>__popupFixture.dueRequests===1);
  assert.match(await popup(d.page).textContent(),/Fresh reminder 1/);assert.equal(await d.page.evaluate(()=>typeof __popupFixture.releaseDue==='function'),true);
  await d.page.evaluate(()=>{__popupFixture.data.items=[];__popupFixture.releaseDue();});assert.deepEqual(d.errors,[]);
  console.log('PASS: first-load notices appear as soon as the server returns, without waiting for overdue processing or inventing a card');
 }finally{await d.close();}

 const e=await fixture();
 try{
  await e.page.goto(base+'/index.html',{waitUntil:'commit'});await popup(e.page).waitFor({timeout:1500});
  await e.page.locator('[data-eleanor-pop-desk]').click();assert.equal(await popup(e.page).count(),1);
  await e.page.evaluate(()=>window.agentHQOpenSecretary=()=>{window.__openedDesk=true;});e.releaseAuth();
  await e.page.waitForFunction(()=>window.__openedDesk===true);await popup(e.page).waitFor({state:'detached'});assert.deepEqual(e.errors,[]);
  console.log('PASS: a desk click made before the main app is ready is kept and opens the desk when ready');
 }finally{await e.close();}
}finally{await browser.close();await new Promise(r=>server.close(r));clearTimeout(deadline);}
