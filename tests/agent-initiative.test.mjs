import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {WORKERS,WORKER_ROLES,savedSources,validateInitiative,initiativeSystemPrompt} from '../agent-initiative-core.js';
import {considerWorkerInitiative} from '../supabase/functions/agent-hq-project-runner/initiative.ts';
const root=dirname(fileURLToPath(import.meta.url));
const read=p=>readFileSync(resolve(root,'..',p),'utf8');
const goal='11111111-1111-4111-8111-111111111111';
const sources=[
 {ref:'goal:'+goal,type:'standing_goal',title:'Elysian Noir customer growth'},
 {ref:'board:weekly',type:'scheduled_routine',title:'Weekly Organization Board'}
];
const idea={kind:'idea',focus_ref:'goal:'+goal,evidence_refs:['goal:'+goal],
 title:'Improve skincare product launch conversion',
 rationale:'The current saved customer-growth goal has incomplete acquisition milestones, so a role-specific evidence-based project can help avoid repeating unmeasured marketing activities.',
 deliverable:'A practical and sourced organic acquisition plan with customer segments, compliant product copy, simple conversion measurements, review checks and a proposed Sunday–Friday follow-up calendar.',
 observed_need:'The owner has an active customer-growth goal with unfinished stages.',
 pattern_kind:'standing_goal',research_questions:['What are current official Shopify conversion optimization guidelines for small skincare stores?']
};
test('all ten genuine workers have scoped roles; no fictional eleventh research worker',()=>{
 assert.equal(WORKERS.length,10);assert.equal(new Set(WORKERS).size,10);
 for(const worker of WORKERS){assert.ok(WORKER_ROLES[worker]);assert.match(initiativeSystemPrompt(worker),/research|public/i);}
 assert.match(initiativeSystemPrompt('riley'),/actual saved Agent HQ owner records/);
});
test('a worker may initiate only grounded, suitably scoped internal work',()=>{
 const checked=validateInitiative(idea,'maya',sources.map(s=>s.ref));
 assert.equal(checked.kind,'idea');assert.equal(checked.evidence_refs[0],'goal:'+goal);
 assert.throws(()=>validateInitiative({...idea,focus_ref:'goal:not-saved'},'maya',sources.map(s=>s.ref)),/saved owner record/);
 assert.throws(()=>validateInitiative({...idea,evidence_refs:['board:unobserved']},'maya',sources.map(s=>s.ref)),/invented/);
 assert.throws(()=>validateInitiative({...idea,pattern_kind:'repeated_work'},'maya',sources.map(s=>s.ref)),/cannot establish repeated behavior/);
 assert.equal(validateInitiative({kind:'none',reason:'Already assigned'},'alex',sources.map(s=>s.ref)).kind,'none');
});
test('public research questions cannot contain account secrets or private identifiers',()=>{
 for(const query of [
  'Search my private bank account balance and transaction history',
  'Check password abc and access token for online account',
  'Search https://example.com/private?token=foo for data'
 ])assert.throws(()=>validateInitiative({...idea,research_questions:[query]},'maya',[idea.focus_ref]),/invalid or sensitive/);
});
test('memory source list reflects actual goals, recurring tasks and projects but excludes health or private intake',()=>{
 const x=savedSources({
  goals:[{id:goal,title:'Elysian Noir customers'}],
  milestones:[{goal_id:goal,title:'First verified sale',status:'pending'}],
  projects:[{id:'22222222-2222-4222-8222-222222222222',title:'Arbitrage feasibility',status:'in_progress'}],
  tasks:[
   {id:'33333333-3333-4333-8333-333333333333',title:'Customer outreach draft',kind:'reminder',weekdays:[0,1,2,3,4,5],status:'active'},
   {id:'44444444-4444-4444-8444-444444444444',title:'Prescription medication schedule',kind:'reminder',weekdays:[0,1,2],status:'active'}
  ],
  boards:[{board_key:'weekly',payload:{business_days:[{day:'Monday',title:'Arbitrage'}]}}],
  patterns:[{focus_ref:'goal:'+goal,summary:'Verified standing owner business priority',disabled:false}]
 });
 assert(x.some(o=>o.ref==='goal:'+goal));
 assert(x.some(o=>o.ref==='board:weekly'));
 assert(x.some(o=>o.ref.startsWith('project:')));
 assert(x.some(o=>o.type==='scheduled_routine'));
 assert(!x.some(o=>/prescription/i.test(o.title)));
 assert(x.find(o=>o.ref==='goal:'+goal).context.includes('observation'));
});
test('trusted initiative service does not claim model research or create work without a saved grounded input',async()=>{
 const calls=[],owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const data={
  agent_hq_goals:[{id:goal,title:'Elysian Noir growth',status:'active'}],
  agent_hq_goal_milestones:[],agent_team_assignments:[],agent_secretary_items:[],
  agent_hq_board_snapshots:[],agent_hq_worker_patterns:[]
 };
 const table=name=>({select(){return this},eq(){return this},in(){return this},order(){return this},
  limit(){return Promise.resolve({data:data[name]||[],error:null})},
  update(){return this}});
 const db={
  rpc:async(name,args)=>{calls.push({name,args});
   if(name==='agent_hq_claim_autonomy')return {data:{owner_id:owner,worker:'maya',local_date:'2026-11-08',timezone:'America/New_York'},error:null};
   if(name==='agent_hq_launch_autonomy')return {data:{state:'project_saved',idea_id:'idea-id',project_id:'project-id'},error:null};
   throw Error('Unknown RPC');},
  from:table
 };
 const runtime={call:async()=>({...idea,focus_ref:'goal:'+goal,evidence_refs:['goal:'+goal]})};
 const outcome=await considerWorkerInitiative(db,[owner],{makeRuntime:()=>runtime});
 assert.equal(outcome.state,'project_saved');
 assert(calls.some(c=>c.name==='agent_hq_launch_autonomy'));
 assert(!calls.some(c=>/purchase|post|publish/.test(c.name)));
});
test('no AI service or absent sources cannot fabricate a launched project',async()=>{
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',calls=[];
 const db={rpc:async name=>{calls.push(name);return {data:{owner_id:owner,worker:'maya',local_date:'2026-11-08'},error:null}},
  from:()=>({select(){return this},update(){return this},eq(){return this},in(){return this},order(){return this},limit(){return Promise.resolve({data:[],error:null})}})};
 const x=await considerWorkerInitiative(db,[owner],{makeRuntime:()=>{throw Error('No live provider')}});
 assert.equal(x.state,'no_recorded_needs');
 assert.equal(calls.filter(x=>x==='agent_hq_launch_autonomy').length,0);
});
test('initiative creation is service-only, owner-private, capped, and linked to Eleanor',()=>{
 const migration=read('supabase/migrations/20261107230000_agent_hq_rotating_proactive_worker_initiatives.sql');
 const handler=read('supabase/functions/agent-hq-project-runner/handler.ts');
 const index=read('supabase/functions/agent-hq-project-runner/index.ts');
 for(const marker of ['force row level security','agent_hq_claim_autonomy','agent_hq_launch_autonomy','max_new_projects_week','agent_custom_bot_messages','agent_secretary_items','review_only'])assert.match(migration,new RegExp(marker));
 assert.match(migration,/to service_role/);
 assert.match(handler,/proactiveInitiatives===true/);
 assert.match(index,/proactiveInitiatives:true/);
});
