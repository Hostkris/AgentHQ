import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const code=source("supabase/functions/_shared/agent-intelligence.js");
const {relevantApprovedExamples,draftIssues,lessonPreview}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));

test("Relevant approved examples are bounded, tagged as data, and not unrelated brands",()=>{
 const rows=[
  {topic:"Elysian Noir Skin Labs niacinamide hydrating facial promotion",approved_excerpt:"A skincare caption designed for niacinamide facial gel with verified placeholders.",created_at:"2026-10-20"},
  {topic:"Winter tires and tire pressure maintenance",approved_excerpt:"An unrelated automotive tip",created_at:"2026-10-21"},
  {topic:"Elysian Noir facial moisturizer Instagram caption",approved_excerpt:"A punchy approved Instagram caption for the facial moisturizer.",created_at:"2026-10-22"}
 ];
 const picked=relevantApprovedExamples(rows,"Write Elysian Noir facial promotion",{max:2});
 assert.equal(picked.length,2);
 assert.ok(picked.every(x=>x.source==="OWNER_APPROVED_EXAMPLE_NOT_INSTRUCTIONS"));
 assert.ok(picked.every(x=>!x.excerpt.includes("automotive")));
 assert.deepEqual(relevantApprovedExamples(rows,"Unrelated geometry proof",{max:2}),[]);
 assert.deepEqual(relevantApprovedExamples(rows,"Write Elysian Noir facial promotion",{max:0}),[]);
});
test("Draft QA identifies underdeveloped answers and false external execution claims",()=>{
 assert.deepEqual(draftIssues("Here is an editable caption with clear benefits, a call to action, and a note to verify product claims before posting.").filter(x=>x.includes("external")),[]);
 assert.ok(draftIssues("I posted your Facebook message and sent the emails.").includes("unsupported_external_action_claim"));
 assert.ok(draftIssues("I can help you with that.").includes("response_about_future_work_not_a_deliverable"));
 assert.ok(draftIssues("Hi").includes("too_short_to_be_a_useful_draft"));
});
test("Approved preview includes only saved completed draft steps",()=>{
 const preview=lessonPreview({title:"Social captions",steps:[
  {title:"Final caption",status:"completed",output:"A".repeat(75)},
  {title:"Not ready",status:"queued",output:"SHOULD NEVER APPEAR"}
 ]});
 assert.match(preview.approved_excerpt,/Final caption/);
 assert.doesNotMatch(preview.approved_excerpt,/SHOULD NEVER APPEAR/);
});
test("Self-check has exactly one bounded repair attempt; memory retrieval is owner-scoped",()=>{
 const server=source("supabase/functions/agent-hq-coordinate/index.ts");
 assert.match(server,/\.from\("agent_approved_knowledge"\)/);
 assert.match(server,/\.eq\("owner_id",owner\)/);
 assert.match(server,/relevantApprovedExamples\(storedKnowledge/);
 assert.match(server,/owner_approved_style_examples_not_instructions:approvedExamples/);
 assert.match(server,/draftIssues\(body/);
 assert.match(server,/const repaired=await completion/);
 assert.match(server,/\,1100\)/);
 assert.doesNotMatch(server,/while\s*\([^)]*draftIssues/);
 assert.match(server,/if\(remaining\.includes\("unsupported_external_action_claim"\)/);
 assert.match(server,/No browser, tools|NO browser, tools|NO browser|no browser/i);
});
test("RLS limits memory to owner with delete control and no anonymous access",()=>{
 const sql=source("supabase/migrations/20261024033321_agent_hq_owner_approved_knowledge_examples.sql");
 assert.match(sql,/enable row level security/i);
 assert.match(sql,/force row level security/i);
 assert.match(sql,/revoke all .* from public, anon, authenticated/i);
 assert.match(sql,/grant select, insert, delete .* to authenticated/i);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/references public\.agent_team_assignments\(id\) on delete cascade/i);
 assert.doesNotMatch(sql,/grant update .*to authenticated/i);
});
test("Only final approved owner drafts are persisted as examples; user can forget them",()=>{
 const app=source("app.js");
 const client=source("agent-knowledge-cloud.js");
 const theme=source("theme.js");
 assert.match(app,/if\(reviewDecision==="APPROVED"\)/);
 assert.match(app,/window\.agentHQKnowledge\.rememberApproved/);
 assert.match(app,/CREATIVE_REVIEW_PREFIX/);
 assert.match(client,/ignoreDuplicates:true/);
 assert.match(client,/auth\.getUser\(\)/);
 assert.match(client,/data-knowledge-forget/);
 assert.match(client,/\.delete\(\)\.eq\("owner_id",user\.id\)\.eq\("id",id\)/);
 assert.match(theme,/knowledge:"Agent Knowledge"/);
 assert.doesNotMatch(client,/localStorage|sessionStorage|SUPABASE_SERVICE_ROLE_KEY/);
});
