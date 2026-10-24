import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProjectTurn,projectTurnPrompt,runProjectTurn} from '../supabase/functions/_shared/project-engine.ts';
import {validateOwnerInterruption,autonomousRecoveryStatus,connectionRetryDelay,PROJECT_AUTONOMY_POLICY} from '../agent-project-autonomy.js';
import {handleProjectRunner} from '../supabase/functions/agent-hq-project-runner/handler.ts';
import {projectRoomHTML} from '../agent-project-view.js';

const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const session={revision:1,phase:'discussion',next_worker:'jordan',active_worker:'jordan',lead_worker:'jordan',team_order:['jordan','casey'],peer_exchanges:1};
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

test('routine permission requests and nonessential owner questions are corrected internally',()=>{
 for(const raw of [{kind:'permission',text:'Can I start?',question:'May I draft this?',url:'https://example.com'}, {kind:'permission',text:'Search',question:'May I search normal public sources?',approval_category:'research',why_blocking:'I want permission to use public search.',url:'https://example.com'}])assert.throws(()=>normalizeProjectTurn(raw,session),e=>e.code==='unnecessary_approval');
 assert.throws(()=>normalizeProjectTurn({kind:'ask_owner',text:'Pick a style',question:'Should I use short paragraphs?'},session),e=>e.code==='nonessential_question');
 assert.throws(()=>normalizeProjectTurn({kind:'ask_owner',text:'Clarify',question:'Please specify the project purpose, exact tone, primary content formats and key success metrics.',blocking_reason:'owner_only_fact',why_blocking:'I would prefer all of these choices before writing the requested project.'},session),e=>e.code==='nonessential_question');
 const prompt=projectTurnPrompt(session,{jordan:'Writing',casey:'Review'});assert.match(prompt,/standing authorization/);assert.match(prompt,/Do not ask the owner to click Retry/);assert.match(prompt,/final editorial approval/);
});
test('essential owner facts and specific sensitive authorizations remain private blockers',()=>{
 const fact={kind:'ask_owner',text:'A private number is essential',question:'What is the approved budget ceiling?',blocking_reason:'owner_only_fact',why_blocking:'The actual spending ceiling is private and is not in the saved brief or approved sources.'};
 assert.equal(normalizeProjectTurn(fact,session).kind,'ask_owner');
 assert.equal(normalizeProjectTurn({...fact,question:'What were the actual success metrics recorded last month?'},session).kind,'ask_owner');
 for(const category of ['account_authorization','private_data','spending','budget_change','account_change','public_release','risky_site','irreversible_commitment']){
  const request={kind:'permission',text:'Sensitive action',question:'Authorize only this exact proposed action and scope?',approval_category:category,why_blocking:'This action requires the actual account owner to authorize the specific scope.',url:'https://example.com/account'};
  assert.equal(normalizeProjectTurn(request,session).approval_category,category);
 }
 assert.match(PROJECT_AUTONOMY_POLICY,/unsafe|Unsafe/);assert.match(PROJECT_AUTONOMY_POLICY,/existing usage and spending limits/);
});
test('a repeated routine discussion question is routed to the team without inventing an owner answer or finished work',()=>{
 const raw={kind:'ask_owner',text:'Clarify before continuing',question:'What tone and writing style should we use?',blocking_reason:'owner_only_fact',why_blocking:'I prefer the owner to select the tone before working.'};
 const saved={...session,recovery_error:'Response correction [nonessential_question/discussion/jordan/1/ask_owner]. Resolve the ordinary choice internally.'};
 const routed=normalizeProjectTurn(raw,saved);assert.equal(routed.kind,'ask_team');assert.equal(routed.recipient,'casey');assert.match(routed.text,/clearly labelled reasonable assumption/);assert(!/owner approved|finished/.test(routed.text));
 assert.equal(normalizeProjectTurn(raw,{...saved,peer_exchanges:3}).kind,'contribute');
 const peer={...saved,active_worker:'casey',next_worker:'casey',peer_target:'casey',peer_return_worker:'jordan',recovery_error:'Response correction [nonessential_question/discussion/casey/1/ask_owner]. Resolve this choice internally.'};
 const answered=normalizeProjectTurn(raw,peer);assert.equal(answered.kind,'answer');assert.match(answered.text,/^jordan, this is an internal team decision/);
 assert.throws(()=>normalizeProjectTurn(raw,{...saved,revision:2}),{code:'nonessential_question'});
 const privateFact={...raw,question:'What is the actual private budget ceiling?'};assert.equal(normalizeProjectTurn(privateFact,saved).kind,'ask_owner');
});
test('automatic recovery has no retry button and does not hide real owner or final-review states',()=>{
 const s={...session,assignment_id:id,assignment:{title:'Script'},recovery_state:'diagnosing',recovery_error:'Response failure',next_run_at:new Date(Date.now()+30000).toISOString()};
 assert.equal(autonomousRecoveryStatus(s).state,'diagnosing');
 const html=projectRoomHTML({projects:[s],selected:id,notes:[],escape,format:escape,remove:()=>'',label:x=>x,deleted:()=>false});
 assert.match(html,/Alex is diagnosing/);assert.match(html,/No action needed/);assert(!html.includes('data-project-control="retry"'));
 for(const phase of ['waiting_owner','waiting_permission','review','approved'])assert.equal(autonomousRecoveryStatus({...s,phase}),null);
 assert.equal(autonomousRecoveryStatus({...s,assignment:{owner_paused:true}}),null);
 assert.deepEqual([1,2,3,4,50].map(connectionRetryDelay),[3000,10000,30000,60000,60000]);
});
test('Alex diagnoses a repeated workflow fault without performing or advancing the specialist work',async()=>{
 const s={...session,active_worker:'alex',recovery_state:'diagnosing',recovery_error:'Wrong project stage',recovery_attempts:3},calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_agent_project_turn'?{state:'claimed',run_id:'diagnosis-run',session:s}:{state:'recovering'}};}};
 let model=0;
 const result=await runProjectTurn({db,owner,ai:{},call:async(system,context)=>{model++;assert.match(system,/Diagnose ONLY/);assert.equal(context.contract.worker,'jordan');return {kind:'repair',expected_kind:'contribute',guidance:'Return one discussion contribution as Jordan. Address any question only to Casey.'};}},{id},{action:'next'});
 assert.equal(model,1);assert.equal(result.state,'recovering');assert(calls.some(c=>c.name==='complete_agent_project_diagnosis'));assert(!calls.some(c=>c.name==='commit_agent_project_turn'));
});

