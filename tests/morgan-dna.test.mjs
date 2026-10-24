import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Morgan DNA v3.0 is permanent Essential with 15 exact instructions and all required sections",()=>{
 const d=read("supabase/functions/_shared/morgan-dna.ts");
 assert.match(d,/MORGAN_DNA_VERSION = "3\.0\.0"/);
 assert.match(d,/title:"E-Commerce Director & Shopify Operations Specialist"/);
 assert.match(d,/priority:"ESSENTIAL"/);
 assert.match(d,/reportsTo:"alex"/);
 const instructions=d.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((instructions.match(/^\s+"(?:0[1-9]|1[0-5])\./gm)||[]).length,15);
 for(const key of ["mission:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze","MORGAN_CHAT_POLICY","MORGAN_TEXT_DRAFT_POLICY"])
  assert.ok(d.includes(key),key+" missing");
});

test("Morgan's correct DNA is connected to existing Messages and both assignment pathways",()=>{
 const chat=read("supabase/functions/agent-hq-converse/index.ts");
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const coord=read("supabase/functions/agent-hq-coordinate/index.ts");
 const alex=read("supabase/functions/_shared/alex-dna.ts");
 assert.match(chat,/import \{MORGAN_CHAT_POLICY\} from "\.\.\/_shared\/morgan-dna.ts"/);
 assert.match(chat,/role==="E-Commerce Director & Shopify Operations Specialist"\?baseSystem\+"\\n"\+MORGAN_CHAT_POLICY:baseSystem/);
 assert.match(worker,/employeeId==="morgan"\?MORGAN_TEXT_DRAFT_POLICY/);
 assert.match(coord,/worker==="morgan"\?MORGAN_TEXT_DRAFT_POLICY/);
 assert.match(alex,/morgan: "E-Commerce Director & Shopify Operations Specialist/);
});

test("Store capabilities do not bypass owner permissions or create automatic external actions",()=>{
 const d=read("supabase/functions/_shared/morgan-dna.ts");
 for(const item of ["noContinuousModelPolling:true","actualSchedulerRequired:true","autoStoreEdits:false","autoRefunds:false",
 "No creating, updating, publishing or deleting products","No automatic refunds","No inferring live Shopify access","No self-modification"])
  assert.ok(d.includes(item),"Missing safeguard: "+item);
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const coord=read("supabase/functions/agent-hq-coordinate/index.ts");
 assert.match(worker,/Your sole capability is to draft TEXT/);
 assert.match(coord,/You can ONLY produce a TEXT draft/);
});

test("Morgan's upgraded name is visible in the application and cache key is refreshed",()=>{
 const app=read("app.js"),html=read("index.html");
 assert.match(app,/\["morgan","🛍️","Morgan","E-Commerce Director"\]/);
 assert.match(html,/src="\.\/app\.js\?v=20261024-morgan-dna-3"/);
});
