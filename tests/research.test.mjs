import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicURL,validateResearchQuery,researchEvidence,runResearch,researchStatus} from '../supabase/functions/agent-hq-converse/research.ts';
const topic='Compare current public options for a small business website';
const evidence={choices:[{finish_reason:'stop',message:{content:'A finding from https://example.com/research and https://invented.example/fake',executed_tools:[{type:'browser.search',search_results:{results:[{title:'Primary source',url:'https://example.com/research'}]}}]}}]};
function mockDB({claimed=true,save=true}={}){
 const calls=[];return {calls,from(table){const chain={select(){return chain},order(){return chain},limit(){return chain},maybeSingle:async()=>({data:null,error:null}),upsert(){return chain},single:async()=>({data:{id:'manager-chat'},error:null}),insert(value){calls.push({table,value});return chain},update(value){calls.push({table,value});return chain},eq(){return chain},then(resolve){resolve({error:null})}};return chain},async rpc(name,args){calls.push({name,args});if(name==='claim_agent_research')return claimed?{data:{query:topic}}:{error:{message:'Already used'}};return save?{data:true}:{error:{message:'Save failed'}}}};
}
test('rejects credential URLs, private literals, unusual schemes and token links',()=>{
 for(const url of ['http://127.0.0.1','http://0x7f000001','http://10.0.0.1','http://[::1]','https://host.internal','http://localhost','https://u:p@example.com','javascript:alert(1)','https://example.com/?access_token=secret'])assert.equal(publicURL(url),null,url);
 assert.equal(publicURL('https://example.com/research'),'https://example.com/research');
 assert.throws(()=>validateResearchQuery('Read http://192.168.1.2/private'));
});
test('requires actual search metadata and takes sources only from executed tools',()=>{
 assert.throws(()=>researchEvidence({content:'I searched https://invented.example'}),/did not confirm/);
 assert.throws(()=>researchEvidence({executed_tools:[{type:'search',output:'Nothing found'}]}),/no verifiable/);
 assert.deepEqual(researchEvidence(evidence.choices[0].message),[{title:'Primary source',url:'https://example.com/research'}]);
 assert.equal(researchEvidence({executed_tools:[{type:'browser.open',output:'Source: https://example.com/docs'}]})[0].url,'https://example.com/docs');
});
test('search uses only the approved topic, with no account or execution tools',async()=>{
 const db=mockDB();let sent;
 const report=await runResearch(db,'owner','riley','job','test-key',async(url,request)=>{sent=JSON.parse(request.body);return Response.json(evidence)});
 assert.deepEqual(sent.tools,[{type:'browser_search'}]);assert.equal(sent.tool_choice,'required');assert.equal(sent.messages.length,2);const input=JSON.parse(sent.messages[1].content);assert.equal(input.approved_topic,topic);assert.equal(input.prior_same_topic_report,null);
 assert.match(report,/saved the full report/i);const stored=db.calls.find(c=>c.name==='finish_agent_research').args.p_report;assert.match(stored,/Verified search sources/);assert(!stored.includes('invented.example'));
 assert.equal(db.calls.filter(c=>c.name==='finish_agent_research').length,1);
});
test('one-use claim prevents repeat provider calls',async()=>{
 let calls=0;await assert.rejects(runResearch(mockDB({claimed:false}),'owner','riley','job','test-key',async()=>{calls++;return Response.json(evidence)}),/Already used/);assert.equal(calls,0);
});
test('provider and evidence failures leave a failed run, never a completed report',async()=>{
 for(const response of [new Response('{}',{status:429}),Response.json({choices:[{message:{content:'Unsupported answer'}}]})]){
  const db=mockDB();await assert.rejects(runResearch(db,'owner','riley','job','test-key',async()=>response));
  assert.equal(db.calls.filter(c=>c.name==='finish_agent_research').length,0);
  assert(db.calls.some(c=>c.value?.status==='failed'));
 }
});
test('save failure is not reported as success; missing key never calls a provider',async()=>{
 await assert.rejects(runResearch(mockDB({save:false}),'owner','riley','job','test-key',async()=>Response.json(evidence)),/could not be saved/);
 let called=false;await assert.rejects(runResearch(mockDB(),'owner','riley','job','',async()=>{called=true}),/GROQ_API_KEY/);assert.equal(called,false);
});
test('connection check verifies model access without a generation request',async()=>{
 let endpoint;const status=await researchStatus('test-key',async url=>{endpoint=url;return Response.json({data:[{id:'openai/gpt-oss-120b',active:true}]})});assert.equal(status.ready,true);assert(endpoint.endsWith('/models'));assert.equal((await researchStatus('')).ready,false);
});

