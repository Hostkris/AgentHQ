// OAuth authorization is separate from Agent HQ sign-in. No passwords or raw tokens are saved.
export const APP_URL='https://hostkris.github.io/AgentHQ/';
export const BRIDGE_URL='https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-chatgpt-bridge';
export const MCP_URL=BRIDGE_URL+'/mcp';
export const SCOPES=['projects:read','deliverables:write'];
export const uuid=(v:any)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(v));
export const hash=async(value:string|Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))).map(b=>b.toString(16).padStart(2,'0')).join('');
const base64url=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const secret=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export const pkce=async(v:string)=>base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))));
export const scopesOK=(s:string)=>!!s&&s.split(' ').every(v=>SCOPES.includes(v))&&SCOPES.every(v=>s.split(' ').includes(v));
export function trustedRedirect(value:any){
 try{const u=new URL(String(value));return u.origin==='https://chatgpt.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&(u.pathname==='/connector_platform_oauth_redirect'||/^\/connector\/oauth\/[a-zA-Z0-9_-]{1,180}$/.test(u.pathname));}catch{return false;}
}
export function authorizationMetadata(){return {
 issuer:BRIDGE_URL,jwks_uri:BRIDGE_URL+'/jwks',subject_types_supported:['public'],id_token_signing_alg_values_supported:[],authorization_endpoint:BRIDGE_URL+'/authorize',token_endpoint:BRIDGE_URL+'/token',registration_endpoint:BRIDGE_URL+'/register',
 revocation_endpoint:BRIDGE_URL+'/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],
 token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true,
 client_id_metadata_document_supported:true,scopes_supported:SCOPES
};}
export const resourceMetadata=()=>({resource:MCP_URL,authorization_servers:[BRIDGE_URL],scopes_supported:SCOPES,bearer_methods_supported:['header'],resource_name:'Agent HQ project handoffs'});
export async function smallJSON(req:Request,max=24000){
 const reader=req.body?.getReader();let length=0,text='';if(!reader)throw Error('Request body required');const decoder=new TextDecoder();
 while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>max){await reader.cancel();throw Error('Request is too large');}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);
}
export async function resolveClient(db:any,id:string,fetcher:typeof fetch=fetch){
 if(id.startsWith('https:')){
  if(!/^https:\/\/chatgpt\.com\/oauth\/(?:[a-zA-Z0-9_-]{1,180}\/)?client\.json$/.test(id))throw Error('Only the official ChatGPT OAuth client is supported');
  const r=await fetcher(id,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('ChatGPT client metadata is not available');
  const meta=await smallJSON(r as any,20000);
  const methods=meta.token_endpoint_auth_methods_supported||[meta.token_endpoint_auth_method];
  if(meta.client_id!==id||typeof meta.client_name!=='string'||!Array.isArray(meta.redirect_uris)||!meta.redirect_uris.length||!meta.redirect_uris.every(trustedRedirect)||!methods.includes('none'))throw Error('Invalid ChatGPT client metadata');
  return {client_id:id,redirect_uris:meta.redirect_uris};
 }
 if(!uuid(id))throw Error('Register the ChatGPT client first');
 const {data,error}=await db.from('agent_chatgpt_clients').select('client_id,redirect_uris').eq('client_id',id).maybeSingle();if(error||!data)throw Error('Unknown ChatGPT client');return data;
}
export async function registerClient(db:any,input:any){
 if(!Array.isArray(input.redirect_uris)||input.redirect_uris.length<1||input.redirect_uris.length>3||!input.redirect_uris.every(trustedRedirect)||input.token_endpoint_auth_method&&input.token_endpoint_auth_method!=='none')throw Error('Register an official ChatGPT callback with public-client authentication');
 if(input.grant_types&&(!Array.isArray(input.grant_types)||input.grant_types.some((v:any)=>!['authorization_code','refresh_token'].includes(v))))throw Error('Unsupported client grants');
 if(input.response_types&&JSON.stringify(input.response_types)!=='["code"]')throw Error('Authorization code responses are required');
 const client={client_id:crypto.randomUUID(),redirect_uris:[...new Set(input.redirect_uris)]};const {error}=await db.from('agent_chatgpt_clients').insert(client);if(error)throw Error('Could not register the ChatGPT client');
 return {...client,client_name:'ChatGPT',token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']};
}
export async function startAuthorization(db:any,params:URLSearchParams,fetcher:typeof fetch=fetch){
 const id=params.get('client_id')||'',redirect=params.get('redirect_uri')||'',state=params.get('state')||'',challenge=params.get('code_challenge')||'',scope=params.get('scope')||SCOPES.join(' ');
 const client=await resolveClient(db,id,fetcher);
 if(!trustedRedirect(redirect)||!client.redirect_uris.includes(redirect)||params.get('response_type')!=='code'||params.get('resource')!==MCP_URL||params.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge)||state.length<1||state.length>2048||!scopesOK(scope))throw Error('Invalid redirect, scope, resource, or PKCE authorization request');
 const request={id:crypto.randomUUID(),client_id:id,redirect_uri:redirect,state,challenge,resource:MCP_URL,scopes:SCOPES.join(' ')};
 const {error}=await db.from('agent_chatgpt_authorizations').insert(request);if(error)throw Error('Could not start authorization');
 return APP_URL+'?agenthq_chatgpt_authorize='+request.id;
}
export async function authorizationRequest(db:any,id:any){
 if(!uuid(id))throw Error('Invalid authorization request');const {data:a,error}=await db.from('agent_chatgpt_authorizations').select('*').eq('id',id).maybeSingle();
 if(error||!a||a.consumed_at||a.approved_at||Date.parse(a.expires_at)<Date.now())throw Error('This authorization request expired or was already used');return a;
}
export async function decideAuthorization(db:any,owner:string,input:any){
 const a=await authorizationRequest(db,input.request_id),code=secret(),url=new URL(a.redirect_uri);url.searchParams.set('state',a.state);url.searchParams.set('iss',BRIDGE_URL);
 if(input.decision==='deny'){
  const {data,error}=await db.from('agent_chatgpt_authorizations').update({consumed_at:new Date().toISOString()}).eq('id',a.id).is('consumed_at',null).is('approved_at',null).select('id').maybeSingle();if(error||!data)throw Error('Authorization was already used');url.searchParams.set('error','access_denied');
 }else if(input.decision==='approve'){
  const {data,error}=await db.from('agent_chatgpt_authorizations').update({owner_id:owner,approved_at:new Date().toISOString(),code_hash:await hash(code)}).eq('id',a.id).is('consumed_at',null).is('approved_at',null).select('id').maybeSingle();if(error||!data)throw Error('Authorization was already used');url.searchParams.set('code',code);
 }else throw Error('Choose allow or deny');return {redirect_url:url.href};
}
export async function exchangeTokens(db:any,input:URLSearchParams){
 const client=input.get('client_id')||'',resource=input.get('resource')||'';if(resource!==MCP_URL||input.get('scope')&&!scopesOK(input.get('scope')||''))throw Error('Invalid token resource or scope');
 const access=secret(),refresh=secret();let result;
 if(input.get('grant_type')==='authorization_code'){
  const code=input.get('code')||'',verifier=input.get('code_verifier')||'';if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!/^[A-Za-z0-9_-]{43}$/.test(code))throw Error('Invalid code or verifier');
  result=await db.rpc('exchange_agent_chatgpt_code',{p_hash:await hash(code),p_client:client,p_redirect:input.get('redirect_uri')||'',p_challenge:await pkce(verifier),p_resource:resource,p_access:await hash(access),p_refresh:await hash(refresh)});
 }else if(input.get('grant_type')==='refresh_token'){
  const token=input.get('refresh_token')||'';if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Invalid refresh token');
  result=await db.rpc('refresh_agent_chatgpt_connection',{p_hash:await hash(token),p_client:client,p_resource:resource,p_access:await hash(access),p_refresh:await hash(refresh)});
 }else throw Error('Unsupported token grant');
 if(result.error||!result.data)throw Error('Invalid, expired, or already used grant');return {access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:result.data.scopes};
}
export async function authenticateConnection(db:any,token:string,allowed:(owner:string)=>boolean){
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const {data:c,error}=await db.from('agent_chatgpt_connections').select('id,owner_id,resource,scopes,access_expires_at,revoked_at').eq('access_hash',await hash(token)).maybeSingle();
 if(error||!c||c.revoked_at||Date.parse(c.access_expires_at)<=Date.now()||c.resource!==MCP_URL||!scopesOK(c.scopes)||!allowed(c.owner_id))return null;return c;
}