function runner({authorized=true,work=[{id,owner_id:owner,workflow_version:2,owner_paused:false}],state='ready'}={}){
 const calls=[],turns=[];const deps={allowedOwners:owner,db:{rpc:async(name,args)=>{calls.push({name,args});return {data:name==='verify_agent_project_runner'?authorized:work};}},makeRuntime:(db,owned)=>({db,owner:owned}),runTurn:async(runtime,assignment,input)=>{turns.push({runtime,assignment,input});return {state};}};
 const request=(token='a'.repeat(64),body={owner_id:'attacker',action:'approve'})=>new Request('https://synthetic/runner',{method:'POST',headers:{'x-agent-hq-runner-token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {calls,turns,deps,request,run:async req=>{const r=await handleProjectRunner(req||request(),deps);return {status:r.status,body:await r.json()};}};
}
test('the background runner requires its private credential and ignores caller-supplied authority',async()=>{
 for(const token of ['', 'short']){const f=runner();assert.equal((await f.run(f.request(token))).status,401);assert.equal(f.calls.length,0);}
 const denied=runner({authorized:false});assert.equal((await denied.run()).status,401);assert.equal(denied.turns.length,0);
 const f=runner();assert.equal((await f.run()).status,200);assert.equal(f.turns.length,1);assert.equal(f.turns[0].runtime.owner,owner);assert.deepEqual(f.turns[0].input,{action:'next'});
 assert.deepEqual(f.calls.find(c=>c.name==='get_agent_project_runner_work').args.p_owners,[owner]);
});
test('background work honors owner scope, pauses, model allowance and idle queues',async()=>{
 for(const work of [[],[{id,owner_id:'another-owner',workflow_version:2}],[{id,owner_id:owner,workflow_version:1}],[{id,owner_id:owner,workflow_version:2,owner_paused:true}]]){
  const f=runner({work});const r=await f.run();assert.equal(r.body.processed,0);assert.equal(f.turns.length,0);
 }
 for(const state of ['budget','paused','working','waiting_owner','waiting_permission','review','approved','recovering']){
  const f=runner({state}),r=await f.run();assert.equal(f.turns.length,1);assert.equal(r.body.results[0].state,state);
 }
 const f=runner();f.deps.allowedOwners='invalid';assert.equal((await f.run()).status,503);assert.equal(f.turns.length,0);
});
