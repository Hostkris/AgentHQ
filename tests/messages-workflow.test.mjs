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


test('Message thread presents real provider authorization links, not fake generic logins',()=>{
 const app=source('app.js');
 assert.match(app,/function renderChatConnectorCard\(items\)/);
 assert.match(app,/data-chat-connect/);
 assert.match(app,/Sign in with Google to connect Gmail/);
 assert.match(app,/agentHQEmailCloud/);
 assert.match(app,/agentHQMetaCloud/);
 assert.match(app,/chatgpt-apply/);
 assert.match(app,/https:\/\/openai\.com\/form\/sign-in-with-chatgpt-interest\//);
 assert.match(app,/Awaiting OpenAI authorization/);
 assert.match(app,/a website login is not|website login does not|website login alone/i);
 assert.match(app,/open-accounts/);
});
test('Final text approval is a scoped owner Messages reply, never publication approval',()=>{
 const app=source('app.js');
 assert.match(app,/function conversationDraftInfo\(a\)/);
 assert.match(app,/function finalDraftForChat\(worker\)/);
 assert.match(app,/reviewDecision/);
 assert.match(app,/There is no single unreviewed completed draft/);
 assert.match(app,/CREATIVE_REVIEW_V1/);
 assert.match(app,/Owner approved the written draft only\. No publishing/);
 assert.match(app,/window\.agentHQChatCloud\.send\(worker,value\)/);
 assert.match(app,/window\.agentHQTeamCloud\.post\(final\.a\.id/);
});
test('Creative Desk intake is removed and worker Messages owns requests',()=>{
 const creative=source('agent-creative-desk.js');
 assert.match(creative,/finished-work library/);
 assert.doesNotMatch(creative,/<form id="creative-request-form"/);
 assert.doesNotMatch(creative,/data-creative-plan-approve=/);
 assert.doesNotMatch(creative,/data-creative-approve=/);
 assert.match(creative,/data-nav="messages"/);
 assert.match(creative,/isCreativeJob/);
});

test('Direct assignments work without another "Yes or no?" and keep owner approval ledger',()=>{
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 const client=source('agent-coordination-cloud.js');
 const app=source('app.js');
 assert.match(chat,/For "task", state that the safe internal assignment is starting/);
 assert.match(chat,/await createAssignment\(composed\)/);
 assert.doesNotMatch(chat,/Should I create the proposed work order\? Yes or no\?/);
 assert.doesNotMatch(chat,/Just to confirm: should I resume the team/);
 assert.match(client,/autoApproveInternal=false/);
 assert.match(client,/autoApproveInternal&&planned\.state==='awaiting_approval'/);
 assert.match(client,/invoke\('approve',id\)/);
 assert.match(app,/autoApproveInternal:planFirst/);
 assert.match(chat,/Outside accounts, publishing, purchases and spending still need separate/);
});
test('Resolved blocker clears confirmation stage and starts the queued specialist draft',()=>{
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 const segment=chat.split('}else if(stage==="confirm_resume"){')[1].split('}else if(stage==="confirm_permission"){')[0];
 assert.match(segment,/await state\("idle"\)/);
 assert.match(segment,/resumeAssignment=related/);
 assert.doesNotMatch(segment,/Just to confirm/);
 assert.match(chat,/resumeAssignment=waiting\.assignment_id/);
 assert.doesNotMatch(chat,/await state\("confirm_resume","",waiting\.assignment_id\)/);
});
test('Final copy accepts natural owner likes, dislikes, green and red light, and thumbs with no publishing',()=>{
 const app=source('app.js');
 assert.match(app,/approveSignals=/);
 assert.match(app,/rejectSignals=/);
 assert.match(app,/thumbs up\|thumb up\|👍/);
 assert.match(app,/thumbs down\|thumb down\|👎/);
 assert.match(app,/REVISION_REQUESTED/);
 assert.match(app,/No publishing, sending, account access or spending approved/);
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 const gate=chat.split('function yesNo')[1].split('// One reply controls')[0];
 assert.doesNotMatch(gate,/thumbs up|thumbs down|👍|👎/);
});
test('All specialists are directed to finish safe drafts, avoid fabricated external actions, and ask only true blockers',()=>{
 const chat=source('supabase/functions/agent-hq-converse/index.ts');
 const coordinator=source('supabase/functions/agent-hq-coordinate/index.ts');
 assert.match(chat,/make an editable first draft with placeholders/i);
 assert.match(coordinator,/Solve routine snags autonomously/);
 assert.match(coordinator,/SMALLEST capable specialist team/);
 assert.match(coordinator,/no account permission is granted|No publishing, spending, website or account permission is granted/i);
 assert.match(coordinator,/If essential owner information genuinely blocks all useful drafting/);
});
