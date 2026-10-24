import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Agent HQ chat creates draft work orders without manual forms',()=>{
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 const app=source('app.js');
 assert.match(chat,/await createAssignment\(composed\)/);
 assert.match(chat,/source_employee_id:worker/);
 assert.match(chat,/startAssignment=assignment\.id/);
 assert.doesNotMatch(app,/id="team-create-form"/);
 assert.match(app,/function renderAssignments\(\)/);
 assert.match(app,/renderAIConnectionGuide\(\)/);
 assert.match(app,/Team assignment discussions/);
});

test('Owner text green and red light is scoped to a queued plan',()=>{
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 const coord=source('supabase/functions/agent-hq-coordinate/index.ts');
 assert.match(chat,/function planSignal/);
 assert.match(chat,/green light/);
 assert.match(chat,/red light/);
 assert.match(chat,/const available=\(assignments\|\|\[\]\)\.filter/);
 assert.match(chat,/\.eq\("owner_id",owner\)/);
 assert.match(chat,/grouped\.get\(a\.id\)\|\|\[\]/);
 assert.match(chat,/\.every\(x=>x==="queued"\)/);
 assert.match(chat,/approved_assignment_id:approvedAssignment/);
 assert.match(coord,/if\(action==="next"&&!approved\)/);
});

test('An owner red light stops future drafts without granting account access',()=>{
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 const coord=source('supabase/functions/agent-hq-coordinate/index.ts');
 const worker=source('supabase/functions/agent-hq-worker/index.ts');
 assert.match(chat,/owner_paused:paused/);
 assert.match(coord,/assignment\.owner_paused/);
 assert.match(worker,/assignment\.owner_paused/);
 assert.match(chat,/No outside actions are authorized/);
});

test('Alex relays saved work into iPhone conversation threads',()=>{
 const coord=source('supabase/functions/agent-hq-coordinate/index.ts');
 const app=source('app.js');
 assert.match(coord,/saveChatUpdate\(admin,owner,id,planMessage\)/);
 assert.match(coord,/saveChatUpdate\(admin,owner,"alex",resultNotice\)/);
 assert.match(app,/function renderConversationWork\(worker\)/);
 assert.match(app,/renderConversationWork\(active\)/);
 assert.match(app,/step\.output/);
 assert.match(app,/ios-work-draft/);
 assert.match(app,/result\.approved_assignment_id/);
});

test('Assignments retains AI connection and archived discussions only',()=>{
 const app=source('app.js');
 assert.match(app,/function renderAIConnectionGuide/);
 assert.match(app,/function renderTeamThread/);
 assert.match(app,/Review-only history/);
 assert.doesNotMatch(app,/document\.querySelector\("#team-create-form"\)/);
 assert.doesNotMatch(app,/id="team-status"/);
 assert.doesNotMatch(app,/id="team-note-form"/);
});

test('Plan and worker progress are bounded and require an owner decision',()=>{
 const client=source('agent-coordination-cloud.js');
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 assert.match(client,/Math\.min\(4,Number\(maxSteps\)\|\|4\)/);
 assert.match(client,/if\(planned\.state!=='ready'\)/);
 assert.match(chat,/manager_summary/);
 assert.match(chat,/No specialist drafts were authorized/);
});
