// Runs the real workspace UI with synthetic data and no network or account access.
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
export function workspaceFixture(){
 const core=read('agent-project-workspace-core.js');
 const ui=read('agent-project-workspace.js').replace(/^import .*;\n/gm,'');
 return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent HQ project workspace test</title><style>body{font:16px system-ui;margin:0;padding:20px;max-width:780px}.primary{border:0;border-radius:12px;background:#007aff;color:white;padding:12px;font:inherit}button{cursor:pointer}#operations{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}h1{font-size:24px}${read('agent-project-workspace.css')}</style><body><h1>Project workspace · synthetic test</h1><p>Study plan · Jordan and Riley · revision 3</p><div id="app"><div data-project-workspace="22222222-2222-4222-8222-222222222222"></div></div><p id="result" role="status"></p><button id="simulate-conflict">Simulate a newer revision</button><pre id="operations"></pre><script>
const id='22222222-2222-4222-8222-222222222222',state={revision:3,phase:'discussion',team_order:['riley','jordan']};
let books=[{handbook_key:'working-agreements',title:'Shared working agreements',scope:'general',content:'Save actual work products and keep projects separate.',approved:true,version:1}],files=[],refs=[],calls=[];
const context=()=>({metadata:{goal:'Create a personal study plan from my notes.',completion_criteria:'Return a verified printable PDF and keep Saturdays free.',output_format:'pdf',business_key:''},handbooks:books,references:refs,handoffs:[{employee_id:'riley',status:'completed',title:'Research notes',work_product:'The supplied notes cover three chapters. Citations: notes.md, sections 1–3.'},{employee_id:'jordan',status:'queued',title:'Printable plan',work_product:''}],capabilities:[{id:'create_document',status:'available',scope:'Real PDF and text outputs.'},{id:'calendar_write',status:'connection_required',scope:'Calendar import files are available.'}]});
const report=body=>{calls.push(body);document.getElementById('operations').textContent=JSON.stringify(calls,null,2);};
window.fixtureCloud={auth:{getUser:async()=>({data:{user:{id:'fixture-owner'}}}),onAuthStateChange:fn=>fn('SIGNED_IN',{user:{id:'fixture-owner'}})},functions:{invoke:async(name,{body})=>{report(body);
 if(body.action==='details')return {data:{context:context(),artifacts:files,revision:state.revision}};
 if(body.action==='handbooks')return {data:{handbooks:books}};
 if(body.action==='save_handbook'){books.push({handbook_key:body.key,title:body.title,scope:body.scope,content:body.content,approved:body.approved,version:1});document.getElementById('result').textContent='Handbook saved';return {data:{}};}
 if(body.action==='update'||body.action==='reference'){if(body.revision!==state.revision)return {data:{error:'Project changed; refresh before applying the update'}};if(body.action==='reference')refs.push({filename:body.filename,content:body.content});state.revision++;document.getElementById('result').textContent='Project updated to revision '+state.revision;return {data:{state:'ready',revision:state.revision}};}
 if(body.action==='create'){document.getElementById('result').textContent='New personal project saved';return {data:{project_id:id}};}
 return {data:{error:'Unexpected fixture operation'}};
}}};
window.agentHQProjects={all:()=>[{assignment_id:id,...state}],refresh:async()=>{},start:async()=>{},select:()=>{}};
document.getElementById('simulate-conflict').onclick=()=>{state.revision++;document.getElementById('result').textContent='Another worker saved revision '+state.revision;};
</script><script type="module">${core}\nwindow.fixtureCore={PROJECT_FORMATS,PROJECT_WORKERS,validateReference};</script><script type="module">const agentCloud=window.fixtureCloud;const {PROJECT_FORMATS,PROJECT_WORKERS,validateReference}=window.fixtureCore;\n${ui}</script></body></html>`;
}
