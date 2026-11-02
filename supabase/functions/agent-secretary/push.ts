const encoded=(s:string,n:number)=>{try{const bytes=Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));return bytes.length===n?bytes:null;}catch{return null;}};
export function validatePushSubscription(value:any){
 let u;try{u=new URL(value?.endpoint)}catch{throw Error('The browser did not return a push subscription');}
 const host=u.hostname,allowed=host==='web.push.apple.com'||/^[a-z0-9-]+\.push\.apple\.com$/.test(host)||host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com';
 if(!allowed||u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname.length<3||u.href.length>4096)throw Error('Unsupported browser push endpoint');
 const pub=String(value.keys?.p256dh||''),auth=String(value.keys?.auth||'');if(!encoded(pub,65)||encoded(pub,65)?.[0]!==4||!encoded(auth,16))throw Error('Invalid browser push encryption keys');return {endpoint:u.href,p256dh:pub,auth_key:auth};
}
async function library(){const r=await import('npm:web-push@3.6.7');return r.default||r;}
export async function pushKeys(db:any,webpush?:any){
 let {data,error}=await db.from('agent_secretary_push_keys').select('public_key,private_key').eq('singleton',true).maybeSingle();if(error)throw Error('Push configuration could not be read');if(data)return data;
 const lib=webpush||await library(),keys=lib.generateVAPIDKeys();await db.from('agent_secretary_push_keys').insert({singleton:true,public_key:keys.publicKey,private_key:keys.privateKey});
 const saved=await db.from('agent_secretary_push_keys').select('public_key,private_key').eq('singleton',true).maybeSingle();if(saved.error||!saved.data)throw Error('Push keys could not be initialized');return saved.data;
}
export async function devicePushStatus(db:any,owner:string,input:any){
 const sub=validatePushSubscription(input.subscription);
 const {data,error}=await db.from('agent_secretary_push_subscriptions')
  .select('id,active,label,last_success_at,last_error').eq('owner_id',owner)
  .eq('endpoint',sub.endpoint).maybeSingle();
 if(error)throw Error('Unable to verify this device connection');
 return {registered:Boolean(data?.active),device_id:data?.active?data.id:null,
  label:data?.label||null,last_success_at:data?.last_success_at||null,
  last_error:data?.last_error||null};
}
export async function savePushSubscription(db:any,owner:string,input:any){
 const valid=validatePushSubscription(input.subscription),{data:existing,error}=await db.from('agent_secretary_push_subscriptions').select('id,owner_id').eq('endpoint',valid.endpoint).maybeSingle();if(error)throw Error('Could not check this device');if(existing&&existing.owner_id!==owner)throw Error('This subscription belongs to a different sign-in. Turn off notifications on this device, then enable them again.');
 const {count,error:ce}=await db.from('agent_secretary_push_subscriptions').select('id',{head:true,count:'exact'}).eq('owner_id',owner).eq('active',true);if(ce||!existing&&(count||0)>=5)throw Error('Use at most five notification devices');
 const {data:saved,error:save}=await db.from('agent_secretary_push_subscriptions').upsert({...valid,owner_id:owner,active:true,label:String(input.label||'My device').slice(0,100)},{onConflict:'endpoint'}).select('id').single();if(save||!saved?.id)throw Error('The notification device could not be saved');return {registered:true,device_id:saved.id,delivery_verified:false};
}
export async function sendSecretaryPush(db:any,owners:string[],fetcher:typeof fetch=fetch,webpush?:any){
 const {data:deliveries,error}=await db.from('agent_secretary_deliveries').select('id,owner_id,item_id,item_version,kind,scheduled_at,push_attempts').in('owner_id',owners).eq('status','saved').eq('action_state','open').eq('push_state','pending').lte('next_push_at',new Date().toISOString()).order('scheduled_at').limit(8);if(error||!deliveries?.length)return;
 const lib=webpush||await library();let keys;
 for(const d of deliveries){
  const {data:current,error:currentError}=await db.from('agent_secretary_deliveries').select('action_state,status').eq('id',d.id).eq('owner_id',d.owner_id).maybeSingle();if(currentError||current?.action_state!=='open'||current?.status!=='saved')continue;
  const {data:settings}=await db.from('agent_secretary_settings').select('bot_id,brief_enabled').eq('owner_id',d.owner_id).maybeSingle();
  const {data:bot}=await db.from('agent_custom_bots').select('status').eq('id',settings?.bot_id).eq('owner_id',d.owner_id).maybeSingle();if(bot?.status!=='active')continue;
  if(d.item_id){const {data:item}=await db.from('agent_secretary_items').select('status,version').eq('id',d.item_id).eq('owner_id',d.owner_id).maybeSingle();if(item?.status!=='active'||item?.version!==d.item_version){await db.from('agent_secretary_deliveries').update({push_state:'not_enabled'}).eq('id',d.id);continue;}}
  if(d.kind==='brief'&&!settings?.brief_enabled)continue;
  const {data:devices,error:de}=await db.from('agent_secretary_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('owner_id',d.owner_id).eq('active',true).limit(5);if(de)continue;
  if(!devices?.length){await db.from('agent_secretary_deliveries').update({push_state:'not_enabled'}).eq('id',d.id).eq('owner_id',d.owner_id);continue;}
  keys??=await pushKeys(db,lib);let accepted=0,unknown=false,retry=false;
  for(const device of devices){
   try{
    validatePushSubscription({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}});
    const payload=JSON.stringify({title:'Eleanor · Agent HQ',body:d.kind==='brief'?'Your daily briefing is ready.':'You have a private secretary reminder. Open Agent HQ.',tag:'eleanor-'+d.id,url:'./?secretary=1'});
    const request=lib.generateRequestDetails({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}},payload,{TTL:3600,urgency:'high',topic:d.id.replace(/-/g,''),vapidDetails:{subject:'https://hostkris.github.io/AgentHQ/',publicKey:keys.public_key,privateKey:keys.private_key}});
    const r=await fetcher(request.endpoint,{method:'POST',headers:request.headers,body:request.body,redirect:'error',signal:AbortSignal.timeout(10000)});
    if(r.ok){accepted++;await db.from('agent_secretary_push_subscriptions').update({last_success_at:new Date().toISOString(),last_error:null}).eq('id',device.id).eq('owner_id',d.owner_id);}
    else if([404,410].includes(r.status))await db.from('agent_secretary_push_subscriptions').update({active:false,last_error:'The device subscription expired. Enable notifications again on that device.'}).eq('id',device.id).eq('owner_id',d.owner_id);
    else{retry=r.status===429||r.status>=500;await db.from('agent_secretary_push_subscriptions').update({last_error:'The push service rejected the request (HTTP '+r.status+'). The notice remains saved in Messages.'}).eq('id',device.id).eq('owner_id',d.owner_id);}
   }catch{unknown=true;await db.from('agent_secretary_push_subscriptions').update({last_error:'Push delivery is unconfirmed. Read the saved notice in Agent HQ.'}).eq('id',device.id).eq('owner_id',d.owner_id);}
  }
  const attempts=(d.push_attempts||0)+1;await db.from('agent_secretary_deliveries').update({push_state:accepted?'accepted':unknown?'unknown':retry&&attempts<3?'pending':'failed',push_attempts:attempts,next_push_at:new Date(Date.now()+120000).toISOString()}).eq('id',d.id).eq('owner_id',d.owner_id);
 }
}

