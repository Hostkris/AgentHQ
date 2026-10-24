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

 // Live, owner-scoped, read-only GitHub verification. No credentials or connection IDs leave this endpoint.
 if(input.action==="nango_verify"){
   const checkedAt=new Date().toISOString();
   const base={checkedAt,configured:nangoReady(),verified:false,readOnly:true};
   const output=(state:string,message:string,extra:Record<string,unknown>={})=>
     response(req,{...base,state,message,...extra});
   if(!nangoReady())return output("not_configured","Nango is not configured in Agent HQ.");
   const nangoKey=env("AGENT_HQ_NANGO_VERIFY_KEY")||env("AGENT_HQ_NANGO_SECRET_KEY");
   // The optional verification key can have read-only list & proxy scopes and no Connect Session permissions.
   const requestHeaders={"authorization":"Bearer "+nangoKey,"accept":"application/json"};
   let selected:Record<string,unknown>|null=null;
   let sawBroken=false;
   let sawMatching=false;
   try{
     // Scope the search at Nango too, then check the owner and integration again locally.
     for(let page=1;page<=5&&!selected;page++){
       const u=new URL("https://api.nango.dev/connections");
       u.searchParams.set("tags[end_user_id]",owner);
       u.searchParams.set("limit","100");
       u.searchParams.set("page",String(page));
       const res=await fetch(u.toString(),{method:"GET",headers:requestHeaders,signal:AbortSignal.timeout(12000)});
       if(res.status===401)return output("credentials_invalid","Nango rejected the verification API key. Check the key and its environment in Supabase.");
       if(res.status===403)return output("permissions_needed","Nango does not allow this key to list connections. It needs the environment:connections:list permission (without credentials access). The read-only GitHub test also requires environment:proxy.");
       if(!res.ok)return output("provider_error","Nango connection lookup returned HTTP "+res.status+". Retry later; no live verification was completed.");
       const json=await res.json();
       if(!Array.isArray(json?.connections))return output("provider_error","Nango returned an unexpected connections response. Nothing was marked verified.");
       const matches=json.connections.filter((c:Record<string,unknown>)=>
         c&&typeof c==="object"&&
         c.tags&&typeof c.tags==="object"&&
         (c.tags as Record<string,unknown>).end_user_id===owner&&
         integrations().includes(String(c.provider_config_key||""))&&
         String(c.provider||"").toLowerCase()==="github"&&
         typeof c.connection_id==="string"&&c.connection_id.length>0
       );
       sawMatching ||= matches.length>0;
       // Prefer the newest connection, and never treat a connection with auth errors as verified.
       matches.sort((a:Record<string,unknown>,b:Record<string,unknown>)=>Date.parse(String(b.created||0))-Date.parse(String(a.created||0)));
       selected=matches.find((c:Record<string,unknown>)=>!Array.isArray(c.errors)||c.errors.length===0)||null;
       if(matches.length&&!selected)sawBroken=true;
       if(json.connections.length<100)break;
     }
     if(!selected){
       if(sawMatching||sawBroken)return output("needs_reconnect","Nango found a GitHub authorization linked to this Agent HQ account, but it reports authorization errors. Inspect that connection in Nango; do not reconnect until its error is understood.",{authorizationFound:true});
       // Diagnostic only. An unfiltered list cannot authorize access to any other user's connection.
       // Return no connection IDs, tags, emails or other cross-account details.
       let githubExists=false;
       let githubExistsInAnotherAccount=false;
       let diagnosisComplete=false;
       try{
         for(let page=1;page<=5;page++){
           const u=new URL("https://api.nango.dev/connections");
           u.searchParams.set("limit","100");
           u.searchParams.set("page",String(page));
           const res=await fetch(u.toString(),{method:"GET",headers:requestHeaders,signal:AbortSignal.timeout(12000)});
           if(!res.ok)break;
           const json=await res.json();
           if(!Array.isArray(json?.connections))break;
           for(const c of json.connections){
             if(!c||typeof c!=="object")continue;
             const record=c as Record<string,unknown>;
             if(!integrations().includes(String(record.provider_config_key||"")))continue;
             githubExists=true;
             const tags=record.tags&&typeof record.tags==="object"?record.tags as Record<string,unknown>:{};
             if(tags.end_user_id!==owner)githubExistsInAnotherAccount=true;
           }
           if(json.connections.length<100){diagnosisComplete=true;break;}
         }
       }catch{}
       if(githubExistsInAnotherAccount)return output("owner_tag_mismatch","Nango has a GitHub connection in this environment, but it is not tagged to this Agent HQ account. Agent HQ will not use an unlinked connection. Inspect the connection's end_user_id tag in Nango. Do not authorize again yet.");
       if(githubExists)return output("matching_details_mismatch","Nango has a GitHub integration connection, but its details did not pass Agent HQ's exact owner-and-provider checks. Inspect the connection details and provider in Nango; nothing was marked verified.");
       if(diagnosisComplete)return output("environment_no_connection","Nango lists no connection for the configured GitHub integration in this API key's environment. Check the Dev/Prod environment and the Nango Connections tab, not the Integrations tab. An OAuth success page alone does not establish API access.");
       return output("diagnostic_incomplete","No owner-matched GitHub connection was returned. The environment-wide diagnostic did not finish, so Agent HQ cannot determine whether the issue is an environment mismatch or an owner tag mismatch. No reauthorization is recommended yet.");
     }
     // A fixed GET only: never accept provider URLs, paths, or connection IDs from the browser.
     const connectionId=String(selected.connection_id);
     const integrationId=String(selected.provider_config_key);
     const ping=await fetch("https://api.nango.dev/proxy/user",{
       method:"GET",
       headers:{...requestHeaders,"Provider-Config-Key":integrationId,"Connection-Id":connectionId,"Accept":"application/vnd.github+json"},
       signal:AbortSignal.timeout(12000)
     });
     if(ping.status===401)return output("needs_reconnect","GitHub's read-only API check was unauthorized. The OAuth connection may need repair.",{authorizationFound:true});
     if(ping.status===403)return output("proxy_permission_needed","Nango found your GitHub authorization, but the read-only API check was denied (HTTP 403). Check the Nango key's environment:proxy scope and GitHub permissions.",{authorizationFound:true});
     if(!ping.ok)return output("api_error","Nango found your GitHub authorization, but the read-only API test returned HTTP "+ping.status+".",{authorizationFound:true});
     const user=await ping.json();
     if(typeof user?.login!=="string"||!user.login)return output("api_error","GitHub returned an unexpected profile response, so the connection remains unverified.",{authorizationFound:true});
     return output("api_verified","GitHub authorization found, and a real read-only GitHub profile request succeeded.",{verified:true,authorizationFound:true,githubLogin:user.login});
   }catch{
     return output("unavailable","Nango or GitHub did not complete the verification request. Nothing was marked verified; retry the check.");
   }
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
