import {runProjectTurn} from '../_shared/project-engine.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

// This service entry point has its own private scheduler credential. It accepts
// no caller-supplied owner, assignment, model, budget, permission or action.
export async function handleProjectRunner(req:Request,deps:any){
 if(req.method!=='POST')return response({error:'POST required'},405);
 const token=req.headers.get('x-agent-hq-runner-token')||'';
 if(!/^[0-9a-f]{64}$/.test(token))return response({error:'Scheduler authorization required'},401);
 const {data:authorized,error:authError}=await deps.db.rpc('verify_agent_project_runner',{p_token:token});
 if(authError)return response({error:'Scheduler authorization unavailable'},503);
 if(authorized!==true)return response({error:'Scheduler authorization required'},401);
 const owners=[...new Set(String(deps.allowedOwners||'').split(',').map((id:string)=>id.trim().toLowerCase()).filter((id:string)=>uuid.test(id)))];
 if(!owners.length)return response({error:'No authorized worker owner configured'},503);
 const {data:work,error}=await deps.db.rpc('get_agent_project_runner_work',{p_owners:owners});
 if(error||!Array.isArray(work))return response({error:'Saved project queue unavailable'},503);
 const results=[];
 for(const assignment of work.slice(0,1)){
  if(!owners.includes(String(assignment.owner_id).toLowerCase())||assignment.workflow_version!==2||assignment.owner_paused)continue;
  try{
   const runtime=deps.makeRuntime(deps.db,assignment.owner_id);
   const result=await (deps.runTurn||runProjectTurn)(runtime,assignment,{action:'next'});
   results.push({state:result?.state||'unconfirmed'});
  }catch{
   return response({error:'Project service unavailable; saved work remains queued'},503);
  }
 }
 return response({state:results.length?'processed':'idle',processed:results.length,results});
}
