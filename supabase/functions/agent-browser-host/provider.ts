// Connection verification only. Never creates a session or sends a Facebook action.
export async function checkHost(key:string,projectId:string,fetcher:typeof fetch=fetch){
 const base={provider:'browserbase',host_ready:false,facebook_connected:false,execution_enabled:false,mode:'host_setup'};
 const missing=[...(!key?['BROWSERBASE_API_KEY']:[]),...(!projectId?['BROWSERBASE_PROJECT_ID']:[])];
 if(missing.length)return {...base,missing,message:'Add the listed secret names in Supabase Edge Function Secrets, then check the hosted connection. Do not paste secret values into Agent HQ or chat.'};
 if(!/^[a-zA-Z0-9_-]{6,128}$/.test(projectId))return {...base,missing:[],message:'The Browserbase project ID format is invalid. Copy the project ID from your Browserbase project settings.'};
 try{
  const r=await fetcher('https://api.browserbase.com/v1/projects/'+encodeURIComponent(projectId),{headers:{'X-BB-API-Key':key,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!r.ok)return {...base,missing:[],message:r.status===429?'Browserbase is rate limited. Check again later.':'Browserbase could not verify this key and project (HTTP '+r.status+'). Check the server secrets.'};
  const p=await r.json();
  if(p?.id!==projectId)return {...base,missing:[],message:'Browserbase did not return the configured project. Check the project ID.'};
  return {...base,host_ready:true,missing:[],message:'Browserbase key and project verified. No browser session has started. Facebook sign-in and an approved-action test are still required; posting and messaging are not enabled.'};
 }catch{return {...base,missing:[],message:'The hosted browser service could not be reached. Try the connection check again.'}}
}
