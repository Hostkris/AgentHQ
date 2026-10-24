import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {socialUrl,capturePacket} from '../supabase/functions/agent-social-read/policy.ts';
import {readChatInput} from '../supabase/functions/agent-social-read/chat-policy.ts';
test('URLs retain page identity and discard tracking, credentials and unsafe destinations',()=>{
 assert.equal(socialUrl('https://m.facebook.com/profile.php?id=123&fbclid=tracking#x'),'https://www.facebook.com/profile.php?id=123');
 for(const u of ['https://facebook.com.evil.test/a','http://www.facebook.com/a','https://user:secret@facebook.com/a','https://www.facebook.com/login/','https://www.facebook.com/checkpoint/','https://facebook.com:444/a','javascript:alert(1)'])assert.throws(()=>socialUrl(u));
 assert.equal(socialUrl('https://messenger.com/t/123/'),'https://www.messenger.com/t/123');
});
test('capture import validates kind, text size, exact source and capture freshness',()=>{
 const now=Date.now(),packet={kind:'agenthq.safari-page.v1',url:'https://www.facebook.com/example/',text:'Visible example page content. '.repeat(4),captured_at:new Date(now).toISOString()};
 assert.equal(capturePacket(packet,now).source_url,'https://www.facebook.com/example');
 for(const update of [{kind:'unknown'},{text:'short'},{text:'x'.repeat(24001)},{captured_at:'invalid'},{captured_at:new Date(now-21*60*1000).toISOString()},{url:'https://www.facebook.com/recover/initiate'}])assert.throws(()=>capturePacket({...packet,...update},now));
});
const requestId='00000000-0000-4000-8000-000000000001';
function harness({ownerAllowed=true,loggedIn=true,claimError=false}={}){
 let handler,calls=[],fetches=0;const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/agent-social-read/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 const engine=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/_shared/social-read-analysis.ts',import.meta.url),'utf8').replace('export async function','async function'));
 vm.runInNewContext(engine+'\n'+source,{Request,Response,URL,AbortSignal,crypto,TextEncoder,Uint8Array,socialUrl,capturePacket,readChatInput,fetch:async()=>{fetches++;return Response.json({choices:[{message:{content:'Observed excerpt and a suggested draft.'},finish_reason:'stop'}]})},createClient:()=>({auth:{getUser:async()=>({data:{user:loggedIn?{id:'owner'}:null}})},rpc:async(name,args)=>{calls.push(args);return args.p_action==='claim'&&claimError?{error:{message:'Approval required'}}:{data:{purpose:'Review the supplied page',source_url:'https://www.facebook.com/example'}}}}),Deno:{env:{get:k=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',AGENT_HQ_ALLOWED_OWNER_IDS:ownerAllowed?'owner':'other',GROQ_API_KEY:'private-test-key'})[k]},serve:fn=>handler=fn}});
 return {get calls(){return calls},get fetches(){return fetches},call:(body,origin='https://hostkris.github.io')=>handler(new Request('https://example/functions/v1/agent-social-read',{method:'POST',headers:{Authorization:'Bearer example',Origin:origin},body:JSON.stringify(body)}))};
}
test('auth, owner and origin checks precede every permission or AI action',async()=>{
 for(const opts of [{loggedIn:false},{ownerAllowed:false}]){const h=harness(opts),r=await h.call({action:'approve',id:requestId});assert([401,403].includes(r.status));assert.equal(h.calls.length,0);assert.equal(h.fetches,0)}
 const h=harness();assert.equal((await h.call({action:'approve',id:requestId},'https://evil.test')).status,403);assert.equal(h.calls.length,0);
});
test('denial and unsupported sending actions never invoke AI',async()=>{
 const h=harness();assert.equal((await h.call({action:'deny',id:requestId})).status,200);assert.equal(h.calls[0].p_action,'deny');
 for(const action of ['publish','send_message','start_session','read_cookies'])assert.equal((await h.call({action,id:requestId})).status,400);
 assert.equal(h.fetches,0);
});
test('the server must claim a live approval before an excerpt reaches Groq',async()=>{
 const capture={kind:'agenthq.safari-page.v1',url:'https://www.facebook.com/example',text:'An example excerpt for a controlled test. '.repeat(3),captured_at:new Date().toISOString()};
 const denied=harness({claimError:true});assert.equal((await denied.call({action:'analyze',id:requestId,capture})).status,400);assert.equal(denied.fetches,0);
 const h=harness();assert.equal((await h.call({action:'analyze',id:requestId,capture})).status,200);assert.equal(h.fetches,1);assert.deepEqual(h.calls.map(c=>c.p_action),['claim','finish']);assert(!JSON.stringify(h.calls).includes(capture.text));
});

test('chat decisions are parsed on the owner server and never accept client-supplied intent',async()=>{
 const h=harness();assert.equal((await h.call({action:'chat',text:'approved if I agree',intent:'approve'})).status,200);assert.equal(h.calls[0].p_data.intent,'other');assert.equal(h.fetches,0);
 for(const opts of [{loggedIn:false},{ownerAllowed:false}]){const blocked=harness(opts);assert([401,403].includes((await blocked.call({action:'chat',text:'approved'})).status));assert.equal(blocked.calls.length,0)}
});
