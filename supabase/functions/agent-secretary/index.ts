import {createClient} from 'npm:@supabase/supabase-js@2.79.0';
import {secretaryHandler} from './handler.ts';
import {sendSecretaryPush,pushKeys} from './push.ts';
import {accessToken,googleGet,textParts} from '../agent-gmail/helpers.ts';
const env=(key:string)=>Deno.env.get(key)?.trim()||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const owners=env('AGENT_HQ_ALLOWED_OWNER_IDS').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
async function readMeetingEmail(owner:string,addresses:string[],start:string){
 // Never scan unrelated inbox content or infer a recipient from untrusted invite text.
 const {token}=await accessToken(db,owner),before=Math.floor(new Date(start).getTime()/1000)+86400,after=before-91*86400;
 const query='after:'+after+' before:'+before+' {'+addresses.map(email=>'from:'+email+' to:'+email).join(' ')+'}';
 const found=await googleGet('messages',token,{q:query,maxResults:'5'}),messages=[];
 for(const m of (found.messages||[]).slice(0,5)){
  const item=await googleGet('messages/'+encodeURIComponent(m.id),token,{format:'full'});const subject=(item.payload?.headers||[]).find((h:any)=>String(h.name).toLowerCase()==='subject')?.value||'(no subject)';
  messages.push({subject:String(subject).slice(0,180),text:textParts(item.payload).slice(0,700),id:m.id});
 }return messages;
}
Deno.serve(secretaryHandler(db,owners,{readMeetingEmail,deliverPush:sendSecretaryPush,preparePush:pushKeys}));
