import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Riley has one permanent researcher specialty and 20 exact instructions',()=>{
 const dna=read('supabase/functions/_shared/riley-dna.ts');
 assert.match(dna,/RILEY_DNA_VERSION = "2\.0\.0"/);
 assert.match(dna,/title:"Market Research Analyst"/);
 assert.match(dna,/reportsTo:"alex"/);
 const block=dna.split('exactInstructions:Object.freeze([')[1]?.split('])')[0]||'';
 assert.equal((block.match(/^\s*"[^"]+",?$/gm)||[]).length,20);
 assert.match(dna,/maxCompetitors:3/);
 assert.match(dna,/maxOpportunities:3/);
 assert.match(dna,/mustRequestSearchApproval:true/);
 assert.match(dna,/mayWriteFinalImagePrompts:false/);
 assert.match(dna,/noExternalActions:true/);
 assert.match(dna,/collect_private_customer_information/);
});

test('Riley chat remains research-only, and cannot request outside account actions',()=>{
 const chat=read('supabase/functions/agent-hq-converse/index.ts');
 assert.match(chat,/role==="Research analyst"\?RILEY_CHAT_POLICY/);
 assert.match(chat,/worker==="riley"&&result\.intent==="action"/);
 assert.match(chat,/await proposeRoleResearch\(composed\)/);
 assert.match(chat,/worker!=="alex"&&worker!=="riley"&&explicitPublicResearch/);
 assert.match(chat,/stage==="confirm_research"/);
 assert.match(chat,/runResearch\(db,owner,worker,job\.id,env\("GROQ_API_KEY"\)\)/);
});

test('All specialist text channels explicitly label Riley research as unverified without live sources',()=>{
 const coord=read('supabase/functions/agent-hq-coordinate/index.ts');
 const worker=read('supabase/functions/agent-hq-worker/index.ts');
 const dna=read('supabase/functions/_shared/riley-dna.ts');
 assert.match(coord,/worker==="riley"\?RILEY_TEXT_DRAFT_POLICY/);
 assert.match(worker,/employeeId==="riley"\?RILEY_TEXT_DRAFT_POLICY/);
 assert.match(dna,/UNVERIFIED/);
 assert.match(dna,/Jordan—not Riley—owns final image-generation prompts/);
});

test('Real research uses separately approved public web tool with traceable sources',()=>{
 const research=read('supabase/functions/agent-hq-converse/research.ts');
 assert.match(research,/claim_agent_research/);
 assert.match(research,/tool_choice:choice/);
 assert.match(research,/requestSearch\('required'\)/);
 assert.match(research,/requestSearch\('auto'\)/);
 const contract=research.split("const searchRequest=")[1]?.split("const requestSearch=")[0]||"";
 assert.match(contract,/tools:\[\{type:'browser_search'\}\]/);
 assert.match(contract,/tool_choice:choice/);
 assert.doesNotMatch(contract,/(?:reasoning_format|reasoning_effort|citation_options|response_format|temperature)\s*:/);
 assert.match(research,/safeParameter/);
 assert.match(research,/No report was completed/);
 assert.match(research,/hasSearchResults/);
 assert.match(research,/hasBrowserResults/);
 assert.match(research,/No report was completed/);
 assert.match(research,/researchEvidence\(message\)/);
 assert.match(research,/finish_agent_research/);
 assert.match(research,/Search retrieved:/);
 assert.match(research,/RILEY_LIVE_RESEARCH_POLICY/);
 assert.match(research,/employee_id:'alex'/);
 assert.match(research,/still needs your verification before the team relies on it/);
 assert.match(research,/previous\?\.\[0\]/);
 assert.match(research,/\.eq\("owner_id",owner\)\.eq\("employee_id","riley"\)/);
 assert.match(research,/\.eq\("query",String\(job\.query\)\)\.eq\("status","completed"\)/);
});

test('Riley cannot silently access websites, publish, buy, or give final creative prompts',()=>{
 const dna=read('supabase/functions/_shared/riley-dna.ts');
 for(const denied of ['web_access_without_approval','private_account_access','bypass_paywalls','make_purchases','change_prices','publish_posts','send_external_messages','generate_final_image_prompts','invent_citations']){
  assert.ok(dna.includes(denied),denied+' must be denied');
 }
});

