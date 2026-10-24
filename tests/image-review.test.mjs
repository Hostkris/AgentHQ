import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageReviewHandler} from '../supabase/functions/agent-hq-image-review/handler.ts';
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',bot='00000000-0000-4000-8000-000000000003';
function harness({target='riley',custom=false,wrongOwner=false,missingKey=false,modelFailure=false,deleteDuringReview=false,closedBot=false}={}){
 let photo={id,owner_id:owner,conversation_id:custom?null:'conversation',bot_id:custom?bot:null,employee_id:custom?bot:target,caption:'Use these colors',storage_path:owner+'/'+(custom?bot:target)+'/'+id+'.jpg',analysis_status:'pending'},calls=0,replies=0,download=0;
 let modelBody;
 const tables={agent_conversations:[{id:'conversation',owner_id:owner,employee_id:target}],agent_custom_bots:[{id:bot,owner_id:owner,name:'Custom writer',role:'Writing',status:closedBot?'archived':'active'}]};
 const db={auth:{getUser:async token=>token==='good'?{data:{user:{id:wrongOwner?'other':owner}}}:{data:{user:null},error:Error('Invalid')}},from(name){let filters=[],update;
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(value){update=value;return q},async maybeSingle(){const rows=['agent_message_photos','agent_custom_message_photos'].includes(name)?(photo?[photo]:[]):tables[name]||[];const row=rows.find(r=>filters.every(([k,v])=>r[k]===v));if(!row)return {data:null};if(update)Object.assign(row,update);return {data:{...row}}},then(resolve){return q.maybeSingle().then(resolve)}};return q;},
  storage:{from:()=>({download:async()=>{download++;return {data:new Blob([Uint8Array.from([255,216,255,...new Array(400).fill(0)])],{type:'image/jpeg'})}}})},
  rpc:async(name,args)=>{assert.equal(name,'finish_agent_photo_review');assert.equal(args.p_owner,owner);if(!photo||photo.analysis_status!=='processing')return {data:false};replies++;photo.analysis_status='completed';return {data:true}}};
 const env=n=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',GROQ_API_KEY:missingKey?'':'groq-secret',AGENT_HQ_ALLOWED_OWNER_IDS:owner+',other'})[n]||'';
 const handler=createImageReviewHandler({createClient:()=>db,env,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');modelBody=JSON.parse(options.body);if(deleteDuringReview)photo=null;return new Response(JSON.stringify({choices:[{message:{content:'A grey desk and purple cable are visible.'}}]}),{status:modelFailure?429:200})}});
 const send=(token='good',origin='https://hostkris.github.io',body={attachment_id:id,target_id:custom?bot:target})=>handler(new Request('https://project.supabase.co/functions/v1/agent-hq-image-review',{method:'POST',headers:{authorization:'Bearer '+token,origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 return {send,get calls(){return calls},get replies(){return replies},get downloads(){return download},get photo(){return photo},get modelBody(){return modelBody}};
}
test('all built-in workers and HQ can review only their owner-shared photo',async()=>{
 for(const target of ['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn','hq']){
  const h=harness({target}),r=await h.send();assert.equal(r.status,200,target);assert.equal(h.calls,1);assert.equal(h.replies,1);
  assert.equal(h.modelBody.messages[1].content[1].type,'image_url');assert(!JSON.stringify(await r.json()).includes('secret'));
 }
});
test('active custom-worker photo reviews use the selected worker identity',async()=>{
 const h=harness({custom:true});assert.equal((await h.send()).status,200);assert.match(h.modelBody.messages[0].content,/Custom writer/);assert.equal(h.replies,1);
 const closed=harness({custom:true,closedBot:true});assert.equal((await closed.send()).status,404);assert.equal(closed.calls,0);
});
test('sign-in, origin, ownership and exact attachment checks precede downloads/model calls',async()=>{
 for(const options of [{wrongOwner:true},{}]){const h=harness(options);const r=await h.send(options.wrongOwner?'good':'bad');assert([401,404].includes(r.status));assert.equal(h.downloads,0);assert.equal(h.calls,0)}
 let h=harness();assert.equal((await h.send('good','https://evil.example')).status,403);assert.equal(h.calls,0);
 h=harness();assert.equal((await h.send('good','https://hostkris.github.io',{attachment_id:'not-id'})).status,400);assert.equal(h.downloads,0);
});
test('one-use claim prevents duplicate vision calls and duplicate replies',async()=>{
 const h=harness();const responses=await Promise.all([h.send(),h.send()]);assert(responses.some(r=>r.status===200));assert.equal(h.calls,1);assert.equal(h.replies,1);assert.equal((await h.send()).status,200);assert.equal(h.calls,1);
});
test('provider failure/missing key never claims image understanding or uses a fallback',async()=>{
 let h=harness({missingKey:true});assert.equal((await h.send()).status,503);assert.equal(h.downloads,0);assert.equal(h.calls,0);
 h=harness({modelFailure:true});assert.equal((await h.send()).status,502);assert.equal(h.calls,1);assert.equal(h.replies,0);assert.equal(h.photo.analysis_status,'failed');
});
test('deleting a photo during review prevents a late reply',async()=>{
 const h=harness({deleteDuringReview:true});assert.equal((await h.send()).status,502);assert.equal(h.replies,0);
});
