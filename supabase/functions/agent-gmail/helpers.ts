import {createClient} from "npm:@supabase/supabase-js@2.79.0";
export const ORIGIN="https://hostkris.github.io";
export const RETURN_URL=ORIGIN+"/AgentHQ/?gmail=connected";
export const FN_BASE="https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-gmail";
export const CALLBACK=FN_BASE+"?op=callback";
export const READ_SCOPE="https://www.googleapis.com/auth/gmail.readonly";
export const SEND_SCOPE="https://www.googleapis.com/auth/gmail.send";
const enc=new TextEncoder(),dec=new TextDecoder();
export const env=(name:string)=>Deno.env.get(name)?.trim()||"";
export const missing=()=>["GOOGLE_OAUTH_CLIENT_ID","GOOGLE_OAUTH_CLIENT_SECRET","GMAIL_TOKEN_ENCRYPTION_KEY"].filter(n=>!env(n));
export const timestamp=()=>new Date().toISOString();
export function allowOrigin(req:Request){
 const origin=req.headers.get("Origin");
 return !origin||origin===ORIGIN||origin.startsWith("http://localhost:")||origin.startsWith("http://127.0.0.1:");
}
export function cors(req:Request){
 const origin=req.headers.get("Origin");
 return {"Access-Control-Allow-Origin":origin&&allowOrigin(req)?origin:ORIGIN,
  "Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"};
}
export function respond(req:Request,body:unknown,status=200){
 return new Response(JSON.stringify(body),{status,headers:cors(req)});
}
export function admin(){
 const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)throw Error("Supabase credentials are unavailable");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export type DB=ReturnType<typeof admin>;
