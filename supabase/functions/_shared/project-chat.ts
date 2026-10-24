// Project replies are bound to one owned project and the worker who asked.
// Approval of finished writing never grants permission to execute outside actions.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function projectSignal(body:string){
 const v=body.trim().toLowerCase().replace(/[.!?]+$/g,'').replace(/\s+/g,' ');
 if(/^(approved?|i approve|yes|green light|thumbs? up|👍|✅|i like it|looks good|good to go)$/.test(v))return 'approve';
 if(/^(decline|declined|reject|rejected|deny|denied|no|red light|thumbs? down|👎|❌|i don't like it|not approved)$/.test(v))return 'changes';
 if(/^(stop|pause|hold|hold on|stop the project|pause the project)$/.test(v))return 'pause';
 if(/^(continue|resume|continue the project|resume the project)$/.test(v))return 'resume';
 return null;
}
export async function routeProjectChat(db:any,owner:string,worker:string,body:string,options:any={}){
 const explicit=options.project_id;
 if(explicit&&!uuid.test(String(explicit)))throw Error('Invalid project conversation');
 let q=db.from('agent_project_sessions').select('assignment_id,phase,revision,waiting_worker,pending_question,pending_request_id,output_version,team_order,lead_worker,last_error')
  .eq('owner_id',owner);
 if(explicit)q=q.eq('assignment_id',explicit);
 else q=q.in('phase',['planning','discussion','drafting','checking','polishing','waiting_owner','waiting_permission','review']);
 const {data:rows,error}=await q.order('updated_at',{ascending:false}).limit(40);
 if(error)throw Error('Could not check your team projects');
 const sessions=rows||[],signal=projectSignal(body);
 if(explicit&&!sessions.length)throw Error('That project is not available under your sign-in');
 const ambiguous=(candidates:any[])=>({handled:true,reply:'More than one project needs your response. Choose the project question in this conversation so I can apply your answer to the right one.',resume_assignment_id:null});
 const waiting=sessions.filter((s:any)=>['waiting_owner','waiting_permission'].includes(s.phase)&&s.waiting_worker===worker);
 // A pending account/research confirmation keeps its own scope unless the owner
 // explicitly chose a project question. Never reinterpret a Yes from another flow.
 if(waiting.length&&(!options.stage||options.stage==='idle'||explicit)&&!['pause','resume'].includes(signal||'')){
  if(waiting.length!==1)return ambiguous(waiting);
  const s=waiting[0];
  const decision=s.phase==='waiting_permission'?(signal==='approve'?'approved':signal==='changes'?'denied':null):null;
  if(s.phase==='waiting_permission'&&!decision)return {handled:true,reply:'Please approve or deny the exact website request in this conversation. That records its scope; it does not connect browsing or authorize publishing.'};
  const {data,error:writeError}=await db.rpc('reply_agent_project_owner',{p_owner:owner,p_assignment:s.assignment_id,p_worker:worker,p_body:body,p_decision:decision,p_expected_revision:options.project_revision??s.revision});
  if(writeError)throw Error(writeError.message);
  return {handled:true,reply:s.phase==='waiting_permission'?'Your scoped decision is saved. I’ll bring it back to the team and continue using the capabilities already connected.':'Thanks. I’ve saved that answer against this project and I’m taking it back to the team.',
   resume_assignment_id:data.state==='ready'?s.assignment_id:null,project_id:s.assignment_id};
 }
 const finals=sessions.filter((s:any)=>s.phase==='review');
 if(worker==='hq'&&(signal==='approve'||signal==='changes'||(explicit&&finals.length&&body.trim()))){
  if(finals.length!==1)return finals.length?ambiguous(finals):{handled:true,reply:'This project has no unreviewed finished version. I haven’t approved or rejected anything.'};
  const s=finals[0];
  const decision=signal==='approve'?'approve':'changes';
  const {data,error:writeError}=await db.rpc('review_agent_project',{p_owner:owner,p_assignment:s.assignment_id,p_version:options.output_version||s.output_version,p_decision:decision,p_feedback:signal?'':body});
  if(writeError)throw Error(writeError.message);
  return {handled:true,reply:decision==='approve'?'The finished writing is approved. No publishing, sending, spending or account changes were authorized.':
   signal?'The team will revise it. The lead has sent you a private message asking what to change.':'Your feedback is saved. The same team is revising this project and will bring back a new finished version.',
   resume_assignment_id:data.state==='ready'?s.assignment_id:null,project_id:s.assignment_id};
 }
 if(['pause','resume'].includes(signal||'')){
  const candidates=sessions.filter((s:any)=>!['approved','review'].includes(s.phase)&&(worker==='alex'||worker==='hq'||s.team_order.includes(worker)));
  if(candidates.length>1)return ambiguous(candidates);
  if(candidates.length===1){const s=candidates[0];const {error:writeError}=await db.rpc('control_agent_project',{p_owner:owner,p_assignment:s.assignment_id,p_action:signal});
   if(writeError)throw Error(writeError.message);
   return {handled:true,reply:signal==='pause'?'This project is paused. The team will not add further work until you resume it.':'The project is resuming from its saved team conversation.',resume_assignment_id:signal==='resume'?s.assignment_id:null};
  }
 }
 if(worker==='alex'&&finals.length&&signal==='approve')return {handled:true,reply:'The finished project is ready in Company HQ. Open its review card there to approve that exact version or request changes.'};
 if(explicit&&worker==='hq')return {handled:true,reply:'The team is still working on this project. They’ll ask you privately if they need information, and I’ll notify you when the finished version is ready.'};
 return null;
}
