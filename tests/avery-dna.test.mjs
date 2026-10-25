import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Avery has permanent Essential financial DNA with 15 exact instructions",()=>{
 const dna=read("supabase/functions/_shared/avery-dna.ts");
 assert.match(dna,/AVERY_DNA_VERSION = "3\.0\.0"/);
 assert.match(dna,/title:"Chief Business Intelligence & Financial Strategy Analyst"/);
 assert.match(dna,/priority:"ESSENTIAL"/);
 assert.match(dna,/reportsTo:"alex"/);
 const part=dna.split("exactInstructions:Object.freeze([")[1]?.split("]),")[0]||"";
 assert.equal((part.match(/^\s+"(?:0[1-9]|1[0-5])\./gm)||[]).length,15);
 for(const section of ["mission:","governingPrinciple:","schedule:Object.freeze","requiredOutputs:Object.freeze","toolsAccessNeeded:Object.freeze","restrictions:Object.freeze","successStandards:Object.freeze","first30Days:Object.freeze","AVERY_CHAT_POLICY","AVERY_TEXT_DRAFT_POLICY"]){
  assert.ok(dna.includes(section),"Missing "+section);
 }
});

test("Avery role is active in Messages, solo drafting and Alex-coordinated assignments",()=>{
 const chat=read("supabase/functions/agent-hq-converse/index.ts");
 const worker=read("supabase/functions/agent-hq-worker/index.ts");
 const team=read("supabase/functions/agent-hq-coordinate/index.ts");
 const alex=read("supabase/functions/_shared/alex-dna.ts");
 assert.match(chat,/import \{AVERY_CHAT_POLICY\} from "\.\.\/_shared\/avery-dna.ts"/);
 assert.match(chat,/role==="Chief Business Intelligence & Financial Strategy Analyst"\?baseSystem\+"\\n"\+AVERY_CHAT_POLICY:/);
 assert.match(worker,/employeeId==="avery"\?AVERY_TEXT_DRAFT_POLICY/);
 assert.match(team,/worker==="avery"\?AVERY_TEXT_DRAFT_POLICY/);
 assert.match(alex,/avery: "Chief Business Intelligence & Financial Strategy Analyst/);
});

test("Avery never receives account access, money-moving powers or autonomous monitoring from DNA",()=>{
 const dna=read("supabase/functions/_shared/avery-dna.ts");
 for(const rule of ["noContinuousModelPolling:true","actualSchedulerRequired:true","autoTransactions:false","autoAccountAccess:false","No transfers, trades, purchases","No invented actuals","No reading bank, brokerage","No DNA self-modification"]){
  assert.ok(dna.includes(rule),"Missing safety boundary: "+rule);
 }
 assert.match(read("supabase/functions/agent-hq-worker/index.ts"),/Your sole capability is to draft TEXT/);
 assert.match(read("supabase/functions/agent-hq-coordinate/index.ts"),/You can ONLY produce a TEXT draft/);
});

test("Agent HQ displays Avery's new role",()=>{
 const ui=read("app.js"),html=read("index.html");
 assert.match(ui,/\["avery","📊","Avery","Financial Strategy Analyst"\]/);
 assert.match(html,/src="\.\/app\.js\?v=20261025-native-home-1"/);
});

