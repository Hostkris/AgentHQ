import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {BOARD_KEYS,BOARD_LABELS,BOARD_CONFLICT_LABELS} from '../agent-eleanor-boards-data.js';
const root=dirname(fileURLToPath(import.meta.url));
const file=p=>readFileSync(resolve(root,'..',p),'utf8');
test('All five supplied personal planning boards remain distinct private records',()=>{
 assert.deepEqual(BOARD_KEYS,['financial','flip','investment','cleaning','weekly']);
 assert.equal(Object.keys(BOARD_LABELS).length,5);
 assert.match(BOARD_LABELS.cleaning,/Cleaning/);
 assert.match(BOARD_LABELS.weekly,/Weekly Organization/);
 assert.equal(BOARD_CONFLICT_LABELS.length,4);
});
test('Budget and schedule conflicts remain visible for owner resolution',()=>{
 const [dinner,cleaning,capital,gym]=BOARD_CONFLICT_LABELS;
 assert.match(dinner,/5 PM/i);
 assert.match(dinner,/6:30 PM/i);
 assert.match(cleaning,/4–4:20 PM/);
 assert.match(capital,/alternative uses/);
 assert.match(gym,/Friday/);
});
test('The five private boards render within Eleanor and do not expose owner financial figures in public JavaScript',()=>{
 const js=file('agent-eleanor-boards.js'),styles=file('agent-eleanor-boards.css'),server=file('supabase/functions/agent-secretary/state.ts');
 for(const part of ['data-hq-board-select','data-hq-board-check','hq-board-sheet-financial','hq-board-sheet-home'])assert.ok((js+styles).includes(part),part);
 assert.match(server,/agent_hq_board_snapshots/);
 assert.match(server,/agent_hq_board_checks/);
 assert.doesNotMatch(file('agent-eleanor-boards-data.js'),/\b[0-9]{4,6}\.\d{2}\b/,'Private savings, bills and income figures must not be hardcoded in public board definitions.');
});
test('Dated cleaning and weekly checklist checkmarks require owner action; Sabbath is protected',()=>{
 const ui=file('agent-eleanor-boards.js');
 const schema=file('supabase/migrations/20261107223500_agent_hq_private_board_checklists.sql');
 assert.match(ui,/addEventListener\('change'/);
 assert.match(ui,/agent_hq_board_checks/);
 assert.match(ui,/dow\(local_date\)===6/);
 assert.match(ui,/auth\.getUser/);
 assert.match(schema,/force row level security/);
 assert.match(schema,/owner_id=\(select auth\.uid\(\)\)/);
});
test('Actual schedule is sourced from private saved payloads and not a guessed time plan',()=>{
 const migration=file('supabase/migrations/20261107222500_eleanor_seed_user_board_schedules.sql');
 assert.match(migration,/agent_hq_board_snapshots/);
 assert.match(migration,/business_days/);
 assert.match(migration,/gym_days/);
 assert.match(migration,/cleaning/);
 assert.match(migration,/Saturday/);
 assert.match(migration,/dinner after 6:30 PM but the earlier 5 PM eating-cutoff/i);
});
