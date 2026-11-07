import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {goalProgress,budgetStatus,dollars,toCents,nextWorkSlot,HOME_STEPS} from '../agent-goal-math.js';
const here=dirname(fileURLToPath(import.meta.url));
test('Each thermometer rises only for completed stages and an initial 0% stays honest',()=>{
 const goal={id:'one',budget_cap_cents:12000,spent_cents:0};
 const own=[1,2,3,4,5,6,7,8].map(position=>({goal_id:'one',position,weight:1,title:'stage '+position,status:'pending'}));
 const other=[{goal_id:'two',position:1,weight:1,status:'done'}];
 const empty=goalProgress(goal,own.concat(other));
 assert.deepEqual([empty.percent,empty.completedSteps,empty.totalSteps],[0,0,8]);
 own[0].status='done';assert.deepEqual([goalProgress(goal,own).percent,goalProgress(goal,own).completedSteps],[13,1]);
 own.forEach(x=>x.status='done');assert.equal(goalProgress(goal,own).percent,100);
 assert.equal(goalProgress({id:'three'},own).percent,0);
});
test('Budgets are numerical ceilings and cannot approve money by themselves',()=>{
 const goal={id:'g',budget_cap_cents:7000,spent_cents:4580};
 const status=budgetStatus(goal);
 assert.deepEqual(status,{cap:7000,spent:4580,remaining:2420,over:false});
 assert.equal(dollars(status.remaining),'$24.20');
 assert.equal(toCents('49.99'),4999);
 assert.equal(toCents('0'),0);
 assert.equal(toCents(''),null);
 assert.throws(()=>toCents('-5'),/nonnegative/);
 assert.throws(()=>toCents('12.123'),/two decimal/);
 assert.equal(budgetStatus({budget_cap_cents:100,spent_cents:101}).over,true);
});
test('Household milestone plan includes safe inspection and actual cost verification',()=>{
 assert.equal(HOME_STEPS.length,6);
 assert.match(HOME_STEPS[1].details,/electrical|structural/i);
 assert.match(HOME_STEPS[2].details,/prices|contingency/i);
 assert.match(HOME_STEPS[5].details,/actual spending/i);
});
test('Calendar slot picker skips Saturday and collisions and leaves external meetings intact',()=>{
 const clock=new Date('2026-11-07T18:00:00Z'); // Saturday
 const slot=nextWorkSlot([], 'America/New_York', clock);
 assert.match(slot,/^2026-11-08T/);
 const used=[{kind:'meeting',status:'active',scheduled_at:new Date('2026-11-08T20:30:00Z').toISOString()},
   {kind:'task',status:'active',due_at:new Date('2026-11-08T21:30:00Z').toISOString()}];
 assert.match(nextWorkSlot(used,'America/New_York',clock),/^2026-11-08T(18|19|20|10|11|13)/);
 const unchanged=used.map(x=>JSON.stringify(x));
 nextWorkSlot(used,'America/New_York',clock);
 assert.deepEqual(used.map(x=>JSON.stringify(x)),unchanged);
});
test('Goal board wires owner-private records, stage evidence and separate financial permissions',()=>{
 const front=readFileSync(resolve(here,'../agent-eleanor-goals.js'),'utf8');
 const cloud=readFileSync(resolve(here,'../agent-hq-goals-cloud.js'),'utf8');
 const secretary=readFileSync(resolve(here,'../agent-secretary.js'),'utf8');
 const backend=readFileSync(resolve(here,'../supabase/functions/agent-secretary/state.ts'),'utf8');
 for(const term of ['data-goal-new-home','data-goal-chatgpt','data-goal-delegate','data-goal-budget','role="progressbar"','data-goal-toggle','data-goal-next'])assert.ok(front.includes(term),term);
 assert.match(cloud,/requires_evidence/);
 assert.match(cloud,/owner_id/);
 assert.match(secretary,/data-secretary-tab="goals"|goals','Goals/);
 assert.match(backend,/agent_hq_goals/);
});
