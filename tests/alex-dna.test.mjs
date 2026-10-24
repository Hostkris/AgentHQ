import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('Alex DNA gives no external execution tools and lists only specialists',()=>{
 const dna=source('supabase/functions/_shared/alex-dna.ts');
 assert.match(dna,/id: "alex"/);
 assert.match(dna,/defaultExternalTools: Object.freeze\(\[\]/);
 assert.match(dna,/noContinuousModelPolling: true/);
 const specialistBlock=dna.split('export const SPECIALIST_JOBS')[1].split('export function isAlexSpecialist')[0];
 assert.doesNotMatch(specialistBlock,/\balex\s*:/);
 assert.match(dna,/verify_stored_completion_evidence/);
});
test('Alex cannot directly execute generic worker steps',()=>{
 const worker=source('supabase/functions/agent-hq-worker/index.ts');
 assert.match(worker,/if\(employeeId==="alex"\)return reply\(req,.*403\)/);
 assert.match(worker,/if\(planDecision\?\.status!=="approved"\)return reply/);
});
test('Owner plan decisions are backed by RLS rather than chat text',()=>{
 const sql=source('supabase/migrations/20261023190000_alex_plan_decisions.sql');
 const coord=source('supabase/functions/agent-hq-coordinate/index.ts');
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/grant select on table public\.agent_alex_plan_decisions to authenticated/i);
 assert.match(coord,/from\("agent_alex_plan_decisions"\)/);
 assert.match(coord,/if\(action==="next"&&!approved\)return reply/);
 assert.match(coord,/if\(!isAlexSpecialist\(id\)\|\|seen\.has\(id\)\)continue/);
});
test('iPhone interface requires separate plan approval before specialist continuation',()=>{
 const ui=source('app.js');
 const client=source('agent-coordination-cloud.js');
 assert.match(ui,/data-alex-decision="approve"/);
 assert.match(ui,/data-alex-decision="reject"/);
 assert.match(ui,/a\.manager_summary&&a\.alex_plan_status!=="approved"/);
 assert.match(ui,/continueTeam=p\.steps\.length>0&&pending&&!p\.waiting&&a\.alex_plan_status==="approved"/);
 assert.match(client,/async function decidePlan\(/);
});
test('Alex chat is manager-only even when research or external action is requested',()=>{
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 assert.match(chat,/worker==="alex"&&isAlexForbiddenIntent\(result\.intent\)/);
 assert.match(chat,/worker!=="alex"&&worker!=="riley"&&isResearchInstruction/);
 assert.match(chat,/worker==="alex"&&\(input\.action==="request_research"/);
});