import vm from 'node:vm';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createResearchRequest,isResearchInstruction,researchApproval} from '../supabase/functions/agent-hq-converse/research.ts';
function chatHarness(){
 const owner='11111111-1111-4111-8111-111111111111';
 const tables={agent_conversations:[],agent_messages:[],agent_chat_states:[],agent_research_jobs:[]};let serial=0,searchCalls=0;
 const db={auth:{getUser:async token=>token==='valid'?{data:{user:{id:owner}}}:{data:{user:null},error:{message:'expired'}}},from(name){
  const table=tables[name]??(tables[name]=[]);let rows=table,update=null,insert=null,upsert=null;
  const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},gt(k,v){rows=rows.filter(r=>r[k]>v);return q},gte(){return q},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},update(v){update=v;return q},insert(v){insert=v;return q},upsert(v){upsert=v;return q},single(){return q.finish(true)},maybeSingle(){return q.finish(true)},then(resolve,reject){return q.finish(false).then(resolve,reject)},async finish(one){
   if(insert){const r={id:'id-'+(++serial),status:'pending',expires_at:new Date(Date.now()+900000).toISOString(),...insert};table.push(r);rows=[r];insert=null}
   if(upsert){let r=table.find(r=>r.owner_id===upsert.owner_id&&r.employee_id===upsert.employee_id);if(r)Object.assign(r,upsert);else{r={id:'id-'+(++serial),...upsert};table.push(r)}rows=[r];upsert=null}
   if(update)rows.forEach(r=>Object.assign(r,update));return {data:one?rows[0]||null:rows,error:null,count:rows.length};
  }};return q;
 },async rpc(name,args){
  const job=tables.agent_research_jobs.find(j=>j.id===args.p_job&&j.owner_id===args.p_owner&&j.employee_id===args.p_worker);
  if(name==='claim_agent_research'){if(job?.status!=='approved')return {error:{message:'Already used'}};job.status='running';return {data:job}}
  if(name==='finish_agent_research'){assert.equal(job.status,'running');job.status='completed';job.report=args.p_report;tables.agent_messages.push({owner_id:owner,conversation_id:job.conversation_id,sender:'employee',body:'The full report, sources and limitations are saved in this thread.'});return {data:true}}
 }};
 const fakeFetch=async()=>{searchCalls++;return Response.json(evidence)};let handler;
 const code=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/agent-hq-converse/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 vm.runInNewContext(code,{createClient:()=>db,createResearchRequest,isResearchInstruction,researchApproval,researchStatus:key=>researchStatus(key,fakeFetch),runResearch:(...args)=>runResearch(...args,fakeFetch),Deno:{env:{get:k=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',GROQ_API_KEY:'test',AGENT_HQ_ALLOWED_OWNER_IDS:owner})[k]},serve:fn=>handler=fn},URL,Request,Response,AbortController,AbortSignal,setTimeout,clearTimeout,console});
 return {tables,get searchCalls(){return searchCalls},async send(text,action,token='valid'){const response=await handler(new Request('https://test.supabase.co/functions/v1/agent-hq-converse',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({employee_id:'riley',text,action})}));return {status:response.status,...await response.json()}}};
}
test('chat saves a scoped proposal, then executes only after Yes and saves one report',async()=>{
 const h=chatHarness();let r=await h.send(topic,'request_research');assert.match(r.reply,/reply yes or no/i);assert.equal(h.searchCalls,0);assert.equal(h.tables.agent_chat_states[0].stage,'confirm_research');
 r=await h.send('Yes');assert.equal(h.searchCalls,1);assert.match(r.reply,/saved the full report/i);assert.equal(h.tables.agent_research_jobs[0].status,'completed');assert.match(h.tables.agent_research_jobs[0].report,/Verified search sources/);assert.equal(h.tables.agent_messages.filter(m=>m.body.includes('Verified search sources')).length,0);
});
test('No, expiry and unauthenticated messages never start a search',async()=>{
 for(const mode of ['no','expired','invalid']){const h=chatHarness();if(mode==='invalid'){assert.equal((await h.send(topic,'request_research','invalid')).status,401);assert.equal(h.tables.agent_messages.length,0)}else{await h.send(topic,'request_research');if(mode==='expired')h.tables.agent_research_jobs[0].expires_at=new Date(Date.now()-1000).toISOString();await h.send(mode==='no'?'No':'Yes')}assert.equal(h.searchCalls,0)}
});

test('late research responses cannot repopulate history after sign-out',async()=>{
 const handlers=[],published=[];let resolveHistory;
 const history=new Promise(r=>resolveHistory=r);
 const mock={auth:{getUser:async()=>({data:{user:{id:'owner-a'}}}),onAuthStateChange:fn=>handlers.push(fn)},from(name){const q={select(){return q},eq(){return q},order(){return q},limit(){return history},then(resolve){resolve({data:[],error:null})}};return q}};
 const window={addEventListener(){},agentHQResearchSync:(rows)=>published.push(rows)};
 const code=fs.readFileSync(new URL('../agent-messages-cloud.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(code,{connectMessageControls:()=>{},agentCloud:mock,window,document:{addEventListener(){}},setInterval(){},setTimeout(){},console});
 const pending=window.agentHQResearchCloud.refresh();await Promise.resolve();await Promise.resolve();handlers.at(-1)();
 resolveHistory({data:[{id:'private-owner-a-report'}],error:null});await pending;
 assert(published.length>0);assert(published.every(rows=>rows.length===0));
});


