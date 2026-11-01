import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {projectMatches,projectFileType,finalReviewAvailable,downloadedBlob} from '../agent-projects-app-core.js';
import {projectLibrary,projectAsset,exportHandbook,exportProject} from '../supabase/functions/_shared/project-library.ts';
import {byteHash,decodeProjectPhoto,saveProjectPhoto,analyzePendingProjectPhoto} from '../supabase/functions/_shared/project-photos.ts';
const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',fileId='33333333-3333-4333-8333-333333333333',version='44444444-4444-4444-8444-444444444444';
function fixture(){
 const tables={agent_team_assignments:[],agent_project_workspaces:[],agent_worker_runs:[],agent_project_artifacts:[],agent_project_photos:[],agent_project_handbooks:[],agent_project_sessions:[]};
 const objects=new Map(),calls=[];
 const db={
  tables,objects,calls,
  from(table){
   let filters=[],pairs=[],window=null,change=null;
   const rows=()=>{
    let result=tables[table].filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v)&&(!pairs.length||pairs.some(p=>r.assignment_id===p.id&&r.revision===p.revision)));
    if(change)result.forEach(r=>Object.assign(r,change));
    return window?result.slice(window[0],window[1]+1):result;
   };
   const q={
    select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},
    or(value){pairs=[...value.matchAll(/assignment_id\.eq\.([a-f0-9-]+),revision\.eq\.(\d+)/g)].map(m=>({id:m[1],revision:Number(m[2])}));return q},
    update(v){change=v;return q},order(){return q},range(a,b){window=[a,b];return q},limit(n){window=[0,n-1];return q},
    async maybeSingle(){return {data:rows()[0]||null}},then(fn){return Promise.resolve({data:rows()}).then(fn)}
   };return q;
  },
  storage:{
   from(bucket){
    assert.equal(bucket,'agent-project-files');
    return {
     async download(path){calls.push(['read',path]);return objects.has(path)?{data:new Blob([objects.get(path)])}:{error:{message:'missing'}}},
     async upload(path,bytes,options){calls.push(['upload',path]);assert.equal(options.upsert,false);objects.set(path,bytes);return {}},
     async remove(paths){paths.forEach(p=>objects.delete(p));return {}},
     async createSignedUrl(path,ttl,options){calls.push(['sign',path,ttl,options]);return {data:{signedUrl:'https://private.invalid/'+path+(options?'?download=1':'')}}}
    };
   }
  },
  async rpc(name,args){
   calls.push([name,args]);if(db.failCommit)return {error:{message:'Project changed'}};
   if(name==='add_agent_project_photo')tables.agent_project_photos.push({id:args.p_photo,owner_id:owner,assignment_id:project,sha256:args.p_sha,caption:args.p_caption,added_revision:2});
   return {data:{revision:2,state:'ready'}};
  }
 };return db;
}
test('final approval is limited to the current final version and never to a reference or handoff',()=>{
 const s={phase:'review',revision:2,output_version:version,final_output:'Actual final output'};
 assert.equal(finalReviewAvailable(s,{revision:2,artifact_kind:'final'}),true);
 for(const [file,ref] of [[{revision:1,artifact_kind:'final'},false],[{revision:2,artifact_kind:'step'},false],[{revision:2,artifact_kind:'final'},true]])assert.equal(finalReviewAvailable(s,file,ref),false);
 assert.equal(finalReviewAvailable({...s,phase:'approved'},null),false);
});
test('project filters work for personal and business work and supported previews never execute HTML',()=>{
 assert.equal(projectMatches({title:'Personal study',session:{phase:'review'}},'ready','study'),true);
 assert.equal(projectMatches({title:'Brand ad',session:{phase:'approved'}},'working',''),false);
 assert.equal(projectFileType({mime_type:'image/png'}),'image');assert.equal(projectFileType({mime_type:'application/pdf'}),'pdf');assert.equal(projectFileType({mime_type:'text/html'}),'text');assert.equal(projectFileType({mime_type:'image/svg+xml'}),'file');
});
test('private assets verify actual bytes and return separate preview and forced-download links',async()=>{
 const db=fixture(),bytes=new TextEncoder().encode('A real saved document with verified bytes.'),path=owner+'/'+project+'/v1/final.md';db.objects.set(path,bytes);
 db.tables.agent_project_artifacts.push({id:fileId,owner_id:owner,assignment_id:project,status:'ready',filename:'final.md',mime_type:'text/markdown',object_path:path,sha256:await byteHash(bytes)});
 const result=await projectAsset(db,owner,project,fileId);assert.notEqual(result.url,result.download_url);assert.deepEqual(db.calls.filter(c=>c[0]==='sign').map(c=>c[3]),[undefined,{download:'final.md'}]);
 await assert.rejects(()=>projectAsset(db,'other-owner',project,fileId),/not available/);await assert.rejects(()=>projectAsset(db,owner,'other-project',fileId),/not available/);
 db.objects.set(path,new TextEncoder().encode('corrupt'));await assert.rejects(()=>projectAsset(db,owner,project,fileId),/could not be verified/);
});
test('handbook and final text exports are real PDFs and reject stale versions',async()=>{
 const require=createRequire(import.meta.url),pdf=require(require.resolve('pdf-lib',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]})),db=fixture();
 db.tables.agent_project_handbooks.push({owner_id:owner,handbook_key:'brand',title:'Brand handbook',version:2,approved:true,content:'A complete handbook with verified products, prices, audience and brand voice.'});
 const result=await exportHandbook(db,owner,{key:'brand',version:2,format:'pdf'},pdf),blob=downloadedBlob(result);assert.equal(result.filename,'Brand-handbook-handbook-v2.pdf');assert.equal(new TextDecoder().decode((new Uint8Array(await blob.arrayBuffer())).slice(0,5)),'%PDF-');assert.equal((await pdf.PDFDocument.load(await blob.arrayBuffer())).getPageCount(),1);
 await assert.rejects(()=>exportHandbook(db,owner,{key:'brand',version:1},pdf),/changed/);
 db.tables.agent_project_sessions.push({owner_id:owner,assignment_id:project,phase:'review',revision:3,output_version:version,final_output:'A complete project deliverable that can be exported as a real PDF document.'});
 assert.equal((await exportProject(db,owner,{id:project,title:'Study'},{output_version:version},pdf)).filename,'Study-v3.pdf');await assert.rejects(()=>exportProject(db,owner,{id:project,title:'Study'},{output_version:fileId},pdf),/changed/);
});
function photoInput(){const bytes=new Uint8Array(150).fill(7);bytes.set([255,216,255]);return {photo_id:fileId,filename:'reference.jpg',base64:Buffer.from(bytes).toString('base64'),width:600,height:600,caption:'Use the navy and ivory palette.',revision:1};}
test('reference photo uploads reject other formats, reuse identical retries and remove failed writes',async()=>{
 assert.throws(()=>decodeProjectPhoto({...photoInput(),base64:Buffer.from('<svg>not a photo</svg>').toString('base64')}),/JPEG/);
 const db=fixture();await saveProjectPhoto(db,owner,project,photoInput());await saveProjectPhoto(db,owner,project,photoInput());assert.equal(db.calls.filter(c=>c[0]==='upload').length,1);assert.equal(db.tables.agent_project_photos.length,1);
 await assert.rejects(()=>saveProjectPhoto(db,owner,project,{...photoInput(),caption:'Different direction'}),/different content/);
 const failed=fixture();failed.failCommit=true;await assert.rejects(()=>saveProjectPhoto(failed,owner,project,photoInput()),/Project changed/);assert.equal(failed.objects.size,0);
});
test('photo observations use the actual owned image and are committed under the existing run and revision',async()=>{
 const db=fixture(),input=photoInput(),bytes=decodeProjectPhoto(input),path=owner+'/'+project+'/references/'+fileId+'.jpg';db.objects.set(path,bytes);db.tables.agent_worker_runs.push({id:'leased-run',owner_id:owner,assignment_id:project,status:'running'});db.tables.agent_project_photos.push({id:fileId,owner_id:owner,assignment_id:project,analysis_status:'pending',object_path:path,sha256:await byteHash(bytes),filename:'reference.jpg',caption:input.caption});
 let request;await analyzePendingProjectPhoto({db,owner,webKey:'fixture-not-a-secret',visionFetch:async(_url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:'Visible reference: navy and ivory palette, large serif headings, generous spacing and a calm product-focused layout.'}}]}));}},{id:project},{revision:2},'leased-run',db.tables.agent_project_photos[0]);
 assert.equal(request.model,'qwen/qwen3.8-27b');assert.equal(db.tables.agent_worker_runs[0].model,request.model);assert.match(request.messages[1].content[1].image_url.url,/^data:image\/jpeg;base64,/);const commit=db.calls.find(c=>c[0]==='complete_agent_project_photo_analysis')[1];assert.equal(commit.p_run,'leased-run');assert.equal(commit.p_revision,2);assert.equal(commit.p_photo,fileId);
});

