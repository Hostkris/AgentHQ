import test from 'node:test';
import assert from 'node:assert/strict';
import {CONSULTING_POLICY,consultingRequested,validateConsultingGuide} from '../agent-consulting-policy.js';
import {consultingMessageHTML} from '../agent-consulting-view.js';
import {projectTurnPrompt,normalizeProjectTurn} from '../supabase/functions/_shared/project-engine.ts';
import {secretaryChat} from '../supabase/functions/agent-secretary/chat.ts';
import {secretaryFixture,owner,bot} from './fixtures/secretary-db.mjs';
const project='55555555-5555-4555-8555-555555555555';
const guide='Goal: Prepare a business pitch. Materials: a one-page service sheet and two examples. Steps: 1. Choose a business. 2. Check its public needs. 3. Adapt the sample pitch. Example: We can help with your next launch. Checks: verify names and claims. Next: prepare your first draft.';

test('practical consulting intake covers business and personal projects without capturing reminders or stop commands',()=>{
 for(const text of ['How do I approach businesses about a partnership?','Walk me through creating a media kit.','Create a marketing campaign for my store.','Teach me how to build a study plan.','What should I create to pitch my services?'])assert.equal(consultingRequested(text),true,text);
 for(const text of ['Hello Eleanor','What are my reminders?','Stop creating this campaign.','Remind me to take Example intake daily at 8 AM.','I took my medicine.'])assert.equal(consultingRequested(text),false,text);
});
test('each team role receives teaching, research and Eleanor delivery instructions without changing its specialty',()=>{
 const roles={alex:'General Manager',maya:'Marketing',jordan:'Creative',riley:'Research',taylor:'Communications',casey:'Social media',morgan:'E-commerce',avery:'Financial analysis',jamie:'Scheduling',quinn:'Growth and partnerships'};
 for(const [worker,title] of Object.entries(roles)){
  const prompt=projectTurnPrompt({phase:worker==='alex'?'planning':'discussion',active_worker:worker,next_worker:worker,team_order:['casey','jordan'],lead_worker:'casey'},roles);
  assert.ok(prompt.includes(CONSULTING_POLICY),worker);assert.match(prompt,/read-only public research/);assert.match(prompt,/Eleanor/);
  if(worker!=='alex')assert.ok(prompt.includes(title),worker);
 }
});
test('new projects cannot finalize without a usable guide and structured deliverable bytes stay separate',()=>{
 const state={phase:'polishing',active_worker:'casey',next_worker:'casey',lead_worker:'casey',team_order:['casey','jordan'],check_done:['jordan'],consulting_guide_required:true};
 const content='name,deliverable,status\nCasey,Approved owner-supplied social draft,ready for review\nJordan,Owner-supplied media draft,ready for review';
 assert.throws(()=>normalizeProjectTurn({kind:'final',text:content},state),/complete consulting guide/);
 const result=normalizeProjectTurn({kind:'final',text:content,guide},state);
 assert.equal(result.text,content);assert.equal(result.guide,guide);
 assert.throws(()=>validateConsultingGuide('x'.repeat(16001),true),/16,000/);
 assert.equal(validateConsultingGuide(undefined,false),'');
});
test('Eleanor saves a concrete consulting project without an extra AI approval or invented specialist answer',async()=>{
 const db=secretaryFixture(),rpc=db.rpc;
 db.rpc=async(name,args)=>{
  if(name==='apply_agent_secretary_ops'){db.calls.push([name,args]);return {data:{saved:true,version:2,changes:[{action:'project_created',project_id:project,title:'Business pitch'}]}};}
  return rpc(name,args);
 };
 const task='Walk me through creating a business pitch and media kit.';
 const response=await secretaryChat(db,owner,{id:bot},task,async()=>{throw Error('No model or extra approval is needed to save the authorized intake')});
 assert.match(response.reply,/saved your consulting project/);assert.match(response.reply,/bring the finished guide/);
 const saved=db.calls.find(c=>c[0]==='apply_agent_secretary_ops')[1];assert.equal(saved.p_ops[0].op,'create_project');assert.equal(saved.p_ops[0].brief,task);
 assert.equal(db.tables.agent_custom_bot_messages.at(-1).body,response.reply);
 assert.equal(db.calls.some(c=>c[0]==='reserve_agent_secretary_ai'),false);
});
test('Eleanor never claims that a consulting project saved when its database write fails',async()=>{
 const db=secretaryFixture(),rpc=db.rpc;
 db.rpc=async(name,args)=>name==='apply_agent_secretary_ops'?{error:{message:'Fixture project write failed'}}:rpc(name,args);
 await assert.rejects(()=>secretaryChat(db,owner,{id:bot},'Teach me how to create a marketing campaign.',()=>{}),/Fixture project write failed/);
 assert.equal(db.tables.agent_custom_bot_messages.length,0);
});
test('guides render as safe text with clickable public sources and a valid project link',()=>{
 const html=consultingMessageHTML({body:'Steps: <img src=x onerror=alert(1)>\nSource: https://example.com/official.\nBad: javascript:alert(1) https://127.0.0.1/private https://user:secret@example.com/private',consultation_project_id:project});
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|href="javascript:|href="https:\/\/127|href="https:\/\/user:/);
 assert.match(html,/href="https:\/\/example.com\/official"/);assert.match(html,/rel="noopener noreferrer"/);
 assert.match(html,new RegExp('data-consultation-project="'+project+'"'));
 assert.doesNotMatch(consultingMessageHTML({body:guide,consultation_project_id:'bad" onclick="alert(1)'}),/data-consultation-project/);
});
