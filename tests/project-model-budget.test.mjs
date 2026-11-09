import test from 'node:test';
import assert from 'node:assert/strict';
import {estimatedTokens,projectModelInput,terminalModelFailure,PROJECT_TOKEN_ALLOWANCE} from '../supabase/functions/_shared/project-model-input.ts';
import {projectCompletion} from '../supabase/functions/_shared/project-runtime.ts';
import {projectTurnPrompt} from '../supabase/functions/_shared/project-engine.ts';
import {SPECIALIST_JOBS} from '../supabase/functions/_shared/alex-dna.ts';
import {autonomousRecoveryStatus,routineOwnerQuestion} from '../agent-project-autonomy.js';
import {normalizeProjectTurn} from '../supabase/functions/_shared/project-engine.ts';

const ai={name:'groq',key:'fixture-secret',url:'https://model.invalid',model:'openai/gpt-oss-120b'};
const session={phase:'discussion',active_worker:'riley',next_worker:'riley',team_order:['riley','jordan'],peer_exchanges:0};
const brief='Create an evidence-based plan for the supplied business. No purchases or account changes. Keep Saturday free.';
function context(){return {title:'Business research',owner_brief:brief,info_needed:'',revision:2,feedback:'Keep the required audience.',current_worker:'riley',phase:'discussion',team:session.team_order,lead:'jordan',shared_draft:'',previous_final:'',
 responsibilities:[{employee_id:'riley',instructions:'Find and compare verified public evidence.'}],
 messages:[{id:'owner-note',from:'Owner',text:'Use the exact approved product description.'},{id:'team-note',from:'jordan',text:'Prior discussion '.repeat(900)}],
 project_workspace:{metadata:{goal:brief,requirements:[brief],output_format:'markdown',completion_criteria:'Sources, limitations and actual usable work.'},
  handbooks:Array.from({length:6},(_,i)=>({handbook_key:'book-'+i,title:'Approved source '+i,content:'Business research evidence and owner preferences. '.repeat(500)})),
  handoffs:Array.from({length:9},(_,i)=>({employee_id:'worker-'+i,status:'completed',output_revision:2,work_product:'Verified upstream evidence. '.repeat(400)})),references:[],reference_photos:[]},
 current_project_research:[{worker:'riley',query:'Official platform documentation',saved_at:'2026-11-09T12:00:00Z',report:'Verified platform guidance and public business evidence. '.repeat(200),sources:[{url:'https://example.com/evidence',title:'Actual saved source'}]}]};}
const success=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({kind:'contribute',text:'Actual complete synthetic contribution.'})}}]}));

