import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {activityName,projectActivity,threadActivities,activityHTML} from '../agent-activity-view.js';
const now=Date.parse('2026-10-24T12:00:00Z'),time=delta=>new Date(now+delta).toISOString();
const workers=['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn'];
const base={assignment_id:'project',owner_id:'owner',phase:'discussion',team_order:workers.filter(w=>w!=='alex'),lead_worker:'jordan',next_worker:'riley',active_worker:'riley',active_run:'run',lease_until:time(45000),assignment:{title:'Launch video',source_employee_id:'alex'}};
for(const worker of [...workers,'hq'])test(worker+' sees the actual teammate working on their project',()=>{
 const rows=threadActivities(worker,{projects:[base],now});
 assert.equal(rows.length,1);assert.equal(rows[0].actor,'riley');assert(rows[0].active);assert.match(rows[0].text,/Riley is preparing a team response/);
 assert.equal((activityHTML(rows).match(/<span><\/span>/g)||[]).length,3);
});
test('unassigned workers do not acquire another team’s activity',()=>{
 const project={...base,team_order:['jordan','casey']};
 assert.equal(threadActivities('morgan',{projects:[project],now}).length,0);
 assert.equal(threadActivities('jordan',{projects:[project],now})[0].actor,'riley');
});
test('stage labels follow saved planning, research, peer questions, drafts and review',()=>{
 for(const [phase,expected] of [['planning',/planning/],['drafting',/writing the shared draft/],['checking',/reviewing Jordan/],['polishing',/applying the team/]])assert.match(projectActivity({...base,phase},now).text,expected);
 assert.match(projectActivity({...base,peer_target:'riley',peer_return_worker:'casey'},now).text,/answering Casey/);
 assert.match(projectActivity({...base,pending_research_query:'Landscape location'},now).text,/researching public sources/);
 assert.match(projectActivity(base,now,{},[{assignment_id:'project',employee_id:'riley',status:'running',started_at:time(-5000)}]).text,/researching public sources/);
});
test('handoffs and queues are visible without pretending to type',()=>{
 const rows=threadActivities('hq',{projects:[{...base,active_run:null,phase:'checking',next_worker:'casey'}],now});
 assert.match(rows[0].text,/Jordan → Casey.*Peer review/);assert(!rows[0].active);
 assert(!activityHTML(rows,{hq:true}).includes('data-activity-running'));
 assert(!activityHTML(rows,{hq:true}).includes('ios-typing'));
 const queued=projectActivity({...base,active_run:null,next_run_at:time(3600000)},now);assert.match(queued.text,/queued until/);assert(!queued.active);
});
test('paused, failed, waiting, expired and completed states stop animation',()=>{
 for(const s of [{...base,assignment:{owner_paused:true}},{...base,last_error:'Quota paused'},{...base,phase:'waiting_owner',waiting_worker:'jordan'},{...base,phase:'waiting_permission',waiting_worker:'casey'},{...base,lease_until:time(-1)},{...base,phase:'review'}]){
  const a=projectActivity(s,now);assert(!a.active);assert(!activityHTML([a]).includes('data-activity-running'));
  assert(!activityHTML([a]).includes('ios-typing'));
 }
 assert.equal(projectActivity({...base,phase:'approved'},now),null);
 assert.match(projectActivity({...base,phase:'waiting_owner',waiting_worker:'jordan'},now).text,/Jordan.*your answer/);
});
test('a direct response remains local to the correct builtin or custom thread',()=>{
 for(const worker of [...workers,'custom-worker']){
  const local=[{id:'local',worker,startedAt:now-1000,stage:'Preparing a response'}];
  const rows=threadActivities(worker,{local,now,labels:{'custom-worker':'Nova'}});assert(rows[0].active);assert.match(rows[0].text,new RegExp(activityName(worker,{'custom-worker':'Nova'})));
  assert.equal(threadActivities(worker==='riley'?'casey':'riley',{local,now}).length,0);
 }
 const late=threadActivities('riley',{local:[{id:'late',worker:'riley',startedAt:now-300000,stage:'Response'}],now});assert(!late[0].active);assert.match(late[0].text,/longer than expected/);
});
test('Company HQ also shows direct work with the actual worker’s name',()=>{
 const rows=threadActivities('hq',{local:[{id:'solo',worker:'quinn',startedAt:now-1000,stage:'Preparing a response'}],now});
 assert.equal(rows[0].actor,'quinn');assert.match(rows[0].text,/Quinn/);assert(rows[0].active);
});
test('individual worker runs and custom research are scoped and do not duplicate project leases',()=>{
 const run={id:'r',assignment_id:'solo',employee_id:'jordan',status:'running',created_at:time(-1000),assignment:{title:'Solo script',employee_ids:['jordan']}};
 assert(threadActivities('jordan',{workerRuns:[run],now})[0].active);assert.equal(threadActivities('casey',{workerRuns:[run],now}).length,0);
 assert.equal(threadActivities('hq',{projects:[base],workerRuns:[{...run,assignment_id:'project'}],now}).length,1);
 const research={id:'web',bot_id:'nova',employee_id:null,status:'running',started_at:time(-1000)};
 const rows=threadActivities('nova',{research:[research],local:[{id:'local',worker:'nova',startedAt:now-1000,stage:'Response'}],labels:{nova:'Nova'},now});assert.equal(rows.length,1);assert.match(rows[0].text,/Nova is researching/);
});
test('stale metadata and network loss stop persisted animation; local requests time out visibly',()=>{
 const research={id:'web',employee_id:'riley',status:'running',started_at:time(-1000)};
 for(const options of [{fresh:false},{online:false}]){
  for(const input of [{projects:[base]},{research:[research]}]){const rows=threadActivities('riley',{...input,...options,now});assert(rows.length);assert(rows.every(r=>!r.active));}
 }
 for(const created_at of ['invalid',time(-121000),time(1000)])assert.equal(threadActivities('riley',{workerRuns:[{id:'r',employee_id:'riley',status:'running',created_at}],now}).length,0);
});
test('activity text and project links escape untrusted saved names and titles',()=>{
 const html=activityHTML([{text:'<img onerror="bad">',title:'<script>bad</script>',actor:'" onclick="bad',projectId:'" onclick="bad',active:true,state:'working'}]);
 assert(!html.includes('<img'));assert(!html.includes('<script'));assert(!html.includes(' onclick="bad'));assert.match(html,/&lt;img/);
});

