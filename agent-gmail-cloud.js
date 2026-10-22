// Agent HQ Email Center. OAuth and sending are executed ONLY by the secure server.
// This adapter never stores Google's API credentials in the browser.
import {agentCloud} from './agent-cloud-auth.js';
let generation=0,lastHash="";
async function user(){
 const {data,error}=await agentCloud.auth.getUser();
 if(error)throw Error(error.message||"Could not verify sign-in");
 if(!data?.user)throw Error("Sign in under Settings to use Email Center.");
 return data.user;
}
async function invoke(action,additional={}){
 await user();
 const {data,error}=await agentCloud.functions.invoke('agent-gmail',{body:{action,...additional}});
 if(error){
  let reason=data?.error;
  if(!reason&&typeof error.context?.clone==="function"){
   try{reason=(await error.context.clone().json())?.error}catch{}
  }
  throw Error(reason||error.message||"Gmail service is unavailable.");
 }
 if(data?.error)throw Error(data.error);
 return data;
}
async function refresh(){
 const current=++generation;
 let state;
 try{
  await user();
  state=await invoke("status");
 }catch(error){
  if(current===generation)window.agentHQEmailSync?.({configured:false,connected:false,ai_drafting_enabled:false,
   message:error.message,auth_error:true},[],error.message);
  return;
 }
 if(current!==generation)return;
 const {data:emails,error}=await agentCloud.from("agent_email_items")
  .select("gmail_message_id,thread_id,from_name,from_email,reply_to,subject,snippet,received_at,is_unread,priority,priority_reason,priority_manual,needs_reply,draft_body,draft_state,sent_at,last_checked_at")
  .order("received_at",{ascending:false}).limit(100);
 if(current!==generation)return;
 if(error){window.agentHQEmailError?.("Email list could not sync: "+error.message);return}
 const list=emails||[];
 const fingerprint=JSON.stringify({state,list});
 if(fingerprint!==lastHash){
  lastHash=fingerprint;
  window.agentHQEmailSync?.(state,list,"Email Center synchronized.");
 }
 return {state,emails:list};
}
async function connect(){
 const result=await invoke("connect");
 const url=result.authorization_url;
 if(!url||!/^https:\/\/accounts\.google\.com\//.test(url))
  throw Error("Google did not return an official authorization page");
 window.location.assign(url);
}
async function check(){
 const result=await invoke("check");
 await refresh();
 return result;
}
async function original(id){
 if(!/^[a-zA-Z0-9_-]{5,100}$/.test(id))throw Error("Invalid saved email");
 return invoke("message",{message_id:id});
}
async function setAI(enabled){
 await user();
 const {data,error}=await agentCloud.rpc("set_agent_gmail_ai_drafts",{p_enabled:enabled===true});
 if(error||data!==true)throw Error(error?.message||"AI drafting preference not saved");
 await refresh();
 return true;
}
async function priority(id,level){
 if(!["low","medium","high","urgent"].includes(level))throw Error("Choose a valid priority");
 await user();
 const {data,error}=await agentCloud.rpc("set_agent_email_priority",{
  p_message_id:id,p_priority:level
 });
 if(error||data!==true)throw Error(error?.message||"Priority was not saved");
 await refresh();return true;
}
async function saveDraft(id,body){
 body=String(body||"").trim();
 if(!body||body.length>8000)throw Error("Write a reply (1–8000 characters)");
 await user();
 const {data,error}=await agentCloud.rpc("save_agent_email_reply",{
  p_message_id:id,p_body:body
 });
 if(error||data!==true)throw Error(error?.message||"The email reply was not saved");
 await refresh();return true;
}
async function send(id,reviewedBody){
 if(!reviewedBody||reviewedBody.length>8000)throw Error("Review the exact saved draft before sending");
 const result=await invoke("send",{message_id:id,reviewed_body:reviewedBody});
 await refresh();
 return result;
}
async function disconnect(){
 const result=await invoke("disconnect");
 await refresh();
 return result;
}
window.agentHQEmailCloud={refresh,connect,check,original,setAI,priority,saveDraft,send,disconnect};
const reload=()=>refresh().catch(error=>window.agentHQEmailError?.(error.message));
agentCloud.auth.onAuthStateChange(()=>setTimeout(reload,0));
window.addEventListener("focus",reload);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)reload()});
setInterval(()=>{if(!document.hidden)reload()},45000);
reload();
