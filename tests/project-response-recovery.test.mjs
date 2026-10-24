import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProjectTurn,projectTurnPrompt,runProjectTurn} from '../supabase/functions/_shared/project-engine.ts';
import {ProjectResponseError,projectResponseContract,projectResponseFailure,projectResponseRecovery} from '../agent-project-recovery.js';
import {projectRoomHTML} from '../agent-project-view.js';
import {projectActivity} from '../agent-activity-view.js';

const id='11111111-1111-4111-8111-111111111111';
const initial={assignment_id:id,revision:2,phase:'discussion',next_worker:'jordan',active_worker:'jordan',peer_exchanges:1,team_order:['jordan','casey'],shared_draft:'Saved editable draft',feedback:'Keep the original audience',final_output:'Earlier finished version',output_version:'earlier-version',turn_count:4};
const assignment={id,title:'Owner project',instructions:'Write a short script for the supplied audience'};
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function fixture(s=initial){
 const session=structuredClone(s),runs=[],calls=[],prompts=[],contexts=[];let responses=[];
 const db={from(table){const data=table==='agent_worker_runs'?runs.slice().reverse().slice(0,2):table==='agent_team_messages'?[{id:'note',sender_kind:'agent',sender_id:'casey',body:'Keep the requested opening',project_revision:2}]:[];
  const q={select(){return q},eq(){return q},order(){return q},limit(){return q},then(resolve){return Promise.resolve({data}).then(resolve);}};return q;},async rpc(name,args){
  calls.push({name,args});
  if(name==='control_agent_project'){session.last_error='';return {data:{state:'ready'}};}
  if(name==='claim_agent_project_turn'){
   if(session.last_error)return {data:{state:'failed',message:session.last_error}};
   if(Date.parse(session.next_run_at)>Date.now())return {data:{state:'ready',retry_at:session.next_run_at}};
   const run={id:'run-'+runs.length,status:'running',error_summary:''};runs.push(run);session.active_worker=session.next_worker;session.active_run=run.id;return {data:{state:'claimed',run_id:run.id,session:structuredClone(session)}};
  }
  if(name==='fail_agent_project_turn'){runs.at(-1).status='failed';runs.at(-1).error_summary=args.p_error.slice(0,300);session.last_error='';session.recovery_error=args.p_error;session.recovery_state='correcting';session.recovery_attempts=(session.recovery_attempts||0)+1;session.next_run_at=new Date(Date.now()+5000).toISOString();session.active_run=null;session.active_worker=null;return {data:true};}
  if(name==='commit_agent_project_turn'){runs.at(-1).status='completed';session.last_error='';session.active_run=null;return {data:{state:'ready'}};}
  throw Error('Unexpected RPC: '+name);
 }};
 const deps={db,owner:'owner-a',ai:{name:'synthetic',model:'no-provider'},jobs:{jordan:'Writing',casey:'Social media'},policyFor:()=>'',call:async(prompt,context)=>{prompts.push(prompt);contexts.push(context);const r=responses.shift();if(r instanceof Error)throw r;return r;}};
 return {session,runs,calls,prompts,contexts,db,deps,respond:(...r)=>responses.push(...r),next:()=>runProjectTurn(deps,assignment,{action:'next'})};
}

