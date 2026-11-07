import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {routineDue,nextEligible,dow} from '../agent-reading-schedule.js';
import {condition} from '../agent-weather-conditions.js';
import {parseSecretaryMessage,smartReminderTime} from '../eleanor-secretary-core.js';
import {validateSecretaryOps} from '../supabase/functions/agent-secretary/state.ts';

test('Saturday is reserved for rest across all habitual tasks',()=>{
 for(const id of ['2026-11-07','2026-11-14','2026-11-21'])assert.equal(routineDue({status:'active',weekdays:[0,1,2,3,4,5,6],data:{}},id),false);
 assert.equal(nextEligible('2026-11-07',0),'2026-11-08');
 assert.equal(nextEligible('2026-11-06',1),'2026-11-08');
 assert.equal(dow('2026-11-07'),6);
});
test('Four-page reading is every other eligible day with no Saturday obligation',()=>{
 const book={status:'active',weekdays:[0,1,2,3,4,5],data:{reading_goal:4,reading_mode:'alternate',anchor_date:'2026-11-08'}};
 const expected={'2026-11-08':true,'2026-11-09':false,'2026-11-10':true,'2026-11-11':false,'2026-11-12':true,'2026-11-13':false,'2026-11-14':false,'2026-11-15':true};
 for(const [day,result] of Object.entries(expected))assert.equal(routineDue(book,day),result,day);
 book.data.reading_mode='daily';
 assert.equal(routineDue(book,'2026-11-10'),true);
 assert.equal(routineDue(book,'2026-11-14'),false);
});
test('Monthly body-weight check moves from Saturday the first to Sunday the second',()=>{
 const item={status:'active',weekdays:[0,1,2,3,4,5],data:{monthly_weight:true}};
 assert.equal(routineDue(item,'2026-08-01'),false);
 assert.equal(routineDue(item,'2026-08-02'),true);
 assert.equal(routineDue(item,'2026-08-03'),false);
 assert.equal(routineDue(item,'2026-12-01'),true);
});
test('Weather icons and conditions reflect actual Open-Meteo interpretation codes',()=>{
 for(const [code,group] of [[0,'sunny'],[1,'fair'],[2,'partly-cloudy'],[3,'cloudy'],[45,'fog'],[61,'rain'],[63,'rain'],[71,'snow'],[95,'storm']])
  assert.equal(condition(code).group,group);
 assert.equal(condition(0,false).icon,'🌙');
 assert.equal(condition(80).icon,'🌦️');
});
test('Agent HQ Calendar and dock expose autonomous internal controls but no external publication',()=>{
 const root=dirname(fileURLToPath(import.meta.url)),home=readFileSync(resolve(root,'../agent-home-layout.js'),'utf8');
 const scheduler=readFileSync(resolve(root,'../supabase/functions/agent-secretary/scheduler.ts'),'utf8');
 assert.match(home,/const DOCK_KEY='agenthq-home-dock-v2'/);
 assert.match(home,/data-home-dock-slot/);
 assert.match(home,/data-home-dock-move/);
 assert.match(home,/weatherCondition/);
 assert.match(home,/weather_code,precipitation_probability_max/);
 assert.match(scheduler,/agent_hq_rollover_missed_tasks/);
 assert.match(scheduler,/agent_hq_capture_unfinished_reading/);
 assert.match(scheduler,/routineDue/);
 assert.match(scheduler,/saturday_rest/);
});

test('Eleanor picks a practical non-Saturday time for routine requests but not medication schedules',()=>{
 const state={settings:{timezone:'America/New_York'},items:[]};
 const utterance='Remind me to read four pages daily';
 const ops=parseSecretaryMessage(utterance,state,new Date('2026-11-08T13:00:00Z'));
 assert.equal(ops[0].item.local_time,'19:00');
 assert.deepEqual(ops[0].item.weekdays,[0,1,2,3,4,5]);
 assert.equal(validateSecretaryOps(ops,state,utterance)[0].item.local_time,'19:00');
 const unsafe=parseSecretaryMessage('Remind me to take medication daily',state);
 assert.match(unsafe.question,/needs a time confirmed/i);
 assert.equal(smartReminderTime('prescription antibiotics'),null);
 const saturday=parseSecretaryMessage('Remind me to review paperwork every Saturday at 7 PM',state);
 assert.match(saturday.question,/Saturday is your rest day/i);
});
