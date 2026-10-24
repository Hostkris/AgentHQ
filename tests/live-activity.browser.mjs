// Real frontend modules, held synthetic server requests. No account or model calls.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(new URL('..',import.meta.url).pathname),results=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.AGENTHQ_TEST_CHROME||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const core=new Set(['app.js','icons.js','agent-home-layout.js','agent-message-controls.js','agent-project-view.js','agent-project-recovery.js','agent-project-autonomy.js','agent-projects-cloud.js','agent-activity-view.js','agent-activity-cloud.js','agent-messages-cloud.js','agent-bot-studio-cloud.js','agent-bot-studio-ui.js']);
await page.route('**/*',async route=>{const url=new URL(route.request().url()),name=url.pathname.split('/').at(-1);if(url.origin!==base){await route.abort();return;}if(name==='agent-cloud-auth.js'){await route.fulfill({contentType:'text/javascript',body:'export const agentCloud=window.__cloud;'});return;}if(name.endsWith('.js')&&!core.has(name)){await route.fulfill({contentType:'text/javascript',body:''});return;}await route.continue();});
await page.addInitScript(()=>{
 const workers=['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq'],listeners=[],holds=new Map();
 const id='11111111-1111-4111-8111-111111111111',bot='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
 const project={assignment_id:id,owner_id:'owner-a',phase:'waiting_owner',waiting_worker:'jordan',pending_question:'Which audience?',team_order:['jordan','casey','riley'],lead_worker:'jordan',next_worker:'riley',revision:1,active_run:null,active_worker:null,last_error:'',next_run_at:new Date(0).toISOString(),assignment:{title:'Landscape campaign',owner_paused:false,source_employee_id:'alex'},updated_at:new Date().toISOString()};
 const tables={agent_project_sessions:[project],agent_worker_runs:[],agent_role_research:[],agent_research_jobs:[],agent_conversations:workers.map(employee_id=>({id:'conv-'+employee_id,employee_id})),agent_messages:[],agent_custom_bots:[{id:bot,name:'Nova',role:'Designer',status:'active',mission:'Create designs'},{id:other,name:'Sage',role:'Editor',status:'active',mission:'Review writing'}],agent_custom_bot_messages:[],agent_custom_bot_handoffs:[]};
 for(let i=0;i<55;i++)for(const worker of ['riley','hq'])tables.agent_messages.push({id:worker+i,conversation_id:'conv-'+worker,sender:'employee',body:'Saved conversation message '+i+' with enough text to exercise scrolling.',created_at:new Date(Date.now()-100000+i*1000).toISOString()});
 for(let i=0;i<50;i++)tables.agent_custom_bot_messages.push({id:'nova-'+i,bot_id:bot,sender:'employee',body:'A previous design discussion '+i,created_at:new Date(Date.now()-100000+i*1000).toISOString()});
 const state=window.__activityMock={id,bot,other,project,tables,workers,owner:'owner-a',calls:[],failMetadata:false,claimDelay:1000};
 state.release=(worker,fail=false)=>holds.get(worker)?.(fail);
 state.auth=(owner,event='SIGNED_IN')=>{state.owner=owner;listeners.forEach(f=>f(event,{user:{id:owner}}));};
 window.__cloud={auth:{getUser:async()=>({data:{user:{id:state.owner}}}),onAuthStateChange:f=>listeners.push(f)},from(table){let filters=[],single=false;
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},then(fn){const error=state.failMetadata&&['agent_worker_runs','agent_role_research','agent_research_jobs'].includes(table)?{message:'Temporarily offline'}:null;const rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?rows[0]||null:structuredClone(rows),error}).then(fn);}};return q;},rpc:async()=>({data:[]}),functions:{async invoke(name,{body}){
   state.calls.push({name,...body});
   if(name==='agent-hq-coordinate'){
    await new Promise(r=>setTimeout(r,state.claimDelay));project.active_run='held-run';project.active_worker=project.next_worker;project.lease_until=new Date(Date.now()+85000).toISOString();
    await new Promise(r=>holds.set('project',r));project.active_run=null;project.phase='waiting_owner';project.waiting_worker='riley';return {data:{state:'waiting_owner'}};
   }
   const worker=body.bot_id||body.employee_id,fail=await new Promise(r=>holds.set(worker,r));holds.delete(worker);
   if(fail)return {error:{message:'Synthetic provider failure'}};
   if(body.bot_id)tables.agent_custom_bot_messages.push({id:'new-bot',bot_id:body.bot_id,sender:'employee',body:'Here is the finished response.',created_at:new Date().toISOString()});
   else tables.agent_messages.push({id:'new-'+worker,conversation_id:'conv-'+worker,sender:'employee',body:'Here is the finished response.',created_at:new Date().toISOString()});
   return {data:{success:true}};
  }}};
 window.agentHQTeamCloud={refresh:async()=>{}};
});
async function check(name,fn){await fn();results.push(name);console.log('PASS:',name);}
async function open(worker){await page.evaluate(worker=>agentHQCameraReturnToChat(worker),worker);await page.locator('#draft').waitFor();}
async function projectRefresh(){await page.evaluate(async()=>{await agentHQProjects.refresh();await agentHQActivity.refresh();});}
const dock=()=>page.locator('.agent-thread-activity');
try{
 await page.goto(base+'/index.html');await page.waitForFunction(()=>window.agentHQProjects&&window.agentHQActivity&&window.agentHQChatCloud&&window.agentHQBotStudioCloud);await projectRefresh();
 await check('A direct message shows three animated dots immediately and stops on confirmed completion',async()=>{
  await open('quinn');await page.locator('#draft').fill('Research current growth strategies');await page.locator('#send-message').click();
  await page.locator('[data-activity-running=true]').waitFor();assert.equal(await dock().locator('.ios-typing span').count(),3);assert.match(await dock().innerText(),/Quinn/);
  assert.equal(await dock().locator('span').first().evaluate(e=>getComputedStyle(e).animationName),'agent-live-dot');
  await open('hq');assert.match(await dock().innerText(),/Quinn.*Preparing a response/);await open('quinn');
  await page.evaluate(()=>__activityMock.release('quinn'));await page.waitForFunction(()=>document.querySelector('.agent-thread-activity')?.hidden);assert.match(await page.locator('#chat-scroll').innerText(),/finished response/);
 });
 await check('Failed direct requests clear the dots and leave a visible error',async()=>{
  await page.locator('#draft').fill('Try this task');await page.locator('#send-message').click();await page.locator('[data-activity-running=true]').waitFor();await page.evaluate(()=>__activityMock.release('quinn',true));
  await page.waitForFunction(()=>document.querySelector('#send-feedback').textContent.includes('Synthetic provider failure'));assert(await dock().evaluate(e=>e.hidden));
 });
 await check('A server claim delayed beyond 700ms becomes visible before the model response finishes',async()=>{
  await page.evaluate(()=>{const s=__activityMock.project;s.phase='discussion';s.waiting_worker=null;s.next_worker='riley';s.assignment.owner_paused=false;agentHQProjects.start(s.assignment_id);});await open('hq');
  await page.waitForFunction(()=>document.querySelector('[data-activity-running=true][data-activity-actor=riley]'),{},{timeout:9000});
  assert.match(await dock().innerText(),/Riley is preparing a team response/);assert.equal(await page.evaluate(()=>__activityMock.calls.filter(c=>c.name==='agent-hq-coordinate').length),1);
 });
 await check('Every assigned worker and Company HQ show the actual active teammate',async()=>{
  await page.evaluate(()=>__activityMock.project.team_order=__activityMock.workers.filter(w=>!['alex','hq'].includes(w)));await projectRefresh();
  for(const worker of await page.evaluate(()=>__activityMock.workers)){await open(worker);assert.equal(await dock().locator('[data-activity-running=true][data-activity-actor=riley]').count(),1);assert.equal(await dock().locator('.ios-typing span').count(),3);}
 });
 await check('Live stage changes preserve the exact input, caret, focus and older-message scroll position',async()=>{
  await open('riley');await page.locator('#draft').fill('Keep this unsent text');await page.locator('#draft').focus();
  await page.evaluate(()=>{const f=document.querySelector('#draft');f.setSelectionRange(5,9);document.querySelector('#chat-scroll').scrollTop=0;__activityMock.project.pending_research_query='Landscape campaign evidence';});await projectRefresh();
  assert.match(await dock().innerText(),/researching public sources/);assert.equal(await page.locator('#draft').inputValue(),'Keep this unsent text');assert.deepEqual(await page.locator('#draft').evaluate(e=>[e===document.activeElement,e.selectionStart,e.selectionEnd]),[true,5,9]);assert.equal(await page.locator('#chat-scroll').evaluate(e=>e.scrollTop),0);
  const area=await dock().boundingBox(),composer=await page.locator('#composer').boundingBox();assert(area.height>30&&area.y+area.height<=composer.y+1);assert(area.y>0&&composer.y+composer.height<=844);
 });
 await check('A teammate’s answer and peer review have distinct visible stages',async()=>{
  await page.evaluate(()=>{const s=__activityMock.project;s.pending_research_query=null;s.peer_target='riley';s.peer_return_worker='casey';});await projectRefresh();assert.match(await dock().innerText(),/answering Casey/);
  await page.evaluate(()=>__activityMock.project.phase='checking');await projectRefresh();assert.match(await dock().innerText(),/reviewing Jordan/);
 });
 await check('Token refresh preserves the active run and does not start a duplicate request',async()=>{
  await page.evaluate(()=>__activityMock.auth('owner-a','TOKEN_REFRESHED'));await projectRefresh();assert.equal(await dock().locator('[data-activity-running=true]').count(),1);assert.equal(await page.evaluate(()=>__activityMock.calls.filter(c=>c.name==='agent-hq-coordinate').length),1);
 });
 await check('Offline and failed metadata reads show reconnecting without fake animated activity',async()=>{
  await context.setOffline(true);await page.waitForFunction(()=>!document.querySelector('[data-activity-running=true]'));assert.match(await dock().innerText(),/Connection interrupted/);await context.setOffline(false);
  await page.evaluate(async()=>{__activityMock.failMetadata=true;await agentHQActivity.refresh();});assert.equal(await dock().locator('[data-activity-running=true]').count(),0);assert.match(await dock().innerText(),/Reconnecting/);
  await page.evaluate(async()=>{__activityMock.failMetadata=false;await agentHQActivity.refresh();});assert.equal(await dock().locator('[data-activity-running=true]').count(),1);
 });
 await check('Paused, queued and private-answer states remain visible with no typing animation',async()=>{
  await page.evaluate(()=>__activityMock.project.assignment.owner_paused=true);await projectRefresh();assert.match(await dock().innerText(),/paused by you/);assert.equal(await dock().locator('[data-activity-running=true]').count(),0);
  await page.evaluate(()=>{const s=__activityMock.project;s.assignment.owner_paused=false;s.active_run=null;s.next_run_at=new Date(Date.now()+3600000).toISOString();});await projectRefresh();assert.match(await dock().innerText(),/queued until/);
  await page.evaluate(()=>{__activityMock.release('project');});await page.waitForFunction(()=>document.querySelector('.agent-thread-activity')?.textContent.includes('waiting for your answer'));assert.equal(await dock().locator('[data-activity-running=true]').count(),0);
 });
 await check('A single-worker assignment appears only in that worker, the manager and HQ',async()=>{
  await page.evaluate(()=>{const m=__activityMock;m.project.phase='approved';m.tables.agent_worker_runs.push({id:'solo-run',owner_id:m.owner,assignment_id:'solo',employee_id:'quinn',status:'running',created_at:new Date().toISOString(),assignment:{title:'Growth analysis',employee_ids:['quinn'],owner_paused:false}});});await projectRefresh();
  for(const worker of ['quinn','alex','hq']){await open(worker);assert.match(await dock().innerText(),/Quinn.*assigned work/);}await open('casey');assert(await dock().evaluate(e=>e.hidden));
  await page.evaluate(()=>__activityMock.tables.agent_worker_runs=[]);await projectRefresh();
 });
 await check('Custom workers use the same three-dot indicator without showing another bot as typing',async()=>{
  await page.evaluate(()=>agentHQCameraReturnToChat(null));await page.locator('[data-nav=studio]').click();
  await page.evaluate(()=>agentHQBotStudioUI.openBot(__activityMock.bot));await page.locator('#studio-message-form').waitFor();
  await page.evaluate(()=>{window.__studioResult=agentHQBotStudioCloud.send(__activityMock.bot,'Design a visual').catch(e=>({error:e.message}));});await page.locator('[data-activity-running=true]').waitFor();assert.match(await dock().innerText(),/Nova/);
  assert.equal(await page.locator('.studio-chat-bubbles .ios-typing').count(),0);assert.equal(await dock().locator('.ios-typing span').count(),3);
  await page.evaluate(()=>agentHQBotStudioUI.openBot(__activityMock.other));await page.waitForFunction(()=>document.querySelector('[data-agent-activity-thread]')?.dataset.agentActivityThread===__activityMock.other);assert(await dock().evaluate(e=>e.hidden));
  await page.evaluate(()=>agentHQBotStudioUI.openBot(__activityMock.bot));await page.locator('[data-activity-running=true]').waitFor();await page.evaluate(async()=>{__activityMock.release(__activityMock.bot);await __studioResult;});assert(await dock().evaluate(e=>e.hidden));
 });
 await check('Light, dark, reduced motion, iPad and landscape retain visible activity above the composer',async()=>{
  await open('hq');await page.evaluate(()=>{const s=__activityMock.project;s.phase='checking';s.next_run_at=new Date(0).toISOString();s.active_run='layout-run';s.active_worker='casey';s.lease_until=new Date(Date.now()+80000).toISOString();});await projectRefresh();
  for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:844,height:390}]){await page.setViewportSize(viewport);const a=await dock().boundingBox(),c=await page.locator('#composer').boundingBox();assert(a.y>=0&&a.y+a.height<=c.y+1);assert(c.y+c.height<=viewport.height+1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});assert.equal(await dock().locator('.ios-typing span').first().evaluate(e=>getComputedStyle(e).animationName),'none');assert.notEqual(await dock().evaluate(e=>getComputedStyle(e).color),await dock().evaluate(e=>getComputedStyle(e).backgroundColor));
  await mkdir('/tmp/agenthq-live-activity',{recursive:true});await page.screenshot({path:'/tmp/agenthq-live-activity/hq-dark.png'});await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});await page.screenshot({path:'/tmp/agenthq-live-activity/hq-light.png'});
 });
 await check('Changing owners clears both project and local activity',async()=>{
  await page.evaluate(()=>{agentHQActivity.begin('hq','Preparing a response',{ownerId:'owner-a'});__activityMock.auth('owner-b');});await projectRefresh();assert(await dock().evaluate(e=>e.hidden));assert.equal(await page.locator('[data-project-room]').count(),0);
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,errors}));
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
