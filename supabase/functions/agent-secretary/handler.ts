import {ensureSecretary,secretaryState,applySecretaryOps,uuid} from './state.ts';
import {processSecretaryDue} from './scheduler.ts';
import {pushKeys,savePushSubscription} from './push.ts';
const ORIGIN='https://hostkris.github.io';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const response=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers});
export function secretaryHandler(db:any,owners:string[],deps:any){
 return async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return response({error:'POST required'},405);
  const origin=req.headers.get('origin');if(origin&&origin!==ORIGIN)return response({error:'Origin not permitted'},403);
  if(new URL(req.url).searchParams.get('op')==='tick'){
   const token=req.headers.get('x-agent-hq-runner-token')||'';if(!/^[0-9a-f]{64}$/.test(token))return response({error:'Scheduler authorization required'},401);
   const {data,error}=await db.rpc('verify_agent_project_runner',{p_token:token});if(error||data!==true)return response({error:'Scheduler authorization required'},401);
   try{if(deps.preparePush)await deps.preparePush(db);return response(await processSecretaryDue(db,owners,deps,true));}catch{return response({error:'Secretary work remains saved and will retry'},503);}
  }
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'').trim();if(!token)return response({error:'Sign in to Agent HQ'},401);
  const {data:auth,error:authError}=await db.auth.getUser(token);const owner=auth?.user?.id;if(authError||!owner||!owners.includes(owner.toLowerCase()))return response({error:'Sign-in expired or account not authorized'},401);
  try{
   const text=await req.text();if(text.length>50000)throw Error('The secretary request is too large');const input=JSON.parse(text);
   if(input.action==='ensure'){const botId=await ensureSecretary(db,owner,false);return response({bot_id:botId});}
   if(input.action==='state')return response(await secretaryState(db,owner));
   if(input.action==='apply')return response(await applySecretaryOps(db,owner,input));
   if(input.action==='act_delivery'){
    if(!uuid(input.delivery_id)||!uuid(input.request_id))throw Error('Choose a saved notice');const {data,error}=await db.rpc('act_agent_secretary_delivery',{p_owner:owner,p_delivery:input.delivery_id,p_action:input.choice,p_request:input.request_id});if(error)throw Error(error.message);return response(data);
   }
   if(input.action==='push_config'){const keys=await pushKeys(db,deps.webpush);return response({public_key:keys.public_key});}
   if(input.action==='subscribe_push')return response(await savePushSubscription(db,owner,input));
   if(input.action==='unsubscribe_push'){
    if(!uuid(input.device_id))throw Error('Choose a notification device');const {error}=await db.from('agent_secretary_push_subscriptions').update({active:false}).eq('id',input.device_id).eq('owner_id',owner);if(error)throw Error('Could not disable this device');return response({disabled:true});
   }
   if(input.action==='check_due')return response(await processSecretaryDue(db,[owner],deps,false));
   return response({error:'Unsupported secretary action'},400);
  }catch(e){return response({error:typeof (e as any)?.message==='string'?(e as any).message.slice(0,250):'Secretary request failed'},400);}
 };
}
