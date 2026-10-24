import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Maya's permanent v3.0 Priority Essential DNA has 15 exact operating instructions and all playbook sections",()=>{
 const source=read("supabase/functions/_shared/maya-dna.ts");
 assert.match(source,/MAYA_DNA_VERSION = "3\.0\.0"/);
 assert.match(source,/title:"Chief Marketing Strategist"/);
 assert.match(source,/priority:"ESSENTIAL"/);
 assert.match(source,/reportsTo:"alex"/);
 const block=source.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((block.match(/^\s+"(?:0[1-9]|1[0-5])\./gm)||[]).length,15);
 for(const key of ["mission:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze","MAYA_CHAT_POLICY","MAYA_TEXT_DRAFT_POLICY"])
  assert.ok(source.includes(key),key+" must exist");
});
test("Maya DNA governs conversational messages without bypassing existing intent/approval classifier",()=>{
 const chat=read("supabase/functions/agent-hq-converse/index.ts");
 assert.match(chat,/import \{MAYA_CHAT_POLICY\} from "\.\.\/_shared\/maya-dna.ts"/);
 assert.match(chat,/role==="Chief Marketing Strategist"\?baseSystem\+"\\n"\+MAYA_CHAT_POLICY:/);
 assert.match(chat,/const ACTION_PAIRS/);
 assert.match(chat,/validatedAction/);
});
test("Maya DNA governs direct worker steps and approved coordinator handoffs",()=>{
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const coord=read("supabase/functions/agent-hq-coordinate/index.ts");
 assert.match(worker,/employeeId==="maya"\?MAYA_TEXT_DRAFT_POLICY/);
 assert.match(coord,/worker==="maya"\?MAYA_TEXT_DRAFT_POLICY/);
 assert.match(coord,/awaiting_approval/);
 assert.match(worker,/Alex's proposed specialist plan needs your approval first/);
 const alex=read("supabase/functions/_shared/alex-dna.ts");
 assert.match(alex,/maya: "Chief Marketing Strategist/);
});
test("No automatic job or external action is implicitly granted to Maya",()=>{
 const source=read("supabase/functions/_shared/maya-dna.ts");
 for(const text of ["noContinuousModelPolling:true","requiresRealSchedulerForAutomation:true","No publishing","owner approval","No self-modification","No scheduled activity","client mixing"])
  assert.ok(source.includes(text),text);
 assert.match(read("app.js"),/\["maya","📣","Maya","Chief Marketing Strategist"\]/);
});