test('large saved context fits one free request without changing exact owner requirements or durable sources',()=>{
 const source=context(),before=structuredClone(source),prompt=projectTurnPrompt(session,SPECIALIST_JOBS);
 const input=projectModelInput(prompt,source,2000),selected=input.context;
 assert.ok(estimatedTokens(prompt)+estimatedTokens(JSON.stringify(selected))+input.maxTokens+160<=PROJECT_TOKEN_ALLOWANCE);
 assert.equal(selected.owner_brief,brief);assert.equal(selected.feedback,source.feedback);
 assert.deepEqual(selected.owner_messages,[source.messages[0]]);
 assert.equal(selected.project_workspace.metadata.requirements_ref,'owner_brief');
 assert.equal(selected.project_workspace.handoffs.length,9);
 assert.equal(selected.current_project_research[0].sources[0].url,'https://example.com/evidence');
 assert.match(selected.context_selection,/Omitted text is not evidence/);assert.deepEqual(source,before);
});
test('every specialist uses a bounded project prompt while retaining role, consulting and authorization rules',()=>{
 for(const worker of ['alex',...Object.keys(SPECIALIST_JOBS)]){
  const prompt=projectTurnPrompt({...session,phase:worker==='alex'?'planning':'discussion',active_worker:worker,next_worker:worker},SPECIALIST_JOBS,'Full role background. '.repeat(800));
  assert.ok(prompt.length<11500,worker);assert.match(prompt,/standing authorization/);assert.match(prompt,/final editorial approval/);assert.match(prompt,/CONSULTING AND PRACTICAL TEACHING/);
  assert.match(prompt,/money\/billing\/pricing\/budget\/financial-advice request needs owner approval/);
 }
});
test('oversized exact requirements fail before a provider call instead of silently truncating the brief',async()=>{
 const source=context();source.owner_brief='Exact owner requirement '.repeat(20000);let calls=0;
 await assert.rejects(()=>projectCompletion(ai,'System',source,2000,async()=>{calls++;return success();}),/\[ai:request_too_large\]/);
 assert.equal(calls,0);assert.equal(source.owner_brief.length,'Exact owner requirement '.length*20000);
});
test('413 recovery makes at most one smaller request and never repeats the identical body',async()=>{
 const bodies=[];
 await projectCompletion(ai,'Preserve exact requirements.',context(),1300,async(_url,options)=>{bodies.push(options.body);return bodies.length===1?new Response('{}',{status:413}):success();});
 assert.equal(bodies.length,2);assert.ok(bodies[1].length<bodies[0].length);
 let calls=0;
 await assert.rejects(()=>projectCompletion(ai,'Short prompt',{small:'Exact small context'},1000,async()=>{calls++;return new Response('{}',{status:413});}),/\[ai:request_too_large\]/);
 assert.equal(calls,1);
});
test('rate limits preserve Retry-After and never expose a provider error body or immediately retry',async()=>{
 let calls=0;const before=Date.now();
 await assert.rejects(()=>projectCompletion(ai,'Short prompt',{small:'context'},1000,async()=>{calls++;return new Response('private account identifiers and fixture-secret',{status:429,headers:{'retry-after':'3600'}});}),error=>{
  assert.match(error.message,/\[ai:rate_limited\]/);assert.doesNotMatch(error.message,/fixture-secret|private account/);
  const at=error.message.match(/Retry after (\S+)\./)[1];assert.ok(Date.parse(at)>=before+3599000);return true;
 });assert.equal(calls,1);
});
test('a token-truncated response cannot be committed as complete even when its content parses',async()=>{
 await assert.rejects(()=>projectCompletion(ai,'Short prompt',{},1000,async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"kind":"final","text":"unfinished"}'}}]}))),/\[ai:output_limit\]/);
});
test('permanent defects and repeated failures stop, while genuine rate limits and authorization remain distinct',()=>{
 for(const error of ['AI provider HTTP 413','AI provider HTTP 400','[ai:request_too_large] Too large'])assert.equal(terminalModelFailure(error,1),true);
 assert.equal(terminalModelFailure('Response correction failed',11),false);assert.equal(terminalModelFailure('Response correction failed',12),true);
 assert.equal(terminalModelFailure('[ai:output_limit] incomplete',2),false);assert.equal(terminalModelFailure('[ai:output_limit] incomplete',3),true);
 for(const error of ['[ai:rate_limited] AI provider HTTP 429','AI provider HTTP 401','AI provider HTTP 403'])assert.equal(terminalModelFailure(error,100),false);
});
test('terminal project errors cannot display an automatic-success recovery notice',()=>{
 assert.equal(autonomousRecoveryStatus({...session,last_error:'[ai:request_too_large] Cannot fit',recovery_state:'idle',recovery_error:'Old reconnect notice'}),null);
});
test('public marketplace comparisons proceed before final owner choices while real inventory and budgets stay private',()=>{
 for(const question of ['Which online marketplaces should be considered in the arbitrage model and product-category research?','Which product category or categories should the pilot arbitrage focus on?']){
  const raw={kind:'ask_owner',text:'Choose research scope',question,blocking_reason:'owner_only_fact',why_blocking:'I prefer a marketplace or product category before comparing the available public options.'};
  assert.equal(routineOwnerQuestion(raw),true);assert.throws(()=>normalizeProjectTurn(raw,session),{code:'nonessential_question'});
  const recovered=normalizeProjectTurn(raw,{...session,revision:1,recovery_error:'Response correction [nonessential_question/discussion/riley/1/ask_owner]. Compare supported options first.'});
  assert.equal(recovered.kind,'ask_team');assert.equal(recovered.recipient,'jordan');
 }
 for(const question of ['Which product categories are already in your actual inventory?','Which marketplaces are you currently selling on?','What is the approved purchase budget?'])assert.equal(routineOwnerQuestion({kind:'ask_owner',question}),false);
});
