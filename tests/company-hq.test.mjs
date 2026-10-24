import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeProjectTurn,projectTurnPrompt,runProjectTurn,safeProjectURL,relevantProjectReports} from '../supabase/functions/_shared/project-engine.ts';
import {routeProjectChat,projectSignal} from '../supabase/functions/_shared/project-chat.ts';
import {projectRoomHTML,projectPrivateHTML,projectIsTyping} from '../agent-project-view.js';
import {draftIssues} from '../supabase/functions/_shared/agent-intelligence.js';
const id='11111111-1111-4111-8111-111111111111',version='22222222-2222-4222-8222-222222222222';
const base={assignment_id:id,revision:1,phase:'discussion',team_order:['jordan','casey'],active_worker:'jordan',peer_exchanges:0,assignment:{title:'Video script',owner_paused:false},next_run_at:new Date().toISOString()};
const safe=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const options={escape:safe,format:safe,remove:(kind,id)=>'<button data-x="'+kind+':'+id+'">×</button>',label:id=>id,deleted:()=>false};
function dbMock(sessions=[base]){
 const calls=[];return {calls,from(table){let data=table==='agent_project_sessions'?sessions:[];const q={select(){return q},eq(k,v){data=data.filter(r=>r[k]===undefined||r[k]===v);return q},in(k,v){data=data.filter(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},maybeSingle:async()=>({data:data[0]||null}),then(resolve){return Promise.resolve({data}).then(resolve)}};return q;},async rpc(name,args){calls.push({name,args});return {data:{state:'ready'}};}};
}
test('one model response represents one assigned speaker, never a fabricated transcript',()=>{
 assert.throws(()=>normalizeProjectTurn({kind:'transcript',text:'Jordan: hello. Casey: yes.'},base),/wrong project stage/);
 assert.throws(()=>normalizeProjectTurn({kind:'ask_team',recipient:'riley',text:'Question'},base),/assigned teammate/);
 assert.throws(()=>normalizeProjectTurn({kind:'ask_team',recipient:'jordan',text:'Question'},base),/assigned teammate/);
 assert.equal(normalizeProjectTurn({kind:'ask_team',recipient:'casey',text:'Casey, which hook fits the supplied audience?'},base).recipient,'casey');
 const prompt=projectTurnPrompt(base,{jordan:'Writing',casey:'Social'},'Permanent role boundary');
 assert.match(prompt,/Never invent a transcript/);assert.match(prompt,/not hidden reasoning/);assert.match(prompt,/Permanent role boundary/);
});
test('only the requested teammate can answer and intermediate stages cannot publish a final',()=>{
 assert.equal(normalizeProjectTurn({kind:'answer',text:'Use the mistake-first hook.'},{...base,peer_target:'casey',active_worker:'casey'}).kind,'answer');
 assert.throws(()=>normalizeProjectTurn({kind:'final',text:'The finished script is here.'},base),/wrong project stage/);
 assert.throws(()=>normalizeProjectTurn({kind:'contribute',text:'Different subject'},{...base,peer_target:'casey'}),/wrong project stage/);
});
test('Alex routes real specialists and cannot assign himself execution',()=>{
 const s={...base,phase:'planning',active_worker:'alex'};
 assert.throws(()=>normalizeProjectTurn({kind:'plan',text:'Start',routes:[{worker:'alex'}]},s),/lead and/);
 assert.throws(()=>normalizeProjectTurn({kind:'plan',text:'Start',routes:[{worker:'alex',title:'Write',instructions:'Write'},{worker:'casey',title:'Review',instructions:'Review'}]},s),/invalid specialist/);
 assert.throws(()=>normalizeProjectTurn({kind:'plan',text:'Start',routes:[{worker:'jordan',title:'Write',instructions:'Write'},{worker:'jordan',title:'Review',instructions:'Review'}]},s),/invalid specialist/);
});
test('private blockers require a question and site requests reject unsafe targets',()=>{
 assert.throws(()=>normalizeProjectTurn({kind:'ask_owner',text:'Blocked'},base),/blocking question/);
 for(const u of ['http://example.com','https://localhost','https://127.0.0.1','https://0x7f000001','https://user:pass@example.com','https://[::1]','https://service.internal','javascript:alert(1)'])assert.equal(safeProjectURL(u),null,u);
 assert.equal(safeProjectURL('https://example.com/research'),'https://example.com/research');
});
test('a promise or unverified external-action claim cannot become finished work',()=>{
 const s={...base,phase:'polishing'};
 assert.throws(()=>normalizeProjectTurn({kind:'final',text:'I will get started on the requested video script and bring something back to you as soon as I have written it.'},s,draftIssues),/completion/);
 assert.throws(()=>normalizeProjectTurn({kind:'final',text:'I published the complete campaign to Facebook and sent all of the responses. The content has now reached your audience successfully.'},s,draftIssues),/completion/);
});
test('saved research is scoped, relevant and labelled by retrieval date',()=>{
 const reports=[{query:'Blue Ridge photography',report:'saved evidence',created_at:'2026-10-23'},{query:'Coffee roasting',report:'unrelated'}];
 assert.deepEqual(relevantProjectReports(reports,'Make a Blue Ridge photography script'),[{query:reports[0].query,saved_at:'2026-10-23',report:'saved evidence'}]);
});
test('one claimed turn makes exactly one model call with shared context and commits its lease',async()=>{
 const db=dbMock();db.rpc=async(name,args)=>{db.calls.push({name,args});return {data:name==='claim_agent_project_turn'?{state:'claimed',run_id:version,session:{...base,peer_exchanges:1}}:{state:'ready'}};};
 let model=0,input;
 const result=await runProjectTurn({db,owner:'owner',ai:{name:'groq',model:'existing'},jobs:{},policyFor:()=>'',issues:draftIssues,call:async(system,context)=>{model++;input=context;return {kind:'contribute',text:'I will use the supplied audience and the agreed visual hook.'};}},{id,title:'Script',instructions:'Specific owner constraints'}, {action:'next'});
 assert.equal(model,1);assert.equal(result.state,'ready');assert.equal(input.owner_brief,'Specific owner constraints');
 const write=db.calls.find(c=>c.name==='commit_agent_project_turn');assert.equal(write.args.p_run,version);assert.equal(write.args.p_owner,'owner');assert.equal(write.args.p_revision,1);
});
test('paused, busy, waiting and exhausted projects never call a model',async()=>{
 for(const state of ['paused','busy','working','budget','waiting_owner','waiting_permission','review','approved']){
  const db=dbMock();db.rpc=async()=>({data:{state}});let model=0;
  assert.equal((await runProjectTurn({db,owner:'owner',ai:{},call:async()=>{model++;}},{id},{action:'next'})).state,state);
  assert.equal(model,0,state);
 }
});
test('model or commit failure leaves a visible saved failure, never a fake completion',async()=>{
 for(const failure of ['provider','commit']){
  const db=dbMock();db.rpc=async(name,args)=>{db.calls.push({name,args});if(name==='claim_agent_project_turn')return {data:{state:'claimed',run_id:version,session:{...base,peer_exchanges:1}}};if(name==='commit_agent_project_turn')return {error:{message:'stopped'}};return {data:true};};
  const result=await runProjectTurn({db,owner:'owner',ai:{},jobs:{},policyFor:()=>'',issues:draftIssues,call:async()=>{if(failure==='provider')throw Error('Provider unavailable');return {kind:'contribute',text:'Concrete contribution'};}},{id},{action:'next'});
  assert.equal(result.state,'failed');assert(db.calls.some(c=>c.name==='fail_agent_project_turn'));
 }
});
test('owner replies go only to the private worker who asked, and ambiguity changes nothing',async()=>{
 const pending={...base,owner_id:'owner',phase:'waiting_owner',waiting_worker:'jordan'};
 let db=dbMock([pending]);assert.equal(await routeProjectChat(db,'owner','casey','Blue Ridge Mountains'),null);assert.equal(db.calls.length,0);
 const result=await routeProjectChat(db,'owner','jordan','Blue Ridge Mountains');assert.equal(result.resume_assignment_id,id);assert.equal(db.calls[0].args.p_worker,'jordan');
 db=dbMock([pending,{...pending,assignment_id:version}]);assert.match((await routeProjectChat(db,'owner','jordan','Blue Ridge Mountains')).reply,/More than one/);assert.equal(db.calls.length,0);
});
test('a Yes in another pending service confirmation cannot approve a project request',async()=>{
 const db=dbMock([{...base,owner_id:'owner',phase:'waiting_permission',waiting_worker:'jordan'}]);
 assert.equal(await routeProjectChat(db,'owner','jordan','yes',{stage:'confirm_research'}),null);assert.equal(db.calls.length,0);
 await routeProjectChat(db,'owner','jordan','yes',{stage:'confirm_research',project_id:id});
 assert.equal(db.calls[0].args.p_decision,'approved');
});
test('HQ approval passes the exact output version; feedback reopens the same project',async()=>{
 let db=dbMock([{...base,owner_id:'owner',phase:'review',output_version:version}]);
 await routeProjectChat(db,'owner','hq','approved',{project_id:id,output_version:version});
 assert.equal(db.calls[0].name,'review_agent_project');assert.equal(db.calls[0].args.p_version,version);assert.equal(db.calls[0].args.p_decision,'approve');
 db=dbMock([{...base,owner_id:'owner',phase:'review',output_version:version}]);
 await routeProjectChat(db,'owner','hq','Make the opening shorter.',{project_id:id,output_version:version});
 assert.equal(db.calls[0].args.p_feedback,'Make the opening shorter.');assert.equal(db.calls[0].args.p_assignment,id);assert.equal(db.calls[0].args.p_decision,'changes');
});
test('final approval in Alex directs the owner to Company HQ rather than publishing',async()=>{
 const db=dbMock([{...base,owner_id:'owner',phase:'review',output_version:version}]);
 assert.match((await routeProjectChat(db,'owner','alex','approved')).reply,/Company HQ/);assert.equal(db.calls.length,0);
 assert.equal(projectSignal('👍'),'approve');assert.equal(projectSignal('stop'),'pause');
});
test('HQ renders named actual turns and hides private source answers and partial drafts',()=>{
 const notes=[{id:'q',assignment_id:id,sender_kind:'agent',sender_id:'jordan',recipient_id:'casey',project_kind:'team_question',project_revision:1,body:'Which hook fits?',created_at:'2026-10-24T10:00:00Z'},
  {id:'owner',assignment_id:id,sender_kind:'owner',project_kind:'owner_context',body:'PRIVATE SOURCE ANSWER'},
  {id:'old',assignment_id:id,sender_kind:'system',body:'Old handoff dashboard'}];
 const html=projectRoomHTML({...options,projects:[{...base,shared_draft:'UNFINISHED DRAFT'}],selected:id,notes});
 assert.match(html,/Which hook fits/);assert.match(html,/to casey/);assert.match(html,/data-x="team:q"/);
 for(const text of ['PRIVATE SOURCE ANSWER','UNFINISHED DRAFT','Old handoff dashboard','data-project-final='])assert(!html.includes(text));
});
test('typing dots reflect only a current, unpaused model lease and respect completion',()=>{
 const s={...base,active_run:version,active_worker:'casey',lease_until:new Date(Date.now()+50000).toISOString()};
 assert(projectIsTyping(s));assert(!projectIsTyping({...s,lease_until:'2000-01-01'}));assert(!projectIsTyping({...s,phase:'review'}));assert(!projectIsTyping({...s,assignment:{owner_paused:true}}));
 const html=projectRoomHTML({...options,projects:[s],notes:[]});assert.match(html,/casey is preparing a response/);assert.equal((html.match(/<span><\/span>/g)||[]).length,3);
});
test('only finished versions have review buttons; content and IDs are escaped',()=>{
 const s={...base,phase:'review',output_version:version,final_output:'Finished script <script>unsafe</script>',assignment:{title:'Title <img src=x>'}};
 const html=projectRoomHTML({...options,projects:[s],notes:[]});assert.match(html,/data-project-version="222/);assert.match(html,/Request changes/);assert(!html.includes('<script>unsafe'));assert(!html.includes('<img src=x>'));
 const approved=projectRoomHTML({...options,projects:[{...s,phase:'approved'}],notes:[]});assert(!approved.includes('data-project-review='));
});
test('private question and Alex ready shortcut are visible only to their intended worker',()=>{
 const s={...base,phase:'waiting_owner',waiting_worker:'jordan',pending_question:'Which destination?',question_message_id:'private-q'};
 assert.match(projectPrivateHTML({...options,projects:[s],worker:'jordan'}),/data-project-answer-select/);
 assert.equal(projectPrivateHTML({...options,projects:[s],worker:'casey'}),'');
 assert.equal(projectPrivateHTML({...options,deleted:()=>true,projects:[s],worker:'jordan'}),'');
 assert.match(projectPrivateHTML({...options,projects:[{...base,phase:'review'}],worker:'alex'}),/Review in Company HQ/);
});
test('shared room uses existing free tools and prevents browser-forged progress',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261024051753_collaborative_company_hq.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/);assert.match(sql,/security invoker/g);assert(!sql.includes('security definer'));
 assert.match(sql,/used>=10/);assert.match(sql,/s\.active_run is distinct from p_run/);assert.match(sql,/s\.output_version is distinct from p_version/);
 assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/grant execute[\s\S]*to service_role/);
});
