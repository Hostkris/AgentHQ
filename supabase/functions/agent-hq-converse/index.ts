import {createClient} from "npm:@supabase/supabase-js@2.79.0";
const ORIGIN="https://hostkris.github.io";
const EMPLOYEES={
 alex:"General Manager",maya:"Marketing strategist",jordan:"Scripts and content",
 riley:"Research analyst (no browsing)",taylor:"Communications",
 casey:"Social media planner",morgan:"Store merchandising",
 avery:"Business analyst",jamie:"Scheduling",quinn:"Partnerships and growth",
 hq:"Company team coordinator"
};
type Worker=keyof typeof EMPLOYEES;
const env=(name:string)=>Deno.env.get(name)?.trim()||"";
function cors(req:Request){
 const origin=req.headers.get("origin");
 const good=origin===ORIGIN||Boolean(origin?.startsWith("http://localhost:")||origin?.startsWith("http://127.0.0.1:"));
 return {"Access-Control-Allow-Origin":good&&origin?origin:ORIGIN,
 "Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type",
 "Access-Control-Allow-Methods":"OPTIONS,POST","Vary":"Origin","Cache-Control":"no-store",
 "Content-Type":"application/json; charset=utf-8"};
}
function reply(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors(req)})}
function yesNo(text:string){const t=text.trim().toLowerCase().replace(/[.!?]+$/g,"");
 if(/^(yes|yeah|yep|yup|sure|okay|ok|go ahead|please do|please proceed|proceed|approved|approve|you can|start|resume|continue)$/i.test(t))return "yes";
 if(/^(no|nope|nah|not yet|stop|don't|do not|decline|denied|deny|cancel)$/i.test(t))return "no";
 return null;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function provider(){
 if(env("GROQ_API_KEY"))return {name:"groq",key:env("GROQ_API_KEY"),model:env("AGENT_HQ_AI_MODEL")||"openai/gpt-oss-120b",url:"https://api.groq.com/openai/v1/chat/completions"};
 if(env("OPENROUTER_API_KEY"))return {name:"openrouter",key:env("OPENROUTER_API_KEY"),model:env("AGENT_HQ_AI_MODEL")||"meta-llama/llama-3.3-70b-instruct:free",url:"https://openrouter.ai/api/v1/chat/completions"};
 return null;
}
async function decide(ai:NonNullable<ReturnType<typeof provider>>,role:string,context:unknown){
 const system=`You are a friendly, concise AI coworker working as ${role} in Agent HQ. This is a casual one-to-one text conversation, not a task dashboard.
You can answer general knowledge questions, discuss assignments, and ask for missing task details. No tools, browsing, account access, purchasing, posting, or file modification are available. Never imply you actually researched a website or completed external work. Do not fabricate sources.
Interpret the user's most recent message in context. Reply naturally, warmly but briefly (up to 450 characters) as a human coworker might text, not corporate UI language.
For a request that appears to be internal text drafting or specialist teamwork, classify as "task" if details suffice, or "collect" when important details are missing; ask ONE focused question. For a general question, classify as "answer" and answer from general knowledge.
For up-to-date business account metrics (e.g., ad spend yesterday), changing an ad budget, publishing to Instagram/TikTok/Facebook/YouTube, sending an email, replying on a real social account, or building a Manychat automation, classify as "action" (NOT "task" or "answer"). Do not invent account metrics or claim a provider is connected.
For "action", describe exactly what the owner is asking to authorize and that an external connection is required; DO NOT say any action has been executed. Only use these provider and action pairs:
meta_ads: read_metrics,change_ad_budget
facebook,instagram,tiktok,youtube: create_content,publish_content,reply_to_comment,read_metrics
manychat: create_automation
email: send_email
other: other.
For "action", return {"intent":"action","reply":"short conversational approval question ending Yes or no?","action":{"provider":"meta_ads","kind":"change_ad_budget","summary":"specific proposed change","scope":"named account, target and amount; mention missing information explicitly"}}. Never assume an account, ID, price or spend amount. If amount/target is missing, ask to clarify instead of issuing an incomplete budget change.
For "task", ask if they want to START the assignment, ending with "Yes or no?".
Return ONLY valid JSON with {"intent":"answer|collect|task|action","reply":"short natural message","action":optional object as above} and no code fences.`;
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),25000);
 try{
  const response=await fetch(ai.url,{method:"POST",signal:abort.signal,
   headers:{"Authorization":"Bearer "+ai.key,"Content-Type":"application/json",
    ...(ai.name==="openrouter"?{"HTTP-Referer":ORIGIN,"X-Title":"Agent HQ"}:{})},
   body:JSON.stringify({model:ai.model,stream:false,temperature:0.35,max_tokens:850,
    ...(ai.name==="groq"&&ai.model.startsWith("openai/gpt-oss")?{reasoning_effort:"low"}:{}),
    messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(context)}]})
  });
  if(!response.ok)throw Error("AI connection returned HTTP "+response.status);
  const raw=await response.json(),answer=raw?.choices?.[0]?.message?.content;
  if(typeof answer!=="string"||!answer.trim())throw Error("AI did not reply");
  const content=answer.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");
  const begin=content.indexOf("{"),end=content.lastIndexOf("}");
  if(begin<0||end<=begin)throw Error("AI reply format was unexpected");
  const payload=JSON.parse(content.slice(begin,end+1));
  const intent=["answer","collect","task","action"].includes(payload.intent)?payload.intent:"answer";
  const text=typeof payload.reply==="string"?payload.reply.trim().slice(0,1200):"";
  if(!text)throw Error("AI response was empty");
  const proposed=payload.action&&typeof payload.action==="object"&&!Array.isArray(payload.action)?payload.action:null;
  return {intent,text,action:proposed};
 }finally{clearTimeout(timer)}
}
const ACTION_PAIRS:Record<string,string[]> = {
 meta_ads:["read_metrics","change_ad_budget"],
 facebook:["create_content","publish_content","reply_to_comment","read_metrics"],
 instagram:["create_content","publish_content","reply_to_comment","read_metrics"],
 tiktok:["create_content","publish_content","reply_to_comment","read_metrics"],
 youtube:["create_content","publish_content","reply_to_comment","read_metrics"],
 manychat:["create_automation"],email:["send_email"],other:["other"]
};
function validatedAction(candidate:unknown){
 if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return null;
 const value=candidate as Record<string,unknown>;
 const provider=typeof value.provider==="string"?value.provider.trim():"";
 const kind=typeof value.kind==="string"?value.kind.trim():"";
 if(!(ACTION_PAIRS[provider]||[]).includes(kind))return null;
 const summary=typeof value.summary==="string"?value.summary.trim().slice(0,800):"";
 const scope=typeof value.scope==="string"?value.scope.trim().slice(0,1200):"";
 if(summary.length<5||scope.length<5)return null;
 return {provider,action_kind:kind,summary,scope};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 const origin=req.headers.get("origin");
 if(origin&&origin!==ORIGIN&&!origin.startsWith("http://localhost:")&&!origin.startsWith("http://127.0.0.1:"))return reply(req,{error:"Origin is not allowed"},403);
 if(req.method!=="POST")return reply(req,{error:"POST required"},405);
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim();
 if(!token)return reply(req,{error:"Sign in first"},401);
 const url=env("SUPABASE_URL"),roleKey=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!roleKey)return reply(req,{error:"Chat server unavailable"},503);
 const db=createClient(url,roleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authErr}=await db.auth.getUser(token);
 if(authErr||!auth.user)return reply(req,{error:"Your sign-in expired. Please sign in again."},401);
 const owner=auth.user.id;
 if(!env("AGENT_HQ_ALLOWED_OWNER_IDS").split(",").some(x=>x.trim().toLowerCase()===owner.toLowerCase()))
  return reply(req,{error:"This account is not authorized for AI conversations"},403);
 let input:Record<string,unknown>;
 try{const raw=await req.json();if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error();input=raw}
 catch{return reply(req,{error:"Invalid message"},400)}
 const worker=typeof input.employee_id==="string"?input.employee_id:"";
 const body=typeof input.text==="string"?input.text.trim():"";
 if(!(worker in EMPLOYEES)||body.length<1||body.length>10000)return reply(req,{error:"Please enter a valid message (up to 10,000 characters)"},400);
 const ai=provider();
 if(!ai)return reply(req,{error:"Groq or OpenRouter must be configured in Supabase Secrets"},503);

 // Save the owner's actual text before model processing. A failed model never erases user text.
 const {data:conversation,error:conversationError}=await db.from("agent_conversations")
  .upsert({owner_id:owner,employee_id:worker},{onConflict:"owner_id,employee_id"}).select("id").single();
 if(conversationError||!conversation)return reply(req,{error:"Could not open the conversation"},500);
 const cid=conversation.id;
 const {data:ownerMessage,error:saveErr}=await db.from("agent_messages")
  .insert({owner_id:owner,conversation_id:cid,sender:"owner",body}).select("id").single();
 if(saveErr||!ownerMessage)return reply(req,{error:"Message could not be saved"},500);

 const {data:stored}=await db.from("agent_chat_states").select("*").eq("owner_id",owner).eq("employee_id",worker).maybeSingle();
 let stage=stored?.stage||"idle";
 let pending=stored?.pending_text||"";
 let related=stored?.assignment_id||null,permission=stored?.permission_request_id||null;
 let pendingAction=stored?.action_proposal_id||null;
 let startAssignment:string|null=null,resumeAssignment:string|null=null;
 let replyText="";
 const decision=yesNo(body);
 const state=async(next:string,taskText="",assignmentId:string|null=null,requestId:string|null=null,actionId:string|null=null)=>{
  const {error}=await db.from("agent_chat_states").upsert({
   owner_id:owner,employee_id:worker,stage:next,pending_text:taskText.slice(0,10000),
   assignment_id:assignmentId,permission_request_id:requestId,
   action_proposal_id:actionId,updated_at:new Date().toISOString()
  },{onConflict:"owner_id,employee_id"});
  if(error)throw Error("Couldn't save the conversation state");
 };
 const append=async(message:string)=>{
  const {error}=await db.from("agent_messages").insert({
   owner_id:owner,conversation_id:cid,sender:"employee",body:message.slice(0,10000)
  });
  if(error)throw Error("Couldn't save the worker's reply");
 };
 const currentWaiting=async()=>{
  const {data:tasks}=await db.from("agent_task_steps").select("id,assignment_id,employee_id,status,question")
   .eq("owner_id",owner).eq("employee_id",worker).in("status",["waiting_for_owner","waiting_for_permission"])
   .order("updated_at",{ascending:false}).limit(1);
  return tasks?.[0]||null;
 };
 try{
  if(stage==="confirm_action"){
   const {data:proposal,error:lookupError}=pendingAction?
    await db.from("agent_action_proposals")
     .select("id,status,summary,scope,provider,action_kind")
     .eq("id",pendingAction).eq("owner_id",owner).eq("employee_id",worker).maybeSingle():
    {data:null,error:null};
   if(lookupError||!proposal||proposal.status!=="pending"){
    await state("idle");
    replyText="That action request is no longer pending. Nothing was executed.";
   }else if(decision){
    const {data:changed,error}=await db.from("agent_action_proposals")
     .update({status:decision==="yes"?"approved":"denied",decided_at:new Date().toISOString()})
     .eq("id",proposal.id).eq("owner_id",owner).eq("employee_id",worker).eq("status","pending")
     .select("id").maybeSingle();
    if(error||!changed)throw Error("Your decision could not be saved. Check Operations and try again.");
    await state("idle");
    replyText=decision==="yes"?
     "Approved as a proposal: "+proposal.summary+
      ". The "+proposal.provider+" account is NOT connected, so I have NOT made any changes. You can review it under Operations.":
     "Okay, I declined that proposed action. Nothing was changed.";
   }else{
    replyText="To confirm, may I record approval for this proposed "+proposal.provider+" action: "+
      proposal.summary+"? Yes or no? This will not connect the account or execute the change.";
   }
  }else if(stage==="confirm_task"){
   if(decision==="yes"){
    if(pending.length<5)throw Error("Assignment details are missing");
    const trimmed=pending.slice(0,10000);
    const first=trimmed.split(/[\r\n]/)[0].trim().slice(0,120)||"New team assignment";
    const assignee=worker==="hq"?"alex":worker;
    const {data:assignment,error}=await db.from("agent_team_assignments").insert({
     owner_id:owner,title:first,instructions:trimmed,employee_ids:[assignee],
     source_employee_id:worker,coordination_status:"planning"
    }).select("id").single();
    if(error||!assignment)throw Error("Could not create this assignment");
    await db.from("agent_team_messages").insert({
     owner_id:owner,assignment_id:assignment.id,sender_kind:"owner",sender_id:"owner",
     message_type:"note",body:trimmed
    });
    await state("idle");
    startAssignment=assignment.id;
    replyText="Yes, I can take that on. I'll bring Alex in to organize the work and keep you updated here.";
   }else if(decision==="no"){
    await state("idle");
    replyText="No problem. We can just talk about it. What would you like to know?";
   }else{
    pending=(pending+"\nAdditional information: "+body).slice(0,10000);
    await state("confirm_task",pending);
    replyText="Got it. Should I go ahead and turn that into an assignment for the team? Yes or no?";
   }
  }else if(stage==="confirm_resume"){
   if(decision==="yes"&&related){
    await state("idle");resumeAssignment=related;
    replyText="Sounds good. I'll get the team going again and keep the updates in our messages.";
   }else if(decision==="no"){
    await state("idle");
    replyText="Okay, I'll leave that assignment paused. Just tell me when you're ready.";
   }else{
    replyText="Just to confirm: should I resume the team on this assignment now? Yes or no?";
   }
  }else if(stage==="confirm_permission"){
   const {data:request}=permission?await db.from("agent_permission_requests").select("id,status,target_url,reason,expires_at")
     .eq("owner_id",owner).eq("employee_id",worker).eq("id",permission).maybeSingle():{data:null};
   if(!request||request.status!=="pending"||Date.parse(request.expires_at)<=Date.now()){
    await state("idle");replyText="That permission request is no longer pending. No website access was started.";
   }else if(decision){
    const {data:changed,error}=await db.from("agent_permission_requests")
     .update({status:decision==="yes"?"approved":"denied",decided_at:new Date().toISOString()})
     .eq("id",request.id).eq("owner_id",owner).eq("employee_id",worker)
     .eq("status","pending").gt("expires_at",new Date().toISOString()).select("id").maybeSingle();
    if(error||!changed)throw Error("That permission decision could not be saved");
    await state("idle");
    replyText=decision==="yes"?
     "I've recorded your approval for that specific request. I still can't open websites automatically. Please send me the source information you want me to work from.":
     "Okay, I won't use that website. We can continue with the information you share here.";
   }else{
    replyText="For "+request.target_url+" ("+request.reason+"), should I record approval for this specific request? Yes or no? It won't start browsing.";
   }
  }else{
   const waiting=await currentWaiting();
   if(waiting?.status==="waiting_for_permission"&&decision){
    const {data:requests}=await db.from("agent_permission_requests")
     .select("id,target_url,reason,expires_at,status")
     .eq("owner_id",owner).eq("employee_id",worker).eq("status","pending")
     .order("created_at",{ascending:false}).limit(1);
    const r=requests?.[0];
    if(r&&Date.parse(r.expires_at)>Date.now()){
     await state("confirm_permission","",waiting.assignment_id,r.id);
     replyText="Before I record anything: do you approve my request for "+r.target_url+
      " specifically to "+r.reason+"? Yes or no? Approval is recorded, but browsing isn't enabled.";
    }
   }
   if(!replyText&&waiting?.status==="waiting_for_permission"&&!decision){
    if(body.length<10){
     replyText="Please send me the source information or details I can safely work from, then I'll ask before resuming.";
    }else{
     const {data:updated,error}=await db.from("agent_task_steps")
      .update({status:"queued",updated_at:new Date().toISOString()})
      .eq("id",waiting.id).eq("owner_id",owner).eq("status","waiting_for_permission")
      .select("id").maybeSingle();
     if(error||!updated)throw Error("Couldn't save the source information for the assignment");
     await db.from("agent_team_messages").insert({
      owner_id:owner,assignment_id:waiting.assignment_id,sender_kind:"owner",
      sender_id:"owner",message_type:"reply",body
     });
     await db.from("agent_team_assignments").update({
      coordination_status:"ready",status:"in_progress",updated_at:new Date().toISOString()
     }).eq("id",waiting.assignment_id).eq("owner_id",owner);
     await state("confirm_resume","",waiting.assignment_id);
     replyText="Thanks for that information. I can draft from what you shared without opening the website. Want me to resume the team now? Yes or no?";
    }
   }
   if(!replyText&&waiting?.status==="waiting_for_owner"){
    // The answer to a worker question is saved in the very same Messages conversation.
    const {data:updated,error}=await db.from("agent_task_steps")
     .update({status:"queued",updated_at:new Date().toISOString()})
     .eq("id",waiting.id).eq("owner_id",owner).eq("status","waiting_for_owner").select("id").maybeSingle();
    if(error||!updated)throw Error("Couldn't record the answer against the waiting task");
    await db.from("agent_team_messages").insert({
     assignment_id:waiting.assignment_id,owner_id:owner,sender_kind:"owner",
     sender_id:"owner",message_type:"reply",body
    });
    await db.from("agent_team_assignments").update({
     coordination_status:"ready",status:"in_progress",updated_at:new Date().toISOString()
    }).eq("id",waiting.assignment_id).eq("owner_id",owner);
    await state("confirm_resume","",waiting.assignment_id);
    replyText="Thanks, that helps. Should I resume this assignment with the team now? Yes or no?";
   }
   if(!replyText){
    const old=pending;
    const isCollect=stage==="collecting_task";
    const composed=isCollect?(old+"\nMore details: "+body).slice(0,10000):body;
    const {count}=await db.from("agent_chat_ai_turns").select("id",{head:true,count:"exact"})
      .eq("owner_id",owner).gte("created_at",new Date(Date.now()-3600000).toISOString());
    if((count||0)>=30){
     replyText="I’m at the conversation limit for this hour. We can pick this up shortly.";
    }else{
     await db.from("agent_chat_ai_turns").insert({owner_id:owner,employee_id:worker});
     const {data:recent}=await db.from("agent_messages").select("sender,body")
       .eq("conversation_id",cid).eq("owner_id",owner).order("created_at",{ascending:false}).limit(7);
     const result=await decide(ai,EMPLOYEES[worker as Worker],{
      current_message:body,context:isCollect?"collecting_task":"new_message",
      pending_assignment_details:isCollect?old:null,
      recent_chat:(recent||[]).reverse().map(x=>({sender:x.sender,body:String(x.body).slice(0,1000)}))
     });
     if(result.intent==="action"){
      const proposed=validatedAction(result.action);
      if(!proposed){
       await state("idle");
       replyText="I can help arrange that, but I need the exact platform, account, and action first. Which should I prepare?";
      }else if(proposed.action_kind==="change_ad_budget"&&!/(?:\$\s*\d|\bUSD\s*\d)/i.test(composed)){
       await state("collecting_task",composed);
       replyText="What exact daily budget do you want, and which campaign or ad set would it apply to?";
      }else{
       const {data:proposal,error:proposalError}=await db.from("agent_action_proposals").insert({
        owner_id:owner,employee_id:worker,provider:proposed.provider,
        action_kind:proposed.action_kind,summary:proposed.summary,scope:proposed.scope,
        execution_status:"not_connected",status:"pending"
       }).select("id").single();
       if(proposalError||!proposal)throw Error("Couldn't save the proposed business action");
       await state("confirm_action","",null,null,proposal.id);
       replyText="I can prepare this: "+proposed.summary+
        ". Scope: "+proposed.scope+
        ". The "+proposed.provider+" integration is not connected yet, so nothing will run. Shall I record your approval for this specific proposal? Yes or no?";
      }
     }else if(/\b(?:spent|spend|cpa|roas|ad metrics|campaign performance)\b/i.test(body)&&
       /\b(?:yesterday|today|last night|this week|campaign|ads?|facebook|meta)\b/i.test(body)){
      await state("idle");
      replyText="I don't have live advertising account data, so I can't verify those numbers. To report actual spending and results, we'd need an authorized read-only Meta Ads connection.";
     }else if(result.intent==="task"){
      await state("confirm_task",composed);
      replyText=result.text.match(/yes or no/i)?result.text:result.text+" Should I start this assignment? Yes or no?";
     }else if(result.intent==="collect"){
      await state("collecting_task",composed);
      replyText=result.text;
     }else{
      await state("idle");
      replyText=result.text;
     }
    }
   }
  }
  await append(replyText);
  return reply(req,{success:true,owner_message_id:ownerMessage.id,
   reply:replyText,start_assignment_id:startAssignment,resume_assignment_id:resumeAssignment});
 }catch(error){
  const info=error instanceof Error?error.message:"Conversation temporarily unavailable";
  const safe="I got your message, but I couldn't finish my reply just now. Please try again. ("+info.slice(0,120)+")";
  try{await append(safe)}catch{}
  return reply(req,{success:true,owner_message_id:ownerMessage.id,reply:safe,
   error:info,start_assignment_id:null,resume_assignment_id:null});
 }
});