test('every stage states its exact response kinds and excludes the sender from recipients',()=>{
 for(const [phase,primary] of Object.entries({planning:'plan',discussion:'contribute',drafting:'draft',checking:'check',polishing:'final'})){
  const s={...initial,phase},c=projectResponseContract(s);assert.equal(c.primary,primary);assert.deepEqual(c.recipients,['casey']);
  const prompt=projectTurnPrompt(s,{jordan:'Writing',casey:'Social'});assert.match(prompt,new RegExp('stage='+phase));assert.match(prompt,/allowed kind values=/);
 }
 const peer={...initial,peer_target:'casey',peer_return_worker:'jordan',active_worker:'casey'};
 assert.deepEqual(projectResponseContract(peer).allowed,['answer','ask_owner','permission','research']);
 assert(!projectResponseContract({...initial,peer_exchanges:3}).allowed.includes('ask_team'));
});
test('wrong-stage finals and self-addressed questions have distinct recoverable codes',()=>{
 assert.throws(()=>normalizeProjectTurn({kind:'final',text:'premature final'},initial),e=>e instanceof ProjectResponseError&&e.code==='wrong_stage');
 for(const raw of [{kind:'ask_team',recipient:'jordan',text:'Which opening?'},{kind:'ask_team',recipient:'casey',text:'Hey Jordan, which opening?'}])
  assert.throws(()=>normalizeProjectTurn(raw,initial),e=>e.code==='self_address');
 assert.throws(()=>normalizeProjectTurn({kind:'ask_team',recipient:'casey',text:'Riley, which source?'},initial),e=>e.code==='recipient_mismatch');
 assert.throws(()=>normalizeProjectTurn({kind:'ask_team',recipient:'riley',text:'Which source?'},initial),e=>e.code==='invalid_recipient');
 assert.equal(normalizeProjectTurn({kind:'ask_team',recipient:'casey',text:'Casey, which opening?'},initial).recipient,'casey');
});
test('pending teammate questions cannot be answered by the wrong specialist',()=>{
 assert.throws(()=>normalizeProjectTurn({kind:'answer',text:'Use the original opening.'},{...initial,peer_target:'casey',peer_return_worker:'jordan'}),e=>e.code==='wrong_worker');
});
test('answers and reviews reject self-addressed text or inconsistent recipients',()=>{
 const peer={...initial,peer_target:'casey',active_worker:'casey',peer_return_worker:'jordan'};
 assert.throws(()=>normalizeProjectTurn({kind:'answer',text:'Casey, use the first opening.'},peer),e=>e.code==='self_address');
 assert.throws(()=>normalizeProjectTurn({kind:'answer',text:'Riley, use the first opening.'},peer),e=>e.code==='recipient_mismatch');
 assert.throws(()=>normalizeProjectTurn({kind:'check',text:'Casey, the opening meets the brief.'},{...initial,phase:'checking',active_worker:'casey',lead_worker:'jordan'}),e=>e.code==='self_address');
 assert.equal(normalizeProjectTurn({kind:'answer',text:'Jordan, use the first opening.'},peer).kind,'answer');
 const reviewer={...initial,phase:'checking',active_worker:'casey',next_worker:'casey',lead_worker:'jordan'};
 let failure;try{normalizeProjectTurn({kind:'check',text:'Casey, the opening is clear.'},reviewer);}catch(error){failure=projectResponseFailure(error,reviewer);}
 const correction=projectResponseRecovery(reviewer,failure);assert.match(correction.instruction,/kind check/);assert.match(correction.hint,/Casey to address Jordan/);
});
test('a rejected reply queues automatic recovery without replacing work or making an immediate extra model call',async()=>{
 for(const raw of [{kind:'final',text:'wrong stage'},{kind:'ask_team',recipient:'jordan',text:'Question'}]){
  const f=fixture();f.respond(raw);const result=await f.next();
  assert.equal(result.state,'recovering');assert.equal(result.recovery_saved,true);assert.equal(f.prompts.length,1);
  assert(!f.calls.some(c=>c.name==='commit_agent_project_turn'));
  for(const key of ['revision','phase','next_worker','team_order','shared_draft','feedback','final_output','output_version','turn_count'])assert.deepEqual(f.session[key],initial[key],key);
  assert.equal((await f.next()).state,'ready');assert.equal(f.prompts.length,1);
 }
});
test('retry restores the exact saved context and supplies a scoped correction from the run ledger',async()=>{
 const f=fixture();f.respond({kind:'ask_team',recipient:'jordan',text:'Which opening?'},{kind:'ask_team',recipient:'casey',text:'Casey, is the agreed opening clear?'});
 await f.next();assert.match(f.session.recovery_error,/self_address\/discussion\/jordan\/2/);f.session.next_run_at=new Date(0).toISOString();
 await runProjectTurn(f.deps,assignment,{action:'project_control',control:'retry'});assert.equal(f.session.last_error,'');
 assert.equal((await f.next()).state,'ready');assert.equal(f.prompts.length,2);
 assert.match(f.prompts[1],/CORRECTION FOR THIS RETRY/);assert.match(f.prompts[1],/recipient to casey/);assert.match(f.prompts[1],/never address yourself/);
 assert.deepEqual(f.contexts[1],f.contexts[0]);
 const commit=f.calls.find(c=>c.name==='commit_agent_project_turn');assert.equal(commit.args.p_assignment,id);assert.equal(commit.args.p_revision,2);assert.equal(commit.args.p_decision.recipient,'casey');
});
test('repeated invalid corrections stay recoverable without replacing the saved deliverable',async()=>{
 const f=fixture();f.respond({kind:'final',text:'wrong stage'},{kind:'final',text:'still wrong'});
 await f.next();f.session.next_run_at=new Date(0).toISOString();await f.next();
 assert.equal(f.prompts.length,2);assert.equal(f.session.shared_draft,initial.shared_draft);assert.equal(f.session.final_output,initial.final_output);assert.equal(projectResponseRecovery(f.session,f.session.recovery_error).code,'wrong_stage');
});
test('stale corrections never influence a different revision, stage or worker',()=>{
 const saved=projectResponseFailure(new ProjectResponseError('self_address','Bad recipient'),initial);
 for(const patch of [{revision:3},{phase:'checking'},{active_worker:'casey'}])assert.equal(projectResponseRecovery({...initial,...patch},saved),null);
 assert.equal(projectResponseRecovery(initial,saved).code,'self_address');
});
test('old generic failures gain a correction path and malformed responses gain JSON guidance',()=>{
 for(const message of ['The worker returned a response for the wrong project stage','The question must be addressed to another assigned teammate'])assert(projectResponseRecovery(initial,message).code);
 const saved=projectResponseFailure(new ProjectResponseError('invalid_response','Malformed JSON'),initial);
 assert.match(projectResponseRecovery(initial,saved).instruction,/one JSON object/);
});
test('a failure to save recovery status is reported honestly and never triggers another model call',async()=>{
 const f=fixture(),rpc=f.db.rpc;f.db.rpc=async(name,args)=>name==='fail_agent_project_turn'?{error:{message:'unavailable'}}:rpc(name,args);
 f.respond({kind:'final',text:'wrong stage'});const result=await f.next();assert.equal(result.state,'failed');assert.equal(result.recovery_saved,false);assert.match(result.message,/could not be saved/);assert.equal(f.prompts.length,1);
});
test('the correction notice survives refresh, escapes text, and preserves the scoped retry action',()=>{
 const error=projectResponseFailure(new ProjectResponseError('self_address','Question addressed to self <script>bad</script>'),initial);
 const s={...initial,active_worker:null,last_error:error,assignment:{title:'Script'},next_run_at:new Date(0).toISOString()};
 const render=()=>projectRoomHTML({projects:[structuredClone(s)],selected:id,notes:[],escape,format:escape,remove:()=>'',label:x=>x,deleted:()=>false});
 const html=render();assert.equal(render(),html);assert.match(html,/Correct recipient &amp; retry/);assert.match(html,/Jordan to address Casey/);assert.match(html,new RegExp('data-project-id="'+id));assert(!html.includes('<script>'));assert(!html.includes('Response correction ['));assert(!html.includes('data-project-final='));
 const activity=projectActivity(s);assert.match(activity.text,/Jordan needs to correct a teammate reply/);assert(!activity.text.includes('Response correction ['));assert(!activity.active);
});
test('a turn limit offers a scope correction instead of a retry that can never succeed',()=>{
 const html=projectRoomHTML({projects:[{...initial,last_error:'This revision reached its bounded team-turn limit.',assignment:{title:'Script'}}],selected:id,notes:[],escape,format:escape,remove:()=>'',label:x=>x,deleted:()=>false});
 assert.match(html,/Message Alex about scope/);assert(!html.includes('data-project-control="retry"'));
});
