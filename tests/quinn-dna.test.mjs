import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Quinn is permanent Priority Essential with all 15 detailed operating instructions",()=>{
 const s=read("supabase/functions/_shared/quinn-dna.ts");
 assert.match(s,/QUINN_DNA_VERSION = "3\.0\.0"/);
 assert.match(s,/title:"Chief Growth Officer & Strategic Partnerships Director"/);
 assert.match(s,/priority:"ESSENTIAL"/);
 assert.match(s,/reportsTo:"alex"/);
 const block=s.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((block.match(/^\s+"(?:0[1-9]|1[0-5])\./gm)||[]).length,15);
 for(const k of ["mission:","governingPrinciple:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze","QUINN_CHAT_POLICY","QUINN_TEXT_DRAFT_POLICY"])assert.ok(s.includes(k),k);
});

test("Quinn policy appears in Messages, solo worker, Alex coordinated work and specialist registry",()=>{
 const chat=read("supabase/functions/agent-hq-converse/index.ts");
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const team=read("supabase/functions/agent-hq-coordinate/index.ts");
 const alex=read("supabase/functions/_shared/alex-dna.ts");
 assert.match(chat,/import \{QUINN_CHAT_POLICY\} from "\.\.\/_shared\/quinn-dna.ts"/);
 assert.match(chat,/role==="Chief Growth Officer & Strategic Partnerships Director"\?baseSystem\+"\\n"\+QUINN_CHAT_POLICY:baseSystem/);
 assert.match(worker,/employeeId==="quinn"\?QUINN_TEXT_DRAFT_POLICY/);
 assert.match(team,/worker==="quinn"\?QUINN_TEXT_DRAFT_POLICY/);
 assert.match(alex,/quinn: "Chief Growth Officer & Strategic Partnerships Director/);
});

test("Quinn cannot independently contact leads, sign contracts, spend or schedule outreach",()=>{
 const s=read("supabase/functions/_shared/quinn-dna.ts");
 for(const k of ["noContinuousModelPolling:true","actualSchedulerRequired:true","autoOutreach:false","autoContracts:false","autoSpending:false","No external messages","No contract signing","No purchases","No independent delegation","No changing software"])assert.ok(s.includes(k),"Missing: "+k);
 assert.match(read("supabase/functions/agent-hq-worker/index.ts"),/Your sole capability is to draft TEXT/);
 assert.match(read("supabase/functions/agent-hq-coordinate/index.ts"),/You can ONLY produce a TEXT draft/);
});

test("Quinn's upgraded staff title appears and app version is refreshed",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/\["quinn","💡","Quinn","Chief Growth Officer"\]/);
 assert.match(html,/src="\.\/app\.js\?v=20261024-all-workers-web-1"/);
});

