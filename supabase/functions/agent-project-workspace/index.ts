import {createClient} from 'npm:@supabase/supabase-js@2.79.0';
import {loadProjectWorkspace,CAPABILITY_STATUS} from '../_shared/project-workspace.ts';
import {validateReference,projectIntake} from '../../../agent-project-workspace-core.js';
import {projectLibrary,projectFilePage,projectPhotoList,projectAsset,exportHandbook,exportProject} from '../_shared/project-library.ts';
import {saveProjectPhoto} from '../_shared/project-photos.ts';
const origin='https://hostkris.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply({error:'Origin not permitted'},403);
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply({error:'Sign-in required'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await db.auth.getUser(token);if(authError||!auth.user)return reply({error:'Sign-in expired'},401);
 const owner=auth.user.id;if(!(Deno.env.get('AGENT_HQ_ALLOWED_OWNER_IDS')||'').split(',').some(s=>s.trim().toLowerCase()===owner.toLowerCase()))return reply({error:'Owner not authorized'},403);
 try{
  if(Number(req.headers.get('content-length')||0)>4500000)throw Error('Request is too large');
  const input=await req.json();const action=input.action;
  if(action==='library')return reply(await projectLibrary(db,owner,input.cursor));
  if(action==='export_handbook')return reply(await exportHandbook(db,owner,input));
  if(action==='handbooks'){
   const {data,error}=await db.from('agent_project_handbooks').select('id,handbook_key,title,scope,content,approved,version').eq('owner_id',owner).order('updated_at',{ascending:false});
   if(error)throw error;return reply({handbooks:data,capabilities:CAPABILITY_STATUS});
  }
  if(action==='save_handbook'){
   const {data,error}=await db.rpc('save_agent_project_handbook',{p_owner:owner,p_key:String(input.key||'').toLowerCase(),p_title:input.title,p_scope:input.scope,p_content:input.content,p_approved:input.approved===true,p_expected_version:input.version??null});
   if(error)throw error;return reply({handbook:data});
  }
  if(action==='create'){
   const meta=projectIntake(input.brief);if(input.output_format)meta.output_format=input.output_format;
   if(input.completion_criteria?.trim())meta.completion_criteria=String(input.completion_criteria).trim().slice(0,3000);
   const {data,error}=await db.rpc('create_agent_workspace_project',{p_owner:owner,p_source:'alex',p_brief:input.brief,p_meta:meta});
   if(error)throw error;return reply({project_id:data.id});
  }
  const project=String(input.project_id||'');if(!/^[a-f0-9-]{36}$/i.test(project))throw Error('Choose a project');
  const {data:a,error:ae}=await db.from('agent_team_assignments').select('id,title').eq('id',project).eq('owner_id',owner).maybeSingle();if(ae||!a)return reply({error:'Project not found'},404);
  if(action==='details'){
   const {data:session,error:sessionError}=await db.from('agent_project_sessions').select('revision,phase,output_version,review_status,final_output,updated_at,team_order,next_worker,recovery_state,next_run_at').eq('owner_id',owner).eq('assignment_id',project).maybeSingle();if(sessionError)throw sessionError;
   const context=await loadProjectWorkspace(db,owner,project);
   const files=await projectFilePage(db,owner,project),photos=await projectPhotoList(db,owner,project);
   return reply({context,...files,photos,project:a,session:session||{revision:1,phase:'planning'},revision:session?.revision??1});
  }
  if(action==='files')return reply(await projectFilePage(db,owner,project,input.cursor));
  if(action==='asset'||action==='photo_asset')return reply(await projectAsset(db,owner,project,input.file_id,action==='photo_asset'));
  if(action==='photo')return reply(await saveProjectPhoto(db,owner,project,input));
  if(action==='export_project')return reply(await exportProject(db,owner,a,input));
  if(action==='update'){
   const {data,error}=await db.rpc('update_agent_project_context',{p_owner:owner,p_assignment:project,p_note:input.note,p_from_worker:input.from_worker||null,p_expected_revision:input.revision??null,p_business_key:input.business_key??null,p_output_format:input.output_format??null});
   if(error)throw error;return reply(data);
  }
  if(action==='reference'){
   const file=validateReference(input.filename,input.content);
   const {data,error}=await db.rpc('add_agent_project_reference',{p_owner:owner,p_assignment:project,p_name:file.filename,p_content:file.content,p_from_worker:input.from_worker||null,p_expected_revision:input.revision??null});
   if(error)throw error;return reply(data);
  }
  return reply({error:'Unsupported workspace action'},400);
 }catch(e){return reply({error:typeof (e as any)?.message==='string'?(e as any).message.slice(0,300):'Workspace operation failed'},400);}
});
