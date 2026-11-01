import {artifactBytes} from '../../../agent-project-workspace-core.js';
import {base64Bytes,byteHash} from './project-photos.ts';
const bucket='agent-project-files';
const uuid=(s:any)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(s));
const safeName=(s:any)=>String(s||'Project').slice(0,100).replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'Project';
function offset(value:any){if(value===undefined||value===null)return 0;if(!Number.isSafeInteger(value)||value<0||value>100000)throw Error('Invalid library page');return value;}
export async function projectLibrary(db:any,owner:string,cursor:any){
 const start=offset(cursor),{data:rows,error}=await db.from('agent_team_assignments').select('id,title,owner_paused,created_at,updated_at').eq('owner_id',owner).eq('workflow_version',2).order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+25);if(error)throw error;
 const items=(rows||[]).slice(0,25),ids=items.map((r:any)=>r.id);if(!ids.length)return {projects:[],next_cursor:null};
 const results=await Promise.all([
  db.from('agent_project_sessions').select('assignment_id,revision,phase,review_status,output_version,next_worker,recovery_state,next_run_at').eq('owner_id',owner).in('assignment_id',ids),
  db.from('agent_project_workspaces').select('assignment_id,project_kind,output_format').eq('owner_id',owner).in('assignment_id',ids),
  db.from('agent_project_photos').select('id,assignment_id,object_path,filename').eq('owner_id',owner).in('assignment_id',ids).order('created_at',{ascending:false}).limit(300)
 ]);if(results.some(r=>r.error))throw Error('Could not load project files and status');
 const [sessions,metas,photos]=results.map(r=>r.data||[]),projects=[];
 const pairs=items.map((a:any)=>'and(assignment_id.eq.'+a.id+',revision.eq.'+(sessions.find((s:any)=>s.assignment_id===a.id)?.revision||1)+')').join(',');
 const {data:files,error:fileError}=await db.from('agent_project_artifacts').select('id,assignment_id,revision,artifact_kind,filename,mime_type,object_path').eq('owner_id',owner).eq('status','ready').or(pairs).order('created_at',{ascending:false}).limit(1000);if(fileError)throw Error('Could not load saved project files');
 for(const a of items){
  const s=sessions.find((s:any)=>s.assignment_id===a.id),meta=metas.find((m:any)=>m.assignment_id===a.id),own=files.filter((f:any)=>f.assignment_id===a.id&&f.revision===(s?.revision||1)),reference=photos.find((p:any)=>p.assignment_id===a.id);
  const image=own.find((f:any)=>f.artifact_kind==='final'&&['image/png','image/jpeg','image/webp'].includes(f.mime_type));const cover=image||reference;let cover_url=null;
  if(cover&&cover.object_path.startsWith(owner+'/'+a.id+'/')){const signed=await db.storage.from(bucket).createSignedUrl(cover.object_path,600);if(!signed.error)cover_url=signed.data?.signedUrl;}
  projects.push({...a,session:s||{phase:'planning',revision:1},metadata:meta||null,files:own.map(({object_path,...f}:any)=>f),cover_url,cover_kind:image?'finished':reference?'reference':null,photo_count:photos.filter((p:any)=>p.assignment_id===a.id).length});
 }
 return {projects,next_cursor:(rows||[]).length>25?start+25:null};
}
export async function projectFilePage(db:any,owner:string,project:string,cursor:any=0){
 const start=offset(cursor),{data,error}=await db.from('agent_project_artifacts').select('id,filename,mime_type,note,revision,artifact_kind,object_path,sha256,size_bytes,employee_id,created_at').eq('owner_id',owner).eq('assignment_id',project).eq('status','ready').order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+50);if(error)throw error;
 const artifacts=[];for(const f of (data||[]).slice(0,50)){
  if(!f.object_path.startsWith(owner+'/'+project+'/'))throw Error('Invalid private file path');
  const {data:link,error:se}=await db.storage.from(bucket).createSignedUrl(f.object_path,600);if(se)throw se;
  const {object_path,...safe}=f;artifacts.push({...safe,url:link.signedUrl});
 }
 return {artifacts,next_files_cursor:(data||[]).length>50?start+50:null};
}
export async function projectPhotoList(db:any,owner:string,project:string){
 const {data,error}=await db.from('agent_project_photos').select('id,filename,mime_type,object_path,width,height,caption,analysis_status,analysis,created_at').eq('owner_id',owner).eq('assignment_id',project).order('created_at',{ascending:false}).limit(12);if(error)throw error;
 const photos=[];for(const p of data||[]){if(!p.object_path.startsWith(owner+'/'+project+'/'))throw Error('Invalid private photo path');const {data:link,error:se}=await db.storage.from(bucket).createSignedUrl(p.object_path,600);if(se)throw se;const {object_path,...safe}=p;photos.push({...safe,url:link.signedUrl});}return photos;
}
export async function projectAsset(db:any,owner:string,project:string,id:any,reference=false){
 if(!uuid(id))throw Error('Choose a saved file');
 let q=db.from(reference?'agent_project_photos':'agent_project_artifacts').select('id,filename,mime_type,object_path,sha256,size_bytes').eq('id',id).eq('owner_id',owner).eq('assignment_id',project);if(!reference)q=q.eq('status','ready');
 const {data:f,error}=await q.maybeSingle();if(error||!f)throw Error('This saved file is not available in the selected project');
 if(!f.object_path.startsWith(owner+'/'+project+'/'))throw Error('Invalid private file path');
 const {data:blob,error:readError}=await db.storage.from(bucket).download(f.object_path);if(readError||!blob||await byteHash(await blob.arrayBuffer())!==f.sha256)throw Error('The saved file is missing or could not be verified');
 const {data:preview,error:pe}=await db.storage.from(bucket).createSignedUrl(f.object_path,600),{data:download,error:de}=await db.storage.from(bucket).createSignedUrl(f.object_path,120,{download:f.filename});if(pe||de)throw Error('Could not open this private file');
 return {id:f.id,filename:f.filename,mime_type:f.mime_type,size_bytes:f.size_bytes,url:preview.signedUrl,download_url:download.signedUrl};
}
export async function exportedDocument(content:string,title:string,filename:string,format:any,pdfLibrary?:any){
 if(!['pdf','markdown'].includes(format))throw Error('Choose PDF or Markdown');
 const file=await artifactBytes(format,content,title,pdfLibrary);return {filename:safeName(filename)+'.'+file.extension,mime_type:file.mime,note:file.note,base64:base64Bytes(file.bytes)};
}
export async function exportHandbook(db:any,owner:string,input:any,pdfLibrary?:any){
 const key=String(input.key||'');if(!/^[a-z0-9_-]{1,120}$/.test(key))throw Error('Choose a handbook');
 const {data:b,error}=await db.from('agent_project_handbooks').select('title,content,approved,version').eq('owner_id',owner).eq('handbook_key',key).maybeSingle();if(error||!b)throw Error('Handbook not found');
 if(input.version!==b.version)throw Error('The handbook changed; reopen it before downloading');
 return await exportedDocument(b.content,b.title+' — handbook v'+b.version+(b.approved?'':' — draft'),b.title+'-handbook-v'+b.version,input.format||'pdf',pdfLibrary);
}
export async function exportProject(db:any,owner:string,project:any,input:any,pdfLibrary?:any){
 const {data:s,error}=await db.from('agent_project_sessions').select('phase,revision,output_version,final_output').eq('owner_id',owner).eq('assignment_id',project.id).maybeSingle();if(error||!s||!['review','approved'].includes(s.phase)||!s.final_output)throw Error('This project has no finished version to export');
 if(!uuid(input.output_version)||s.output_version!==input.output_version)throw Error('The finished version changed; refresh before downloading');
 return await exportedDocument(s.final_output,project.title,project.title+'-v'+s.revision,input.format||'pdf',pdfLibrary);
}
