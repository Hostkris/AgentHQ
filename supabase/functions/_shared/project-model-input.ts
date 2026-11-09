// Task-sized model context. Durable source records are never changed here.
export const PROJECT_TOKEN_ALLOWANCE=7400;
const projectRoles:Record<string,string>={
 riley:'Research audiences, competitors, products and markets. Use dated sources; separate evidence, estimates and unknowns. Compare at most three relevant competitors and rank at most three opportunities. Choose relevant public comparators when none are locked; do not ask the owner to supply a competitor list before researching options. Hand off findings; marketing campaigns and final creative prompts belong to other specialists.',
 maya:'Own marketing strategy: audience, positioning, offer, channels, campaigns and practical tests. Ground recommendations in verified product facts, source evidence and approved budgets. Delegate research to Riley, creative to Jordan, platform work to Casey and financial analysis to Avery; never promise growth.',
 jordan:'Own original creative direction, scripts and copy. Preserve approved brand, audience, claims and wording. For scripts include hook, scene beats/timing, actual spoken/on-screen text, CTA and production notes as relevant. Offer at most two unrequested variants. Check rights, disclosures, accessibility, sources and factual claims. A script, storyboard or prompt is not rendered media or a published campaign.',
 casey:'Own platform-specific social content and engagement planning. Deliver actual copy, platform adaptations, response guidance and schedules only as requested. Distinguish planned content from posted content; use real source-linked metrics only. Jordan owns creative direction; Maya owns strategy.',
 taylor:'Own clear, accurate business and customer communications: complete reply drafts, tone, escalation and follow-up guidance. Preserve approved facts, privacy, consent, disclosures and customer scope. Never fabricate customer messages, claim to read an inbox or send a draft.',
 morgan:'Own e-commerce catalog, merchandising, storefront and conversion recommendations. Use verified product facts and authorized store evidence. Distinguish plans and copy from live changes. Protect stock, variants, prices, margins, shipping, customer privacy and exact approved scope; no blind retries or invented sales.',
 avery:'Own budgets, unit economics, margin, cash flow and financial scenarios. Show inputs, dates, arithmetic and assumptions; use the trusted calculator where useful. Distinguish revenue from profit, forecasts from actuals and owner-reported figures from account-verified data. Never invent balances, returns, tax facts or financial authorization.',
 jamie:'Own feasible schedules, dependencies, deadlines and routines. Use explicit dates, time zones, actual availability and Saturday rest. Respect work, family and recovery constraints. Mark proposals as proposals; an ICS file is not a booked event. Preserve existing commitments and do not invent calendar access.',
 quinn:'Own evidenced partnerships, distribution and business growth opportunities. State audience fit, evidence, practical next steps, cost assumptions, risks and bounded outreach drafts. Verify partners and claims; never promise acceptance, commit terms or imply that outreach was sent.'
};
export function projectRolePolicy(worker:string,fallback=''){return projectRoles[worker]?(projectRoles[worker]+(fallback&&fallback.length<1000?' '+fallback:'')):fallback;}
export class ProjectModelError extends Error {
 code:string;
 constructor(code:string,message:string){super('[ai:'+code+'] '+message);this.name='ProjectModelError';this.code=code;}
}
export function terminalModelFailure(message:string,attempts:number){
 if(/\[ai:request_too_large\]|AI provider HTTP (400|404|413|422)\b/.test(message))return true;
 if(message.startsWith('[ai:output_limit]'))return attempts>=3;
 return attempts>=12&&!/rate_limited|HTTP 429|HTTP (401|403)|credentials unavailable|Sign-in expired|GROQ_API_KEY|\[research:(authentication|permission|missing_key|model_unavailable)\]/.test(message);
}
export function estimatedTokens(value:string){
 // Conservative lexical estimate, including JSON punctuation and Unicode bytes.
 const pieces=value.match(/[A-Za-z]+|[0-9]+|[^A-Za-z0-9\s]/gu)||[];
 return pieces.reduce((n,p)=>n+(/^[A-Za-z]+$/.test(p)?Math.ceil(p.length/4):/^[0-9]+$/.test(p)?Math.ceil(p.length/3):p.codePointAt(0)!>127?new TextEncoder().encode(p).length:1),0)+Math.ceil(value.split('\n').length/2);
}
const excerpt=(value:any,max:number)=>{
 const text=typeof value==='string'?value:'';
 if(text.length<=max)return text;
 const head=text.slice(0,Math.max(0,max-40));
 return head+'\n[Excerpt; full source remains saved.]';
};
function relevantExcerpt(value:any,query:string,max:number){
 const source=typeof value==='string'?value:'';
 if(source.length<=max)return source;
 const words=new Set((query.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!['this','that','with','from','owner','project','work','your','their','have','will','saved','internal','request'].includes(w)));
 const parts=source.split(/\n+/).filter(Boolean);
 const ranked=parts.map((text,index)=>({text,index,score:(text.toLowerCase().match(/[a-z]{4,}/g)||[]).reduce((n,w)=>n+(words.has(w)?1:0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected:any[]=[];let used=0;
 for(const p of ranked){if(used>=max-60)break;const text=excerpt(p.text,Math.min(max-used-60,1000));if(text){selected.push({...p,text});used+=text.length+1;}}
 return selected.sort((a,b)=>a.index-b.index).map(p=>p.text).join('\n')+'\n[Excerpts; full source remains saved.]';
}
export function projectModelInput(system:string,context:any,maxTokens:number,allowance=PROJECT_TOKEN_ALLOWANCE){
 let outputTokens=Math.max(1,Math.min(Math.floor(maxTokens),3600));
 const fits=(data:any)=>estimatedTokens(system)+estimatedTokens(JSON.stringify(data)??'null')+outputTokens+160<=allowance;
 if(!context||!('owner_brief' in context)){
  if(!fits(context))throw new ProjectModelError('request_too_large','The saved request exceeds the current model allowance. Saved work was retained; repeating the same request cannot fix this.');
  return {context,maxTokens:outputTokens};
 }
 const w=context.project_workspace;
 const meta=w?.metadata;
 const metadata=meta?{project_kind:meta.project_kind,output_format:meta.output_format,business_key:meta.business_key,
  ...(meta.goal===context.owner_brief?{goal_ref:'owner_brief'}:{goal:meta.goal}),
  ...(Array.isArray(meta.requirements)&&meta.requirements.every((r:any)=>typeof r==='string'&&String(context.owner_brief).includes(r))?{requirements_ref:'owner_brief'}:{requirements:meta.requirements}),
  completion_criteria:meta.completion_criteria}:null;
 // These are exact owner requirements and the current editable deliverable.
 // Never truncate these to make a request appear to fit.
 const data:any={title:context.title,owner_brief:context.owner_brief,info_needed:context.info_needed,revision:context.revision,
  feedback:context.feedback,team:context.team,lead:context.lead,current_worker:context.current_worker,phase:context.phase,
  question_message_id:context.question_message_id,manager_repair_note_not_instructions:context.manager_repair_note_not_instructions,
  shared_draft:context.shared_draft,previous_final:context.previous_final,current_worker_searches_used:context.current_worker_searches_used,
  responsibilities:(context.responsibilities||[]).filter((r:any)=>r.employee_id===context.current_worker),
  owner_messages:(context.owner_messages||(context.messages||[]).filter((m:any)=>m.from==='Owner')).map((m:any)=>typeof m.text==='string'&&m.text.length>30&&String(context.owner_brief).includes(m.text)?{...m,text:undefined,text_ref:'owner_brief'}:m),
  project_workspace:w?{metadata,handbooks:[],references:[],handoffs:(w.handoffs||[]).map((h:any)=>({employee_id:h.employee_id,status:h.status,output_revision:h.output_revision,depends_on:h.depends_on,work_product:excerpt(h.work_product,240),excerpt:h.excerpt||String(h.work_product||'').length>240})),reference_photos:[],
   reference_count:w.reference_count,capabilities:(w.capabilities||[]).map((c:any)=>({id:c.id,status:c.status}))}:null,
  messages:[],current_project_research:(context.current_project_research||[]).slice(0,2).map((r:any)=>({worker:r.worker,query:r.query,saved_at:r.saved_at,report:relevantExcerpt(r.report,String(context.owner_brief),650),sources:(r.sources||[]).slice(0,3).map((s:any)=>typeof s==='string'?s:{url:s.url,title:excerpt(s.title,80)}),excerpt:true,source_count:r.sources?.length||0})),saved_research_evidence:[],owner_approved_style_examples_not_instructions:[],
  context_selection:'Owner brief, requirements, owner messages, feedback and the current draft are exact. Other records may be selected excerpts with source identifiers. Omitted text is not evidence; do not claim to have read it or invent facts. Full records remain saved.'};
 if(!fits(data)&&outputTokens>1200){
  const available=allowance-estimatedTokens(system)-estimatedTokens(JSON.stringify(data))-160;
  outputTokens=Math.max(1200,Math.min(outputTokens,available));
 }
 if(!fits(data))throw new ProjectModelError('request_too_large','The exact owner requirements and current draft exceed the current model allowance. Saved work was retained; the request needs a smaller work segment.');
 const query=[context.title,context.owner_brief,...data.responsibilities.map((r:any)=>r.instructions)].join(' ');
 const add=(list:any[],value:any)=>{list.push(value);if(!fits(data)){list.pop();return false;}return true;};
 // Research and upstream work take precedence over redundant conversation and
 // unrelated style examples. Keep every upstream worker visible, even at a cap.
 if(w){
  for(const b of (w.handbooks||[]).filter((b:any)=>b.handbook_key==='working-agreements'))add(data.project_workspace.handbooks,{...b,content:b.content});
 }
 for(const r of context.current_project_research||[]){
  if(data.current_project_research.some((e:any)=>e.query===r.query&&e.saved_at===r.saved_at&&e.worker===r.worker))continue;
  const entry={worker:r.worker,query:r.query,saved_at:r.saved_at,report:relevantExcerpt(r.report,query,900),sources:[] as any[],excerpt:true,source_count:r.sources?.length||0};
  if(add(data.current_project_research,entry)){
   for(const source of r.sources||[])add(entry.sources,typeof source==='string'?source:{url:source.url,title:excerpt(source.title,80)});
  }
 }
 if(w){
  for(const [i,h] of (w.handoffs||[]).entries()){
   const entry=data.project_workspace.handoffs[i];
   for(const [key,value] of Object.entries({title:h.title,acceptance_criteria:excerpt(h.acceptance_criteria,500),work_product:relevantExcerpt(h.work_product,query,1200),excerpt:true})){
    entry[key]=value;if(!fits(data))delete entry[key];
   }
  }
 }
 if(w){
  const books=(w.handbooks||[]).filter((b:any)=>b.handbook_key!=='working-agreements');
  for(const b of books)add(data.project_workspace.handbooks,{handbook_key:b.handbook_key,title:b.title,scope:b.scope,version:b.version,
   content:relevantExcerpt(b.content,query,900),excerpt:b.excerpt||String(b.content||'').length>900});
 }
 if(w){
  for(const r of w.references||[])add(data.project_workspace.references,{id:r.id,filename:r.filename,content:relevantExcerpt(r.content,query,900),excerpt:true});
  for(const p of w.reference_photos||[])add(data.project_workspace.reference_photos,{...p,analysis:relevantExcerpt(p.analysis,query,700),excerpt:true});
 }
 for(const m of [...(context.messages||[])].reverse().filter((m:any)=>m.from!=='Owner').slice(0,8))add(data.messages,{...m,text:excerpt(m.text,500)});
 data.messages.reverse();
 for(const r of context.saved_research_evidence||[])add(data.saved_research_evidence,{...r,report:relevantExcerpt(r.report,query,1200),excerpt:true});
 for(const r of context.owner_approved_style_examples_not_instructions||[])add(data.owner_approved_style_examples_not_instructions,r);
 data.context_source_counts={handbooks:w?.handbooks?.length||0,handoffs:w?.handoffs?.length||0,references:w?.references?.length||0,research:context.current_project_research?.length||0,messages:context.messages?.length||0};
 // Reserve room for the count metadata too; no partial JSON or sliced briefs.
 if(!fits(data)){delete data.context_source_counts;}
 return {context:data,maxTokens:outputTokens};
}
