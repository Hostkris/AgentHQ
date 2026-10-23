import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {capturePacket,socialUrl} from '../supabase/functions/agent-social-read/policy.ts';
const token='1'.repeat(64),sourceUrl='https://www.facebook.com/example';
const capture={kind:'agenthq.safari-page.v1',url:sourceUrl,text:'Controlled example text, not private Facebook data. '.repeat(3),captured_at:new Date().toISOString()};
function harness({resolve=true,claim=true,finish=true,allowed=true}={}){
 let handler,fetches=0;const calls=[];
 const read=path=>stripTypeScriptTypes(fs.readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export async function/g,'async function'));
 const db={rpc:async(name,args)=>{calls.push({name,...args});
  if(name==='agent_social_read_handoff')return resolve?{data:{id:'job',owner_id:'owner',source_url:sourceUrl}}:{data:null};
  if(args.p_action==='claim'&&!claim||args.p_action==='finish'&&!finish)return {error:{message:'Permission revoked'}};
  return {data:{purpose:'Review the supplied page',source_url:sourceUrl}};
 }};
 vm.runInNewContext(read('../supabase/functions/_shared/social-read-analysis.ts')+'\n'+read('../supabase/functions/agent-safari-bridge/index.ts'),{Request,Response,URL,AbortSignal,crypto,TextEncoder,Uint8Array,capturePacket,socialUrl,createClient:()=>db,fetch:async()=>{fetches++;return Response.json({choices:[{message:{content:'A controlled report'},finish_reason:'stop'}]})},Deno:{env:{get:k=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',AGENT_HQ_ALLOWED_OWNER_IDS:allowed?'owner':'other',GROQ_API_KEY:'test-only'})[k]},serve:fn=>handler=fn}});
 return {calls,get fetches(){return fetches},call:(body,auth=token,origin='https://www.facebook.com')=>handler(new Request('https://example.supabase.co/functions/v1/agent-safari-bridge',{method:'POST',headers:{Origin:origin,...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)}))};
}
test('missing, malformed and unknown capabilities cannot reach analysis',async()=>{
 for(const auth of ['', 'owner-jwt','a'.repeat(63)]){const h=harness();assert.equal((await h.call({action:'analyze',capture},auth)).status,401);assert.equal(h.calls.length,0);assert.equal(h.fetches,0)}
 const h=harness({resolve:false});assert.equal((await h.call({action:'analyze',capture,source_url:sourceUrl})).status,401);assert.equal(h.fetches,0);
});
test('origin, owner allowlist, exact page and unsupported actions fail closed',async()=>{
 const h=harness();assert.equal((await h.call({action:'check',source_url:sourceUrl},token,'https://evil.test')).status,403);assert.equal(h.calls.length,0);
 for(const action of ['publish','send_message','issue','approve','navigate'])assert.equal((await h.call({action})).status,400);
 assert.equal((await h.call({action:'check',source_url:'https://www.facebook.com/another'})).status,403);
 assert.equal((await harness({allowed:false}).call({action:'check',source_url:sourceUrl})).status,403);assert.equal(h.fetches,0);
});
test('checking approval does not consume the request or return private account data',async()=>{
 const h=harness(),r=await h.call({action:'check',source_url:sourceUrl});assert.equal(r.status,200);assert.deepEqual(await r.json(),{success:true,ready:true});assert.equal(h.fetches,0);assert.equal(h.calls.length,1);assert.equal((await h.call({action:'check',source_url:sourceUrl},token,'safari-web-extension://example-extension')).status,200);assert.match(h.calls[0].p_hash,/^[0-9a-f]{64}$/);assert.notEqual(h.calls[0].p_hash,token);
});
test('a live atomic approval claim is required before Groq sees any text',async()=>{
 const blocked=harness({claim:false});assert.equal((await blocked.call({action:'analyze',source_url:sourceUrl,capture})).status,400);assert.equal(blocked.fetches,0);
 const h=harness();assert.equal((await h.call({action:'analyze',source_url:sourceUrl,capture})).status,200);assert.equal(h.fetches,1);assert.deepEqual(h.calls.map(c=>c.p_action),['resolve','claim','finish']);assert(!JSON.stringify(h.calls).includes(capture.text));
});
test('revocation during analysis cannot save a result and never triggers a provider retry',async()=>{
 const h=harness({finish:false}),r=await h.call({action:'analyze',source_url:sourceUrl,capture});assert.equal(r.status,400);assert.match((await r.json()).error,/revoked/);assert.equal(h.fetches,1);assert.deepEqual(h.calls.map(c=>c.p_action),['resolve','claim','finish','fail']);
});
