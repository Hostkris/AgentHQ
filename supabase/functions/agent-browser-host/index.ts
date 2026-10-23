import {createClient} from 'npm:@supabase/supabase-js@2.79.0';
import {checkHost} from './provider.ts';
const ORIGIN='https://hostkris.github.io';
const env=(s:string)=>Deno.env.get(s)?.trim()||'';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'OPTIONS,POST','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==ORIGIN)return response({error:'Origin not allowed'},403);
 if(req.method!=='POST')return response({error:'POST required'},405);
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'').trim();
 if(!token)return response({error:'Sign in under Settings first.'},401);
 if(!env('SUPABASE_URL')||!env('SUPABASE_SERVICE_ROLE_KEY'))return response({error:'Host connection service is unavailable.'},503);
 const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data?.user)return response({error:'Your sign-in expired. Sign in under Settings.'},401);
 if(!env('AGENT_HQ_ALLOWED_OWNER_IDS').split(',').some(x=>x.trim().toLowerCase()===data.user.id.toLowerCase()))return response({error:'This account is not authorized for worker connections.'},403);
 let input;try{input=await req.json()}catch{return response({error:'Invalid request'},400)}
 if(!input||Array.isArray(input)||input.action!=='check')return response({error:'Only the read-only connection check is available. Facebook sending is not connected.'},400);
 return response(await checkHost(env('BROWSERBASE_API_KEY'),env('BROWSERBASE_PROJECT_ID')));
});
