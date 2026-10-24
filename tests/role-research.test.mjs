import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {ROLE_WEB_SCOPE,PUBLIC_WEB_CAPABILITY,explicitPublicResearch,roleWebProfile,validateRoleQuery,planRoleQuery,publicQueryPlanner,fetchPublicEvidence,researchForRole} from '../supabase/functions/_shared/role-research.ts';
import {routeProjectChat} from '../supabase/functions/_shared/project-chat.ts';
import {runProjectTurn} from '../supabase/functions/_shared/project-engine.ts';
const owner='11111111-1111-4111-8111-111111111111',assignment='22222222-2222-4222-8222-222222222222',run='33333333-3333-4333-8333-333333333333';
const evidence={choices:[{finish_reason:'stop',message:{content:'The primary source describes current guidance at https://example.com/official. An unsupported link is https://invented.example/claim.',executed_tools:[{type:'browser.search',search_results:{results:[{url:'https://example.com/official',title:'Official guidance'}]}}]}}]};
const bot={id:assignment,status:'active',name:'Pat',role:'Engineering research specialist',mission:'Research engineering designs and technical documentation.',skills:['Engineering','Design'],anti_jobs:['Do not operate accounts']};
const basicProfile=roleWebProfile('casey');
test('every built-in agent and HQ has its dedicated public research profile',()=>{
 for(const id of ['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq']){
  const p=roleWebProfile(id);assert(p.title.length>3);assert(p.topics.length>20);
  const query=p.topics.split(' ').slice(0,4).join(' ');assert.equal(validateRoleQuery(query,{task:query,profile:p}),query);
 }
 assert.equal(roleWebProfile(bot.id,bot).title,bot.role);assert.throws(()=>roleWebProfile(bot.id,{...bot,status:'archived'}));assert.throws(()=>roleWebProfile('unknown'));
});
test('task-scoped public queries reject unrelated topics, private identifiers, credentials and internal URLs',()=>{
 for(const query of ['bake sourdough starter bread','Instagram access_token=secret','Facebook gsk_abcdefghijklmno','Social media test@example.com','Instagram +1 (614) 555-0199','Read https://127.0.0.1/private for social media','Read https://user:pass@example.com for social media','my Facebook private messages','https://office.internal/ Instagram'])
  assert.throws(()=>validateRoleQuery(query,{task:'Improve Instagram social media engagement',profile:basicProfile}),query);
 assert.throws(()=>validateRoleQuery('niacinamide skincare ingredients',{task:'niacinamide skincare ingredients',profile:roleWebProfile('alex')}),/Alex researches management/);
 assert.equal(explicitPublicResearch('Research current Instagram engagement practices'),true);
 for(const text of ['Do not research this','Write without online research','Stop browsing','No web research'])assert.equal(explicitPublicResearch(text),false,text);
 for(const text of ['Create a campaign and research the current options','Write a script using public research','Have the team research and produce a launch plan'])assert.equal(explicitPublicResearch(text),false,text);
});
test('query planning sees one task and role, asks for missing private scope rather than searching it',async()=>{
 let received;
 const planned=await planRoleQuery('casey','Research Instagram social media engagement',async(system,user)=>{received=user;return {kind:'research',query:'Instagram social media engagement',purpose:'Improve the assigned post'};});
 assert.equal(planned.kind,'research');assert.equal(received.owner_request,'Research Instagram social media engagement');assert(!('history' in received));
 const privateRequest=await planRoleQuery('taylor','Read my inbox',async()=>({kind:'private',question:'Which authorized inbox connection should I use?'}));assert.equal(privateRequest.kind,'private');
});
test('the public tool contract uses only the existing Groq model and browser_search',async()=>{
 let request,url;
 const result=await fetchPublicEvidence({key:'synthetic-key',query:'Instagram social media engagement',purpose:'Improve post clarity',profile:basicProfile,fetcher:async(u,r)=>{url=u;request=JSON.parse(r.body);return Response.json(evidence);}});
 assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(request.model,'openai/gpt-oss-120b');assert.deepEqual(request.tools,[{type:'browser_search'}]);assert.equal(request.tool_choice,'required');assert.equal(request.reasoning_effort,'low');assert(!request.response_format);assert(!request.compound_custom);
 assert.match(result.report,/Retrieved:/);assert.match(result.report,/https:\/\/example.com\/official/);assert(!result.report.includes('https://invented.example/claim'));assert.match(result.report,/unverified link omitted/);
});
test('missing executed search metadata, incomplete reports, quotas and missing keys cannot become completed research',async()=>{
 for(const payload of [{choices:[{message:{content:'I searched https://fake.example'}}]}, {...evidence,choices:[{...evidence.choices[0],finish_reason:'length'}]}]){
  await assert.rejects(fetchPublicEvidence({key:'synthetic',query:'Instagram engagement',profile:basicProfile,purpose:'Task',fetcher:async()=>Response.json(payload)}));
 }
 let calls=0;await assert.rejects(fetchPublicEvidence({key:'synthetic',query:'Instagram engagement',profile:basicProfile,purpose:'Task',fetcher:async()=>{calls++;return new Response('{}',{status:429});}}),/No paid fallback/);assert.equal(calls,1);
 await assert.rejects(fetchPublicEvidence({key:'',query:'Instagram engagement',profile:basicProfile,purpose:'Task',fetcher:async()=>{calls++;}}),/No other provider/);assert.equal(calls,1);
});
test('only provider-confirmed tool-selection failure gets one same-provider retry',async()=>{
 const choices=[];
 await fetchPublicEvidence({key:'synthetic',query:'Instagram engagement',profile:basicProfile,purpose:'Task',fetcher:async(u,r)=>{choices.push(JSON.parse(r.body).tool_choice);return choices.length===1?Response.json({error:{code:'tool_use_failed'}},{status:400}):Response.json(evidence);}});
 assert.deepEqual(choices,['required','auto']);
 let n=0;await assert.rejects(fetchPublicEvidence({key:'synthetic',query:'Instagram engagement',profile:basicProfile,purpose:'Task',fetcher:async()=>{n++;return Response.json({error:{code:'invalid_request_error'}},{status:400});}}));assert.equal(n,1);
});
function simpleDB(state='claimed'){
 const calls=[];return {calls,from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},update(value){calls.push({table,value});return q},then(fn){return Promise.resolve({data:[]}).then(fn);}};return q;},async rpc(name,args){calls.push({name,args});if(name==='begin_agent_role_research')return {data:{state,job_id:assignment,retry_at:new Date(Date.now()+3600000).toISOString()}};return {data:{state:args?.p_context?.assignment_id?'ready':'completed',job_id:assignment}};}};
}
test('database authorization and replay/allowance states run before the browser request',async()=>{
 for(const state of ['budget','busy','running','completed','limit']){
  const db=simpleDB(state);let n=0;const r=await researchForRole({db,owner,worker:'casey',task:'Instagram engagement',query:'Instagram social media engagement',purpose:'Improve content',context:{conversation_id:assignment,message_id:run,request_key:'chat:'+run},key:'synthetic',fetcher:async()=>{n++;return Response.json(evidence);}});assert.equal(r.state,state);assert.equal(n,0);
 }
});
test('research completion requires an atomic save and a failure stays visibly failed',async()=>{
 const db=simpleDB();db.rpc=async(name,args)=>{db.calls.push({name,args});return name==='begin_agent_role_research'?{data:{state:'claimed',job_id:assignment}}:{error:{message:'project stopped'}};};
 await assert.rejects(researchForRole({db,owner,worker:'casey',task:'Instagram engagement',query:'Instagram social media engagement',purpose:'Improve content',context:{},key:'synthetic',fetcher:async()=>Response.json(evidence)}),/not committed/);
 assert(db.calls.some(c=>c.table==='agent_role_research'&&c.value.status==='failed'));
});

