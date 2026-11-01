import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {stageProjectArtifact,loadProjectWorkspace,resolveCalculationTokens,verifiedCalculations,routeWorkspaceUpdate} from '../supabase/functions/_shared/project-workspace.ts';
const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
function database(){
 const tables={agent_project_workspaces:[{owner_id:owner,assignment_id:project,output_format:'markdown',business_key:'chosen'}],agent_project_artifacts:[],agent_project_handbooks:[],agent_project_references:[],agent_task_steps:[],agent_project_photos:[]};
 const objects=new Map(),calls=[];
 const db={tables,objects,calls,corrupt:false,failUpload:false,from(table){let filters=[],any=[],inserted;
  const rows=()=>tables[table].filter(row=>filters.every(([k,v])=>row[k]===v)&&(!any.length||any.some(([k,v])=>row[k]===v)));
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},or(value){any=value.split(',').map(s=>{const [k,,v]=s.split('.');return [k,v]});return q},order(){return q},limit(){return q},insert(row){inserted={id:'artifact-'+tables[table].length,...row};return q},async maybeSingle(){return {data:rows()[0]||null}},async single(){tables[table].push(inserted);return {data:inserted}},then(fn){return Promise.resolve({data:rows()}).then(fn)}};return q;
 },storage:{from(bucket){assert.equal(bucket,'agent-project-files');return {
  async upload(path,bytes,options){calls.push({action:'upload',path});assert.equal(options.upsert,false);if(db.failUpload)return {error:{message:'fixture storage unavailable'}};if(objects.has(path))return {error:{message:'object exists'}};objects.set(path,bytes.slice());return {error:null};},
  async download(path){calls.push({action:'download',path});if(!objects.has(path))return {error:{message:'not found'}};return {data:new Blob([db.corrupt?new TextEncoder().encode('corrupt'):objects.get(path)])};},
  async remove(paths){for(const path of paths)objects.delete(path);return {error:null};}
 };}}};return db;
}
test('saved work is downloaded and checksum-verified; identical retries reuse one file',async()=>{
 const db=database(),s={revision:1,active_worker:'jordan'},a={id:project,title:'Study plan'},text='A usable study plan based on the supplied references and actual requirements.';
 const first=await stageProjectArtifact(db,owner,a,s,'run-1',text);
 const again=await stageProjectArtifact(db,owner,a,s,'run-1',text);
 assert.equal(first.id,again.id);assert.equal(db.objects.size,1);assert.equal(db.calls.filter(c=>c.action==='upload').length,1);assert.equal(db.calls.filter(c=>c.action==='download').length,2);
 assert.equal(db.tables.agent_project_artifacts[0].status,undefined); // Only the database commit may make this ready.
 await assert.rejects(()=>stageProjectArtifact(db,owner,a,s,'run-1',text+' Changed.'),/different output/);
 db.objects.clear();await assert.rejects(()=>stageProjectArtifact(db,owner,a,s,'run-1',text),/could not be verified/);
});
test('missing or corrupt storage cannot create completion metadata and failed objects are removed',async()=>{
 for(const mode of ['failUpload','corrupt']){
  const db=database();db[mode]=true;
  await assert.rejects(()=>stageProjectArtifact(db,owner,{id:project,title:'Test'},{revision:1,active_worker:'jordan'},'run-1','A complete real document that should be saved and checked.'));
  assert.equal(db.tables.agent_project_artifacts.length,0);assert.equal(db.objects.size,0);
 }
});
test('structured output remains parseable after trusted calculations',async()=>{
 const results=verifiedCalculations({calculations:[{label:'total',expression:'14*3'}]});
 const output=resolveCalculationTokens('{"title":"Actual calculated output","total":{{calc:total}}}',results,false);
 assert.equal(JSON.parse(output).total,42);
 const db=database();db.tables.agent_project_workspaces[0].output_format='json';
 await stageProjectArtifact(db,owner,{id:project,title:'Totals'},{revision:2,active_worker:'avery'},'run-2',output,'final');
 assert.equal(db.objects.size,2);assert.deepEqual(db.tables.agent_project_artifacts.map(a=>a.artifact_kind),['final','original']);
 assert.throws(()=>resolveCalculationTokens('{{calc:missing}}',results),/not resolved/);
});
test('workers receive owner-scoped handbooks and actual saved upstream work',async()=>{
 const db=database();db.tables.agent_project_handbooks=[
  {owner_id:owner,handbook_key:'general',scope:'general',approved:true,content:'Shared factual rules'},
  {owner_id:owner,handbook_key:'chosen',scope:'business',approved:true,content:'Verified selected business facts'},
  {owner_id:owner,handbook_key:'other',scope:'business',approved:true,content:'OTHER BUSINESS PRIVATE'},
  {owner_id:owner,handbook_key:'draft',scope:'general',approved:false,content:'UNAPPROVED FACTS'},
  {owner_id:'other-owner',handbook_key:'elsewhere',scope:'general',approved:true,content:'ANOTHER OWNER PRIVATE'}];
 db.tables.agent_task_steps=[{owner_id:owner,assignment_id:project,employee_id:'riley',work_product:'Actual saved source findings and citation links.',output:'Short preview'}];
 const context=await loadProjectWorkspace(db,owner,project);
 assert.equal(context.handbooks.length,2);assert.equal(context.handoffs[0].work_product,'Actual saved source findings and citation links.');
 assert.doesNotMatch(JSON.stringify(context),/OTHER BUSINESS PRIVATE|UNAPPROVED FACTS|ANOTHER OWNER PRIVATE/);
});
test('approval, pause and pending confirmation messages cannot become project updates',async()=>{
 const db={from(){throw Error('A scoped decision was intercepted as an update')}};
 for(const body of ['looks good','I like it','thumbs up','good to go','red light','hold on','resume the project'])assert.equal(await routeWorkspaceUpdate(db,owner,'hq',body,{project_id:project}),null);
 assert.equal(await routeWorkspaceUpdate(db,owner,'hq','Confirm this exact action',{project_id:project,stage:'confirm_permission'}),null);
});
test('large earlier sources cannot hide the last specialist or later references',async()=>{
 const db=database();
 db.tables.agent_task_steps=Array.from({length:9},(_,i)=>({owner_id:owner,assignment_id:project,employee_id:'worker-'+i,work_product:'Work '+i+': '+('verified findings '.repeat(1000))}));
 db.tables.agent_project_references=Array.from({length:50},(_,i)=>({owner_id:owner,assignment_id:project,id:'ref-'+i,filename:'source-'+i+'.md',content:'Source '+i+': '+('reference facts '.repeat(1000))}));
 const context=await loadProjectWorkspace(db,owner,project);
 assert.equal(context.handoffs.length,9);assert.ok(context.handoffs.every(h=>h.work_product.length>0&&h.excerpt));assert.match(context.handoffs.at(-1).work_product,/Work 8/);
 assert.equal(context.references.length,50);assert.match(context.references.at(-1).content,/Source 49/);assert.ok(context.references.reduce((n,r)=>n+r.content.length,0)<=16000);
});
function handler({user={id:owner},allowed=owner,assignment={id:project,title:'Test'},tokenError=null}={}){
 let serve;const calls=[];
 const db={auth:{getUser:async()=>({data:{user},error:tokenError})},from(table){const q={select(){return q},eq(k,v){calls.push({table,k,v});return q},async maybeSingle(){return {data:assignment}}};return q;}};
 const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/agent-project-workspace/index.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{createClient:()=>db,Request,Response,Error,loadProjectWorkspace,validateReference(){throw Error('unexpected reference')},projectIntake(){throw Error('unexpected intake')},CAPABILITY_STATUS:[],Deno:{serve:fn=>serve=fn,env:{get:k=>k==='AGENT_HQ_ALLOWED_OWNER_IDS'?allowed:'fixture'}}});
 return {calls,request:(input,headers={})=>serve(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json',...headers},body:JSON.stringify(input)}))};
}
test('workspace endpoint rejects expired tokens, nonowners and foreign projects before reading files',async()=>{
 assert.equal((await handler({user:null,tokenError:new Error('expired')}).request({action:'details',project_id:project})).status,401);
 assert.equal((await handler({allowed:'another-owner'}).request({action:'details',project_id:project})).status,403);
 const missing=handler({assignment:null});assert.equal((await missing.request({action:'details',project_id:project})).status,404);
 assert.deepEqual(missing.calls.map(c=>[c.k,c.v]),[['id',project],['owner_id',owner]]);
 assert.equal((await handler().request({action:'details',project_id:project},{origin:'https://untrusted.invalid'})).status,403);
});
