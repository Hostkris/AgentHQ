import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {checkHost} from '../supabase/functions/agent-browser-host/provider.ts';
test('missing secrets are named without any provider call or secret disclosure',async()=>{
 let called=false;const r=await checkHost('','',async()=>{called=true});assert.equal(called,false);assert.deepEqual(r.missing,['BROWSERBASE_API_KEY','BROWSERBASE_PROJECT_ID']);assert.equal(r.execution_enabled,false);assert.equal(r.facebook_connected,false);
});
test('validates project with a read-only GET and never returns key or raw provider data',async()=>{
 let request;const r=await checkHost('private-test-key','project_123',async(url,options)=>{request={url,options};return Response.json({id:'project_123',name:'Private project',ownerId:'private-user',secret:'private-test-key'})});
 assert.equal(r.host_ready,true);assert.equal(r.facebook_connected,false);assert.equal(r.execution_enabled,false);assert.equal(request.url,'https://api.browserbase.com/v1/projects/project_123');assert.equal(request.options.method,undefined);assert.equal(request.options.redirect,'error');assert(!JSON.stringify(r).includes('private-test-key'));assert(!JSON.stringify(r).includes('Private project'));
});
test('rejected keys, project mismatch, network failure and bad IDs never appear connected',async()=>{
 for(const fetcher of [async()=>new Response('{}',{status:401}),async()=>Response.json({id:'wrong-project'}),async()=>{throw Error('network')}])assert.equal((await checkHost('key','project_123',fetcher)).host_ready,false);
 let called=false;assert.equal((await checkHost('key','../escape',async()=>{called=true})).host_ready,false);assert.equal(called,false);
});
function handlerHarness(allowed=true){
 let handler,checks=0;const key='private-host-key';
 const code=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/agent-browser-host/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 vm.runInNewContext(code,{Request,Response,checkHost:async()=>{checks++;return {host_ready:true,execution_enabled:false}},createClient:()=>({auth:{getUser:async token=>({data:token==='valid'?{user:{id:'owner'}}:{user:null},error:token==='valid'?null:{message:'Expired'}})}}),Deno:{env:{get:k=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service-key',AGENT_HQ_ALLOWED_OWNER_IDS:allowed?'owner':'someone-else',BROWSERBASE_API_KEY:key,BROWSERBASE_PROJECT_ID:'project_123'})[k]},serve:fn=>handler=fn}});
 return {get checks(){return checks},call:(body,token='valid',origin='https://hostkris.github.io')=>handler(new Request('https://example.supabase.co/functions/v1/agent-browser-host',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('endpoint enforces sign-in, owner allowlist and origin before checking the host',async()=>{
 const h=handlerHarness();assert.equal((await h.call({action:'check'},'expired')).status,401);assert.equal((await h.call({action:'check'},'valid','https://untrusted.example')).status,403);assert.equal(h.checks,0);
 const denied=handlerHarness(false);assert.equal((await denied.call({action:'check'})).status,403);assert.equal(denied.checks,0);
 assert.equal((await h.call({action:'check'})).status,200);assert.equal(h.checks,1);
});
test('no create-session, Facebook publishing or messaging action is accepted',async()=>{
 const h=handlerHarness();for(const action of ['connect','start_session','publish','send_message','approve'])assert.equal((await h.call({action})).status,400);assert.equal(h.checks,0);
});

test('free-only policy is explicit and no project result authorizes billable execution',async()=>{
 for(const result of [await checkHost('',''),await checkHost('key','project_123',async()=>Response.json({id:'project_123',plan:'paid'}))]){
  assert.equal(result.free_tier_only,true);assert.equal(result.paid_usage_allowed,false);assert.equal(result.free_plan_verified,false);assert.equal(result.execution_enabled,false);
 }
});
