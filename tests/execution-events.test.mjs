import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {threadActivities,activityHTML} from '../agent-activity-view.js';

const now=Date.parse('2026-10-24T17:00:00Z');
const base={id:'11111111-1111-4111-8111-111111111111',
 assignment_id:'22222222-2222-4222-8222-222222222222',
 employee_id:'riley',event_type:'worker_completed',state:'completed',
 occurred_at:new Date(now-1000).toISOString(),summary:'Riley completed an assigned turn'};
test('recorded outcomes appear without claiming a worker is currently typing',()=>{
 const r=threadActivities('hq',{events:[base],now});
 assert.equal(r.length,1);
 assert.equal(r[0].event,true);
 assert.equal(r[0].active,false);
 assert.equal(r[0].text,base.summary);
 const html=activityHTML(r,{hq:true});
 assert.doesNotMatch(html,/data-activity-running="true"/);
 assert.match(html,/Riley completed an assigned turn/);
});
test('a worker start is displayed only through an actual running record, not historic event',()=>{
 assert.deepEqual(threadActivities('hq',{events:[{...base,event_type:'worker_started'}],now}),[]);
 assert.deepEqual(threadActivities('hq',{events:[{...base,occurred_at:new Date(now-121000).toISOString()}],now}),[]);
});
test('other employees do not inherit unrelated events and no content executes as HTML',()=>{
 assert.deepEqual(threadActivities('maya',{events:[base],now}),[]);
 const all=threadActivities('alex',{events:[{...base,summary:'<script>unsafe</script>'}],now});
 assert.equal(all.length,1);
 assert.doesNotMatch(activityHTML(all),/<script>/);
 assert.match(activityHTML(all),/&lt;script&gt;/);
});
test('the migration restricts inserts to backend triggers and owner-scoped reads',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261024170000_verified_execution_events.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/grant select on public\.agent_execution_events to authenticated/i);
 assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/i);
 assert.match(sql,/after insert or update of status on public\.agent_worker_runs/i);
 assert.match(sql,/after insert on public\.agent_team_messages/i);
 assert.match(sql,/revoke all on public\.agent_execution_events from public,anon,authenticated/i);
});
