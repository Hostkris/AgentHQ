import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("Taylor essential DNA v3.0 has 15 instructions and safeguards",()=>{
 const d=read("supabase/functions/_shared/taylor-dna.ts");
 assert.ok(d.includes('TAYLOR_DNA_VERSION = "3.0.0"'));
 assert.ok(d.includes('priority:"ESSENTIAL"'));
 const instructions=d.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((instructions.match(/^  "[0-9][0-9][.]/gm)||[]).length,15);
 for(const section of ["mission:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze"]) assert.ok(d.includes(section));
 assert.ok(d.includes("actualSchedulerRequired:true"));
 assert.ok(d.includes("autoSend:false"));
});
test("Taylor is present in every established agent task path",()=>{
 const a=read("supabase/functions/agent-hq-converse/index.ts"),b=read("supabase/functions/agent-hq-worker/index.ts"),c=read("supabase/functions/agent-hq-coordinate/index.ts");
 assert.ok(a.includes('import {TAYLOR_CHAT_POLICY}'));
 assert.ok(a.includes('TAYLOR_CHAT_POLICY:'));
 assert.ok(b.includes('employeeId==="taylor"?TAYLOR_TEXT_DRAFT_POLICY'));
 assert.ok(c.includes('worker==="taylor"?TAYLOR_TEXT_DRAFT_POLICY'));
 assert.ok(read("supabase/functions/_shared/alex-dna.ts").includes('taylor: "Executive Communications Director'));
});
test("Taylor staff card and app version",()=>{
 assert.ok(read("app.js").includes('"Taylor","Communications Director"'));
 assert.match(read("index.html"),/app\.js\?v=20261024-team-room-1/);
});

