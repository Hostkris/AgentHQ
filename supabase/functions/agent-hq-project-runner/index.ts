import {createClient} from 'npm:@supabase/supabase-js@2.79.0';
import {handleProjectRunner} from './handler.ts';
import {projectRuntime} from '../_shared/project-runtime.ts';
const env=(key:string)=>Deno.env.get(key)?.trim()||'';
Deno.serve(async(req:Request)=>{
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return new Response(JSON.stringify({error:'Project service unavailable'}),{status:503,headers:{'Content-Type':'application/json'}});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 return await handleProjectRunner(req,{db,allowedOwners:env('AGENT_HQ_ALLOWED_OWNER_IDS'),makeRuntime:projectRuntime});
});
