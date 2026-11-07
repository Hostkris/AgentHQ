import {CHATGPT_POLICY,chatGPTRequested} from '../agent-chatgpt-app-core.js';
import {requestChatGPT,chatGPTRequestReply} from '../supabase/functions/_shared/chatgpt-requests.ts';
import {CONSULTING_POLICY,consultingRequested} from '../agent-consulting-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {ELEANOR_SPEC,ELEANOR_TEMPLATE,ELEANOR_INSTRUCTION_LIMIT} from '../eleanor-secretary-core.js';

// Exercise the real authenticated save route, including validation before insertion.
function studio(){
 let handler;const saved=[],owner='11111111-1111-4111-8111-111111111111';
 const db={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(table){
  assert.equal(table,'agent_custom_bots');let row;const q={
   select(){return q},eq(key,value){assert.equal(key,'owner_id');assert.equal(value,owner);return q},
   insert(value){row=value;return q},
   async single(){saved.push(row);return {data:{id:'new-worker',name:row.name,status:row.status}}},
   then(resolve,reject){return Promise.resolve({count:saved.length,error:null}).then(resolve,reject)}
  };return q;
 }};
 const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/agent-bot-studio/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 vm.runInNewContext(source,{CHATGPT_POLICY,chatGPTRequested,requestChatGPT,chatGPTRequestReply,CONSULTING_POLICY,consultingRequested,ELEANOR_TEMPLATE,ELEANOR_INSTRUCTION_LIMIT,createClient:()=>db,
  Request,Response,URL,AbortController,setTimeout,clearTimeout,
  fetch:()=>{throw Error('Saving instructions must not call an AI provider')},
  Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'})[key]}}
 });
 return {saved,async save(instructions,template_key=ELEANOR_TEMPLATE){
  const response=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},
   body:JSON.stringify({action:'save',template_key,spec:{...ELEANOR_SPEC,instructions}})}));
  return {status:response.status,...await response.json()};
 }};
}

test('Eleanor saves her complete standing instructions without dropping the final protocols',async()=>{
 const h=studio(),response=await h.save(ELEANOR_SPEC.instructions);
 assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.saved,true);
 assert.ok(ELEANOR_SPEC.instructions.length>4500);assert.equal(h.saved[0].instructions,ELEANOR_SPEC.instructions);
 assert.equal(h.saved[0].template_key,ELEANOR_TEMPLATE);
});
test('Eleanor accepts her exact capacity and rejects overflow before any database write',async()=>{
 const h=studio();assert.equal((await h.save('x'.repeat(ELEANOR_INSTRUCTION_LIMIT))).status,200);
 const response=await h.save('x'.repeat(ELEANOR_INSTRUCTION_LIMIT+1));
 assert.equal(response.status,400);assert.match(response.error,/8000 characters/);assert.equal(h.saved.length,1);
 assert.equal(h.saved[0].instructions.length,ELEANOR_INSTRUCTION_LIMIT);
});
test('ordinary workers retain their existing capacity without silently truncating overflow',async()=>{
 const h=studio();assert.equal((await h.save('x'.repeat(4500),'')).status,200);
 const response=await h.save('x'.repeat(4501),'');assert.equal(response.status,400);
 assert.match(response.error,/4500 characters/);assert.equal(h.saved.length,1);assert.equal(h.saved[0].instructions.length,4500);
});
test('only the exact Eleanor template receives the larger instruction capacity',async()=>{
 const h=studio(),response=await h.save(ELEANOR_SPEC.instructions,ELEANOR_TEMPLATE+'-other');
 assert.equal(response.status,400);assert.match(response.error,/4500 characters/);assert.equal(h.saved.length,0);
});
test('instruction counts agree with Postgres for Unicode text at both boundaries',async()=>{
 const h=studio(),text='👩'.repeat(ELEANOR_INSTRUCTION_LIMIT);
 assert.equal((await h.save(text)).status,200);assert.equal(h.saved[0].instructions,text);
 assert.equal((await h.save(text+'👩')).status,400);
 assert.equal((await h.save('👩'.repeat(19))).status,400);assert.equal(h.saved.length,1);
});