test('project library paginates owned projects and uses only the current revision for covers',async()=>{
 const db=fixture();
 for(let i=0;i<26;i++){const id='aaaaaaaa-aaaa-4aaa-8aaa-'+String(i).padStart(12,'0');db.tables.agent_team_assignments.push({id,owner_id:owner,workflow_version:2,title:'Project '+i});db.tables.agent_project_sessions.push({assignment_id:id,owner_id:owner,revision:2,phase:'review'});}
 db.tables.agent_team_assignments.push({id:'foreign',owner_id:'other-owner',workflow_version:2,title:'PRIVATE FOREIGN PROJECT'});
 const id=db.tables.agent_team_assignments[0].id;
 db.tables.agent_project_artifacts.push({id:'current',owner_id:owner,assignment_id:id,revision:2,status:'ready',artifact_kind:'final',filename:'ad.png',mime_type:'image/png',object_path:owner+'/'+id+'/ad.png'},{id:'old',owner_id:owner,assignment_id:id,revision:1,status:'ready',artifact_kind:'final',filename:'old.png',mime_type:'image/png',object_path:owner+'/'+id+'/old.png'});
 const first=await projectLibrary(db,owner,0);assert.equal(first.projects.length,25);assert.equal(first.next_cursor,25);assert.equal(first.projects[0].cover_kind,'finished');assert.deepEqual(first.projects[0].files.map(f=>f.id),['current']);assert.doesNotMatch(JSON.stringify(first),/PRIVATE FOREIGN PROJECT|old.png/);
 const next=await projectLibrary(db,owner,first.next_cursor);assert.equal(next.projects.length,1);assert.equal(next.next_cursor,null);
});
