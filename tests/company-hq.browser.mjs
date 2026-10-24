// Synthetic projects and model responses only. No real account, source or model calls.
import {createRequire} from 'node:module';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const engine=process.env.AGENTHQ_TEST_BROWSER==='webkit'?webkit:chromium,mac=process.env.AGENTHQ_TEST_DEVICE==='mac';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(new URL('..',import.meta.url).pathname),results=[];
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',extname(path)==='.css'?'text/css':extname(path)==='.js'?'text/javascript':'text/html');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.AGENTHQ_TEST_CHROME||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:process.env.AGENTHQ_TEST_WEBKIT?{executablePath:process.env.AGENTHQ_TEST_WEBKIT}:{} )});
const context=await browser.newContext({viewport:mac?{width:1440,height:900}:{width:390,height:844},deviceScaleFactor:1,isMobile:!mac,hasTouch:!mac});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',dialog=>dialog.accept());
const core=new Set(['agent-research-status.js','app.js','agent-home-layout.js','agent-message-controls.js','agent-project-view.js','agent-project-recovery.js','agent-project-autonomy.js','agent-projects-cloud.js','agent-activity-cloud.js','agent-activity-view.js','icons.js']);
await page.route('**/*',async route=>{const u=new URL(route.request().url()),name=u.pathname.split('/').at(-1);
 if(u.origin!==base){await route.abort();return;}
 if(name==='agent-cloud-auth.js'){await route.fulfill({contentType:'text/javascript',body:'export const agentCloud=window.__cloud;'});return;}
 if(name.endsWith('.js')&&!core.has(name)){await route.fulfill({contentType:'text/javascript',body:''});return;}
 await route.continue();
});
await page.addInitScript(()=>{
 const id='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333';
 const projects=[{assignment_id:id,owner_id:'owner-a',phase:'waiting_owner',revision:1,turn_count:4,team_order:['jordan','casey'],lead_worker:'jordan',next_worker:'jordan',waiting_worker:'jordan',pending_question:'Which landscape location should the script feature?',question_message_id:'private-question',shared_draft:'HIDDEN PARTIAL DRAFT',final_output:'',review_status:'pending',active_run:null,last_error:'',next_run_at:new Date(0).toISOString(),updated_at:new Date().toISOString(),assignment:{title:'Landscape video script',owner_paused:false,status:'in_progress',source_employee_id:'alex'}},
  {assignment_id:second,owner_id:'owner-a',phase:'review',revision:1,team_order:['maya','jordan'],lead_worker:'jordan',final_output:'Launch campaign\nA complete synthetic campaign with a clear audience, an honest benefit, a concise invitation and a simple measurement plan. No outside account actions were performed.',output_version:version,review_status:'pending',active_run:null,last_error:'',next_run_at:new Date(0).toISOString(),updated_at:new Date(Date.now()-10000).toISOString(),assignment:{title:'Launch campaign',owner_paused:false,status:'in_progress',source_employee_id:'alex'}}];
 const notes=[{id:'turn-1',assignment_id:id,sender_kind:'agent',sender_id:'jordan',recipient_id:'casey',project_revision:1,project_kind:'team_question',body:'Casey, should the opening show the beginner mistake first?',created_at:new Date(Date.now()-120000).toISOString()},
  {id:'turn-2',assignment_id:id,sender_kind:'agent',sender_id:'casey',recipient_id:'jordan',project_revision:1,project_kind:'team_answer',body:'Jordan, show the mistake, then the corrected photo. It makes the takeaway concrete.',created_at:new Date(Date.now()-110000).toISOString()},
  {id:'owner-context',assignment_id:id,sender_kind:'owner',sender_id:'owner',project_revision:1,project_kind:'owner_context',body:'PRIVATE OWNER SOURCE MATERIAL',created_at:new Date().toISOString()}];
 const authListeners=[],ledger=[];const mock=window.__projectMock={id,second,version,projects,notes,owner:'owner-a',calls:[],hold:false};
 mock.sync=()=>{window.agentHQTeamSync(projects.map(s=>({id:s.assignment_id,...s.assignment,workflow_version:2,employee_ids:s.team_order,coordination_status:'working',created_at:new Date().toISOString()})),notes,'Synced');window.agentHQSyncMessages([{id:'private-question',employeeId:'jordan',sender:'employee',text:'Which landscape location should the script feature?',createdAt:new Date().toISOString()},{id:'alex-complete',employeeId:'alex',sender:'employee',text:'The team has finished Launch campaign. It is ready for review in Company HQ.',createdAt:new Date().toISOString()}],'Synced');};
 mock.changeOwner=owner=>{mock.owner=owner;authListeners.forEach(f=>f('SIGNED_IN',{user:{id:owner}}));};
 window.__cloud={auth:{getUser:async()=>({data:{user:{id:mock.owner}}}),onAuthStateChange:f=>authListeners.push(f)},from(table){let filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(){return q},order(){return q},limit(){return q},abortSignal(){return q},then(resolve){return Promise.resolve({data:table==='agent_project_sessions'?structuredClone(projects.filter(s=>filters.every(([k,v])=>s[k]===v))):table==='agent_worker_runs'?projects.filter(s=>s.active_run&&!s.assignment.owner_paused).map(s=>({id:s.active_run,owner_id:s.owner_id,assignment_id:s.assignment_id,employee_id:s.active_worker,status:'running',created_at:new Date().toISOString()})).filter(r=>filters.every(([k,v])=>r[k]===v)):[]}).then(resolve);}};return q;},async rpc(name,args){if(name==='dismiss_agent_chat_item')ledger.push({kind:args.p_kind,item_key:args.p_key});return {data:name==='get_agent_chat_dismissals'?ledger:true};},functions:{async invoke(name,{body}){
   mock.calls.push(body);const s=projects.find(s=>s.assignment_id===body.assignment_id);if(!s)return {error:{message:'not found'}};
   if(body.action==='project_review'){
    if(s.phase!=='review'||s.output_version!==body.output_version)return {data:{error:'This finished version changed or was already reviewed'}};
    if(body.decision==='approve'){s.phase='approved';s.review_status='approved';}else{s.phase='waiting_owner';s.waiting_worker=s.lead_worker;s.pending_question='What would you like changed?';s.review_status='changes_requested';}
   }else if(body.action==='project_control'){
    if(body.control==='pause'){s.assignment.owner_paused=true;s.active_run=null;}else{s.assignment.owner_paused=false;s.last_error='';}
   }else if(body.action==='project_answer'){s.phase='checking';s.waiting_worker=null;s.active_run='synthetic-run';s.active_worker='casey';s.lease_until=new Date(Date.now()+80000).toISOString();}
   else if(body.action==='next'){
    if(mock.failTransport){mock.failTransport=false;s.active_run=null;return {error:{message:'Synthetic connection interrupted'}};}
    if(mock.failNext){s.active_run=null;s.last_error='';s.recovery_error=mock.failNext;s.recovery_state='correcting';s.next_run_at=new Date(Date.now()+1200).toISOString();mock.failNext=null;return {data:{state:'recovering',message:'Correcting automatically',workflow_version:2}};}
    s.active_run='synthetic-run';s.active_worker=s.next_worker;s.lease_until=new Date(Date.now()+80000).toISOString();
    if(mock.hold)await new Promise(r=>mock.release=r);
    s.active_run=null;s.phase='waiting_owner';s.waiting_worker=s.next_worker;s.pending_question='Synthetic model blocker';s.recovery_state='idle';s.recovery_error='';
   }
   return {data:{state:s.phase==='approved'?'approved':s.phase==='waiting_owner'?'waiting_owner':'ready',workflow_version:2}};
  }}};
 window.agentHQChatCloud={markRead:async()=>{},refresh:async()=>mock.sync(),async converse(worker,text,options){mock.calls.push({action:'converse',worker,text,options});const s=projects.find(s=>s.assignment_id===options.projectId);if(s&&worker==='hq'&&s.phase==='review'){s.phase='waiting_owner';s.waiting_worker=s.lead_worker;s.review_status='changes_requested';s.pending_question='Please confirm the changes.';}return {success:true,project_workflow:true};}};
 window.agentHQTeamCloud={refresh:async()=>mock.sync()};
});
async function check(name,fn){await fn();results.push(name);console.log('PASS:',name);}
async function open(id){await page.evaluate(id=>window.agentHQCameraReturnToChat(id),id);await page.locator('#composer').waitFor();}
async function refresh(){await page.evaluate(async()=>{await agentHQProjects.refresh();await agentHQActivity.refresh();});}
try{
 await page.goto(base+'/index.html');await page.waitForFunction(()=>!!window.agentHQProjects);await page.evaluate(async()=>{const m=await import('./agent-message-controls.js?v=20261024-delete-1');m.connectMessageControls(window.__cloud);});await refresh();await page.evaluate(()=>__projectMock.sync());
 await check('HQ shows named agent questions and answers without work-order instructions or private source material',async()=>{
  await open('hq');assert.equal(await page.locator('.hq-team-turn').count(),2);assert.match(await page.locator('#chat-scroll').innerText(),/to Casey/);
  const text=await page.locator('#chat-scroll').innerText();for(const hidden of ['HIDDEN PARTIAL DRAFT','PRIVATE OWNER SOURCE MATERIAL','Team work order','Produce a first-draft'])assert(!text.includes(hidden));
  assert.equal(await page.locator('[data-project-final]').count(),0);assert.equal(await page.locator('.hq-team-turn [data-chat-dismiss]').count(),2);
 });
 await check('Private questions open only the requesting worker’s Messages thread with a scoped reply target',async()=>{
  await page.locator('[data-project-answer-thread]').click();assert.equal(await page.locator('.ios-contact-name').innerText(),'Jordan\nCreative Content Director');
  assert.equal(await page.locator('[data-project-question]').count(),1);await page.locator('#draft').fill('Blue Ridge Mountains');await page.locator('#send-message').click();
  assert.equal(await page.evaluate(()=>__projectMock.calls.at(-1).options.projectId),await page.evaluate(()=>__projectMock.id));
  await open('casey');assert.equal(await page.locator('[data-project-question]').count(),0);
 });
 await check('Current model work has labelled iPhone typing dots and incoming updates preserve the focused draft',async()=>{
  await page.evaluate(()=>{const s=__projectMock.projects[0];s.phase='checking';s.waiting_worker=null;s.active_run='real-lease';s.active_worker='casey';s.lease_until=new Date(Date.now()+80000).toISOString();});await refresh();await open('hq');
  await page.locator('#draft').fill('Keep my unsent feedback');await page.locator('#draft').focus();
  await page.evaluate(()=>{__projectMock.notes.push({id:'turn-3',assignment_id:__projectMock.id,sender_kind:'agent',sender_id:'casey',project_revision:1,project_kind:'check',body:'The opening is clear. Tighten the final invitation.',created_at:new Date().toISOString()});__projectMock.sync();});
  assert.equal(await page.locator('#draft').inputValue(),'Keep my unsent feedback');assert(await page.locator('#draft').evaluate(el=>el===document.activeElement));assert.equal(await page.locator('.hq-team-typing .ios-typing span').count(),3);assert.match(await page.locator('.hq-team-typing').getAttribute('aria-label'),/Casey/);
 });
 await check('Real public research is a named team message with an expandable report and clickable sources',async()=>{
  await page.evaluate(()=>{__projectMock.notes.push({id:'web-evidence',assignment_id:__projectMock.id,sender_kind:'agent',sender_id:'casey',project_revision:1,project_kind:'discussion',body:'PUBLIC_RESEARCH_V1\nCasey · Public research\nRetrieved: 2026-10-24\nThe official public guidance supports the proposed video structure.\nhttps://example.com/official',created_at:new Date().toISOString()});__projectMock.sync();});
  const row=page.locator('[data-project-message="web-evidence"]');await row.getByText('Read public research and sources').click();assert.equal(await row.locator('a[href="https://example.com/official"]').count(),1);assert.match(await row.innerText(),/Retrieved: 2026-10-24/);assert.equal(await row.locator('[data-chat-dismiss]').count(),1);
 });
 await check('Pause invalidates the active typing indicator and resume targets the same project',async()=>{
  await page.locator('[data-project-control="pause"]').click();await page.waitForFunction(()=>document.querySelector('[data-project-control="resume"]'));
  assert.equal(await page.locator('.hq-team-typing').count(),0);await page.locator('[data-project-control="resume"]').click();assert.equal(await page.evaluate(()=>__projectMock.calls.filter(c=>c.action==='project_control').at(-1).assignment_id),await page.evaluate(()=>__projectMock.id));
 });
 await check('Routine response faults correct themselves without an owner retry and keep the same saved work',async()=>{
  await page.evaluate(()=>{const s=__projectMock.projects[0];s.phase='discussion';s.next_worker='jordan';s.active_worker=null;s.active_run=null;s.last_error='';s.recovery_state='correcting';s.recovery_error='Response correction [self_address/discussion/jordan/1]. The question must be addressed to another assigned teammate.';s.next_run_at=new Date(Date.now()+800).toISOString();s.shared_draft='SAVED DRAFT BEFORE RETRY';__projectMock.failNext='Response correction [wrong_stage/discussion/jordan/1]. The worker returned a response for the wrong project stage.';});
  await refresh();await page.evaluate(()=>agentHQProjects.start(__projectMock.id));const notice=page.locator('[data-project-autonomy="correcting"]');await notice.waitFor();assert.match(await notice.innerText(),/No action needed/);assert.equal(await page.locator('[data-project-control="retry"]').count(),0);
  await page.waitForFunction(()=>__projectMock.projects[0].recovery_error.includes('wrong_stage'));
  const saved=await page.evaluate(()=>({draft:__projectMock.projects[0].shared_draft,revision:__projectMock.projects[0].revision,manual:__projectMock.calls.filter(c=>c.action==='project_control'&&c.control==='retry').length}));assert.equal(saved.draft,'SAVED DRAFT BEFORE RETRY');assert.equal(saved.revision,1);assert.equal(saved.manual,0);
  await page.screenshot({path:'/tmp/agenthq-team-browser/hq-autonomous-recovery.png'});
  await page.waitForFunction(()=>__projectMock.projects[0].phase==='waiting_owner');assert.equal(await page.locator('[data-project-autonomy]').count(),0);
 });
 await check('A temporary connection failure reconnects and continues automatically without repeated immediate requests',async()=>{
  await page.evaluate(()=>{const s=__projectMock.projects[0];s.phase='discussion';s.active_run=null;s.last_error='';s.recovery_state='idle';s.recovery_error='';s.next_run_at=new Date(0).toISOString();__projectMock.failTransport=true;});
  await refresh();await page.evaluate(()=>agentHQProjects.start(__projectMock.id));await page.locator('[data-project-autonomy="reconnecting"]').waitFor();assert.match(await page.locator('[data-project-autonomy="reconnecting"]').innerText(),/No action needed/);assert.equal(await page.locator('[data-project-control="retry"]').count(),0);
  const calls=await page.evaluate(()=>__projectMock.calls.filter(c=>c.action==='next').length);await refresh();assert.equal(await page.evaluate(()=>__projectMock.calls.filter(c=>c.action==='next').length),calls);
  await page.waitForFunction(()=>__projectMock.projects[0].phase==='waiting_owner');assert.equal(await page.evaluate(()=>__projectMock.projects[0].shared_draft),'SAVED DRAFT BEFORE RETRY');assert.equal(await page.evaluate(()=>__projectMock.calls.filter(c=>c.action==='project_control'&&c.control==='retry').length),0);
 });
 await check('Alex has a direct link to the exact finished project and only final versions show review controls',async()=>{
  await open('alex');assert.equal(await page.locator('.hq-manager-ready').count(),1);await page.locator('.hq-manager-ready [data-project-open]').click();
  assert.equal(await page.locator('[data-project-final]').count(),1);assert.match(await page.locator('.hq-finished-content').innerText(),/complete synthetic campaign/);assert.equal(await page.locator('[data-project-review]').count(),2);
  await page.screenshot({path:'/tmp/agenthq-team-browser/hq-iphone-final.png'});
 });
 await check('Approval is tied to the selected final version and shows the saved approved state',async()=>{
  await page.locator('[data-project-review="approve"]').click();await page.locator('.hq-approved-label').waitFor();const call=await page.evaluate(()=>__projectMock.calls.find(c=>c.action==='project_review'));
  assert.equal(call.output_version,await page.evaluate(()=>__projectMock.version));assert.equal(call.assignment_id,await page.evaluate(()=>__projectMock.second));assert.equal(await page.locator('[data-project-review]').count(),0);
 });
 await check('Typed change requests carry the exact selected project and current version',async()=>{
  await page.evaluate(()=>{const s=__projectMock.projects[1];s.phase='review';s.review_status='pending';});await refresh();
  await page.locator('#draft').fill('Make the opening shorter and keep the original audience.');await page.locator('#send-message').click();
  const call=await page.evaluate(()=>__projectMock.calls.filter(c=>c.action==='converse').at(-1));assert.equal(call.worker,'hq');assert.equal(call.options.projectId,await page.evaluate(()=>__projectMock.second));assert.equal(call.options.projectVersion,await page.evaluate(()=>__projectMock.version));
 });
 await check('Outdated review actions are visibly rejected and do not approve another version',async()=>{
  await page.evaluate(()=>{const s=__projectMock.projects[1];s.phase='review';s.output_version='44444444-4444-4444-8444-444444444444';});await refresh();
  await page.locator('[data-project-review="approve"]').evaluate(el=>el.dataset.projectVersion='33333333-3333-4333-8333-333333333333');await page.locator('[data-project-review="approve"]').click();
  await page.waitForFunction(()=>document.querySelector('#send-feedback')?.textContent.includes('changed'));assert.equal(await page.evaluate(()=>__projectMock.projects[1].phase),'review');
 });
 await check('Private scoped permission buttons apply only to their project and then return it to the team',async()=>{
  await page.evaluate(()=>{const s=__projectMock.projects[0];s.phase='waiting_permission';s.waiting_worker='jordan';s.pending_question='May I record this limited site scope?';s.pending_request_id='permission-id';});await refresh();await open('jordan');
  await page.locator('[data-project-permission="denied"]').click();const call=await page.evaluate(()=>__projectMock.calls.filter(c=>c.action==='project_answer').at(-1));assert.equal(call.decision,'denied');assert.equal(call.assignment_id,await page.evaluate(()=>__projectMock.id));
 });
 await check('Deleting an individual team message keeps other workers’ messages and project state',async()=>{
  await open('hq');await page.locator('[data-project-open]').first().click();const row=page.locator('[data-project-message="turn-1"]');await row.locator('[data-chat-dismiss]').click();await page.waitForFunction(()=>!document.querySelector('[data-project-message="turn-1"]'));
  assert.equal(await page.locator('[data-project-message="turn-2"]').count(),1);
 });
 await check('iPad and landscape layouts keep the conversation and review controls within the viewport',async()=>{
  for(const viewport of [{width:820,height:1180},{width:844,height:390}]){await page.setViewportSize(viewport);await page.locator('[data-project-open]').nth(1).click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const b=await page.locator('.hq-finished-project').boundingBox();assert(b.x>=0&&b.x+b.width<=viewport.width+1);
  }await page.screenshot({path:'/tmp/agenthq-team-browser/hq-ipad.png'});
 });
 await check('Light and dark appearance preserve readable final work and reduced motion stops dot animation',async()=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  const colors=await page.locator('.hq-finished-project').evaluate(el=>({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el.closest('.hq-project-room')).color}));
  assert.equal(colors.background,'rgb(28, 28, 30)');assert.equal(colors.text,'rgb(245, 245, 247)');
  await page.evaluate(()=>document.documentElement.dataset.themeMode='light');assert.equal(await page.locator('.hq-finished-project').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.evaluate(()=>delete document.documentElement.dataset.themeMode);await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
 });
 await check('Failed research explains the provider error, keeps project recovery and hides unfinished findings',async()=>{
  await page.evaluate(()=>{
   window.agentHQResearchCloud={refresh:async()=>{},retry:async id=>{__projectMock.researchRetries=(__projectMock.researchRetries||0)+1;return new Promise(resolve=>__projectMock.finishResearchRetry=()=>resolve({message:'The same saved project will continue automatically.'}));}};
   window.agentHQResearchSync([{id:'failed-research',employee_id:'riley',status:'failed',query:'Official public guidance',report:'UNSUPPORTED PARTIAL FINDINGS https://invented.example',error:'[research:rate_limited] HTTP 429. Retry after 2026-10-24T23:59:00Z. gsk_PRIVATE',recovery_assignment_id:__projectMock.id},{id:'completed-research',employee_id:'casey',status:'completed',query:'YouTube official help',report:'Provider-confirmed source https://support.google.com/youtube/answer/15424877'}],'Synced');
   const button=document.createElement('button');button.dataset.nav='research';button.id='test-open-research';document.querySelector('#app').append(button);button.click();
  });
  const history=page.locator('#research-history');assert.match(await history.innerText(),/Groq rate-limited public research \(HTTP 429\)/);assert.match(await history.innerText(),/recovery continues automatically/);assert(!/UNSUPPORTED|invented.example|gsk_PRIVATE/.test(await history.innerText()));assert.equal(await history.locator('details').count(),1);assert.equal(await history.getByRole('button',{name:'Open saved project'}).count(),1);
  await history.getByText('Read report').click();assert.equal(await history.locator('a[href="https://support.google.com/youtube/answer/15424877"]').count(),1);
 });
 await check('Research history has an optional retry that stays disabled while work is in flight',async()=>{
  const retry=page.locator('[data-research-retry="failed-research"]');await retry.click();assert.equal(await retry.isDisabled(),true);assert.match(await retry.innerText(),/Retrying/);
  await page.evaluate(()=>document.querySelector('[data-research-retry]').dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(await page.evaluate(()=>__projectMock.researchRetries),1);
  await page.evaluate(()=>__projectMock.finishResearchRetry());await page.waitForFunction(()=>!document.querySelector('[data-research-retry]').disabled);assert.match(await page.locator('#research-history-notice').innerText(),/same saved project/);await open('hq');
 });
 await check('Account switching clears project messages, outputs and selected reply scope',async()=>{
  await page.evaluate(()=>__projectMock.changeOwner('owner-b'));await page.waitForFunction(()=>document.querySelector('.hq-project-empty'));assert.equal(await page.locator('[data-project-final],.hq-team-turn').count(),0);assert.deepEqual(await page.evaluate(()=>agentHQProjects.context('hq')),{});
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,errors}));
}finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
