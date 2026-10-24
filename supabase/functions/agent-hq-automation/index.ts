// Agent HQ's combined Activepieces + Nango adapter.
// Existing Gmail/Meta credentials are deliberately never imported or overwritten.
import {createClient} from "npm:@supabase/supabase-js@2.79.0";
const env=(key:string)=>Deno.env.get(key)?.trim()||"";
const originAllowed=(o:string|null)=>!o||o==="https://hostkris.github.io"||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o);
const headers=(req:Request)=>({
 "Access-Control-Allow-Origin":originAllowed(req.headers.get("origin"))&&req.headers.get("origin")?req.headers.get("origin")!:"https://hostkris.github.io",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store","Vary":"Origin"
});
const response=(req:Request,body:unknown,code=200)=>new Response(JSON.stringify(body),{status:code,headers:headers(req)});
const integrations=()=>env("AGENT_HQ_NANGO_INTEGRATIONS").split(",").map(s=>s.trim()).filter(s=>/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(s)).slice(0,30);
const nangoReady=()=>!!env("AGENT_HQ_NANGO_SECRET_KEY")&&integrations().length>0;
const flowUrl=()=>{try{const value=env("AGENT_HQ_ACTIVEPIECES_PILOT_WEBHOOK");const u=new URL(value);
 if(u.protocol!=="https:"||u.username||u.password||!u.hostname.includes(".")||/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(u.hostname))return "";
 return u.toString();}catch{return ""}};
const activepiecesReady=()=>!!flowUrl()&&!!env("AGENT_HQ_ACTIVEPIECES_PILOT_SECRET");
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:headers(req)});
 if(!originAllowed(req.headers.get("origin")))return response(req,{error:"Origin not allowed"},403);
 if(req.method!=="POST")return response(req,{error:"POST only"},405);
 if(Number(req.headers.get("content-length")||0)>4096)return response(req,{error:"Request too large"},413);
 const token=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return response(req,{error:"Sign in required"},401);
 const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return response(req,{error:"Agent HQ backend unavailable"},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)return response(req,{error:"Session expired; sign in again"},401);
 const owner=data.user.id;
 const owners=env("AGENT_HQ_ALLOWED_OWNER_IDS").toLowerCase().split(",").map(s=>s.trim()).filter(Boolean);
 if(!owners.includes(owner.toLowerCase()))return response(req,{error:"This owner is not authorized for connector operations"},403);
 let input:Record<string,unknown>;
 try{const parsed=await req.json();if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error();input=parsed;}
 catch{return response(req,{error:"Invalid JSON object"},400)}
 if(input.action==="status")return response(req,{activepieces:{configured:activepiecesReady(),scope:"test webhook only",verified:false},
   nango:{configured:nangoReady(),integrations:integrations(),verified:false},
   note:"Configuration alone does not verify a live connection or grant agent execution permission."});
 if(input.action==="connect_session"){
   if(!nangoReady())return response(req,{error:"Nango is not configured. Set the server-side key and allowed integrations."},503);
   try{
     const result=await fetch("https://api.nango.dev/connect/sessions",{
       method:"POST",headers:{"authorization":"Bearer "+env("AGENT_HQ_NANGO_SECRET_KEY"),"content-type":"application/json"},
       body:JSON.stringify({tags:{end_user_id:owner,...(data.user.email?{end_user_email:data.user.email}:{})},allowed_integrations:integrations()}),
       signal:AbortSignal.timeout(12000)
     });
     if(!result.ok)return response(req,{error:result.status===401||result.status===403?"Nango rejected the server credentials.":"Nango could not create a connect session (HTTP "+result.status+")."},502);
     const payload=await result.json();
     const session=payload?.data?.token;
     if(typeof session!=="string"||!session)return response(req,{error:"Nango did not return a session token"},502);
     // Nango's hosted connect link avoids loading a third-party SDK in Safari/PWAs.
     const connectLink=payload?.data?.connect_link;
     let safeLink="";
     try{
       if(typeof connectLink==="string"){
         const u=new URL(connectLink);
         if(u.protocol==="https:"&&u.hostname==="connect.nango.dev"&&!u.username&&!u.password)safeLink=u.toString();
       }
     }catch{}
     if(!safeLink)return response(req,{error:"Nango returned a session but no valid hosted connection link. Retry or check Nango's service status."},502);
     return response(req,{sessionToken:session,connectLink:safeLink,expiresAt:payload?.data?.expires_at||null});
   }catch{return response(req,{error:"Nango is temporarily unreachable. Retry the connection."},504)}
 }
 if(input.action==="activepieces_pilot"){
   if(!activepiecesReady())return response(req,{error:"Activepieces pilot webhook and secret are not configured."},503);
   // This is a non-sensitive delivery probe, NOT permission to publish, transfer data, or spend money.
   const requestId=crypto.randomUUID();
   try{
     const result=await fetch(flowUrl(),{method:"POST",
       headers:{"content-type":"application/json","x-agenthq-webhook-secret":env("AGENT_HQ_ACTIVEPIECES_PILOT_SECRET")},
       body:JSON.stringify({event:"agenthq.pilot.ping",requestId,createdAt:new Date().toISOString()}),
       signal:AbortSignal.timeout(12000)});
     if(!result.ok)return response(req,{delivered:false,error:"Activepieces pilot webhook returned HTTP "+result.status,requestId},502);
     return response(req,{delivered:true,requestId,message:"Webhook accepted the test. Flow execution and downstream actions are not yet verified."});
   }catch{return response(req,{delivered:false,error:"Activepieces webhook unreachable; no execution was confirmed.",requestId},504)}
 }
 return response(req,{error:"Unsupported connector operation"},400);
});