function chatHarness({privatePlan=false}={}){
 const tables={agent_conversations:[],agent_messages:[],agent_chat_states:[],agent_project_sessions:[],agent_role_research:[]},requests=[];let serial=0,handler;
 const db={auth:{getUser:async token=>({data:{user:token==='valid'?{id:owner}:null}})},from(name){const list=tables[name]??(tables[name]=[]);let filters=[],op='',value,one=false;
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},insert(v){op='insert';value=v;return q},upsert(v){op='upsert';value=v;return q},update(v){op='update';value=v;return q},single(){one=true;return finish()},maybeSingle(){one=true;return finish()},then(a,b){return finish().then(a,b)}};
  async function finish(){let rows=list.filter(r=>filters.every(f=>f(r)));if(op==='insert'){rows=[{id:'synthetic-'+(++serial),...value}];list.push(rows[0]);}if(op==='upsert'){let r=list.find(r=>r.owner_id===value.owner_id&&r.employee_id===value.employee_id);if(!r){r={id:'synthetic-'+(++serial),...value};list.push(r);}else Object.assign(r,value);rows=[r];}if(op==='update')rows.forEach(r=>Object.assign(r,value));return {data:one?rows[0]||null:rows,error:null};}return q;
 },async rpc(name,args){if(name==='begin_agent_role_research'){const row={id:'web-'+(++serial),owner_id:args.p_owner,employee_id:args.p_worker,query:args.p_query,conversation_id:args.p_context.conversation_id,status:'running'};tables.agent_role_research.push(row);return {data:{state:'claimed',job_id:row.id}};}
  if(name==='finish_agent_role_research'){const row=tables.agent_role_research.find(r=>r.id===args.p_job);Object.assign(row,{status:'completed',report:args.p_report,sources:args.p_sources});tables.agent_messages.push({id:'result-'+(++serial),owner_id:owner,conversation_id:row.conversation_id,sender:'employee',body:args.p_summary});return {data:{state:'completed',job_id:row.id}};}}
 };
 const fetcher=async(url,request)=>{const body=JSON.parse(request.body);requests.push(body);if(body.tools)return Response.json(evidence);
  if(privatePlan)return Response.json({choices:[{message:{content:JSON.stringify({kind:'private',question:'Private inbox access needs its existing connector permission.'})}}]});
  const role=JSON.parse(body.messages[1].content).worker_role,p=Object.values(ROLE_WEB_SCOPE).find(p=>p.title===role)||{topics:'engineering technical design'};
  return Response.json({choices:[{message:{content:JSON.stringify({kind:'research',query:p.topics.split(' ').slice(0,5).join(' '),purpose:'Evidence for this role’s assigned task'})}}]});};
 const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/agent-hq-converse/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 const scopedResearch=args=>researchForRole({...args,fetcher});
 vm.runInNewContext(source,{createClient:()=>db,routeProjectChat,PUBLIC_WEB_CAPABILITY,explicitPublicResearch,planRoleQuery,publicQueryPlanner:key=>publicQueryPlanner(key,fetcher),researchForRole:scopedResearch,fetch:fetcher,URL,Request,Response,AbortController,AbortSignal,setTimeout,clearTimeout,console,Deno:{serve:f=>handler=f,env:{get:k=>({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic',GROQ_API_KEY:'synthetic',AGENT_HQ_ALLOWED_OWNER_IDS:owner})[k]}}});
 return {tables,requests,async send(worker,text,token='valid'){const response=await handler(new Request('https://synthetic.supabase.co',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({employee_id:worker,text,action:'role_research'})}));return {status:response.status,...await response.json()};}};
}
for(const [worker,p] of Object.entries(ROLE_WEB_SCOPE))test(worker+' can research their actual specialty directly in Messages',async()=>{
 const h=chatHarness(),r=await h.send(worker,'Research current '+p.topics.split(' ').slice(0,5).join(' '));
 assert.equal(r.status,200);assert(!r.error,r.error);assert.equal(h.requests.filter(r=>r.tools).length,1);assert.equal(h.tables.agent_role_research[0].employee_id,worker);assert.equal(h.tables.agent_role_research[0].status,'completed');assert.match(h.tables.agent_role_research[0].report,/example.com\/official/);
 assert(!h.tables.agent_messages.some(m=>m.body?.includes('Want me to go ahead')));
});
test('invalid login and private-account request never call the public search tool',async()=>{
 let h=chatHarness();assert.equal((await h.send('casey','Research social media engagement','invalid')).status,401);assert.equal(h.requests.length,0);
 h=chatHarness({privatePlan:true});const r=await h.send('taylor','Research the responses needed in my private inbox');assert.match(r.reply,/connector permission/);assert.equal(h.requests.filter(r=>r.tools).length,0);assert.equal(h.tables.agent_role_research.length,0);
});
test('team research uses the real worker’s lease, then reuses source-backed evidence in later turns',async()=>{
 const calls=[],s={revision:1,phase:'drafting',active_worker:'jordan',lead_worker:'jordan',team_order:['jordan','casey'],peer_exchanges:1};
 const db=simpleDB();db.rpc=async(name,args)=>{calls.push({name,args});return {data:name==='claim_agent_project_turn'?{state:'claimed',run_id:run,session:s}:name==='begin_agent_role_research'?{state:'claimed',job_id:assignment}:{state:'ready'}};};
 let model=0,browse=0;const r=await runProjectTurn({db,owner,ai:{name:'groq',model:'existing'},webKey:'synthetic',jobs:{jordan:'Creative writing'},policyFor:()=>'',call:async()=>{model++;return {kind:'research',text:'I’m checking a factual reference for the scene.',query:'landscape photography composition',purpose:'Accurate visual descriptions in the script'};},webFetch:async()=>{browse++;return Response.json(evidence);}},{id:assignment,title:'Landscape script',instructions:'Write a landscape photography script for beginners'},{action:'next'});
 assert.equal(r.state,'ready');assert.equal(model,1);assert.equal(browse,1);assert.equal(calls.find(c=>c.name==='begin_agent_role_research').args.p_context.run_id,run);assert.equal(calls.filter(c=>c.name==='commit_agent_project_turn').length,0);
});
test('a saved queued team query resumes without another planning model call or a paid fallback',async()=>{
 const s={revision:1,phase:'drafting',active_worker:'jordan',pending_research_query:'landscape photography composition',pending_research_purpose:'Accurate script'};
 const calls=[],db=simpleDB();db.rpc=async(name,args)=>{calls.push({name,args});return {data:name==='claim_agent_project_turn'?{state:'claimed',run_id:run,session:s}:name==='begin_agent_role_research'?{state:'budget',retry_at:'2026-10-24T12:00:00Z'}:{state:'ready'}};};
 let model=0,browse=0;const r=await runProjectTurn({db,owner,ai:{},webKey:'synthetic',jobs:{jordan:'Writing'},call:async()=>{model++;},webFetch:async()=>{browse++;}},{id:assignment,instructions:'Landscape photography script'},{action:'next'});
 assert.equal(r.state,'budget');assert.equal(model,0);assert.equal(browse,0);assert(calls.some(c=>c.name==='defer_agent_project_research'));
});

function customHarness(status='active'){
 let handler,serial=0;const messages=[],reports=[],requests=[];
 const activeBot={...bot,status,owner_id:owner};
 const db={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(table){let row,op='',filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},limit(){return q},insert(v){op='insert';row=v;return q},update(v){op='update';row=v;return q},maybeSingle(){return finish(true)},single(){return finish(true)},then(a,b){return finish(false).then(a,b)}};
  async function finish(single){let data=table==='agent_custom_bots'?[activeBot]:table==='agent_custom_bot_messages'?messages:reports;data=data.filter(r=>filters.every(f=>f(r)));
   if(op==='insert'){const r={id:'custom-message-'+(++serial),...row};messages.push(r);data=[r];}if(op==='update')data.forEach(r=>Object.assign(r,row));return {data:single?data[0]||null:data};}return q;},
  async rpc(name,args){if(name==='begin_agent_role_research'){assert.equal(args.p_worker,bot.id);assert.equal(args.p_context.bot_id,bot.id);assert(messages.some(m=>m.id===args.p_context.message_id&&m.sender==='owner'));return {data:{state:'claimed',job_id:run}};}
   if(name==='finish_agent_role_research'){reports.push({owner_id:owner,bot_id:bot.id,query:'Engineering design',report:args.p_report,status:'completed'});messages.push({id:'custom-result-'+(++serial),owner_id:owner,bot_id:bot.id,sender:'worker',body:args.p_summary});return {data:{state:'completed',job_id:run}};}}
 };
 const fetcher=async(url,req)=>{const body=JSON.parse(req.body);requests.push(body);return body.tools?Response.json(evidence):Response.json({choices:[{message:{content:JSON.stringify({kind:'research',query:'engineering technical design',purpose:'Evidence for the assigned design'})}}]});};
 const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/agent-bot-studio/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
 vm.runInNewContext(source,{createClient:()=>db,PUBLIC_WEB_CAPABILITY,explicitPublicResearch,planRoleQuery,publicQueryPlanner:key=>publicQueryPlanner(key,fetcher),researchForRole:args=>researchForRole({...args,fetcher}),fetch:fetcher,URL,Request,Response,AbortController,AbortSignal,setTimeout,clearTimeout,console,Deno:{serve:f=>handler=f,env:{get:k=>({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic',GROQ_API_KEY:'synthetic',AGENT_HQ_ALLOWED_OWNER_IDS:owner})[k]}}});
 return {messages,reports,requests,async send(message){const r=await handler(new Request('https://synthetic.supabase.co',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({action:'chat',bot_id:bot.id,message})}));return {status:r.status,...await r.json()};}};
}
test('an active custom worker can actually research through its saved Messages endpoint',async()=>{
 const h=customHarness(),r=await h.send('Research current engineering technical design guidance');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.saved,true);assert.equal(h.requests.filter(r=>r.tools).length,1);assert.match(h.reports[0].report,/Official guidance/);assert.equal(h.messages.filter(m=>m.sender==='owner').length,1);assert.equal(h.messages.filter(m=>m.sender==='worker').length,1);
});
test('archived custom workers cannot plan queries or browse',async()=>{
 const h=customHarness('archived'),r=await h.send('Research engineering design');assert.equal(r.status,409);assert.equal(h.requests.length,0);assert.equal(h.messages.length,0);
});
