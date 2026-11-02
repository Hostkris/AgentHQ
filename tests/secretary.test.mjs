import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ELEANOR_SPEC,ELEANOR_ETHICS,secretaryTime,secretaryDate,dailyBrief,meetingBrief} from '../eleanor-secretary-core.js';
import {secretaryState,validateSecretaryOps,applySecretaryOps} from '../supabase/functions/agent-secretary/state.ts';
import {secretaryChat} from '../supabase/functions/agent-secretary/chat.ts';
import {processSecretaryDue,scopedMeetingEmail} from '../supabase/functions/agent-secretary/scheduler.ts';
import {validatePushSubscription,pushKeys,sendSecretaryPush} from '../supabase/functions/agent-secretary/push.ts';
import {secretaryHandler} from '../supabase/functions/agent-secretary/handler.ts';
import {secretaryFixture,owner,other,bot,item,delivery} from './fixtures/secretary-db.mjs';
const reminder=(extra={})=>({op:'save_item',title_source:'Example intake',time_source:'8 AM',item:{kind:'reminder',title:'Example intake',details:'',timezone:'America/New_York',local_time:'08:00',weekdays:[0,1,2,3,4,5,6],data:{intake_type:'medication'}},...extra});
test('Eleanor has concrete secretary ethics, durable records and no invented health or delivery claims',()=>{
 assert.ok(ELEANOR_SPEC.instructions.length<=4500);for(const word of ['Discretion','punctuality','Daily_Reminders','Active_Tasks','Workout_Schedule','Context','Prep Assets','Objectives','missed-dose','untrusted','one later check-in'])assert.ok(ELEANOR_ETHICS.includes(word),word);assert.match(ELEANOR_ETHICS,/One-time tasks remain open/);assert.match(ELEANOR_ETHICS,/Marking a reminder done today never stops/);
});
test('Time parsing refuses ambiguous intake times and preserves explicit 12/24 hour intent',()=>{
 assert.equal(secretaryTime('8 AM'),'08:00');assert.equal(secretaryTime('8:15 pm'),'20:15');assert.equal(secretaryTime('00:30'),'00:30');for(const t of ['8','8:00','25:30','13 PM'])assert.equal(secretaryTime(t),null);assert.equal(secretaryDate(new Date('2026-11-02T01:00:00Z'),'America/New_York'),'2026-11-01');
});
test('Clinical reminders cannot invent a label, dose, time, recurrence or an unrequested indefinite period',async()=>{
 const state=await secretaryState(secretaryFixture(),owner),message='Remind me to take Example intake daily at 8 AM.';assert.equal(validateSecretaryOps([reminder()],state,message)[0].item.local_time,'08:00');
 const wrong=reminder();wrong.item.title='Example intake 500 mg';assert.throws(()=>validateSecretaryOps([wrong],state,message),/actual item label/);
 const invented=reminder();invented.item.details='Take two extra doses';assert.throws(()=>validateSecretaryOps([invented],state,message),/Do not invent/);
 assert.throws(()=>validateSecretaryOps([reminder({time_source:'8'})],state,'Remind me to take Example intake daily at 8.'),/time does not match/);
 assert.throws(()=>validateSecretaryOps([reminder()],state,'Stop my Example intake daily reminder at 8 AM.'),/cannot create/);
 assert.throws(()=>validateSecretaryOps([reminder()],state,'Remind me to take Example intake daily at 8 AM for 14 days.'),/start and end boundaries/);
});
test('Stopping an item must match both the named record and the requested action; daily acknowledgement is separate',async()=>{
 const db=secretaryFixture();db.tables.agent_secretary_deliveries.push({id:delivery,owner_id:owner,item_id:item,status:'saved',action_state:'open',kind:'reminder'});const state=await secretaryState(db,owner);
 assert.equal(validateSecretaryOps([{op:'control_item',id:item,status:'stopped',item_source:'Example intake'}],state,'Stop reminding me about Example intake.')[0].status,'stopped');
 assert.throws(()=>validateSecretaryOps([{op:'control_item',id:item,status:'active',item_source:'Example intake'}],state,'Stop Example intake.'),/matching administrative/);
 assert.throws(()=>validateSecretaryOps([{op:'control_item',id:item,status:'stopped',item_source:'another intake'}],state,'Stop another intake.'),/does not match/);
 assert.equal(validateSecretaryOps([{op:'ack_delivery',id:delivery,choice:'done',item_source:'Example intake'}],state,'I took Example intake.')[0].op,'ack_delivery');
 assert.throws(()=>validateSecretaryOps([{op:'ack_delivery',id:delivery,choice:'done',item_source:'Example intake'}],state,"I haven't taken Example intake."),/actually handled/);
});
test('Workout briefing copies only the saved sets and targets and reports absent plans clearly',async()=>{
 const db=secretaryFixture(),state=await secretaryState(db,owner);const empty=dailyBrief(state,new Date('2026-11-02T12:00:00Z'));assert.match(empty,/No saved workout/);assert.doesNotMatch(empty,/squats|bench press/i);
 state.items.push({id:bot,kind:'workout',status:'active',title:'Monday owner plan',details:'Leg press: 3 sets × 10 reps at the owner’s saved load.',weekdays:[1],timezone:'America/New_York'});const brief=dailyBrief(state,new Date('2026-11-02T12:00:00Z'));assert.match(brief,/3 sets × 10 reps/);assert.match(brief,/Completion not yet logged/);
 assert.throws(()=>validateSecretaryOps([{op:'save_item',title_source:'Leg press',days_source:'Monday',item:{kind:'workout',title:'Leg press',details:'5 sets of 20 at 200 pounds',weekdays:[1],timezone:'America/New_York',data:{}}}],state,'Save Leg press on Monday: 3 sets of 10.'),/Do not invent/);
});
test('Meeting briefs retain the three required parts, known roles, owner assets and actual email provenance',()=>{
 const event={title:'Planning meeting',details:'Review the saved plan.',data:{attendees:[{name:'Sam',email:'sam@example.invalid'}],notes:'Open the draft PDF.',objectives:'Resolve the launch date.'}};
 const brief=meetingBrief(event,{state:'read',messages:[{subject:'Agenda',text:'The pending decision is the launch date.'}]});for(const t of ['Context','Prep Assets','Objectives','role not supplied','Open the draft PDF.','Email: Agenda','Resolve the launch date.'])assert.ok(brief.includes(t));assert.match(meetingBrief(event),/Gmail reading is not enabled/);
});
test('Meeting email is never read without the secretary-specific permission or attendee addresses',async()=>{
 const state=await secretaryState(secretaryFixture(),owner);let called=0;const deps={readMeetingEmail:async()=>{called++;return [{subject:'Agenda',text:'An actual scoped email snippet'}]}};
 assert.equal((await scopedMeetingEmail(state,{data:{attendees:[{email:'sam@example.invalid'}]}},deps)).state,'not_enabled');assert.equal(called,0);state.settings.email_for_meetings=true;assert.equal((await scopedMeetingEmail(state,{data:{attendees:[]}},deps)).state,'no_attendees');assert.equal(called,0);
 assert.equal((await scopedMeetingEmail(state,{data:{attendees:[{email:'sam@example.invalid'}]},scheduled_at:'2026-12-01T15:00Z'},deps)).state,'read');assert.equal(called,1);
});
test('Secretary chat confirms actual saved changes instead of relaying an unexecuted model promise',async()=>{
 const db=secretaryFixture(),worker={id:bot};const response=await secretaryChat(db,owner,worker,'Remind me to take Example intake daily at 8 AM.',async()=>JSON.stringify({reply:'I have booked everything!',operations:[reminder()]}));assert.match(response.reply,/Saved: Example intake/);assert.doesNotMatch(response.reply,/booked/);assert.ok(db.calls.some(c=>c[0]==='apply_agent_secretary_ops'));
 const noChange=await secretaryChat(db,owner,worker,'Hello Eleanor',async()=>JSON.stringify({reply:'I have scheduled your medication.',operations:[]}));assert.match(noChange.reply,/No records changed/);
 const refusal=secretaryFixture();refusal.rpc=async()=>({data:false});await assert.rejects(()=>secretaryChat(refusal,owner,worker,'Hello',async()=>{throw Error('must not call provider')}),/allowance/);
});
test('The scheduler saves real notices under an owned lease and stays independent of AI calls',async()=>{
 const db=secretaryFixture();let claimed=false;db.rpc=async(name,args)=>{db.calls.push([name,args]);if(name==='claim_agent_secretary_delivery'&&!claimed){claimed=true;return {data:{id:delivery,owner_id:owner,item_id:item,item_version:1,kind:'reminder',scheduled_at:'2026-11-02T13:00Z',lease_id:bot,attempts:1}};}if(name==='claim_agent_secretary_delivery')return {data:null};if(name==='complete_agent_secretary_delivery')return {data:{state:'saved'}};return {data:true};};
 const result=await processSecretaryDue(db,[owner],{},true);assert.equal(result.saved,1);const commit=db.calls.find(c=>c[0]==='complete_agent_secretary_delivery')[1];assert.equal(commit.p_lease,bot);assert.match(commit.p_body,/Example intake/);assert.ok(!db.calls.some(c=>/reserve.*ai/.test(c[0])));assert.ok(db.tables.agent_secretary_settings[0].last_scheduler_at);
});
test('API authentication and the private scheduler credential do not accept caller-supplied owner scope',async()=>{
 const db=secretaryFixture(),handler=secretaryHandler(db,[owner],{}),post=(body,token)=>new Request('https://edge.invalid/agent-secretary',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 assert.equal((await handler(post({action:'state',owner_id:other}))).status,401);const response=await(await handler(post({action:'state',owner_id:other},'owner-session'))).json();assert.equal(response.settings.owner_id,owner);assert.equal(response.calendar_sync_connected,false);
 const tick=await handler(new Request('https://edge.invalid/agent-secretary?op=tick',{method:'POST',body:'{}'}));assert.equal(tick.status,401);
 const allowed=new Request('https://edge.invalid/agent-secretary?op=tick',{method:'POST',headers:{'x-agent-hq-runner-token':'a'.repeat(64)},body:JSON.stringify({owners:[other]})});assert.equal((await handler(allowed)).status,200);assert.deepEqual(db.calls.find(c=>c[0]==='prepare_agent_secretary_deliveries')[1].p_owners,[owner]);
});
test('Browser push endpoints cannot be redirected to arbitrary servers and device keys stay outside the public state',async()=>{
 const pub=Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth=Buffer.alloc(16,1).toString('base64url'),sub={endpoint:'https://web.push.apple.com/fixture-endpoint',keys:{p256dh:pub,auth}};
 assert.ok(validatePushSubscription(sub));for(const endpoint of ['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.evil.invalid/x','https://evil.invalid/push'])assert.throws(()=>validatePushSubscription({...sub,endpoint}),/Unsupported/);
 const state=await secretaryState(secretaryFixture(),owner);assert.ok(!JSON.stringify(state).includes('private_key'));
});
test('Real Web Push encryption sends a generic notice and records acceptance separately from acknowledgement',async()=>{
 const require=createRequire(import.meta.url),lib=require(require.resolve('web-push',{paths:[process.env.ELEANOR_TEST_NODE_MODULES||process.cwd()]})),keys=lib.generateVAPIDKeys(),deviceKeys=lib.generateVAPIDKeys(),db=secretaryFixture();db.tables.agent_secretary_push_keys.push({singleton:true,public_key:keys.publicKey,private_key:keys.privateKey});
 db.tables.agent_secretary_push_subscriptions.push({id:bot,owner_id:owner,active:true,endpoint:'https://web.push.apple.com/fixture-endpoint',p256dh:deviceKeys.publicKey,auth_key:Buffer.alloc(16,3).toString('base64url')});db.tables.agent_secretary_deliveries.push({id:delivery,owner_id:owner,item_id:item,item_version:1,kind:'reminder',status:'saved',action_state:'open',push_state:'pending',next_push_at:new Date(0).toISOString(),push_attempts:0});
 let requests=0;await sendSecretaryPush(db,[owner],async(url,options)=>{requests++;assert.equal(url,'https://web.push.apple.com/fixture-endpoint');assert.ok(options.headers.Authorization||options.headers.authorization);assert.equal(Buffer.from(options.body).includes(Buffer.from('Example intake')),false);assert.ok(options.body.length>100);return new Response(null,{status:201});},lib);
 assert.equal(requests,1);assert.equal(db.tables.agent_secretary_deliveries[0].push_state,'accepted');assert.equal(db.tables.agent_secretary_deliveries[0].action_state,'open');
});
