import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Jordan Priority Essential DNA v3.0 includes mission, 15 exact instructions, and all playbook sections",()=>{
 const source=read("supabase/functions/_shared/jordan-dna.ts");
 assert.match(source,/JORDAN_DNA_VERSION = "3\.0\.0"/);
 assert.match(source,/title:"Creative Content Director & Scriptwriting Specialist"/);
 assert.match(source,/priority:"ESSENTIAL"/);
 assert.match(source,/reportsTo:"alex"/);
 const block=source.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((block.match(/^\s+"(?:0[1-9]|1[0-5])\./gm)||[]).length,15);
 for(const key of ["mission:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze","JORDAN_CHAT_POLICY","JORDAN_TEXT_DRAFT_POLICY"]){
  assert.ok(source.includes(key),key+" missing");
 }
});

test("Jordan's chat and both worker channels apply the permanent role instructions",()=>{
 const chat=read("supabase/functions/agent-hq-converse/index.ts");
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const coord=read("supabase/functions/agent-hq-coordinate/index.ts");
 assert.match(chat,/import \{JORDAN_CHAT_POLICY\} from "\.\.\/_shared\/jordan-dna.ts"/);
 assert.match(chat,/role==="Creative Content Director & Scriptwriting Specialist"\?baseSystem\+"\\n"\+JORDAN_CHAT_POLICY:/);
 assert.match(worker,/employeeId==="jordan"\?JORDAN_TEXT_DRAFT_POLICY/);
 assert.match(coord,/worker==="jordan"\?JORDAN_TEXT_DRAFT_POLICY/);
 assert.match(chat,/const ACTION_PAIRS/);
 assert.match(coord,/awaiting_approval/);
});

test("Jordan is a writer, not a publisher, browser, or self-authorizing agent",()=>{
 const dna=read("supabase/functions/_shared/jordan-dna.ts");
 for(const rule of [
  "No sending messages","No unauthorized account","No invented citations",
  "No reproduction of substantial copyrighted","No deception","No self-modification",
  "noContinuousModelPolling:true","actualSchedulerRequired:true","noAutoPublish:true",
  "No unapproved background schedules","No mixing unrelated businesses"
 ])assert.ok(dna.includes(rule),"Missing safeguard: "+rule);
 const alex=read("supabase/functions/_shared/alex-dna.ts");
 assert.match(alex,/jordan: "Creative Content Director & Scriptwriting Specialist/);
});

test("Jordan's visual role and deployment cache identify the correct agent",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/\["jordan","🎬","Jordan","Creative Content Director"\]/);
 assert.match(read("index.html"),/app\.js\?v=20261024-[a-z]+-dna-3/);
});
