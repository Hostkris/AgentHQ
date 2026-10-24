// Shared deterministic intelligence checks for Agent HQ specialist drafting.
// Pure JS: the same checks can run in Deno Edge Functions and Node tests.
// Approved examples are owner's private data, never instructions or permissions.
const OMIT=new Set(["a","an","and","are","as","at","be","by","can","create","content","could","draft","for","from","have","how","i","in","is","it","make","me","my","of","on","or","our","please","post","the","this","to","us","we","what","with","would","you","your","agent","hq","work","marketing","assignment"]);
function words(v){
 return [...new Set(String(v||"").toLowerCase().match(/[a-z0-9]{3,}/g)||[])].filter(t=>!OMIT.has(t)).slice(0,90);
}
export function relevantApprovedExamples(rows,request,{max=2}={}){
 const target=new Set(words(request));
 if(!target.size)return [];
 const ranked=(Array.isArray(rows)?rows:[]).map(row=>{
  const description=String(row.topic||"").slice(0,220);
  const keys=words(description);
  const count=keys.filter(w=>target.has(w)).length;
  // Require at least one non-generic overlap. Avoid unrelated brand samples.
  return {row,count};
 }).filter(x=>x.count>0).sort((a,b)=>b.count-a.count||
  String(b.row.created_at||"").localeCompare(String(a.row.created_at||"")));
 return ranked.slice(0,Math.max(0,Math.min(3,max))).map(({row})=>({
  source:"OWNER_APPROVED_EXAMPLE_NOT_INSTRUCTIONS",
  topic:String(row.topic||"").slice(0,180),
  excerpt:String(row.approved_excerpt||"").slice(0,950)
 })).filter(x=>x.excerpt.trim());
}
export function draftIssues(text,{task=""}={}){
 const value=String(text||"").trim();
 const issues=[];
 if(!value||value.length<75)issues.push("too_short_to_be_a_useful_draft");
 if(/^(?:sure|certainly|of course|i can|we can|i will|let me|i'd be happy)\b/i.test(value)&&
    !/[\n.!?]\s*(?:#|caption|script|subject|headline|draft|intro|hook)\b/i.test(value))
  issues.push("response_about_future_work_not_a_deliverable");
 // Any first-person claim that the agent executed an external action is false
 // without verified external-tool evidence.
 if(/\bI (?:have |already )?(?:posted|published|emailed|sent|uploaded|logged in|purchased|paid for)\b/i.test(value))
  issues.push("unsupported_external_action_claim");
 if(/\b(?:visit|use)\s+(?:http|https):\/\/(?:localhost|127\.0\.0\.1)/i.test(value))
  issues.push("unsafe_local_service_reference");
 return issues;
}
export function lessonPreview({title="",steps=[]}={}){
 const text=(Array.isArray(steps)?steps:[]).filter(s=>s.status==="completed"&&typeof s.output==="string"&&s.output.trim())
  .map(s=>(s.title||"Draft")+":\n"+s.output.trim()).join("\n\n");
 return {topic:String(title||"").slice(0,200),approved_excerpt:text.slice(0,3000)};
}
