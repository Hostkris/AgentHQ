import {
 APP_RETURN,CALLBACK,env,GRAPH_VERSION,GRAPH,config,cors,json,allowOrigin,
 base64url,digestHex,aesKey,encrypt,metaGET,exchange,admin,stamp,
 userFromRequest,connection,access,adAccounts,metric,asNumber,redirect,
 accountPattern,presets
} from "./helpers.ts";

async function authorize(db:ReturnType<typeof admin>,owner:string,req:Request){
 const setup=config();
 if(setup.missing.length)return json(req,{error:"Configure "+setup.missing.join(", ")+" in Supabase Edge Function Secrets before connecting.",missing:setup.missing},503);
 await aesKey();
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 const state=base64url(bytes);
 const hash=await digestHex(state);
 const {error}=await db.from("agent_meta_oauth_states").insert({
  state_hash:hash,owner_id:owner,expires_at:new Date(Date.now()+600000).toISOString()
 });
 if(error)throw Error("Could not create a secure Meta authorization request");
 const authorize=new URL("https://www.facebook.com/"+GRAPH_VERSION+"/dialog/oauth");
 authorize.searchParams.set("client_id",env("META_APP_ID"));
 authorize.searchParams.set("redirect_uri",CALLBACK);
 authorize.searchParams.set("response_type","code");
 authorize.searchParams.set("scope","ads_read");
 authorize.searchParams.set("state",state);
 return json(req,{authorization_url:authorize.toString(),scope:"ads_read",expires_in_seconds:600});
}
async function callback(req:Request){
 const url=new URL(req.url);
 if(url.searchParams.has("error"))return redirect("cancelled");
 const state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
 if(state.length<32||state.length>200||!code||code.length>3000)return redirect("error");
 const setup=config();
 if(setup.missing.length)return redirect("setup");
 try{
  const db=admin();
  const {data:owner,error:consumeError}=await db.rpc("consume_agent_meta_oauth_state",{p_hash:await digestHex(state)});
  if(consumeError||!owner)return redirect("invalid");
  const short=await exchange({
   client_id:env("META_APP_ID"),client_secret:env("META_APP_SECRET"),
   redirect_uri:CALLBACK,code
  });
  const long=await exchange({
   grant_type:"fb_exchange_token",client_id:env("META_APP_ID"),
   client_secret:env("META_APP_SECRET"),fb_exchange_token:short.access_token
  });
  const token=String(long.access_token||"");
  if(!token||token.length<15)throw Error("Meta token exchange failed");
  const granted=await metaGET("me/permissions",token);
  const scopes=(Array.isArray(granted?.data)?granted.data:[])
    .filter((x:any)=>x.status==="granted").map((x:any)=>String(x.permission));
  if(!scopes.includes("ads_read"))return redirect("permission");
  const profile=await metaGET("me",token,{fields:"id"});
  if(!profile?.id)throw Error("Could not identify your Meta user");
  const protectedToken=await encrypt(token);
  const lifespan=Math.min(Math.max(Number(long.expires_in)||3600,600),60*24*60*60);
  const {error:saveError}=await db.from("agent_meta_ads_connections").upsert({
   owner_id:owner,meta_user_id:String(profile.id).slice(0,128),
   encrypted_access_token:protectedToken.cipher,token_iv:protectedToken.iv,
   token_expires_at:new Date(Date.now()+lifespan*1000).toISOString(),
   granted_scopes:scopes,status:"active",preferred_account_id:null,updated_at:stamp()
  },{onConflict:"owner_id"});
  if(saveError)throw Error("Failed to store the encrypted connection");
  try{await adAccounts(db,owner,token)}catch{
   // A valid ads_read connection can exist even with zero visible ad accounts.
   return redirect("accounts");
  }
  return redirect("connected");
 }catch{
  // Never place Meta tokens or provider error payloads into a redirect URL.
  return redirect("error");
 }
}
async function status(db:ReturnType<typeof admin>,owner:string,req:Request){
 const setup=config();
 if(setup.missing.length)return json(req,{configured:false,connected:false,
  missing:setup.missing,accounts:[],message:"Meta App setup required"});
 const record=await connection(db,owner);
 if(!record)return json(req,{configured:true,connected:false,accounts:[],message:"Meta Ads not connected"});
 const expired=Date.parse(record.token_expires_at)<Date.now()+60000;
 const {data:accounts,error}=await db.from("agent_meta_ad_accounts")
  .select("account_id,name,currency,timezone_name,account_status,last_seen_at").eq("owner_id",owner).order("name");
 if(error)throw Error("Cannot load advertising accounts");
 return json(req,{configured:true,connected:record.status==="active"&&!expired,
  reconnect_required:record.status!=="active"||expired,
  read_only:true,granted_scope:"ads_read",token_expires_at:record.token_expires_at,
  preferred_account_id:record.preferred_account_id||null,
  accounts:accounts||[],message:expired?"Meta session expired — reconnect to continue":
   record.status==="active"?"Meta Ads connected for read-only reporting":"Meta session needs reconnection"});
}
async function report(db:ReturnType<typeof admin>,owner:string,req:Request,input:Record<string,unknown>){
 const accountId=String(input.account_id||"");
 const period=String(input.period||"last_7d");
 if(!accountPattern.test(accountId)||!presets.includes(period as typeof presets[number]))
  return json(req,{error:"Choose a saved ad account and a supported reporting period"},400);
 const {data:saved,error:accountError}=await db.from("agent_meta_ad_accounts")
  .select("account_id,name,currency,timezone_name").eq("owner_id",owner)
  .eq("account_id",accountId).maybeSingle();
 if(accountError||!saved)return json(req,{error:"Select an ad account from your connected Meta account list"},403);
 const token=await access(db,owner);
 const params={date_preset:period};
 const [overview,campaigns]=await Promise.all([
  metaGET(accountId+"/insights",token,{...params,level:"account",
   fields:"spend,impressions,clicks,reach,cpc,ctr,date_start,date_stop",limit:"1"}),
  metaGET(accountId+"/insights",token,{...params,level:"campaign",
   fields:"campaign_id,campaign_name,spend,impressions,clicks,reach,ctr,cpc,date_start,date_stop",
   limit:"100"})
 ]);
 const overall=metric((overview?.data||[])[0]||{});
 const rows=(Array.isArray(campaigns?.data)?campaigns.data:[]).map((x:any)=>({
  id:String(x.campaign_id||""),name:String(x.campaign_name||"Campaign").slice(0,200),
  ...metric(x)
 })).filter((x:any)=>/^\d+$/.test(x.id)).sort((a:any,b:any)=>b.spend-a.spend);
 return json(req,{source:"meta_marketing_api_live",account:{
  id:saved.account_id,name:saved.name,currency:saved.currency,timezone_name:saved.timezone_name
 },period,reporting_level:"account",overview:overall,campaigns:rows,
  campaigns_truncated:Boolean(campaigns?.paging?.next),
  received_at:stamp(),read_only:true,
  note:"Live numbers are reported by Meta for this account and date preset. Attribution and conversion reporting can differ from click counts."});
}
async function disconnect(db:ReturnType<typeof admin>,owner:string,req:Request){
 const {error:e1}=await db.from("agent_meta_oauth_states").delete().eq("owner_id",owner);
 const {error:e2}=await db.from("agent_meta_ad_accounts").delete().eq("owner_id",owner);
 const {error:e3}=await db.from("agent_meta_ads_connections").delete().eq("owner_id",owner);
 if(e1||e2||e3)throw Error("The local Meta Ads connection could not be fully disconnected");
 return json(req,{disconnected:true,message:"The local encrypted Meta connection and account records were removed. You can also revoke app access in Meta's settings."});
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 if(!allowOrigin(req))return json(req,{error:"Origin not allowed"},403);
 if(req.method==="GET"){
  if(new URL(req.url).searchParams.get("op")==="callback")return callback(req);
  return json(req,{error:"Not found"},404);
 }
 if(req.method!=="POST")return json(req,{error:"POST required"},405);
 let owner:string;
 let db:ReturnType<typeof admin>;
 try{db=admin();owner=await userFromRequest(req,db)}
 catch(error){return json(req,{error:error instanceof Error?error.message:"Sign in required"},401)}
 let input:Record<string,unknown>;
 try{input=await req.json();if(!input||Array.isArray(input)||typeof input!=="object")throw Error()}
 catch{return json(req,{error:"Invalid action body"},400)}
 try{
  switch(input.action){
   case "status":return status(db,owner,req);
   case "connect":return authorize(db,owner,req);
   case "accounts":{
    const token=await access(db,owner);
    const result=await adAccounts(db,owner,token);
    return json(req,{...result,read_only:true});
   }
   case "select_account":{
    const requested=String(input.account_id||"");
    if(!accountPattern.test(requested))return json(req,{error:"Select a valid advertising account"},400);
    await access(db,owner);
    const {data:account,error:lookupError}=await db.from("agent_meta_ad_accounts")
      .select("account_id").eq("owner_id",owner).eq("account_id",requested).maybeSingle();
    if(lookupError||!account)return json(req,{error:"The selected account is not available under your Meta connection"},403);
    const {error:saveError}=await db.from("agent_meta_ads_connections")
      .update({preferred_account_id:requested,updated_at:stamp()}).eq("owner_id",owner);
    if(saveError)throw Error("Could not save your preferred account");
    return json(req,{selected_account_id:requested,read_only:true});
   }
   case "report":return report(db,owner,req,input);
   case "disconnect":return disconnect(db,owner,req);
   default:return json(req,{error:"Unsupported read-only Meta Ads action"},400);
  }
 }catch(error){
  const kind=(error as {kind?:string})?.kind||"operation_failed";
  const message=error instanceof Error?error.message:"Meta Ads connection error";
  return json(req,{code:kind,error:message},kind==="token_invalid"?401:kind==="rate_limit"?429:400);
 }
});
