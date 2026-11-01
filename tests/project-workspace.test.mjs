import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {projectIntake,projectUpdateIntent,validatePlanRoutes,calculate,artifactBytes,validateReference,csvRows,PROJECT_WORKERS} from '../agent-project-workspace-core.js';
test('personal intake saves requirements and desired file without requiring a business',()=>{
 const v=projectIntake('Create a study plan from these notes.\nReturn a printable PDF.\nKeep Saturdays free.');
 assert.equal(v.project_kind,'general');assert.equal(v.output_format,'pdf');assert.equal(v.requirements.length,3);assert.match(v.completion_criteria,/pdf/);
});
test('all nine specialists plus manager can participate, with acyclic earlier dependencies',()=>{
 const routes=PROJECT_WORKERS.filter(w=>w!=='alex').map(worker=>({worker,title:worker,instructions:'Complete the saved work.'}));
 const result=validatePlanRoutes(routes);assert.equal(result.length,9);assert.deepEqual(result[8].depends_on,routes.slice(0,8).map(r=>r.worker));
 assert.throws(()=>validatePlanRoutes([{...routes[0],depends_on:['quinn']},routes[1]]),/earlier/);
 assert.throws(()=>validatePlanRoutes([routes[0],routes[0]]),/distinct/);
});
test('project update binds a named affected worker and preserves supplied details',()=>{
 assert.deepEqual(projectUpdateIntent('Add this information for Jordan: Use the revised outline.'),{text:'Use the revised outline.',from_worker:'jordan'});
 assert.equal(projectUpdateIntent('What is the status?'),null);
});
test('calculator supports precedence and rejects code, non-finite results and ambiguous syntax',()=>{
 assert.equal(calculate('(120 - 35) / 5').result,17);
 assert.equal(calculate('1e-3 + 2').result,2.001);
 for(const expr of ['fetch("secret")','1/0','2 3','(1+2','1**4','Infinity','2e++3','1e +2','9'.repeat(601)])assert.throws(()=>calculate(expr));
});
test('references reject unsupported binary types and keep full Unicode source text',()=>{
 assert.deepEqual(validateReference('notes.md','My notes — unchanged.'),{filename:'notes.md',content:'My notes — unchanged.'});
 assert.throws(()=>validateReference('account.pdf','binary'),/currently support/);
 assert.throws(()=>validateReference('notes.txt','\0'),/non-empty/);
});
test('real output writers validate JSON and CSV, prevent formula injection, and neutralize HTML',async()=>{
 const json=await artifactBytes('json','{"title":"Reference project","count":3}');assert.equal(JSON.parse(new TextDecoder().decode(json.bytes)).count,3);
 await assert.rejects(()=>artifactBytes('json','not a valid JSON document'),SyntaxError);
 const csv=await artifactBytes('csv','Name,Value\nSafe,12\nUnsafe,=HYPERLINK("evil")');const text=new TextDecoder().decode(csv.bytes);assert.match(text,/'=HYPERLINK/);assert.equal(csvRows(text).length,3);
 const spaced=await artifactBytes('csv','Name,Value\nUnsafe,\t=HYPERLINK("evil")\nNumber,-12');const cells=csvRows(new TextDecoder().decode(spaced.bytes));assert.equal(cells[1][1][0],"'");assert.equal(cells[2][1],'-12');
 await assert.rejects(()=>artifactBytes('csv','Name,Value\nOne column only\n'),/consistent/);
 const html=await artifactBytes('html','A complete document <script>alert(1)</script> with source notes.');const page=new TextDecoder().decode(html.bytes);assert.ok(!page.includes('<script>'));assert.match(page,/Content-Security-Policy/);
});
test('calendar file is real ICS and rejects guessed or reversed times',async()=>{
 const body=JSON.stringify([{title:'Study session',start:'2026-11-02T15:00:00-05:00',end:'2026-11-02T16:00:00-05:00',description:'Read the supplied notes.'}]);
 const file=await artifactBytes('ics',body);assert.match(new TextDecoder().decode(file.bytes),/DTSTART:20261102T200000Z/);assert.match(file.note,/not added/);
 await assert.rejects(()=>artifactBytes('ics',JSON.stringify([{title:'Bad',start:'2026-11-02T15:00:00',end:'2026-11-02T16:00:00'}])),/time zone/);
});
test('PDF writer creates readable paginated bytes from actual content',async()=>{
 const require=createRequire(import.meta.url);const pdf=require(require.resolve('pdf-lib',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
 const source=Array.from({length:120},(_,i)=>'Study task '+(i+1)+': read the assigned source and write a short evidence-based answer.').join('\n');
 const file=await artifactBytes('pdf',source,'Study Plan',pdf);assert.equal(new TextDecoder().decode(file.bytes.slice(0,5)),'%PDF-');
 const parsed=await pdf.PDFDocument.load(file.bytes);assert.ok(parsed.getPageCount()>1);
 if(process.env.AGENTHQ_PDF_QA_PATH)writeFileSync(process.env.AGENTHQ_PDF_QA_PATH,file.bytes);
});
