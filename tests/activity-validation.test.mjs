import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {threadActivities,activityHTML} from '../agent-activity-view.js';
const now=Date.parse('2026-10-24T18:00:00Z');
const session={assignment_id:'project',owner_id:'owner',phase:'discussion',team_order:['riley','casey'],next_worker:'riley',active_worker:'riley',active_run:'run',lease_until:new Date(now+85000).toISOString(),assignment:{title:'Public research',source_employee_id:'alex'}};
const run={id:'run',owner_id:'owner',assignment_id:'project',employee_id:'riley',status:'running',created_at:new Date(now-1000).toISOString()};
test('live project dots require a matching running worker record, not just a retained lease',()=>{
 for(const workerRuns of [[],[{...run,status:'failed'}],[{...run,employee_id:'casey'}],[{...run,id:'other-run'}]]){
  const rows=threadActivities('hq',{projects:[session],workerRuns,verifiedRuns:true,now});assert(!rows[0].active);assert(!activityHTML(rows).includes('ios-typing'));
 }
 assert(threadActivities('hq',{projects:[session],workerRuns:[run],verifiedRuns:true,now})[0].active);
});
test('a terminal backend event stops stale dots before the project snapshot catches up',()=>{
 for(const event_type of ['worker_completed','worker_failed']){
  const rows=threadActivities('hq',{projects:[session],workerRuns:[run],verifiedRuns:true,events:[{id:'terminal',source_id:'run',assignment_id:'project',employee_id:'riley',event_type,summary:'Recorded outcome',occurred_at:new Date(now).toISOString()}],now});
  assert(rows.every(r=>!r.active));assert(!activityHTML(rows).includes('ios-typing'));
 }
});
test('a selected blocked project and its recorded handoff remain visible among other waiting projects',()=>{
 const projects=Array.from({length:4},(_,i)=>({...session,assignment_id:'project-'+i,phase:'waiting_owner',waiting_worker:'riley',active_run:null}));
 const rows=threadActivities('hq',{projects,selected:'project-2',events:[{id:'handoff',assignment_id:'project-2',employee_id:'riley',event_type:'team_message_sent',summary:'Riley sent a message to Casey',occurred_at:new Date(now).toISOString()}],now});
 assert.equal(rows[0].projectId,'project-2');assert(rows.some(r=>r.event));assert(!activityHTML(rows).includes('ios-typing'));
});
function harness(){
 let clock=now,account='owner',hold=false,release,projectRefreshes=0;const intervals=[],auth=[];
 class Clock extends Date{static now(){return clock;}}
 const project=structuredClone(session),root={dataset:{agentActivityThread:'hq',activityLocal:'true'},innerHTML:'',hidden:true};
 const tables={agent_worker_runs:[structuredClone(run)],agent_role_research:[],agent_research_jobs:[],agent_execution_events:[]};
 const cloud={auth:{getUser:async()=>({data:{user:account?{id:account}:null}}),onAuthStateChange:f=>auth.push(f)},from(table){let filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},limit(){return q},abortSignal(signal){assert(signal);return q},then(resolve,reject){const response=()=>({data:structuredClone(tables[table].filter(r=>filters.every(f=>f(r))))});return (hold?new Promise(r=>release=()=>r(response())):Promise.resolve(response())).then(resolve,reject);}};return q;}};
 const window={addEventListener(){},agentHQProjects:{all:()=>[project],context:()=>({projectId:'project'}),refresh:async()=>{projectRefreshes++;}}};
 const source=readFileSync(new URL('../agent-activity-cloud.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{agentCloud:cloud,threadActivities,activityHTML,window,Date:Clock,AbortSignal,document:{hidden:false,querySelectorAll:()=>[root],getElementById:()=>null,addEventListener(){}},navigator:{onLine:true},setTimeout(){},clearTimeout(){},setInterval:f=>intervals.push(f),console});
 return {root,project,tables,api:window.agentHQActivity,advance(ms){clock+=ms;intervals.forEach(f=>f());},hang(){hold=true;},signOut(){account=null;auth.forEach(f=>f('SIGNED_OUT',null));},get projectRefreshes(){return projectRefreshes;}};
}
test('the elapsed-time watchdog removes stale dots even while the next status query is stuck',async()=>{
 const h=harness();await h.api.refresh();assert(h.root.innerHTML.includes('ios-typing'));
 h.hang();h.api.refresh();await Promise.resolve();h.advance(16000);
 assert(!h.root.innerHTML.includes('ios-typing'));assert.match(h.root.innerHTML,/Reconnecting to live activity/);
});
test('confirmed backend events refresh saved stages and historical summaries never animate',async()=>{
 const h=harness();await h.api.refresh();h.tables.agent_worker_runs=[];
 h.tables.agent_execution_events.push({id:'handoff',owner_id:'owner',assignment_id:'project',employee_id:'riley',event_type:'team_message_sent',state:'team_question',summary:'Riley sent an assignment message to casey',occurred_at:new Date(now).toISOString()});
 await h.api.refresh();assert(h.projectRefreshes>0);assert.match(h.root.innerHTML,/Riley sent an assignment message/);assert(!h.root.innerHTML.includes('ios-typing'));
});
test('owner questions, authorization, pauses and review clear dots; resumption needs a real new run',async()=>{
 const h=harness();await h.api.refresh();
 for(const phase of ['waiting_owner','waiting_permission','review','approved']){h.project.phase=phase;h.project.waiting_worker='riley';h.api.paint();assert(!h.root.innerHTML.includes('ios-typing'));}
 h.project.phase='discussion';h.project.assignment.owner_paused=true;h.api.paint();assert(!h.root.innerHTML.includes('ios-typing'));
 h.project.assignment.owner_paused=false;h.tables.agent_worker_runs=[];await h.api.refresh();assert(!h.root.innerHTML.includes('ios-typing'));
 h.tables.agent_worker_runs=[structuredClone(run)];await h.api.refresh();assert(h.root.innerHTML.includes('ios-typing'));
});
test('sign-out removes activity even if an old composer still has its sending flag',async()=>{
 const h=harness();await h.api.refresh();h.api.begin('riley','Preparing a response',{ownerId:'owner'});h.signOut();assert(h.root.hidden);assert(!h.root.innerHTML.includes('ios-typing'));
});
