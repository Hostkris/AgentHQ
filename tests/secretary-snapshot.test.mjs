import test from 'node:test';
import assert from 'node:assert/strict';
import {savedSecretaryOwner,secretaryPendingNotices,readSecretarySnapshot,saveSecretarySnapshot,clearSecretarySnapshot} from '../agent-secretary-snapshot.js';

export const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',bot='33333333-3333-4333-8333-333333333333';
const authKey='sb-fixture-auth-token';
function memory(){const records=new Map();return {records,getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};}
function state(){return {settings:{owner_id:owner,bot_id:bot,version:1,agent_alerts_enabled:true},items:[{id:'routine',status:'active',version:2},{id:'stopped',status:'stopped',version:1}],deliveries:[
 {id:'current',kind:'reminder',item_id:'routine',item_version:2,status:'saved',action_state:'open',body:'Saved owner instructions'},
 {id:'old',kind:'reminder',item_id:'routine',item_version:1,status:'saved',action_state:'open',body:'Outdated instructions'},
 {id:'done',kind:'reminder',status:'saved',action_state:'done',body:'Already handled'},
 {id:'stopped-notice',kind:'reminder',item_id:'stopped',item_version:1,status:'saved',action_state:'open',body:'Stopped routine'},
 {id:'queued',kind:'reminder',status:'queued',action_state:'open',body:'Not yet delivered'}
 ],agent_alerts:[{id:'attention',status:'open',actor:'Alex',alert_kind:'review',title:'Draft ready',body:'Review the actual saved PDF.'},{id:'closed',status:'dismissed'}]};}

test('A saved preview needs the same remembered account and an actual persisted session',()=>{
 const store=memory();assert.equal(savedSecretaryOwner(store,authKey),null);
 store.setItem(authKey,JSON.stringify({user:{id:owner}}));assert.equal(savedSecretaryOwner(store,authKey),null);
 store.setItem(authKey,JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',user:{id:owner}}));assert.equal(savedSecretaryOwner(store,authKey),owner);
 store.setItem(authKey,'broken JSON');assert.equal(savedSecretaryOwner(store,authKey),null);
});
test('Only open saved notices for current active item versions enter the preview',()=>{
 const data=state();assert.deepEqual(secretaryPendingNotices(data).map(n=>n.id),['attention','current']);
 data.settings.agent_alerts_enabled=false;assert.deepEqual(secretaryPendingNotices(data).map(n=>n.id),['current']);
});
test('The whole pending list is retained, with exact text, without account credentials or unrelated records',()=>{
 const data=state(),store=memory();for(let n=0;n<7;n++)data.deliveries.push({id:'saved-'+n,kind:'brief',status:'saved',action_state:'open',body:'The full supplied text '.repeat(60)});
 data.devices=[{auth_key:'must-not-copy'}];data.workout_log=[{notes:'unrelated private log'}];
 const saved=saveSecretarySnapshot(store,owner,data,100000);assert.equal(saved.notices.length,9);assert.equal(saved.notices.at(-1).body,data.deliveries.at(-1).body);
 assert.equal(JSON.stringify(saved).includes('auth_key'),false);assert.equal(JSON.stringify(saved).includes('workout_log'),false);
 assert.deepEqual(readSecretarySnapshot(store,owner,100001),saved);
 assert.equal(readSecretarySnapshot(store,other,100001),null);assert.equal(saveSecretarySnapshot(store,other,data,100001),null);
});
test('Acknowledged notices and an empty fresh inbox replace a previously saved preview',()=>{
 const data=state(),store=memory();saveSecretarySnapshot(store,owner,data);
 data.deliveries[0].action_state='done';data.agent_alerts[0].status='dismissed';saveSecretarySnapshot(store,owner,data);
 assert.deepEqual(readSecretarySnapshot(store,owner).notices,[]);clearSecretarySnapshot(store,owner);assert.equal(readSecretarySnapshot(store,owner),null);
});
test('Expired, malformed and mismatched account snapshots are discarded',()=>{
 const store=memory();saveSecretarySnapshot(store,owner,state(),100000);
 assert.equal(readSecretarySnapshot(store,owner,100000+8*24*60*60*1000),null);assert.equal(store.records.size,0);
 saveSecretarySnapshot(store,owner,state(),100000);const key=[...store.records.keys()][0],value=JSON.parse(store.getItem(key));value.owner_id=other;store.setItem(key,JSON.stringify(value));assert.equal(readSecretarySnapshot(store,owner,100001),null);
 store.setItem(key,'broken JSON');assert.equal(readSecretarySnapshot(store,owner),null);
});
test('Storage restrictions leave normal authenticated reading usable',()=>{
 const blocked={getItem(){throw Error('Storage unavailable');},setItem(){throw Error('Quota');},removeItem(){throw Error('Storage unavailable');}};
 assert.equal(savedSecretaryOwner(blocked,authKey),null);assert.equal(readSecretarySnapshot(blocked,owner),null);
 assert.equal(saveSecretarySnapshot(blocked,owner,state()).notices.length,2);assert.doesNotThrow(()=>clearSecretarySnapshot(blocked,owner));
});
test('Agent popup targets survive saved preview restoration without unrelated fields',()=>{
 const data=state(),store=memory(),project='44444444-4444-4444-8444-444444444444';
 Object.assign(data.agent_alerts[0],{actor:'Riley',alert_kind:'question',project_id:project,secret:'do-not-copy'});
 const saved=saveSecretarySnapshot(store,owner,data);
 const notice=readSecretarySnapshot(store,owner).notices.find(n=>n.agent);
 assert.equal(notice.actor,'Riley');assert.equal(notice.alert_kind,'question');assert.equal(notice.project_id,project);
 assert.equal(JSON.stringify(saved).includes('do-not-copy'),false);
});