export async function signedUser(req:Request,db:DB){
 const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"").trim();
 if(!token)throw Error("Sign in under Agent HQ Settings");
 const {data,error}=await db.auth.getUser(token);
 if(error||!data?.user)throw Error("Your Agent HQ sign-in expired. Sign in again.");
 return data.user.id;
}
function fromBase64(text:string){
 if(!/^[A-Za-z0-9/_+-]+={0,2}$/.test(text))throw Error("Invalid base64 value");
 const normalized=text.replace(/-/g,"+").replace(/_/g,"/");
 const bin=atob(normalized);
 return Uint8Array.from(bin,x=>x.charCodeAt(0));
}
export function base64Url(data:Uint8Array){
 let text="";for(const v of data)text+=String.fromCharCode(v);
 return btoa(text).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export async function hash(value:string){
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value))),
  v=>v.toString(16).padStart(2,"0")).join("");
}
async function cryptoKey(){
 const key=fromBase64(env("GMAIL_TOKEN_ENCRYPTION_KEY"));
 if(key.length!==32)throw Error("GMAIL_TOKEN_ENCRYPTION_KEY must be base64 32 random bytes");
 return crypto.subtle.importKey("raw",key,"AES-GCM",false,["encrypt","decrypt"]);
}
export async function encrypt(value:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await cryptoKey(),enc.encode(value)));
 return {value:base64Url(ciphertext),iv:base64Url(iv)};
}
export async function decrypt(value:string,iv:string){
 const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64(iv)},await cryptoKey(),fromBase64(value));
 return dec.decode(raw);
}
export async function validateCrypto(){await cryptoKey()}
async function network(url:string,init:RequestInit={}){
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),14000);
 try{return await fetch(url,{...init,signal:control.signal})}
 finally{clearTimeout(timer)}
}
export async function googleToken(params:Record<string,string>){
 const response=await network("https://oauth2.googleapis.com/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams(params).toString()
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data?.access_token)throw Object.assign(Error("Google sign-in could not be completed. Try reconnecting."),{kind:"oauth_error"});
 return data;
}
export async function googleGet(path:string,token:string,params:Record<string,string>={}){
 const u=new URL("https://gmail.googleapis.com/gmail/v1/users/me/"+path.replace(/^\//,""));
 for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
 const response=await network(u.toString(),{headers:{Authorization:"Bearer "+token,Accept:"application/json"}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(Error(response.status===401?
  "Google session expired. Reconnect Gmail.":"Gmail request failed ("+response.status+")."),{kind:response.status===401?"token_invalid":"gmail_error"});
 return data;
}
export async function gmailSend(token:string,raw:string,threadId:string){
 const response=await network("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
  method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json"},
  body:JSON.stringify({raw,threadId})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data?.id)throw Object.assign(Error("Gmail did not confirm sending. Check Sent in Gmail before attempting again."),
  {kind:response.status===401?"token_invalid":"send_uncertain"});
 return data;
}
export async function getConnection(db:DB,owner:string){
 const {data,error}=await db.from("agent_gmail_connections").select(
  "owner_id,gmail_address,encrypted_access_token,access_iv,encrypted_refresh_token,refresh_iv,scopes,token_expires_at,status,ai_drafting_enabled,last_checked_at"
 ).eq("owner_id",owner).maybeSingle();
 if(error)throw Error("Gmail connection could not be loaded");
 return data;
}
export async function accessToken(db:DB,owner:string){
 const c=await getConnection(db,owner);
 if(!c||c.status!=="active")throw Error("Connect Gmail in Email Center first.");
 if(Date.parse(c.token_expires_at)>Date.now()+90000)
  return {token:await decrypt(c.encrypted_access_token,c.access_iv),connection:c};
 try{
  const refresh=await decrypt(c.encrypted_refresh_token,c.refresh_iv);
  const token=await googleToken({client_id:env("GOOGLE_OAUTH_CLIENT_ID"),
   client_secret:env("GOOGLE_OAUTH_CLIENT_SECRET"),refresh_token:refresh,grant_type:"refresh_token"});
  const newSecret=await encrypt(token.access_token);
  const expires=new Date(Date.now()+Math.max(60,Number(token.expires_in)||3600)*1000).toISOString();
  const {error}=await db.from("agent_gmail_connections").update({
   encrypted_access_token:newSecret.value,access_iv:newSecret.iv,token_expires_at:expires,
   status:"active",updated_at:timestamp()
  }).eq("owner_id",owner);
  if(error)throw Error("Could not refresh Gmail credentials");
  return {token:token.access_token,connection:{...c,token_expires_at:expires}};
 }catch{
  await db.from("agent_gmail_connections").update({status:"reconnect_required",updated_at:timestamp()}).eq("owner_id",owner);
  throw Error("Gmail authorization needs renewal. Reconnect from Email Center.");
 }
}
export function redirect(code:string){
 const u=new URL(RETURN_URL);
 u.searchParams.set("gmail",code);
 return new Response(null,{status:303,headers:{"Location":u.toString(),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
export function textParts(payload:any):string{
 if(!payload||typeof payload!=="object")return "";
 const nodes:any[]=[payload],plain:string[]=[],html:string[]=[];
 while(nodes.length){
  const node=nodes.pop();
  if(!node||nodes.length>25)break;
  if(Array.isArray(node.parts))nodes.push(...node.parts.slice(0,15));
  const type=String(node.mimeType||"").toLowerCase();
  const raw=node.body?.data;
  if(typeof raw!=="string"||raw.length>32000)continue;
  try{
   const content=dec.decode(fromBase64(raw)).slice(0,4500);
   if(type==="text/plain")plain.push(content);
   if(type==="text/html")html.push(content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&"));
  }catch{}
 }
 return (plain.join("\n")||html.join("\n")).slice(0,3500);
}
export function emailAddress(raw:string){
 const value=String(raw||"").replace(/[\r\n]/g," ").trim();
 const match=value.match(/<([^<>\s,;]+@[^<>\s,;]+)>/)||value.match(/(^|\s)([^\s<>@,;]+@[^\s<>@,;]+)(?=\s|$)/);
 const candidate=(match?match[1]?.includes("@")?match[1]:match[2]:"")||"";
 return /^[A-Z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(candidate)?candidate.toLowerCase():"";
}
export function cleanHeader(s:unknown,max=500){return String(s||"").replace(/[\r\n\t]+/g," ").trim().slice(0,max)}
export function makeReply(email:string,to:string,subject:string,body:string,msgId:string,refs:string){
 const safeEmail=emailAddress(email),safeTo=emailAddress(to);
 if(!safeEmail||!safeTo)throw Error("The email recipient couldn't be verified. Do not send.");
 const cleanSubj=cleanHeader(subject,490);
 const replySubj=/^re\s*:/i.test(cleanSubj)?cleanSubj:"Re: "+cleanSubj;
 const headers=["From: <"+safeEmail+">","To: <"+safeTo+">","Subject: "+replySubj,
  "MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8"];
 const ids=String(refs||"").match(/<[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+>/g)||[];
 const original=String(msgId||"").match(/^<[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+>$/)?.[0];
 if(original){
  headers.push("In-Reply-To: "+original,"References: "+[...ids,original].slice(-15).join(" "));
 }
 const content=headers.join("\r\n")+"\r\n\r\n"+body.replace(/\r?\n/g,"\r\n");
 return base64Url(enc.encode(content));
}
