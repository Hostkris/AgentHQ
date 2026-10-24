import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Cloud sync queries owner-scoped unread counts and marks opened threads read',()=>{
 const c=read('agent-messages-cloud.js');
 assert.match(c,/rpc\('get_agent_unread_counts'\)/);
 assert.match(c,/rpc\('mark_agent_conversation_read'/);
 assert.match(c,/const visible=window\.agentHQVisibleThread\?\.\(\)/);
 assert.match(c,/await refreshUnread\(\)/);
});

test('Home, Messages and worker rows show automatic attention counters',()=>{
 const app=read('app.js');
 assert.match(app,/screenName==="messages"\?messagesAttention\(\)/);
 assert.match(app,/screenName==="approvals"\?pendingCount\(\)/);
 assert.match(app,/screenName==="assignments"\?assignmentAttention\(\)/);
 assert.match(app,/screenName==="operations"\?operationsAttention\(\)/);
 assert.match(app,/const employeeAttention=id=>unreadFor\(id\)\+pendingRequestsFor\(id\)/);
 assert.match(app,/unreadBadge\(employeeAttention\(x\[0\]\)\)/);
 assert.match(app,/const hasConversation=id=>employeeAttention\(id\)>0/);
 assert.match(app,/markRead\(active\)/);
 assert.match(app,/unreadLabel=n=>n>99\?"99\+":String\(n\)/);
});

test('Badge system needs no extra user-facing setup button or permission prompt',()=>{
 const app=read('app.js');
 const css=read('ios-ui.css');
 assert.doesNotMatch(app,/data-enable-icon-badges/);
 assert.match(app,/Notification\.requestPermission\(\)\.then\(\(\)=>syncAppBadge\(\)\)/);
 assert.match(app,/if\(next==="messages"\&\&/);
 assert.doesNotMatch(css,/\.agent-badge-settings/);
 assert.match(app,/navigator\.setAppBadge\(count\)/);
 assert.match(app,/navigator\.clearAppBadge\(\)/);
});

test('Task and business permission events refresh attention automatically',()=>{
 const app=read('app.js');
 assert.match(app,/const pendingRequestsFor=id=>/);
 assert.match(app,/const assignmentAttention=\(\)=>/);
 assert.match(app,/const operationsAttention=\(\)=>/);
 assert.match(app,/const allAttention=\(\)=>messagesAttention\(\)\+assignmentAttention\(\)\+operationsAttention\(\)/);
 assert.match(app,/window\.agentHQSyncApprovals=\(rows,notice\)=>/);
 assert.match(app,/updateAttentionIndicators\(\)/);
});

test('Unread SQL is per owner, per conversation and counts worker replies only',()=>{
 const migration=read('supabase/migrations/20261023223939_agent_hq_unread_message_badges.sql');
 const workerOnly=read('supabase/migrations/20261023224202_worker_only_unread_counts.sql');
 assert.match(migration,/last_read_at timestamptz not null default now\(\)/);
 assert.match(migration,/security invoker/);
 assert.match(migration,/owner_id = \(select auth\.uid\(\)\)/);
 assert.match(workerOnly,/m\.sender = 'employee'/);
 assert.match(workerOnly,/m\.created_at > c\.last_read_at/);
 assert.match(workerOnly,/grant execute on function public\.get_agent_unread_counts\(\) to authenticated/);
});

test('New worker messages and approval requests refresh without manually checking',()=>{
 const realtime=read('agent-attention-cloud.js');
 const index=read('index.html');
 for(const table of ['agent_messages','agent_permission_requests','agent_team_assignments','agent_task_steps','agent_action_proposals']){
  assert.match(realtime,new RegExp(table));
 }
 assert.match(realtime,/owner_id=eq\./);
 assert.match(realtime,/postgres_changes/);
 assert.match(realtime,/agentHQChatCloud\?\.refresh/);
 assert.match(realtime,/agentHQCloudApprovals\?\.refresh/);
 assert.match(index,/agent-attention-cloud\.js/);
});

test('iPhone styling and cache versions include message badges',()=>{
 const css=read('ios-ui.css');
 const index=read('index.html');
 assert.match(css,/\.agent-unread-badge--tile/);
 assert.match(css,/\.agent-unread-badge--thread/);
 assert.ok(index.includes('app.js?v=20261024-'));
});
