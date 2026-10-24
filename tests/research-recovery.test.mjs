import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {ResearchProviderError,researchFailureInfo} from '../agent-research-status.js';
import {providerResearchError} from '../supabase/functions/_shared/research-provider.ts';
import {fetchPublicEvidence,roleWebProfile,researchForRole} from '../supabase/functions/_shared/role-research.ts';
import {researchStatus,researchEvidence} from '../supabase/functions/agent-hq-converse/research.ts';
import {handleResearchCheck} from '../supabase/functions/agent-hq-research-check/handler.ts';
const profile=roleWebProfile('casey'),owner='11111111-1111-4111-8111-111111111111';
const evidence={choices:[{finish_reason:'stop',message:{content:'Official YouTube guidance: https://support.google.com/youtube/answer/15424877 . Unsupported: https://invented.example/claim',executed_tools:[{type:'browser_search',search_results:{results:[{url:'https://support.google.com/youtube/answer/15424877',title:'YouTube Help'}]},output:'Unrelated endpoint https://api.example/search'}]}}]};

test('model access is reported separately from proof of an actual browser search',async()=>{
 let calls=0;const status=await researchStatus('synthetic',async url=>{calls++;assert.match(url,/\/models$/);return Response.json({data:[{id:'openai/gpt-oss-120b',active:true}]});});
 assert.equal(calls,1);assert.equal(status.model_access,true);assert.equal(status.tool,'browser_search');assert.equal(status.live_search_verified,false);assert.match(status.message,/does not run a search/);
});
test('structured provider sources take priority over incidental tool text and model-invented URLs',()=>{
 assert.deepEqual(researchEvidence(evidence.choices[0].message),[{url:'https://support.google.com/youtube/answer/15424877',title:'YouTube Help'}]);
 assert.throws(()=>researchEvidence({content:'I searched https://invented.example',executed_tools:[{type:'code_interpreter',output:'https://invented.example'}]}),{code:'no_evidence'});
});
for(const [status,code] of [[400,'request_rejected'],[401,'authentication'],[403,'permission'],[404,'model_unavailable'],[429,'rate_limited'],[500,'provider_unavailable'],[503,'provider_unavailable']])
 test('HTTP '+status+' explains the failure without leaking provider payloads or switching providers',async()=>{
  let calls=0;await assert.rejects(fetchPublicEvidence({key:'synthetic',profile,query:'YouTube Shorts official guidance',purpose:'Public guidance',fetcher:async(url,req)=>{
   calls++;assert.match(url,/^https:\/\/api\.groq\.com\//);assert.equal(JSON.parse(req.body).tool_choice,'required');
   return Response.json({error:{code:'invalid_request_error',param:'tool_choice',message:'gsk_PRIVATE private-owner@example.com https://invented.example secret query'}},{status,headers:{'Retry-After':'120'}});
  }}),error=>{assert.equal(error.code,code);assert(!/PRIVATE|private-owner|invented.example|secret query/.test(error.message));assert.equal(researchFailureInfo(error).retryLabel,'Retry research');return true;});assert.equal(calls,1);
 });
test('only whitelisted field names survive an invalid request explanation',async()=>{
 assert.match((await providerResearchError(Response.json({error:{param:'tool_choice',message:'private text'}},{status:400}))).message,/Field: tool_choice/);
 assert(!((await providerResearchError(Response.json({error:{param:'gsk_PRIVATE',message:'private text'}},{status:400}))).message.includes('PRIVATE')));
 assert(!researchFailureInfo('Unexpected provider response gsk_PRIVATE https://invented.example').message.includes('PRIVATE'));
 assert.equal(researchFailureInfo(new ResearchProviderError('request_rejected')).requiresOwner,false);
 assert.equal(researchFailureInfo(new ResearchProviderError('authentication')).requiresOwner,true);
});
test('429 Retry-After survives persistence and is bounded without an immediate second call',async()=>{
 const start=Date.now(),error=await providerResearchError(new Response('{}',{status:429,headers:{'Retry-After':'120'}}));
 assert(Date.parse(error.retryAt)>=start+119000);assert(Date.parse(error.retryAt)<=Date.now()+121000);
 assert.equal(researchFailureInfo(error.message.slice(0,300)).retryAt,error.retryAt);
 const huge=await providerResearchError(new Response('{}',{status:429,headers:{'Retry-After':'999999999'}}));assert(Date.parse(huge.retryAt)<=Date.now()+21600000);
});
test('network interruptions and timeouts do not return an invented evidence report',async()=>{
 for(const failure of [new TypeError('fetch failed gsk_PRIVATE'),new DOMException('secret topic','TimeoutError')]){
  await assert.rejects(fetchPublicEvidence({key:'synthetic',profile,query:'YouTube official guidance',purpose:'Public guidance',fetcher:async()=>{throw failure;}}),error=>{assert(['network','timeout'].includes(error.code));assert(!/PRIVATE|secret topic/.test(error.message));return true;});
 }
});
test('no evidence, truncation and unconfirmed saves remain failed with no source-backed success',async()=>{
 for(const [payload,code,saveFails] of [[{choices:[{message:{content:'Fake citation https://invented.example'}}]},'no_evidence',false],[{choices:[{...evidence.choices[0],finish_reason:'length'}]},'incomplete',false],[evidence,'save_failed',true]]){
  const writes=[],calls=[];const db={from(){const q={update(v){writes.push(v);return q},eq(){return q},then(resolve){return Promise.resolve({}).then(resolve)}};return q;},async rpc(name){calls.push(name);return name==='begin_agent_role_research'?{data:{state:'claimed',job_id:'saved-job'}}:saveFails?{error:{message:'private DB payload'}}:{data:{state:'completed'}};}};
  await assert.rejects(researchForRole({db,owner,worker:'casey',task:'YouTube Shorts guidance',query:'YouTube Shorts guidance',purpose:'Public guidance',context:{},key:'synthetic',fetcher:async()=>Response.json(payload)}),{code});
  assert.equal(writes[0].status,'failed');assert(!writes[0].report);assert(!writes[0].sources);assert(!writes[0].error.includes('private DB payload'));
  assert.equal(calls.includes('finish_agent_role_research'),saveFails);
 }
});

function retryHarness(jobs){
 let account='owner-a';const handlers=[],invocations=[],starts=[];
 const db={auth:{getUser:async()=>({data:{user:{id:account}}}),onAuthStateChange:fn=>handlers.push(fn)},from(table){let filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},then(resolve){const rows=table==='agent_role_research'?jobs.filter(j=>filters.every(([k,v])=>j[k]===v)):[];return Promise.resolve({data:structuredClone(rows)}).then(resolve);}};return q;},rpc:async()=>({data:[]}),functions:{async invoke(name,{body}){invocations.push(body);return {data:{success:true,reply:'Saved retry result'}};}}};
 const window={addEventListener(){},agentHQProjects:{start:async id=>starts.push(id)}};
 const source=readFileSync(new URL('../agent-messages-cloud.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{agentCloud:db,connectMessageControls(){},window,document:{addEventListener(){}},setInterval(){},setTimeout(){},console});
 return {retry:window.agentHQResearchCloud.retry,invocations,starts,switchAccount(id){account=id;handlers.forEach(fn=>fn());}};
}
test('history retry uses the same worker and saved topic and coalesces repeated clicks',async()=>{
 const h=retryHarness([{id:'job',owner_id:'owner-a',employee_id:'casey',query:'YouTube Shorts official guidance',status:'failed'}]);
 await Promise.all([h.retry('job'),h.retry('job')]);assert.equal(h.invocations.length,1);assert.equal(h.invocations[0].employee_id,'casey');assert.equal(h.invocations[0].text,'YouTube Shorts official guidance');assert.equal(h.invocations[0].action,'role_research');
});
test('a failed direct search already recovering as a project reuses that project',async()=>{
 const h=retryHarness([{id:'job',owner_id:'owner-a',employee_id:'riley',query:'Market research',status:'failed',recovery_assignment_id:'same-project'}]);
 await h.retry('job');assert.deepEqual(h.starts,['same-project']);assert.equal(h.invocations.length,0);
});
test('history retry rejects completed, unknown and other-owner requests and account changes',async()=>{
 const h=retryHarness([{id:'done',owner_id:'owner-a',employee_id:'riley',query:'Research',status:'completed'},{id:'private',owner_id:'owner-b',employee_id:'riley',query:'Private topic',status:'failed'},{id:'job',owner_id:'owner-a',employee_id:'riley',query:'Research',status:'failed'}]);
 for(const id of ['done','unknown','private'])await assert.rejects(h.retry(id));
 const pending=h.retry('job');h.switchAccount('owner-b');await assert.rejects(pending,/account changed/);assert.equal(h.invocations.length,0);
});

function probeHarness(authorized=true){
 const calls=[];const db={rpc:async()=>({data:authorized}),from(table){let row;const q={upsert(v){row=v;return q},insert(v){row=v;return q},select(){return q},single:async()=>({data:{id:crypto.randomUUID(),...row}})};return q;}};
 const deps={db,allowedOwners:owner,key:'synthetic',checkStatus:async()=>({ready:true,model_access:true,live_search_verified:false}),research:async options=>{calls.push(options);return {state:'completed',sources:[{url:'https://example.com/official',title:'Official'}]};}};
 const request=body=>new Request('https://synthetic.invalid/check',{method:'POST',headers:{'x-agent-hq-runner-token':'a'.repeat(64)},body:JSON.stringify(body||{})});return {calls,deps,request};
}
test('private live check tests Riley and Casey through fixed, authorized, budgeted research requests',async()=>{
 const h=probeHarness(),result=await (await handleResearchCheck(h.request({owner:'other',model:'paid-model',query:'private account balance',budget:999}),h.deps)).json();
 assert.equal(result.verified,true);assert.deepEqual(h.calls.map(c=>c.worker),['riley','casey']);assert(h.calls.every(c=>c.owner===owner&&c.context.message_id&&!('budget' in c)));assert.match(h.calls[0].query,/Groq/);assert.match(h.calls[1].query,/YouTube/);
});
test('private live check requires its credential and cannot mistake model access or failures for search success',async()=>{
 let h=probeHarness(false);assert.equal((await handleResearchCheck(h.request(),h.deps)).status,401);assert.equal(h.calls.length,0);
 h=probeHarness();h.deps.research=async()=>{throw Error('gsk_PRIVATE source https://invented.example')};let result=await (await handleResearchCheck(h.request(),h.deps)).json();assert.equal(result.verified,false);assert(result.tests.every(t=>t.state==='failed'&&t.sources.length===0&&!t.message.includes('PRIVATE')));
 h.deps.research=async()=>({state:'budget',message:'Allowance resets later'});result=await (await handleResearchCheck(h.request(),h.deps)).json();assert.equal(result.verified,false);assert(result.tests.every(t=>t.state==='budget'&&t.sources.length===0));
});
