import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readChatInput} from '../supabase/functions/agent-social-read/chat-policy.ts';
test('direct text approvals and stop phrases are deterministic',()=>{
 for(const text of ['approved','Approved!','authorized','you’re authorized','green light','go ahead'])assert.equal(readChatInput(text).intent,'approve',text);
 for(const text of ['stop','denied','not approved','do not approve','red light',"don't do it"])assert.equal(readChatInput(text).intent,'deny',text);
 for(const text of ['approved if the page is mine','not yet approved','say approved to continue','"approved"','I have not approved','yes, but only if it is safe','please do not check Facebook'])assert.notEqual(readChatInput(text).intent,'approve',text);
});
test('profile questions, URL replies and numbered decisions cannot themselves approve a read',()=>{
 assert.equal(readChatInput('Riley check my Facebook profile').intent,'request');
 const link=readChatInput('https://m.facebook.com/profile.php?id=123&fbclid=tracking');assert.equal(link.intent,'other');assert.equal(link.source_url,'https://www.facebook.com/profile.php?id=123');
 assert.equal(readChatInput('1').intent,'other');assert.equal(readChatInput('1').choice,1);
 assert.equal(readChatInput('approve 2').intent,'approve');assert.equal(readChatInput('approve 2').choice,2);
 assert.equal(readChatInput('Check https://www.facebook.com.evil.test/profile').source_url,null);
 assert.equal(readChatInput('Continue').intent,'continue');
});

import fs from 'node:fs';
import vm from 'node:vm';
test('Riley routes text through contextual reading decisions; other workers and public research keep their routes',async()=>{
 const source=fs.readFileSync(new URL('../agent-messages-cloud.js',import.meta.url),'utf8');
 const part=source.slice(source.indexOf('async function converse('),source.indexOf('async function deleteMessage('));
 const calls=[];let handled=true;
 const context={employees:new Set(['riley','alex']),getUser:async()=>({id:'owner'}),refresh:async()=>{},window:{agentHQSocialReadCloud:{handleChat:async text=>{calls.push({kind:'social',text});return {handled,success:true}}}},agentCloud:{functions:{invoke:async(name,args)=>{calls.push({kind:name,body:args.body});return {data:{success:true}}}}}};
 vm.createContext(context);vm.runInContext(part+'\nthis.run=converse;',context);
 await context.run('riley','approved');assert.equal(calls.length,1);assert.equal(calls[0].kind,'social');
 calls.length=0;await context.run('alex','approved');assert.equal(calls[0].kind,'agent-hq-converse');
 calls.length=0;await context.run('riley','research public facts',{research:true});assert.equal(calls[0].body.action,'request_research');
 calls.length=0;handled=false;await context.run('riley','How are you?');assert.deepEqual(calls.map(x=>x.kind),['social','agent-hq-converse']);
});
