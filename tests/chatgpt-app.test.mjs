import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_WORKERS,CHATGPT_STATUS,chatGPTRequested,chatGPTPrompt,chatGPTNotice} from '../agent-chatgpt-app-core.js';
import {requestChatGPT,chatGPTRequestReply} from '../supabase/functions/_shared/chatgpt-requests.ts';
import {chatGPTDeskAction} from '../supabase/functions/agent-chatgpt-bridge/desk.ts';
import {ownedHandoff,callProjectTool} from '../supabase/functions/agent-chatgpt-bridge/projects.ts';
import {normalizeProjectTurn,runProjectTurn} from '../supabase/functions/_shared/project-engine.ts';
import {secretaryPendingNotices,saveSecretarySnapshot,readSecretarySnapshot} from '../agent-secretary-snapshot.js';
import {fixture} from './fixtures/chatgpt-handoff-db.mjs';
const own='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',hid='33333333-3333-4333-8333-333333333333',request='77777777-7777-4777-8777-777777777777';
test('all ten staff and Eleanor share the ChatGPT request desk with truthful session status',()=>{
 assert.equal(Object.keys(CHATGPT_WORKERS).length,11);
 for(const phrase of ['Ask ChatGPT to create a media kit.','Use OpenAI to review this script.','ChatGPT should help answer this question.'])assert.equal(chatGPTRequested(phrase),true);
 assert.equal(chatGPTRequested('Do not use ChatGPT for this project.'),false);
 assert.match(CHATGPT_STATUS.ready,/Open ChatGPT/);assert.doesNotMatch(CHATGPT_STATUS.ready,/working|running/i);
 assert.match(chatGPTPrompt(hid),/real Markdown answer file/);assert.match(chatGPTPrompt(hid),/Final approval belongs to the owner/);
});
test('the real request helper binds actor, project revision and active run to the authenticated owner',async()=>{
 const calls=[],db={rpc:async(name,args)=>{calls.push({name,args});return {data:{id:request,status:'ready'}}}};
 await requestChatGPT(db,own,'casey','Create an actual media kit.','Image creation tools are needed.','message:fixture',project,4,hid);
 assert.deepEqual(calls[0],{name:'request_agent_chatgpt_help',args:{p_owner:own,p_worker:'casey',p_question:'Create an actual media kit.',p_reason:'Image creation tools are needed.',p_key:'message:fixture',p_project:project,p_revision:4,p_run:hid}});
 await assert.rejects(()=>requestChatGPT({rpc:async()=>({error:{message:'Project changed'}})},own,'casey','Question','Reason','fixture'),/Project changed/);
 assert.match(chatGPTRequestReply({status:'owner_required'}),/Nothing was sent/);
 assert.match(chatGPTRequestReply({status:'ready'}),/Open ChatGPT/);
});
test('project workers can ask Eleanor for specific ChatGPT help without committing a fake work product',()=>{
 const state={phase:'discussion',active_worker:'casey',next_worker:'casey',team_order:['casey','jordan'],lead_worker:'casey'};
 const result=normalizeProjectTurn({kind:'chatgpt',text:'Image tools are needed.',question:'Create a visual media kit from the supplied references.',reason:'The available internal tools cannot render the requested artwork.'},state);
 assert.equal(result.kind,'chatgpt');assert.match(result.reason,/cannot render/);
 assert.throws(()=>normalizeProjectTurn({kind:'chatgpt',text:'Help',question:'do it',reason:'why'},state),/exact ChatGPT task/);
});
test('the ChatGPT connector cannot open or list a request that is held for owner approval',async()=>{
 const db=await fixture();db.tables.agent_chatgpt_requests=[{id:request,owner_id:own,handoff_id:hid,status:'owner_required'}];
 await assert.rejects(()=>ownedHandoff(db,own,hid),/owner approval/);
 const list=await callProjectTool(db,{owner_id:own},'list_project_handoffs',{});assert.equal(list.handoffs.length,0);
 db.tables.agent_chatgpt_requests[0].status='ready';assert.equal((await ownedHandoff(db,own,hid)).id,hid);
});
test('a real project turn queues scoped ChatGPT help instead of committing a fake completed step',async()=>{
 const calls=[],session={phase:'discussion',revision:4,active_worker:'casey',next_worker:'casey',team_order:['casey','jordan'],lead_worker:'casey'};
 const db={from(){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},then(fn){return Promise.resolve({data:[]}).then(fn)}};return q;},async rpc(name,args){calls.push({name,args});if(name==='claim_agent_project_turn')return {data:{state:'claimed',run_id:hid,session}};if(name==='request_agent_chatgpt_help')return {data:{id:request,status:'ready'}};throw Error('Unexpected project mutation: '+name);}};
 const result=await runProjectTurn({db,owner:own,ai:{name:'groq',model:'fixture'},jobs:{casey:'Social Media Director'},policyFor:()=>'',call:async()=>({kind:'chatgpt',text:'The requested artwork needs creation tools.',question:'Create the visual media kit using the saved project references.',reason:'The internal text tools cannot produce this artwork.'})},{id:project,title:'Media kit',instructions:'Create the owner requested media kit.'},{action:'next'});
 assert.equal(result.state,'waiting_chatgpt');assert.equal(result.request_id,request);
 const scoped=calls.find(c=>c.name==='request_agent_chatgpt_help').args;assert.equal(scoped.p_owner,own);assert.equal(scoped.p_worker,'casey');assert.equal(scoped.p_project,project);assert.equal(scoped.p_revision,4);assert.equal(scoped.p_run,hid);
 assert.equal(calls.some(c=>c.name==='commit_agent_project_turn'),false);
});
test('result review requires the exact saved returned version and never approves a request by itself',async()=>{
 const db=await fixture();db.tables.agent_chatgpt_requests=[{id:request,owner_id:own,project_id:project,status:'review',output_version:hid}];
 await assert.rejects(()=>chatGPTDeskAction(db,own,{action:'review_chatgpt_result',request_id:request,output_version:project,decision:'approve'}),/changed or was already reviewed/);
 await chatGPTDeskAction(db,own,{action:'review_chatgpt_result',request_id:request,output_version:hid,decision:'approve',owner_id:'other'});
 const review=db.calls.find(c=>c[0]==='review_agent_project');assert.equal(review[1].p_owner,own);assert.equal(review[1].p_version,hid);assert.equal(review[1].p_assignment,project);
});
test('Eleanor pop-ups retain requester, reason and actual status in the owner-bound startup copy',()=>{
 const r={id:request,worker_key:'casey',requester_label:'Casey',question:'Create the requested media kit.',reason:'The image creation tools are needed.',status:'ready'};
 const state={settings:{owner_id:own,bot_id:hid,version:1,chatgpt_notifications_enabled:true},chatgpt_requests:[r]};
 const notices=secretaryPendingNotices(state);assert.equal(notices.length,1);assert.match(notices[0].body,/Casey/);assert.match(notices[0].body,/image creation tools/);assert.match(notices[0].body,/Open ChatGPT/);
 const memory=new Map(),storage={setItem:(k,v)=>memory.set(k,v),getItem:k=>memory.get(k)};saveSecretarySnapshot(storage,own,state);
 assert.equal(readSecretarySnapshot(storage,own).notices[0].chatgpt,true);
 assert.equal(secretaryPendingNotices({...state,settings:{...state.settings,chatgpt_notifications_enabled:false}}).length,0);
 assert.equal(secretaryPendingNotices({...state,chatgpt_requests:[{...r,status:'approved'}]}).length,0);
});
