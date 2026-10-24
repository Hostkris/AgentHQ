import {researchForRole} from '../_shared/role-research.ts';
import {RESEARCH_MODEL,researchStatus} from '../agent-hq-converse/research.ts';
import {researchFailureInfo} from '../../../agent-research-status.js';
const response=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const PUBLIC_RESEARCH_CHECKS=Object.freeze([
 {worker:'riley',query:'Groq browser_search GPT OSS official documentation',task:'Research official Groq documentation for GPT OSS browser_search public research support.'},
 {worker:'casey',query:'YouTube Shorts video length official YouTube Help',task:'Research official YouTube Help guidance about YouTube Shorts video length for social media content.'}
]);

// Private, fixed public checks only. No caller-selected owner, model, query,
// account action, spending limit, credentials or test result is accepted.
export async function handleResearchCheck(req:Request,deps:any){
 if(req.method!=='POST')return response({error:'POST required'},405);
 const token=req.headers.get('x-agent-hq-runner-token')||'';
 if(!/^[0-9a-f]{64}$/.test(token))return response({error:'Private verification credential required'},401);
 const {data:authorized,error}=await deps.db.rpc('verify_agent_project_runner',{p_token:token});
 if(error)return response({error:'Verification authorization unavailable'},503);
 if(authorized!==true)return response({error:'Private verification credential required'},401);
 const owners=[...new Set(String(deps.allowedOwners||'').split(',').map((v:string)=>v.trim()).filter((v:string)=>/^[0-9a-f-]{36}$/i.test(v)))];
 if(owners.length!==1)return response({error:'Verification requires one configured owner'},503);
 const owner=owners[0],run=crypto.randomUUID(),cases=[];
 const status=await (deps.checkStatus||researchStatus)(deps.key);
 for(const item of PUBLIC_RESEARCH_CHECKS){
  try{
   const {data:thread,error:threadError}=await deps.db.from('agent_conversations').upsert({owner_id:owner,employee_id:item.worker},{onConflict:'owner_id,employee_id'}).select('id').single();
   if(threadError||!thread)throw Error('Could not save the verification conversation');
   const {data:origin,error:originError}=await deps.db.from('agent_messages').insert({owner_id:owner,conversation_id:thread.id,sender:'owner',body:'[Owner-requested public research verification] '+item.task}).select('id').single();
   if(originError||!origin)throw Error('Could not save the authorized verification request');
   const result=await (deps.research||researchForRole)({db:deps.db,owner,worker:item.worker,task:item.task,query:item.query,purpose:'Verify the configured public browser-search pipeline using an official public source.',key:deps.key,
    context:{conversation_id:thread.id,message_id:origin.id,request_key:'verification:'+run+':'+item.worker}});
   const passed=result?.state==='completed'&&Array.isArray(result.sources)&&result.sources.length>0;
   cases.push({worker:item.worker,state:passed?'passed':result?.state||'unconfirmed',job_id:result?.job_id||null,sources:passed?result.sources:[],message:passed?'Provider-executed search evidence and the source-backed report were saved.':result?.message||'No completed research report was confirmed.'});
  }catch(error){const failure=researchFailureInfo(error);cases.push({worker:item.worker,state:'failed',sources:[],message:failure.message,retry_at:failure.retryAt,retry_label:failure.retryLabel});}
 }
 return response({model:RESEARCH_MODEL,tool:'browser_search',model_check:status,tests:cases,verified:cases.length===2&&cases.every(c=>c.state==='passed')});
}
