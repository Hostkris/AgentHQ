import {createClient} from "npm:@supabase/supabase-js@2.79.0";
// Agent HQ read-only Meta Ads: OAuth authorization code, server encryption, owner-scoped insights.
const APP_ORIGIN="https://hostkris.github.io";
export const APP_RETURN=APP_ORIGIN+"/AgentHQ/?meta=connected";
const CALLBACK_BASE="https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-meta-ads";
export const CALLBACK=CALLBACK_BASE+"?op=callback";
export const env=(s:string)=>Deno.env.get(s)?.trim()||"";
export const GRAPH_VERSION=/^v\d+\.\d+$/.test(env("META_GRAPH_VERSION"))?env("META_GRAPH_VERSION"):"v26.0";
export const GRAPH="https://graph.facebook.com/"+GRAPH_VERSION;
export const required=["META_APP_ID","META_APP_SECRET","META_TOKEN_ENCRYPTION_KEY"] as const;
export const accountPattern=/^act_[0-9]{1,32}$/;
export const presets=["yesterday","last_7d","last_30d"] as const;
const td=new TextDecoder(),te=new TextEncoder();
export const config=()=>({missing:required.filter(x=>!env(x))});
export function cors(req:Request){
 const origin=req.headers.get("Origin");
 const allowed=origin===APP_ORIGIN||Boolean(origin?.startsWith("http://localhost:")||origin?.startsWith("http://127.0.0.1:"));
 return {"Access-Control-Allow-Origin":allowed&&origin?origin:APP_ORIGIN,
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"};
}
export function json(req:Request,payload:unknown,status=200){
 return new Response(JSON.stringify(payload),{status,headers:cors(req)});
}
export function allowOrigin(req:Request){
 const origin=req.headers.get("Origin");
 return !origin||origin===APP_ORIGIN||origin.startsWith("http://localhost:")||origin.startsWith("http://127.0.0.1:");
}
export function base64url(bytes:Uint8Array){
 let s="";for(const v of bytes)s+=String.fromCharCode(v);
 return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function unbase64(s:string){
 if(!/^[A-Za-z0-9+/_-]+={0,2}$/.test(s))throw Error("Invalid encryption key format");
 const normalized=s.replace(/-/g,"+").replace(/_/g,"/");
 const binary=atob(normalized);
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
export async function digestHex(value:string){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(value)));
 return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
export async function aesKey(){
 const raw=unbase64(env("META_TOKEN_ENCRYPTION_KEY"));
 if(raw.length!==32)throw Error("META_TOKEN_ENCRYPTION_KEY must be base64-encoded 32 random bytes");
 return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
}
export async function encrypt(secret:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const output=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(),te.encode(secret)));
 return {cipher:base64url(output),iv:base64url(iv)};
}
export async function decrypt(cipher:string,nonce:string){
 const output=await crypto.subtle.decrypt({name:"AES-GCM",iv:unbase64(nonce)},
  await aesKey(),unbase64(cipher));
 return td.decode(output);
}
export async function appSecretProof(accessToken:string){
 const key=await crypto.subtle.importKey("raw",te.encode(env("META_APP_SECRET")),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=new Uint8Array(await crypto.subtle.sign("HMAC",key,te.encode(accessToken)));
 return Array.from(signature,x=>x.toString(16).padStart(2,"0")).join("");
}
function safeError(code:string,message:string){return {error:message,code}}
export async function metaGET(path:string,token:string,params:Record<string,string>={}){
 const u=new URL(GRAPH+"/"+path.replace(/^\//,""));
 for(const [key,value] of Object.entries(params))u.searchParams.set(key,value);
 u.searchParams.set("appsecret_proof",await appSecretProof(token));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const result=await fetch(u,{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:controller.signal});
  const body=await result.json().catch(()=>null);
  if(!result.ok){
   const kind=body?.error?.code===190?"token_invalid":
    result.status===429?"rate_limit":result.status===403?"access_denied":"provider_error";
   throw Object.assign(Error("Meta returned "+result.status+"; reconnect or check your account permissions."),{kind});
  }
  return body;
 }finally{clearTimeout(timer)}
}
export async function exchange(params:Record<string,string>){
 const u=new URL(GRAPH+"/oauth/access_token");
 for(const [key,value] of Object.entries(params))u.searchParams.set(key,value);
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const response=await fetch(u,{headers:{Accept:"application/json"},signal:ctrl.signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.access_token)throw Error("Meta did not authorize the account connection");
  return result;
 }finally{clearTimeout(timer)}
}
export function cleanAccount(raw:any){
 const id=String(raw?.id||"");
 const currency=String(raw?.currency||"");
 if(!accountPattern.test(id)||!/^[A-Z]{3}$/.test(currency))return null;
 return {account_id:id,name:String(raw?.name||id).slice(0,220)||id,currency,
  timezone_name:String(raw?.timezone_name||"").slice(0,100),
  account_status:Number.isInteger(raw?.account_status)?raw.account_status:null};
}
export function admin(){
 const url=env("SUPABASE_URL"),key=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)throw Error("Supabase service credentials are unavailable");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export const stamp=()=>new Date().toISOString();
export async function userFromRequest(req:Request,db:ReturnType<typeof admin>){
 const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"").trim();
 if(!token)throw Error("Sign in under Agent HQ Settings.");
 const {data,error}=await db.auth.getUser(token);
 if(error||!data?.user)throw Error("Your Agent HQ sign-in expired. Sign in again.");
 return data.user.id;
}
export async function connection(db:ReturnType<typeof admin>,owner:string){
 const {data,error}=await db.from("agent_meta_ads_connections")
  .select("owner_id,meta_user_id,encrypted_access_token,token_iv,token_expires_at,status,updated_at")
  .eq("owner_id",owner).maybeSingle();
 if(error)throw Error("Meta connection information could not be read");
 return data;
}
export async function access(db:ReturnType<typeof admin>,owner:string){
 const stored=await connection(db,owner);
 if(!stored||stored.status!=="active")throw Error("Connect Meta Ads from Operations first.");
 if(Date.parse(stored.token_expires_at)<Date.now()+60000){
  await db.from("agent_meta_ads_connections").update({status:"reconnect_required",updated_at:stamp()}).eq("owner_id",owner);
  throw Error("Your Meta sign-in has expired. Reconnect from Operations.");
 }
 return decrypt(stored.encrypted_access_token,stored.token_iv);
}
export async function adAccounts(db:ReturnType<typeof admin>,owner:string,token:string){
 const payload=await metaGET("me/adaccounts",token,{fields:"id,name,currency,timezone_name,account_status",limit:"100"});
 const accounts=(Array.isArray(payload?.data)?payload.data:[]).map(cleanAccount).filter(Boolean);
 // An owner may only read an ad account discovered from their own Meta token.
 if(accounts.length){
  const {error}=await db.from("agent_meta_ad_accounts").upsert(accounts.map((a:any)=>({
   owner_id:owner,...a,last_seen_at:stamp()
  })),{onConflict:"owner_id,account_id"});
  if(error)throw Error("Could not securely save your advertising account list");
 }
 return {accounts,has_more:Boolean(payload?.paging?.next)};
}
export function asNumber(value:unknown){const n=Number(value??0);return Number.isFinite(n)&&n>=0?n:0}
export function metric(row:any){
 return {spend:asNumber(row?.spend),impressions:asNumber(row?.impressions),clicks:asNumber(row?.clicks),
  reach:asNumber(row?.reach),ctr:asNumber(row?.ctr),cpc:asNumber(row?.cpc),
  date_start:String(row?.date_start||""),date_stop:String(row?.date_stop||"")};
}
export function redirect(code:string){
 const location=new URL(APP_RETURN);
 location.searchParams.set("meta",code);
 return new Response(null,{status:303,headers:{"Location":location.toString(),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}
