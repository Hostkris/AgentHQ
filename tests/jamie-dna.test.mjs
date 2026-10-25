import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Jamie permanent Essential scheduling DNA has exactly 15 instructions and full playbook",()=>{
 const s=read("supabase/functions/_shared/jamie-dna.ts");
 assert.match(s,/JAMIE_DNA_VERSION = "3\.0\.0"/);
 assert.match(s,/title:"Executive Scheduling Director & Workflow Management Specialist"/);
 assert.match(s,/priority:"ESSENTIAL"/);
 assert.match(s,/reportsTo:"alex"/);
 const block=s.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((block.match(/^\s+"(?:0[1-9]|1[0-5])\./gm)||[]).length,15);
 for(const key of ["mission:","governingPrinciple:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze","JAMIE_CHAT_POLICY","JAMIE_TEXT_DRAFT_POLICY"]) assert.ok(s.includes(key),key);
});

test("Jamie DNA is injected into Messages, direct worker and Alex team drafts",()=>{
 const chat=read("supabase/functions/agent-hq-converse/index.ts");
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const team=read("supabase/functions/agent-hq-coordinate/index.ts");
 const alex=read("supabase/functions/_shared/alex-dna.ts");
 assert.match(chat,/import \{JAMIE_CHAT_POLICY\} from "\.\.\/_shared\/jamie-dna.ts"/);
 assert.match(chat,/role==="Executive Scheduling Director & Workflow Management Specialist"\?baseSystem\+"\\n"\+JAMIE_CHAT_POLICY:/);
 assert.match(worker,/employeeId==="jamie"\?JAMIE_TEXT_DRAFT_POLICY/);
 assert.match(team,/worker==="jamie"\?JAMIE_TEXT_DRAFT_POLICY/);
 assert.match(alex,/jamie: "Executive Scheduling Director & Workflow Management Specialist/);
});

test("No automatic calendar edits, background reminders, notifications or Alex role takeover",()=>{
 const s=read("supabase/functions/_shared/jamie-dna.ts");
 for(const item of ["noContinuousModelPolling:true","actualSchedulerRequired:true","autoCalendarWrites:false","autoNotifications:false","autoTaskDispatch:false",
 "No automatic calendar creation","No independent delegation or dispatch","No claiming proposed events"])assert.ok(s.includes(item),item);
 assert.match(read("supabase/functions/agent-hq-worker/index.ts"),/Your sole capability is to draft TEXT/);
 assert.match(read("supabase/functions/agent-hq-coordinate/index.ts"),/You can ONLY produce a TEXT draft/);
});

test("Agent HQ displays Jamie's new title and cache version",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/\["jamie","📅","Jamie","Scheduling Director"\]/);
 assert.match(html,/src="\.\/app\.js\?v=20261025-ipad-layout-1"/);
});

