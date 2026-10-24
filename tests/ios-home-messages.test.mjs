import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('iPhone-style home layout supports page management, drag rearranging and widgets',()=>{
 const js=src('agent-home-layout.js');
 assert.match(js,/const KEY="agenthq-home-layout-v1"/);
 assert.match(js,/localStorage\.setItem\(KEY/);
 assert.match(js,/data-home-edit/);
 assert.match(js,/data-home-add-page/);
 assert.match(js,/data-home-page/);
 assert.match(js,/data-home-shift/);
 assert.match(js,/data-home-add-widget/);
 assert.match(js,/data-home-remove-widget/);
 assert.match(js,/addEventListener\('pointerdown'/);
 assert.match(js,/addEventListener\('drop'/);
 assert.match(js,/addEventListener\('touchend'/);
 assert.match(js,/Messages/);
 assert.match(js,/Approvals/);
 const app=src('app.js');
 assert.match(app,/renderHomeScreen\(button,/);
 assert.match(app,/connectHomeScreen\(/);
});

test('Press hold on one worker supports owner-only deletion with saved work retained',()=>{
 const app=src('app.js'),cloud=src('agent-messages-cloud.js');
 const migration=src('supabase/migrations/20261024021400_owner_clear_worker_conversation.sql');
 assert.match(app,/data-thread-press/);
 assert.match(app,/Delete all text messages/);
 assert.match(app,/Permanently delete all text messages with/);
 assert.match(app,/clearConversation\(worker\)/);
 assert.match(cloud,/rpc\('clear_agent_conversation'/);
 assert.match(cloud,/agentHQConversationClearSync/);
 assert.match(migration,/security invoker/);
 assert.match(migration,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(migration,/delete from public\.agent_messages/);
 assert.match(migration,/cleared_at/);
 assert.doesNotMatch(migration,/delete from public\.agent_team_assignments/);
});

test('Large research output collapses and new verified reports remain in the thread',()=>{
 const app=src('app.js'),research=src('supabase/functions/agent-hq-converse/research.ts');
 assert.match(app,/function naturalChatText/);
 assert.match(app,/ios-long-chat/);
 assert.match(app,/function renderConversationResearch/);
 assert.match(app,/renderConversationResearch\(active\)/);
 assert.match(app,/naturalResearchHTML/);
 assert.match(research,/return 'I finished checking public sources for/);
 assert.match(research,/finish_agent_research/);
 assert.match(research,/researchEvidence\(message\)/);
 const sql=src('supabase/migrations/20261024023500_research_save_full_report_send_short_chat.sql');
 assert.match(sql,/report=p_report/);
 assert.match(sql,/The full report, sources and limitations are saved/);
 assert.doesNotMatch(sql,/values\(p_owner,job\.conversation_id,'employee',p_report\)/);
 assert.match(sql,/grant execute on function public\.finish_agent_research.*to service_role/);
});

test('Riley responds to casual status checks without searching those words',()=>{
 const chat=src('supabase/functions/agent-hq-converse/index.ts');
 const dna=src('supabase/functions/_shared/riley-dna.ts');
 assert.match(chat,/did you find anything/);
 assert.match(chat,/Could not check Riley's research history/);
 assert.match(chat,/agent_research_jobs/);
 assert.match(chat,/last\.status==="completed"/);
 assert.match(dna,/normal conversational texts/);
 assert.match(chat,/one to three short sentences/);
});

test('New home files are linked and iPhone touch styles are present',()=>{
 const index=src('index.html'),app=src('app.js'),css=src('ios-ui.css');
 assert.match(index,/home-chat-v3/);
 assert.match(app,/agent-home-layout\.js/);
 assert.match(css,/\.home-widget/);
 assert.match(css,/\.agent-thread-action-backdrop/);
 assert.match(css,/\.ios-research-attachment/);
});
