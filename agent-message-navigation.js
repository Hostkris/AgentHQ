// Route saved attention items to their actual conversation or finished work.
// Opening a destination never answers a question or approves a request.
const workers=new Set(['alex','maya','jordan','riley','taylor','casey','morgan','avery','jamie','quinn']);
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function agentAlertDestination(alert,projects=[]){
 const projectId=uuid.test(String(alert?.project_id||''))?alert.project_id:null;
 const actor=String(alert?.actor||'').trim().toLowerCase();
 const saved=projectId?projects.find(p=>p.assignment_id===projectId):null;
 if(saved){
  if(['waiting_owner','waiting_permission'].includes(saved.phase)&&workers.has(saved.waiting_worker))
   return {kind:'message',worker:saved.waiting_worker,projectId};
  return {kind:'project',projectId};
 }
 if(workers.has(actor)&&(!projectId||['question','approval'].includes(alert?.alert_kind)))
  return {kind:'message',worker:actor,projectId};
 return projectId?{kind:'project',projectId}:{kind:'approvals'};
}
