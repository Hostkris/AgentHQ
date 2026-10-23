import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../agent-creative-desk.js",import.meta.url),"utf8");
const runtime=source.replace(/^import\s+.+?;\s*/m,"");
function createHarness(){
 const callbacks={};
 const host={addEventListener:(name,fn)=>{callbacks[name]=fn}};
 const sandbox={
  window:{},document:{
   getElementById:name=>name==="app"?host:null,
   addEventListener:()=>{},activeElement:null
  },navigator:{},MutationObserver:class{observe(){}},
  setTimeout:()=>{},console
 };
 // The script is evaluated in a deliberately isolated VM with no network or DOM.
 runInNewContext(runtime+"\n globalThis.__test={MARKER,REVIEW,reviewOf,versionOf,finished,jobStatus,card,render,steps,messages,plans};",sandbox);
 return sandbox.__test;
}
const worker={id:"22222222-2222-4222-8222-222222222222",assignment_id:"11111111-1111-4111-8111-111111111111",employee_id:"jordan",status:"completed",title:"Draft content",output:"Copy with <script>alert('x')</script>"};
const assignment={id:worker.assignment_id,title:"Creative: My Store · Short video script",instructions:"Agent HQ Creative Request v1\nBusiness: My Store\nDestination: YouTube\nFormat: Short video script\nRequested specialist: jordan\nBrief: Short video ad",coordination_status:"completed",manager_summary:"Jordan writes one script"};

test("Creative Desk presents actual connection state and publishing boundary",()=>{
 const c=createHarness(),markup=c.render();
 assert.match(markup,/Creative Desk/);
 assert.match(markup,/Not connected/);
 assert.match(markup,/publishing is always a separate/i);
 assert.doesNotMatch(markup,/data-creative-publish=/);
 assert.doesNotMatch(source,/\bfetch\s*\(/);
 assert.doesNotMatch(source,/service_role|session_cookie|refresh_token/i);
});

test("Approvals are version-bound and only recorded for finished worker output",()=>{
 const c=createHarness();
 c.steps.set(assignment.id,[{...worker}]);
 c.plans.set(assignment.id,"approved");
 assert.equal(c.finished(assignment),true);
 assert.equal(c.jobStatus(assignment),"Ready for your review");
 const version=c.versionOf(assignment);
 c.messages.set(assignment.id,[{sender_kind:"owner",sender_id:"owner",body:c.REVIEW+"|APPROVED|"+version+"\nApproved content only."}]);
 assert.equal(c.reviewOf(assignment),"APPROVED");
 assert.equal(c.jobStatus(assignment),"Approved — not published");
 c.steps.set(assignment.id,[{...worker,output:"Revised copy"}]);
 assert.equal(c.reviewOf(assignment),null);
 assert.equal(c.jobStatus(assignment),"Ready for your review");
});

test("Only an owner note counts as final approval, never a worker message",()=>{
 const c=createHarness();c.steps.set(assignment.id,[{...worker}]);
 const version=c.versionOf(assignment);
 c.messages.set(assignment.id,[{sender_kind:"agent",sender_id:"jordan",body:c.REVIEW+"|APPROVED|"+version}]);
 assert.equal(c.reviewOf(assignment),null);
});

test("Drafts are escaped and remain text-only",()=>{
 const c=createHarness();c.steps.set(assignment.id,[{...worker}]);
 const html=c.card(assignment);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/Nothing is published|nothing is published|nothing is posted|no external accounts/i);
 assert.doesNotMatch(html,/data-creative-publish/);
});
