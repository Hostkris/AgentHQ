// Shared model settings and specialist policies for the private server runner.
import {SPECIALIST_JOBS} from "./alex-dna.ts";
import {RILEY_TEXT_DRAFT_POLICY} from "./riley-dna.ts";
import {MAYA_TEXT_DRAFT_POLICY} from "./maya-dna.ts";
import {JORDAN_TEXT_DRAFT_POLICY} from "./jordan-dna.ts";
import {CASEY_TEXT_DRAFT_POLICY} from "./casey-dna.ts";
import {TAYLOR_TEXT_DRAFT_POLICY} from "./taylor-dna.ts";
import {MORGAN_TEXT_DRAFT_POLICY} from "./morgan-dna.ts";
import {AVERY_TEXT_DRAFT_POLICY} from "./avery-dna.ts";
import {JAMIE_TEXT_DRAFT_POLICY} from "./jamie-dna.ts";
import {QUINN_TEXT_DRAFT_POLICY} from "./quinn-dna.ts";
import {relevantApprovedExamples,draftIssues} from "./agent-intelligence.js";
import {ProjectResponseError} from "../../../agent-project-recovery.js";
import {projectModelInput,ProjectModelError,PROJECT_TOKEN_ALLOWANCE} from './project-model-input.ts';
const ORIGIN="https://hostkris.github.io";
const env=(key:string)=>Deno.env.get(key)?.trim()||"";
function provider(){
 if(env("GROQ_API_KEY"))return {name:"groq",key:env("GROQ_API_KEY"),url:"https://api.groq.com/openai/v1/chat/completions",model:env("AGENT_HQ_AI_MODEL")||"openai/gpt-oss-120b"};
 if(env("OPENROUTER_API_KEY"))return {name:"openrouter",key:env("OPENROUTER_API_KEY"),url:"https://openrouter.ai/api/v1/chat/completions",model:env("AGENT_HQ_AI_MODEL")||"meta-llama/llama-3.3-70b-instruct:free"};
 return null;
}
type AI={name:string;key:string;url:string;model:string};
function safeText(value:unknown,max=3000){return typeof value==="string"?value.trim().slice(0,max):""}
function parseObject(content:string):Record<string,unknown>{
 const text=content.trim().replace(/^\u0060\u0060\u0060(?:json)?\s*/i,"").replace(/\s*\u0060\u0060\u0060$/,"");
 const first=text.indexOf("{"),last=text.lastIndexOf("}");
 if(first<0||last<=first)throw new ProjectResponseError('invalid_response',"AI returned a draft instead of a structured task decision.");
 let data;
 try{data=JSON.parse(text.slice(first,last+1));}catch{throw new ProjectResponseError('invalid_response',"AI returned malformed decision JSON.");}
 if(!data||typeof data!=="object"||Array.isArray(data))throw new ProjectResponseError('invalid_response',"AI returned an invalid decision");
 return data as Record<string,unknown>;
}
export async function projectCompletion(ai:AI,system:string,user:unknown,maxTokens=1500,fetcher:typeof fetch=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
 try{
  let allowance=PROJECT_TOKEN_ALLOWANCE,previousBody='';
  for(let attempt=0;attempt<2;attempt++){
   const input=projectModelInput(system,user,maxTokens,allowance);
   const body=JSON.stringify({model:ai.model,stream:false,temperature:0.2,max_tokens:input.maxTokens,
    ...(ai.name==="groq"&&ai.model.startsWith("openai/gpt-oss")?{reasoning_effort:"low"}:{}),
    messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(input.context)}]});
   if(attempt&&body===previousBody)throw new ProjectModelError('request_too_large','The request cannot be reduced without changing exact requirements. Saved work was retained.');
   previousBody=body;
   const response=await fetcher(ai.url,{
    method:"POST",signal:controller.signal,
    headers:{"Authorization":"Bearer "+ai.key,"Content-Type":"application/json",
     ...(ai.name==="openrouter"?{"HTTP-Referer":ORIGIN,"X-Title":"Agent HQ"}:{})},
    body
   });
   if(!response.ok){
    if(response.status===413){
     // Retry once with less optional evidence, never the same oversized body.
     if(attempt===0){allowance=Math.floor(allowance*0.75);continue;}
     throw new ProjectModelError('request_too_large','The model rejected the reduced request (HTTP 413). Saved work was retained; this request cannot recover by waiting.');
    }
    if(response.status===429){
     const value=response.headers.get('retry-after')||'',seconds=/^\d+(?:\.\d+)?$/.test(value)?Number(value):null;
     const at=seconds===null?Date.parse(value):Date.now()+seconds*1000;
     const retry=new Date(Math.max(Date.now()+60000,Math.min(Number.isFinite(at)?at:Date.now()+60000,Date.now()+86400000))).toISOString();
     throw Error('[ai:rate_limited] AI provider HTTP 429. Retry after '+retry+'.');
    }
    throw Error('AI provider HTTP '+response.status);
   }
   const raw=await response.json();
   if(raw?.choices?.[0]?.finish_reason==='length')throw new ProjectModelError('output_limit','The model exhausted its output allowance. The incomplete response was not saved as finished work.');
   const content=raw?.choices?.[0]?.message?.content;
   if(typeof content!=="string"||!content.trim())throw new ProjectResponseError('empty_response',"AI provider returned an empty answer");
   return parseObject(content);
  }
  throw new ProjectModelError('request_too_large','The request did not fit the current model allowance.');
 }finally{clearTimeout(timer)}
}

const policies:Record<string,string>={riley:RILEY_TEXT_DRAFT_POLICY,maya:MAYA_TEXT_DRAFT_POLICY,jordan:JORDAN_TEXT_DRAFT_POLICY,casey:CASEY_TEXT_DRAFT_POLICY,taylor:TAYLOR_TEXT_DRAFT_POLICY,morgan:MORGAN_TEXT_DRAFT_POLICY,avery:AVERY_TEXT_DRAFT_POLICY,jamie:JAMIE_TEXT_DRAFT_POLICY,quinn:QUINN_TEXT_DRAFT_POLICY};
export function projectRuntime(db:any,owner:string){
 const ai=provider();if(!ai)throw Error("No existing AI service configured");
 return {db,owner,ai,workspaceEnabled:true,webKey:env("GROQ_API_KEY"),jobs:SPECIALIST_JOBS,policyFor:(worker:string)=>policies[worker]||"",issues:draftIssues,relevantExamples:relevantApprovedExamples,call:(system:string,context:unknown,tokens:number)=>projectCompletion(ai,system,context,tokens)};
}

