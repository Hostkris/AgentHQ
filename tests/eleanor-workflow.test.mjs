import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync(resolve(here,'../agent-eleanor-workflow.js'),'utf8');
const workflow=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const store=new Map();
globalThis.window={};
globalThis.localStorage={
 getItem:key=>store.get(key)||null,
 setItem:(key,value)=>store.set(key,String(value)),
 removeItem:key=>store.delete(key)
};
const escape=value=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state=owner=>({settings:{owner_id:owner,timezone:'America/New_York',brief_time:'07:00:00'},items:[]});
const today='2026-11-07';

test('Notes review never reads another owner or legacy unscoped Notes',()=>{
 store.set('agenthq-home-personal-widgets-v1',JSON.stringify({notes:[{text:'Unscoped private note'}]}));
 store.set('agenthq-home-notes-v1:owner-one',JSON.stringify([{text:'Create a TikTok skincare content plan',date:'Nov 7'}]));
 store.set('agenthq-home-notes-v1:owner-two',JSON.stringify([{text:'OTHER OWNER PRIVATE'}]));
 const one=workflow.renderEleanorCoordination('notes',state('owner-one'),today,escape);
 assert.match(one,/Create a TikTok skincare content plan/);
 assert.doesNotMatch(one,/OTHER OWNER PRIVATE|Unscoped private note/);
 const two=workflow.renderEleanorCoordination('notes',state('owner-two'),today,escape);
 assert.doesNotMatch(two,/Create a TikTok skincare content plan/);
 assert.match(two,/OTHER OWNER PRIVATE/);
});
test('Notes must be explicitly reviewed, scheduled, tasked or delegated',()=>{
 const text=workflow.renderEleanorCoordination('notes',state('owner-one'),today,escape);
 for(const label of ['Ask Eleanor for ideas','Make task','Add to Calendar','Start project'])
  assert.ok(text.includes(label),label);
 assert.match(text,/not Apple or iCloud Calendar/);
});
test('Note worker suggestions preserve Alex and domain specialists',()=>{
 const text=workflow.renderEleanorCoordination('notes',state('owner-one'),today,escape);
 assert.match(text,/Alex/);
 assert.match(text,/Casey/);
 assert.match(text,/Jordan/);
 assert.match(text,/Morgan/);
});
test('Daily check-in asks for manually reported data, including reply drafting',()=>{
 const text=workflow.renderEleanorCoordination('checkin',state('owner-one'),today,escape);
 for(const label of ['Heart rate','Water consumed','Multivitamin drink','Apple cider vinegar','TikTok Live','Checked TikTok posts','Checked TikTok messages','need a reply'])
  assert.ok(text.includes(label),label);
 assert.match(text,/no outside health connection/i);
 assert.match(text,/Save in Agent HQ and report to Eleanor/);
 assert.match(text,/Ask Eleanor to review authorized social activity/);
 assert.match(text,/will not post it/i);
});
test('Morning screen has useful entry points but does not claim auto-reading',()=>{
 const text=workflow.renderEleanorTodaySummary(state('owner-one'),today,escape);
 assert.match(text,/Answer today’s check-in/);
 assert.match(text,/Review Notes/);
 assert.match(text,/The Calendar and Notes are inside Agent HQ/);
});
test('Eleanor proposes internal actions and keeps owner yes/no approval explicit',()=>{
 const current=globalThis.window.agentHQNotesCloud;
 globalThis.window.agentHQNotesCloud={owner:()=> 'owner-one',loaded:()=>true,list:()=>[
  {id:'33333333-3333-4333-8333-333333333333',text:'Schedule a planning meeting',date:'Nov 7',review_status:'pending',review_kind:'calendar',review_summary:'Would you like me to add this inside Agent HQ?'}
 ]};
 try{
  const text=workflow.renderEleanorCoordination('notes',state('owner-one'),today,escape);
  assert.match(text,/Eleanor suggests/);
  assert.match(text,/Approve calendar entry/);
  assert.match(text,/No, leave it as a note/);
  assert.match(text,/data-note-id="33333333-3333-4333-8333-333333333333"/);
 }finally{globalThis.window.agentHQNotesCloud=current;}
});
test('Cloud-confirmed reports and internal calendar agenda are reflected in today’s screen',()=>{
 const existing=globalThis.window.agentHQCheckins;
 globalThis.window.agentHQCheckins={owner:()=> 'owner-one',loaded:()=>true,record:()=>({fields:{water_oz:32,multivitamin:'yes'},submitted_at:'2026-11-07T12:30:00Z',sent_signature:'saved'})};
 try{
  const stateWithAgenda=state('owner-one');
  stateWithAgenda.items=[{id:'a',title:'Review video draft',kind:'task',status:'active'},{id:'b',title:'Team meeting',kind:'meeting',scheduled_at:'2030-12-01T12:00:00Z',status:'active'}];
  const text=workflow.renderEleanorTodaySummary(stateWithAgenda,today,escape);
  assert.match(text,/check-in is saved in Agent HQ and sent/);
  assert.match(text,/1 active task/);
  assert.match(text,/Team meeting/);
  assert.match(text,/Open Calendar/);
 }finally{globalThis.window.agentHQCheckins=existing;}
});
test('Authenticated load provisions one repeating reminder, respecting stopped records',()=>{
 const source=readFileSync(resolve(here,'../agent-secretary.js'),'utf8');
 assert.match(source,/title:'Eleanor daily check-in'/);
 assert.match(source,/weekdays:\[0,1,2,3,4,5\]/);
 assert.match(source,/i\.kind==='reminder'&&i\.title\.toLowerCase\(\)==='eleanor daily check-in'/);
 assert.match(source,/if\(next\)void load\(\)/);
});
