// Eleanor's owner-private agent attention inbox. Called by the authorized
// minute scheduler, not by a browser tab. No autonomous approvals.
const startOfObservation = '2026-11-02T00:00:00Z';
const clean=(v:any,max=200)=>String(v||'').trim().slice(0,max);
export async function collectAgentAlerts(db:any,owners:string[]){
 if(!owners.length)return {created:0};
 const {data:settings,error:settingsError}=await db.from('agent_secretary_settings')
  .select('owner_id,agent_alerts_enabled').in('owner_id',owners).eq('agent_alerts_enabled',true);
 if(settingsError)throw Error('Could not read alert preferences');
 const enabled=new Set((settings||[]).map((s:any)=>s.owner_id));
 if(!enabled.size)return {created:0};
 const selected=[...enabled];
 const cutoff=new Date(Math.max(Date.parse(startOfObservation),Date.now()-7*86400000)).toISOString();
 const [projects,assignments,permissions,proposals]=await Promise.all([
  db.from('agent_project_sessions').select('assignment_id,owner_id,phase,revision,output_version,question_message_id,pending_request_id,waiting_worker,last_error,updated_at').in('owner_id',selected).gte('updated_at',cutoff).limit(200),
  db.from('agent_team_assignments').select('id,owner_id,title,owner_paused').in('owner_id',selected).limit(200),
  db.from('agent_permission_requests').select('id,owner_id,employee_id,reason,request_kind,status,expires_at,created_at').in('owner_id',selected).eq('status','pending').gte('created_at',cutoff).limit(100),
  db.from('agent_action_proposals').select('id,owner_id,employee_id,summary,status,created_at').in('owner_id',selected).eq('status','pending').gte('created_at',cutoff).limit(100)
 ]);
 if([projects,assignments,permissions,proposals].some(x=>x.error))throw Error('Could not read agent attention states');
 const labels=new Map((assignments.data||[]).map((a:any)=>[a.id,a]));
 const events:any[]=[], currentKeys=new Set<string>();
 const add=(e:any)=>{currentKeys.add(e.owner_id+':'+e.event_key);events.push(e)};
 for(const s of projects.data||[]){
  const a=labels.get(s.assignment_id);if(!a||a.owner_paused)continue;
  const base={owner_id:s.owner_id,project_id:s.assignment_id,actor:clean(s.waiting_worker||'Alex',45),title:clean(a.title||'Agent project',180)};
  let kind:string|null=null,reference='';
  if(s.phase==='review'){kind='review';reference=clean(s.output_version||'version-'+s.revision,50);}
  else if(s.phase==='waiting_owner'){kind='question';reference=clean(s.question_message_id||'revision-'+s.revision,50);}
  else if(s.phase==='waiting_permission'){kind='approval';reference=clean(s.pending_request_id||'revision-'+s.revision,50);}
  else if(s.last_error&&s.phase!=='approved'){kind='blocker';reference=clean('revision-'+s.revision,50);}
  if(!kind)continue;
  add({...base,alert_kind:kind,event_key:'project:'+s.assignment_id+':'+kind+':'+reference,
    body:kind==='review'?'The team completed a draft and needs your review.':
     kind==='approval'?'An agent has an authorization request that needs your decision.':
     kind==='question'?'An agent needs information from you to continue.':
     'The project needs attention before it can continue.'});
 }
 const now=Date.now();
 for(const req of permissions.data||[]){
  if(req.expires_at&&Date.parse(req.expires_at)<now)continue;
  add({owner_id:req.owner_id,event_key:'permission:'+req.id,request_id:req.id,
   actor:clean(req.employee_id||'Agent',45),alert_kind:'approval',title:'Agent permission request',
   body:'A worker needs your approval for a specific permission.'});
 }
 for(const req of proposals.data||[]){
  add({owner_id:req.owner_id,event_key:'proposal:'+req.id,request_id:req.id,
   actor:clean(req.employee_id||'Agent',45),alert_kind:'approval',title:'Action approval request',
   body:'A proposed account action requires your review.'});
 }
 if(events.length){
  const {error}=await db.from('agent_secretary_agent_alerts')
    .upsert(events,{onConflict:'owner_id,event_key',ignoreDuplicates:true});
  if(error)throw Error('Could not save agent alerts');
 }
 const {data:open,error:openError}=await db.from('agent_secretary_agent_alerts')
  .select('id,owner_id,event_key,project_id,status').in('owner_id',selected).eq('status','open').limit(500);
 if(openError)throw Error('Could not reconcile agent alerts');
 const old=(open||[]).filter((a:any)=>!currentKeys.has(a.owner_id+':'+a.event_key));
 if(old.length){
  const {error}=await db.from('agent_secretary_agent_alerts').update({status:'closed',updated_at:new Date().toISOString()}).in('id',old.map((x:any)=>x.id));
  if(error)throw Error('Could not close completed attention alerts');
 }
 return {observed:events.length,closed:old.length};
}
