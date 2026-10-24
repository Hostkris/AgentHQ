import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Casey v3.0 has permanent Priority Essential social-media DNA and 15 exact instructions",()=>{
 const dna=read("supabase/functions/_shared/casey-dna.ts");
 assert.match(dna,/CASEY_DNA_VERSION = "3\.0\.0"/);
 assert.match(dna,/title:"Social Media Director & Digital Engagement Specialist"/);
 assert.match(dna,/priority:"ESSENTIAL"/);
 assert.match(dna,/reportsTo:"alex"/);
 const block=dna.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((block.match(/^\s+"(?:0[1-9]|1[0-5])\./gm)||[]).length,15);
 for(const item of ["mission:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze","CASEY_CHAT_POLICY","CASEY_TEXT_DRAFT_POLICY"]){
  assert.ok(dna.includes(item),item);
 }
});

test("Casey DNA applies to chat, solo worker, Alex-coordinated specialist work",()=>{
 const chat=read("supabase/functions/agent-hq-converse/index.ts");
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const coord=read("supabase/functions/agent-hq-coordinate/index.ts");
 const alex=read("supabase/functions/_shared/alex-dna.ts");
 assert.match(chat,/import \{CASEY_CHAT_POLICY\} from "\.\.\/_shared\/casey-dna.ts";/);
 assert.match(chat,/role==="Social Media Director & Digital Engagement Specialist"\?baseSystem\+"\\n"\+CASEY_CHAT_POLICY:/);
 assert.match(chat,/const ACTION_PAIRS/);
 assert.match(worker,/employeeId==="casey"\?CASEY_TEXT_DRAFT_POLICY/);
 assert.match(coord,/worker==="casey"\?CASEY_TEXT_DRAFT_POLICY/);
 assert.match(coord,/awaiting_approval/);
 assert.match(alex,/casey: "Social Media Director & Digital Engagement Specialist/);
});

test("Casey does not gain automatic publishing or three-day scheduling",()=>{
 const dna=read("supabase/functions/_shared/casey-dna.ts");
 for(const key of ["regularDraftLimit:2","regularCycleDays:3","noContinuousModelPolling:true","actualSchedulerRequired:true","autoPublishing:false","No automatic public posting","No self","No scheduled jobs"]){
  if(key==="No self")assert.match(dna,/No role impersonation|No self-modification/);
  else assert.ok(dna.includes(key),key);
 }
 assert.match(dna,/actual provider evidence|provider evidence|provider confirmation/);
});

test("Casey UI title is updated and app cache reflects it",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/\["casey","📱","Casey","Social Media Director"\]/);
 assert.match(read("index.html"),/app\.js\?v=20261024-[a-z]+-dna-3/);
});