function lifecycle(file,{fail=false}={}){
 let release;const pending=new Promise(r=>release=r),events=[];
 const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},then(f){return Promise.resolve({data:[]}).then(f)}};
 const cloud={auth:{getUser:async()=>({data:{user:{id:'owner'}}}),onAuthStateChange(){}},from:()=>q,rpc:async()=>({data:[]}),functions:{invoke:async()=>{await pending;return fail?{error:{message:'Provider stopped'}}:{data:{success:true}};}}};
 const win={addEventListener(){},agentHQActivity:{rememberWorkers(){},begin(worker,stage,options){events.push({worker,stage,options});return {update(stage){events.push({stage})},end(){events.push({ended:true})}};}}};
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{agentCloud:cloud,connectMessageControls(){},window:win,document:{addEventListener(){},hidden:false},setTimeout(){},setInterval(){},clearTimeout(){},console});
 return {win,events,release};
}
for(const [file,api,worker] of [['agent-messages-cloud.js','agentHQChatCloud','riley'],['agent-bot-studio-cloud.js','agentHQBotStudioCloud','nova'],['agent-worker-cloud.js','agentHQWorkerCloud','jordan']]){
 for(const fail of [false,true])test(file+' clears the correct live request on '+(fail?'failure':'success'),async()=>{
  const h=lifecycle(file,{fail}),promise=api==='agentHQWorkerCloud'?h.win[api].run('11111111-1111-4111-8111-111111111111',worker):h.win[api][api==='agentHQChatCloud'?'converse':'send'](worker,'Research the assignment');
  await new Promise(r=>setImmediate(r));assert.equal(h.events[0].worker,worker);assert.equal(h.events[0].options.ownerId,'owner');assert(!h.events.some(e=>e.ended));
  h.release();if(fail)await assert.rejects(promise,/Provider stopped/);else await promise;assert.equal(h.events.filter(e=>e.ended).length,1);
 });
}
