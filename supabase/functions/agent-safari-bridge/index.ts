import {createClient} from 'npm:@supabase/supabase-js@2.79.0';
import {capturePacket,socialUrl} from '../agent-social-read/policy.ts';
import {analyzeSocialPage} from '../_shared/social-read-analysis.ts';
const env=(key:string)=>Deno.env.get(key)?.trim()||'';
// This endpoint uses a 256-bit, single-page capability instead of an owner JWT.
// Safari never receives the owner's Supabase session or any server secret.
export async function tokenHash(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('')}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin')||'';
 const allowed=!origin||origin==='null'||/^safari-web-extension:\/\/[a-z0-9-]+$/i.test(origin)||['https://hostkris.github.io','https://facebook.com','https://www.facebook.com','https://m.facebook.com','https://mbasic.facebook.com','https://web.facebook.com','https://messenger.com','https://www.messenger.com'].includes(origin);
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed&&origin?origin:'https://hostkris.github.io','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!allowed)return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'').trim()||'';
 if(!/^[0-9a-f]{64}$/.test(token))return reply({error:'An approved Safari handoff is required.'},401);
 try{
  const body=await req.text();if(body.length>90000)return reply({error:'Request too large'},413);
  const input=JSON.parse(body);
  if(!input||!['check','analyze'].includes(input.action))return reply({error:'Only an approved page read is available.'},400);
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const found=await db.rpc('agent_social_read_handoff',{p_action:'resolve',p_owner:null,p_request:null,p_hash:await tokenHash(token)});
  if(found.error||!found.data)return reply({error:'Permission is missing, used, expired or revoked. Return to Riley’s thread.'},401);
  const job=found.data;
  if(!env('AGENT_HQ_ALLOWED_OWNER_IDS').split(',').some(x=>x.trim().toLowerCase()===String(job.owner_id).toLowerCase()))return reply({error:'Connection unavailable'},403);
  if(socialUrl(input.source_url)!==job.source_url)return reply({error:'This page differs from the approved page.'},403);
  if(input.action==='check')return reply({success:true,ready:true});
  const packet=capturePacket(input.capture);
  if(packet.source_url!==job.source_url)return reply({error:'This capture differs from the approved page.'},403);
  await analyzeSocialPage(db,job.owner_id,job.id,packet,env);
  return reply({success:true});
 }catch(e){return reply({error:e instanceof SyntaxError?'Invalid request.':e instanceof Error?e.message:'Reading failed.'},400)}
});
