import {createClient} from 'npm:@supabase/supabase-js@2.79.0';
import {socialUrl,capturePacket} from './policy.ts';
import {analyzeSocialPage} from '../_shared/social-read-analysis.ts';
const ORIGIN='https://hostkris.github.io';
const env=(s:string)=>Deno.env.get(s)?.trim()||'';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'OPTIONS,POST','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==ORIGIN)return reply({error:'Origin not allowed'},403);
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'').trim();
 if(!token)return reply({error:'Sign into Agent HQ under Settings first.'},401);
 const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await db.auth.getUser(token);
 if(authError||!auth?.user)return reply({error:'Your Agent HQ sign-in expired.'},401);
 const owner=auth.user.id;
 if(!env('AGENT_HQ_ALLOWED_OWNER_IDS').split(',').some(x=>x.trim().toLowerCase()===owner.toLowerCase()))return reply({error:'This account is not authorized for worker connections.'},403);
 let id='';
 const transition=async(action:string,data:unknown)=>{const r=await db.rpc('agent_social_read_transition',{p_owner:owner,p_action:action,p_data:data});if(r.error)throw Error(r.error.message);if(!r.data)throw Error('Reading request was not confirmed.');return r.data};
 try{
  const body=await req.text();if(body.length>90000)return reply({error:'Request is too large.'},413);
  const input=JSON.parse(body);if(!input||Array.isArray(input))throw Error('Invalid reading request.');
  if(input.employee_id&&input.employee_id!=='riley')throw Error('Riley handles these reading requests.');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(input.action==='request'){
   if(!uuid.test(input.account_id||''))throw Error('Choose a saved Facebook profile.');
   const purpose=String(input.purpose||'').trim();if(purpose.length<5||purpose.length>1000)throw Error('Describe the research task in 5–1,000 characters.');
   return reply({success:true,request:await transition('request',{account_id:input.account_id,purpose,source_url:socialUrl(input.source_url)})});
  }
  id=String(input.id||'');if(!uuid.test(id))throw Error('Choose a valid reading request.');
  if(['approve','deny','revoke'].includes(input.action))return reply({success:true,request:await transition(input.action,{id})});
  if(input.action==='handoff'){
   const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
   const grant=await db.rpc('agent_social_read_handoff',{p_action:'issue',p_owner:owner,p_request:id,p_hash:hash});
   if(grant.error||!grant.data)throw Error(grant.error?.message||'Approve this page first.');
   return reply({success:true,handoff:{kind:'agenthq.safari-handoff.v1',token,...grant.data}});
  }
  if(input.action!=='analyze')throw Error('Only page-reading approvals and shared-text analysis are available.');
  await analyzeSocialPage(db,owner,id,capturePacket(input.capture),env);
  return reply({success:true});
 }catch(e){
  return reply({error:e instanceof SyntaxError?'Invalid request format.':e instanceof Error?e.message:'Reading request failed.'},400);
 }
});
