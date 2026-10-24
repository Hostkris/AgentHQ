import {createClient} from "npm:@supabase/supabase-js@2.79.0";
import {createResearchRequest,isResearchInstruction,researchApproval,researchStatus,runResearch} from "./research.ts";
import {ALEX_DNA,isAlexForbiddenIntent} from "../_shared/alex-dna.ts";
import {alexBrief} from "./alex-brief.ts";
const ORIGIN="https://hostkris.github.io";
const EMPLOYEES={
 alex:"General Manager",maya:"Marketing strategist",jordan:"Scripts and content",
 riley:"Research analyst",taylor:"Communications",
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
// One reply controls only one currently pending internal drafting plan. It never
// authorizes websites, account actions, publishing, payments or permissions.
function planSignal(value:string):"approve"|"reject"|null{
 const t=value.trim().toLowerCase().replace(/[.!?]+$/g,"").replace(/\s+/g," ");
 if(/^(approved|approve|yes|yes please|green light|you (?:have|got) the green light|go ahead|proceed|you(?:'re| are) authorized|i approve(?: this(?: plan)?)?|approve (?:this |the )?plan|you(?:'re| are) approved|give (?:them|the team) the green light)$/.test(t))return "approve";
 if(/^(no|nope|red light|stop|stop the plan|reject|reject (?:this |the )?plan|decline|denied|not approved|do not approve|don't approve|hold off|cancel (?:this |the )?plan)$/.test(t))return "reject";
 return null;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function provider(){
 if(env("GROQ_API_KEY"))return {name:"groq",key:env("GROQ_API_KEY"),model:env("AGENT_HQ_AI_MODEL")||"openai/gpt-oss-120b",url:"https://api.groq.com/openai/v1/chat/completions"};
 if(env("OPENROUTER_API_KEY"))return {name:"openrouter",key:env("OPENROUTER_API_KEY"),model:env("AGENT_HQ_AI_MODEL")||"meta-llama/llama-3.3-70b-instruct:free",url:"https://openrouter.ai/api/v1/chat/completions"};
 return null;
}
async function decide(ai:NonNullable<ReturnType<typeof provider>>,role:string,context:unknown){
 const system=role==="General Manager"?`You are Alex, General Manager of Agent HQ. Permanent mission: ${ALEX_DNA.mission}. Your ONLY professional work is to clarify assignments, draft proposed work routing, coordinate specialists, monitor progress and report status. You are not a specialist. Do NOT answer as the Research, Marketing, Writing, Social, Communications, Shopify, Analysis, Scheduling or Growth specialist. No web search, Gmail, external account tools, purchase, publication, sending, code editing or permission changes. No actions are executed by this conversation. The backend requires separate owner approval for your plans. For any specialist or external task, classify as "task", briefly describe that you will route it to a specialist, and ask "Should I create a proposed assignment? Yes or no?". If essential assignment details are missing classify as "collect" and ask ONE precise question. For internal workflow/status questions use "answer" to give a concise, factual response without pretending work occurred. Return ONLY valid JSON {"intent":"answer|collect|task","reply":"brief professional response"} with no code fences.`:`You are a friendly, concise AI coworker working as ${role} in Agent HQ. This is the OWNER'S PRIVATE PERSONAL-USE workspace for their own social accounts, advertising accounts and projects, not a commercial agency. This is a casual one-to-one text conversation, not a task dashboard.
You can answer general knowledge questions, discuss assignments, and ask for missing task details. Public web research is available through a separate owner-approved research flow. You cannot browse in this classification call. Account access, purchasing, posting, and file modification are unavailable. Never imply you actually researched a website or completed external work. Do not fabricate sources.
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
For requests to research online, search the web, look something up, find current public information, or compare current public options, classify as "research". The server will ask approval before searching; do not claim to have searched. For requests requiring account data or actions, still use "action".
For "task", ask if they want to START the assignment, ending with "Yes or no?".
Return ONLY valid JSON with {"intent":"answer|collect|task|action|research","reply":"short natural message","action":optional object as above} and no code fences.`;
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
  const intent=["answer","collect","task","action","research"].includes(payload.intent)?payload.intent:"answer";
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
const PERSONAL_ACTION_SCOPES:Record<string,string>={
 read_metrics:"read_account_data",publish_content:"publish_content",
 reply_to_comment:"manage_messages"
};
// Creates only an owner-scoped PERMISSION REQUEST. Never a live connection or grant.
async function requestPersonalScope(
 db:ReturnType<typeof createClient>,owner:string,worker:string,platform:string,
 kind:string,summary:string,userInstruction:string
):Promise<{outcome:"not_required"|"missing"|"ambiguous"|"requested"|"approved",label?:string}>{
 const capability=PERSONAL_ACTION_SCOPES[kind];
 if(!capability||!["facebook","instagram","tiktok","youtube"].includes(platform))
  return {outcome:"not_required"};
 if(worker==="hq")return {outcome:"ambiguous"};
 const {data:profiles,error:accountError}=await db.from("agent_personal_accounts")
  .select("id,label,handle").eq("owner_id",owner).eq("platform",platform).limit(50);
 if(accountError)throw Error("Couldn't verify your saved social accounts");
 if(!profiles?.length)return {outcome:"missing"};
 // Only select automatically when exactly one matching profile exists.
 const matched=profiles.filter(p=>userInstruction.toLowerCase().includes(String(p.handle).toLowerCase()));
 const account=matched.length===1?matched[0]:profiles.length===1?profiles[0]:null;
 if(!account)return {outcome:"ambiguous"};
 const {data:existing,error:checkError}=await db.from("agent_personal_permission_plans")
  .select("id,status,expires_at,revoked_at").eq("owner_id",owner)
  .eq("account_id",account.id).eq("employee_id",worker).eq("capability",capability)
  .maybeSingle();
 if(checkError)throw Error("Couldn't check your worker permissions");
 if(existing?.status==="approved"&&!existing.revoked_at&&Date.parse(existing.expires_at)>Date.now())
  return {outcome:"approved",label:String(account.label)};
 const purpose=("For the owner's request: "+summary).slice(0,500);
 const {error:saveError}=await db.from("agent_personal_permission_plans").upsert({
  owner_id:owner,account_id:account.id,employee_id:worker,capability,purpose,
  status:"requested",requested_at:new Date().toISOString(),
  expires_at:new Date(Date.now()+7*86400000).toISOString(),
  decided_at:null,revoked_at:null,external_execution_enabled:false
 },{onConflict:"owner_id,account_id,employee_id,capability"});
 if(saveError)throw Error("Couldn't save the worker's limited permission request");
 return {outcome:"requested",label:String(account.label)};
}
async function liveMetaAnswer(db:ReturnType<typeof createClient>,owner:string,userJwt:string,employeeId:string,question:string){
 const mentionsAds=/\b(meta|facebook|instagram|ads?|campaigns?|adsets?)\b/i.test(question);
 const requestsMetrics=/\b(spent|spend|spending|performance|results|report|metrics|impressions|clicks|cpc|ctr|roas|costs?)\b/i.test(question);
 const intendsChange=/\b(change|increase|decrease|raise|lower|set|update|pause|stop|publish|send|create)\b/i.test(question);
 if(!mentionsAds||!requestsMetrics||intendsChange)return null;
 const {data:conn}=await db.from("agent_meta_ads_connections")
  .select("status,preferred_account_id,token_expires_at").eq("owner_id",owner).maybeSingle();
 if(!conn||conn.status!=="active"||Date.parse(conn.token_expires_at)<=Date.now()){
  return "I can check actual Meta advertising results once your account is connected. Open Agent HQ → Operations → Meta Ads reporting and authorize read-only access. I won't guess at your spending.";
 }
 const {data:accounts,error}=await db.from("agent_meta_ad_accounts")
  .select("account_id,name,currency").eq("owner_id",owner);
 if(error)return "I couldn't load your Meta account list. Please open Operations and refresh your advertising accounts.";
 const list=accounts||[];
 const target=list.find(a=>a.account_id===conn.preferred_account_id)||(list.length===1?list[0]:null);
 if(!target){
  return list.length>1?"You have multiple Meta ad accounts. Which should I report on? First select the reporting account in Operations → Meta Ads, then ask me again.":
   "Meta is connected, but I don't see an accessible ad account yet. Open Operations and tap Refresh accounts.";
 }
 if(employeeId==="hq")return "Choose a named employee in Contacts for Meta reporting. I can't give Company HQ unrestricted access to your advertising data.";
 const {data:workerPermission,error:permissionError}=await db.from("agent_meta_worker_grants")
  .select("expires_at,revoked_at").eq("owner_id",owner)
  .eq("employee_id",employeeId).eq("account_id",target.account_id).maybeSingle();
 if(permissionError)return "I couldn't verify my reporting permission. Please try again after checking Operations.";
 if(!workerPermission||workerPermission.revoked_at||Date.parse(workerPermission.expires_at)<=Date.now()){
  return "Meta Ads is connected, but I don't have permission to read "+target.name+" yet. In Operations → Meta Ads reporting, select this account and grant me read-only reporting access for 24 hours. I won't access the data without your approval.";
 }
 const period=/\byesterday\b|\blast night\b/i.test(question)?"yesterday":
  /\b30\s*days\b|\blast month\b|\bmonthly\b/i.test(question)?"last_30d":"last_7d";
 const url=env("SUPABASE_URL")+"/functions/v1/agent-meta-ads";
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),18000);
 try{
  const result=await fetch(url,{method:"POST",signal:abort.signal,
   headers:{"Authorization":"Bearer "+userJwt,"Content-Type":"application/json",
    ...(env("SUPABASE_ANON_KEY")?{"apikey":env("SUPABASE_ANON_KEY")}:{})},
   body:JSON.stringify({action:"report",account_id:target.account_id,period})
  });
  const payload=await result.json().catch(()=>null);
  if(!result.ok||payload?.source!=="meta_marketing_api_live"){
   return "Meta couldn't provide a verified report right now. "+String(payload?.error||"Check permissions and try again.").slice(0,160)+
   " No spending figures were guessed.";
  }
  const m=payload.overview||{},currency=payload.account?.currency||target.currency||"USD";
  const number=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;
  const price=(v:unknown)=>{
   try{return new Intl.NumberFormat("en-US",{style:"currency",currency}).format(number(v))}
   catch{return number(v).toFixed(2)+" "+currency}
  };
  const clicks=number(m.clicks).toLocaleString("en-US");
  const impressions=number(m.impressions).toLocaleString("en-US");
  const range=period==="yesterday"?"yesterday":period==="last_30d"?"the last 30 days":"the last 7 days";
  const top=(payload.campaigns||[]).slice(0,2);
  let answer="I checked Meta's live report for "+target.name+" ("+range+"). Spend: "+
   price(m.spend)+". "+clicks+" clicks, "+impressions+" impressions. CPC: "+
   price(m.cpc)+"; CTR: "+number(m.ctr).toFixed(2)+"%.";
  if(top.length)answer+=" The highest-spend campaign was "+top[0].name+" ("+price(top[0].spend)+").";
  answer+=" Source: Meta Marketing API, retrieved "+new Date(payload.received_at).toLocaleString("en-US")+
   ". This is read-only; I haven't changed any ads.";
  return answer.slice(0,1500);
 }catch{
  return "Meta's read-only report didn't finish. Please try again or open Operations to check the connection. I won't invent any results.";
 }finally{clearTimeout(timer)}
}

// Read only the owner's previously checked Gmail PRIORITY SUMMARIES, never message bodies.
// A Google connection and an unexpired grant for this specific named worker are both required.
async function liveGmailAnswer(db:ReturnType<typeof createClient>,owner:string,worker:string,question:string){
 const wantsMail=/\b(gmail|inbox|e-mails?|emails?|mail)\b/i.test(question);
 const wantsReview=/\b(check|scan|review|sort|prioriti[sz]e|rank|summari[sz]e|organize|organise|what.s important|what needs|unread)\b/i.test(question);
 if(!wantsMail||!wantsReview)return null;
 if(/\b(icloud|apple mail)\b/i.test(question))return "I can help draft email responses, but iCloud Mail is not connected to Agent HQ. Apple uses a separate IMAP/SMTP setup with an app-specific password, not Gmail's Google sign-in. I won't ask for your Apple password in chat.";
 if(worker==="hq")return "Please choose a named coworker like Maya or Taylor before granting Gmail inbox access. I can't grant the entire HQ unrestricted email access.";
 const {data:c,error:connectionError}=await db.from("agent_gmail_connections")
  .select("status,last_checked_at,scopes").eq("owner_id",owner).maybeSingle();
 if(connectionError)return "I couldn't verify Gmail's connection. Open Email Center to review the setup.";
 if(!c||c.status!=="active"||!Array.isArray(c.scopes)||!c.scopes.includes("https://www.googleapis.com/auth/gmail.readonly"))
  return "To review your inbox, first connect Gmail using the button in this conversation. Google will ask you to sign in and approve Gmail access. That alone won't give me permission.";
 const {data:grant,error:grantError}=await db.from("agent_gmail_worker_grants")
  .select("expires_at,revoked_at,scope").eq("owner_id",owner).eq("employee_id",worker).maybeSingle();
 if(grantError)return "I couldn't verify my Gmail permission, so I won't read your inbox.";
 if(!grant||grant.scope!=="priority_summaries"||grant.revoked_at||Date.parse(grant.expires_at)<=Date.now())
  return "Gmail is connected. Please use the Allow button in this conversation to give me 24-hour access to its priority summaries. I can't open your inbox until you approve that specific permission.";
 const {data:items,error}=await db.from("agent_email_items")
  .select("from_name,from_email,subject,priority,priority_reason,needs_reply,draft_state,received_at")
  .eq("owner_id",owner).order("received_at",{ascending:false}).limit(100);
 if(error)return "Gmail is authorized, but I couldn't load your saved priority summaries.";
 const last=c.last_checked_at?Date.parse(c.last_checked_at):0;
 if(!last||!items?.length)return "I'm authorized to review Gmail priority summaries, but no messages have been checked yet. Tap Check inbox now in this conversation. Nothing will be sent.";
 const counts={urgent:0,high:0,medium:0,low:0};
 for(const item of items){
  if(Object.prototype.hasOwnProperty.call(counts,item.priority))
   counts[item.priority as keyof typeof counts]++;
 }
 const top=[...items].sort((a,b)=>({urgent:0,high:1,medium:2,low:3}[a.priority as keyof typeof counts]??4)-
   ({urgent:0,high:1,medium:2,low:3}[b.priority as keyof typeof counts]??4)||
   Date.parse(b.received_at)-Date.parse(a.received_at)).slice(0,5);
 const brief=top.map(m=>{
  const sender=String(m.from_name||m.from_email||"Sender").slice(0,80).replace(/[\r\n]/g," ");
  const subject=String(m.subject||"(no subject)").slice(0,100).replace(/[\r\n]/g," ");
  return "["+m.priority+"] "+sender+": "+subject+(m.draft_state==="ready"?" — reply draft ready":"");
 }).join("; ");
 const stale=Date.now()-last>15*60000?" These are SAVED results, not a fresh inbox check. Tap Check inbox now for a new review.":"";
 return "Among "+items.length+" recently saved Gmail messages (last checked "+new Date(last).toLocaleString("en-US",{timeZone:"America/New_York",timeZoneName:"short"})+"): "+
  counts.urgent+" urgent, "+counts.high+" high, "+counts.medium+" medium, "+counts.low+" low. "+
  "Top items: "+brief+"."+stale+" I didn't send, delete, or open any email.";
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
 if(input.action==="research_status")return reply(req,await researchStatus(env("GROQ_API_KEY")));
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
 let researchJob=stored?.research_job_id||null,replySaved=false;
 let startAssignment:string|null=null,resumeAssignment:string|null=null,approvedAssignment:string|null=null;
 let replyText="";
 const decision=yesNo(body);
 const state=async(next:string,taskText="",assignmentId:string|null=null,requestId:string|null=null,actionId:string|null=null,researchId:string|null=null)=>{
  const {error}=await db.from("agent_chat_states").upsert({
   owner_id:owner,employee_id:worker,stage:next,pending_text:taskText.slice(0,10000),
   assignment_id:assignmentId,permission_request_id:requestId,
   action_proposal_id:actionId,research_job_id:researchId,updated_at:new Date().toISOString()
  },{onConflict:"owner_id,employee_id"});
  if(error)throw Error("Couldn't save the conversation state");
 };
 const append=async(message:string)=>{
  const {error}=await db.from("agent_messages").insert({
   owner_id:owner,conversation_id:cid,sender:"employee",body:message.slice(0,10000)
  });
  if(error)throw Error("Couldn't save the worker's reply");
 };
 const createAssignment=async(details:string)=>{
  const trimmed=details.trim().slice(0,10000);
  if(trimmed.length<5)throw Error("Assignment details are missing");
  const first=trimmed.split(/[\r\n]/)[0].trim().slice(0,120)||"New team assignment";
  const assignee=worker==="hq"?"alex":worker;
  const {data:assignment,error}=await db.from("agent_team_assignments").insert({
   owner_id:owner,title:first,instructions:trimmed,employee_ids:[assignee],
   source_employee_id:worker,coordination_status:"planning"
  }).select("id").single();
  if(error||!assignment)throw Error("Could not save Alex's proposed assignment");
  await db.from("agent_team_messages").insert({
   owner_id:owner,assignment_id:assignment.id,sender_kind:"owner",
   sender_id:"owner",message_type:"note",body:trimmed
  });
  await state("idle","",assignment.id);
  startAssignment=assignment.id;
  replyText=worker==="alex"?"I've asked the team planner to prepare a specialist work order here in Messages. You'll see the full plan and can reply green light or red light before anyone starts.":
   "I've handed your request to Alex to choose the right specialists. The plan will show in this conversation, and nothing starts without your approval.";
 };
 const currentWaiting=async()=>{
  const {data:tasks}=await db.from("agent_task_steps").select("id,assignment_id,employee_id,status,question")
   .eq("owner_id",owner).eq("employee_id",worker).in("status",["waiting_for_owner","waiting_for_permission"])
   .order("updated_at",{ascending:false}).limit(1);
  return tasks?.[0]||null;
 };
 const proposeResearch=async(topic:string)=>{
  if(!env("GROQ_API_KEY")){
   await state("idle");replyText="Web research needs the Groq server connection. Open Settings → Web Research and tap Check connection. A GROQ_API_KEY must be configured in Supabase Secrets; don't send API keys in chat.";return;
  }
  const id=await createResearchRequest(db,owner,worker,cid,topic);
  await state("confirm_research","",null,null,null,id);
  replyText=researchApproval(topic);
 };
 try{
  // Chat approval is limited to a single saved routing plan awaiting its owner's decision.
  // "Yes" in confirm_task confirms task creation; it does not approve its later plan.
  const signal=planSignal(body);
  let planDecisionHandled=false;
  if(signal&&stage==="idle"){
   let query=db.from("agent_team_assignments")
    .select("id,title,manager_summary,source_employee_id,coordination_status,status")
    .eq("owner_id",owner).neq("status","completed")
    .order("updated_at",{ascending:false}).limit(25);
   if(worker!=="alex"&&worker!=="hq")query=query.eq("source_employee_id",worker);
   const {data:assignments,error:assignmentReadError}=await query;
   if(assignmentReadError)throw Error("Could not verify pending assignments");
   const ids=(assignments||[]).map(a=>a.id);
   if(ids.length){
    const [{data:steps,error:stepsError},{data:decisions,error:decisionsError}]=await Promise.all([
     db.from("agent_task_steps").select("assignment_id,status").eq("owner_id",owner).in("assignment_id",ids),
     db.from("agent_alex_plan_decisions").select("assignment_id,status").eq("owner_id",owner).in("assignment_id",ids)
    ]);
    if(stepsError||decisionsError)throw Error("Could not verify the plan approval ledger");
    const grouped=new Map<string,string[]>();
    for(const step of steps||[])grouped.set(step.assignment_id,[...(grouped.get(step.assignment_id)||[]),step.status]);
    const decided=new Map((decisions||[]).map(x=>[x.assignment_id,x.status]));
    const available=(assignments||[]).filter(a=>a.manager_summary?.trim()&&
      (grouped.get(a.id)||[]).length>0&&
      (grouped.get(a.id)||[]).every(x=>x==="queued")&&decided.get(a.id)!=="approved");
    const target=available.find(a=>a.id===related)||(available.length===1?available[0]:null);
    if(available.length>1&&!target){
     planDecisionHandled=true;
     replyText="More than one plan needs approval. Please open the specific conversation and say which plan you mean: "+available.slice(0,3).map(x=>x.title).join("; ")+". I have not approved anything.";
    }else if(target){
     planDecisionHandled=true;
     if(signal==="approve"){
      const {error}=await db.from("agent_alex_plan_decisions").upsert({
       owner_id:owner,assignment_id:target.id,status:"approved",decided_at:new Date().toISOString()
      },{onConflict:"owner_id,assignment_id"});
      if(error)throw Error("Could not record plan approval");
      approvedAssignment=target.id;
      await state("idle","",target.id);
      replyText="Green light recorded for "+target.title+". The approved specialists can draft their assigned work. I'll show their results in Messages. This did NOT authorize posting or outside account actions.";
     }else{
      // This is the same bounded rejection behavior as the coordinator.
      const {error:deleteError}=await db.from("agent_task_steps").delete()
       .eq("owner_id",owner).eq("assignment_id",target.id).eq("status","queued");
      if(deleteError)throw Error("Could not stop the proposed specialist plan");
      const {error:resetError}=await db.from("agent_team_assignments").update({
       employee_ids:["alex"],manager_summary:"",coordination_status:"planning",status:"planned",updated_at:new Date().toISOString()
      }).eq("owner_id",owner).eq("id",target.id);
      if(resetError)throw Error("Could not reset the rejected plan");
      const {error:decisionError}=await db.from("agent_alex_plan_decisions").upsert({
       owner_id:owner,assignment_id:target.id,status:"rejected",decided_at:new Date().toISOString()
      },{onConflict:"owner_id,assignment_id"});
      if(decisionError)throw Error("Could not log the rejected plan");
      await state("idle","",target.id);
      replyText="Red light. I rejected the plan for "+target.title+". No specialist drafts were authorized. Tell me what to change and I will prepare a replacement.";
     }
    }else if(related&&(assignments||[]).some(a=>a.id===related)){
     planDecisionHandled=true;
     replyText="There is no unapproved specialist plan for that assignment now. I have not changed any permissions or launched other work.";
    }
   }
  }
  if(planDecisionHandled){
   await append(replyText);
   return reply(req,{success:true,owner_message_id:ownerMessage.id,reply:replyText,
    start_assignment_id:null,resume_assignment_id:null,approved_assignment_id:approvedAssignment});
  }
  // Alex cannot enter research, account-operation, or permission-approval flows, even from stale saved chat state.
  if(worker==="alex"&&(input.action==="request_research"||["confirm_research","confirm_action","confirm_permission"].includes(stage))){
   await state("idle");
   replyText="My role is managing employee assignments. I cannot research websites or operate accounts myself. I can prepare a request for the appropriate specialist and submit the plan for your approval.";
  }else if(input.action==="request_research"){
   await proposeResearch(body);
  }else if(stage==="confirm_research"){
   const {data:job,error:jobError}=researchJob?await db.from("agent_research_jobs")
    .select("id,status,query,expires_at").eq("id",researchJob).eq("owner_id",owner).eq("employee_id",worker).maybeSingle():{data:null,error:null};
   if(jobError)throw Error("Couldn't check the research request.");
   if(!job||job.status!=="pending"||Date.parse(job.expires_at)<=Date.now()){
    await state("idle");replyText="That research request expired or has already been decided. Send a new topic if you want another report.";
   }else if(decision){
    const {data:changed,error}=await db.from("agent_research_jobs")
     .update({status:decision==="yes"?"approved":"denied",approved_at:decision==="yes"?new Date().toISOString():null})
     .eq("id",job.id).eq("owner_id",owner).eq("employee_id",worker).eq("status","pending")
     .gt("expires_at",new Date().toISOString()).select("id").maybeSingle();
    if(error||!changed)throw Error("The research decision was already used or couldn't be saved.");
    await state("idle");
    if(decision==="no")replyText="Cancelled. I haven't searched the web for this request.";
    else{
     try{replyText=await runResearch(db,owner,worker,job.id,env("GROQ_API_KEY"));replySaved=true}
     catch(e){replyText="I couldn't complete the web research: "+(e instanceof Error?e.message:"Please try again.")+" No report was marked complete. Send the topic again to request a new search."}
    }
   }else if(isResearchInstruction(body)){
    await proposeResearch(body);
   }else{
    // Changing the subject cancels the pending approval; a later Yes cannot approve a stale topic.
    await db.from("agent_research_jobs").update({status:"denied"}).eq("id",job.id).eq("owner_id",owner).eq("status","pending");
    await state("idle");replyText="I've cancelled that pending research request. Send the revised topic or question, and I'll help with it.";
   }
  }else if(stage==="confirm_action"){
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
    await createAssignment(pending);
   }else if(decision==="no"){
    await state("idle");
    replyText="Okay, no assignment will start. Tell me what you want changed.";
   }else{
    pending=(pending+"\nAdditional information: "+body).slice(0,10000);
    await state("confirm_task",pending);
    replyText="Got it. Should I create the proposed work order? Yes or no?";
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
   if(worker!=="alex"&&isResearchInstruction(body)&&stage==="idle")await proposeResearch(body);
   const waiting=replyText?null:await currentWaiting();
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
    const actual=stage!=="idle"?null:worker==="alex"?(/\b(?:daily brief|weekly brief|weekly digest|operations status|status report|team progress|manager brief)\b/i.test(body)?await alexBrief(db,owner,/\bweek(?:ly)?\b/i.test(body)?"weekly":"daily"):null):(await liveGmailAnswer(db,owner,worker,body))||(await liveMetaAnswer(db,owner,token,worker,body));
    if(actual){await state("idle");replyText=actual}
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
     if(worker==="alex"&&isAlexForbiddenIntent(result.intent)){
      await state("idle");
      replyText="I cannot perform that work or request those permissions myself. I can create an assignment for the qualified specialist and show you the proposed plan for approval.";
     }else if(result.intent==="action"){
      const proposed=validatedAction(result.action);
      if(!proposed){
       await state("idle");
       replyText="I can help arrange that, but I need the exact platform, account, and action first. Which should I prepare?";
      }else if(proposed.action_kind==="change_ad_budget"&&!/(?:\$\s*\d|\bUSD\s*\d)/i.test(composed)){
       await state("collecting_task",composed);
       replyText="What exact daily budget do you want, and which campaign or ad set would it apply to?";
      }else{
       const personal=await requestPersonalScope(
        db,owner,worker,proposed.provider,proposed.action_kind,proposed.summary,composed
       );
       if(personal.outcome==="missing"){
        await state("idle");
        replyText="I can help prepare that for your own "+proposed.provider+
          " account. First, save its public handle under My Accounts. Don't enter a password or login code. Then I can request the exact worker permission.";
       }else if(personal.outcome==="ambiguous"){
        await state("idle");
        replyText="I need to know which personal account and individual worker this applies to. Open My Accounts to choose the profile, then send me the specific handle and task. I won't assume access to another account.";
       }else{
        const {data:proposal,error:proposalError}=await db.from("agent_action_proposals").insert({
         owner_id:owner,employee_id:worker,provider:proposed.provider,
         action_kind:proposed.action_kind,summary:proposed.summary,scope:proposed.scope,
         detail:personal.label?{account_label:personal.label}: {},
         execution_status:"not_connected",status:"pending"
        }).select("id").single();
        if(proposalError||!proposal)throw Error("Couldn't save the proposed personal account action");
        await state("confirm_action","",null,null,proposal.id);
        const requested=personal.outcome==="requested"?
         " I also created a limited worker permission request for "+personal.label+
         ". Open My Accounts to approve or deny it separately.":
         personal.outcome==="approved"?
         " I have a currently approved planning scope for "+personal.label+
         ", but that isn't an active platform login.":"";
        replyText="I can prepare: "+proposed.summary+". Scope: "+proposed.scope+"."+
          requested+" The actual "+proposed.provider+
          " integration cannot execute this yet. Should I record approval for this specific proposed action? Yes or no?";
       }
      }
     }else if(/\b(?:spent|spend|cpa|roas|ad metrics|campaign performance)\b/i.test(body)&&
       /\b(?:yesterday|today|last night|this week|campaign|ads?|facebook|meta)\b/i.test(body)){
      await state("idle");
      replyText="I don't have live advertising account data, so I can't verify those numbers. To report actual spending and results, we'd need an authorized read-only Meta Ads connection.";
     }else if(result.intent==="research"){
      await proposeResearch(composed);
     }else if(result.intent==="task"){
      // Drafting the work order is safe; the owner still must approve the
      // SPECIFIC specialist plan before any AI drafting or external action.
      await createAssignment(composed);
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
  if(!replySaved)await append(replyText);
  return reply(req,{success:true,owner_message_id:ownerMessage.id,
   reply:replyText,start_assignment_id:startAssignment,resume_assignment_id:resumeAssignment,approved_assignment_id:approvedAssignment});
 }catch(error){
  const info=error instanceof Error?error.message:"Conversation temporarily unavailable";
  const safe="I got your message, but I couldn't finish my reply just now. Please try again. ("+info.slice(0,120)+")";
  try{await append(safe)}catch{}
  return reply(req,{success:true,owner_message_id:ownerMessage.id,reply:safe,
   error:info,start_assignment_id:null,resume_assignment_id:null});
 }
});