export async function sendAgentWorkPush(db:any,owners:string[],fetcher:typeof fetch=fetch,webpush?:any){
 if(!owners.length)return {sent:0};
 const now=new Date().toISOString();
 const {data:alerts,error}=await db.from('agent_secretary_agent_alerts')
  .select('id,owner_id,alert_kind,push_attempts').in('owner_id',owners)
  .eq('status','open').eq('push_state','pending').lte('next_push_at',now)
  .order('created_at').limit(12);
 if(error)throw Error('Agent alerts could not be read');
 if(!alerts?.length)return {sent:0};
 const lib=webpush||await library();let keys:any,delivered=0;
 for(const alert of alerts){
  const {data:settings}=await db.from('agent_secretary_settings')
    .select('agent_alerts_enabled').eq('owner_id',alert.owner_id).maybeSingle();
  if(!settings?.agent_alerts_enabled)continue;
  const {data:devices}=await db.from('agent_secretary_push_subscriptions')
    .select('id,endpoint,p256dh,auth_key').eq('owner_id',alert.owner_id).eq('active',true).limit(5);
  if(!devices?.length){
   await db.from('agent_secretary_agent_alerts').update({push_state:'not_enabled'})
    .eq('id',alert.id).eq('status','open');continue;
  }
  keys??=await pushKeys(db,lib);
  let accepted=false,retry=false;
  for(const device of devices){
   try{
    validatePushSubscription({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}});
    // Lock-screen text stays generic. Sensitive specifics are only in the authenticated inbox.
    const payload=JSON.stringify({kind:'agent_attention',alert_id:alert.id,
      tag:'eleanor-agent-'+alert.id});
    const request=lib.generateRequestDetails(
     {endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}},
     payload,{TTL:3600,urgency:'high',topic:alert.id.replace(/-/g,''),
      vapidDetails:{subject:'https://hostkris.github.io/AgentHQ/',
       publicKey:keys.public_key,privateKey:keys.private_key}});
    const r=await fetcher(request.endpoint,{method:'POST',headers:request.headers,
     body:request.body,redirect:'error',signal:AbortSignal.timeout(10000)});
    if(r.ok){
     accepted=true;delivered++;
     await db.from('agent_secretary_push_subscriptions')
      .update({last_success_at:new Date().toISOString(),last_error:null})
      .eq('id',device.id).eq('owner_id',alert.owner_id);
    }else if([404,410].includes(r.status)){
     await db.from('agent_secretary_push_subscriptions')
      .update({active:false,last_error:'Push subscription expired. Enable alerts on this device again.'})
      .eq('id',device.id).eq('owner_id',alert.owner_id);
    }else{
     retry=retry||r.status===429||r.status>=500;
     await db.from('agent_secretary_push_subscriptions')
      .update({last_error:'The push service did not accept the agent alert (HTTP '+r.status+').'})
      .eq('id',device.id).eq('owner_id',alert.owner_id);
    }
   }catch{
    retry=true;
    await db.from('agent_secretary_push_subscriptions')
     .update({last_error:'Agent alert delivery could not be confirmed.'})
     .eq('id',device.id).eq('owner_id',alert.owner_id);
   }
  }
  const attempts=(alert.push_attempts||0)+1;
  const newStatus=accepted?'accepted':retry&&attempts<3?'pending':'failed';
  await db.from('agent_secretary_agent_alerts')
   .update({push_state:newStatus,push_attempts:attempts,
     next_push_at:new Date(Date.now()+Math.min(600000,120000*attempts)).toISOString()})
   .eq('id',alert.id).eq('owner_id',alert.owner_id).eq('status','open');
 }
 return {accepted:delivered};
}
