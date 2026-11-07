// Authenticated owner-only controls. The server creates project ideas;
// this browser cannot fabricate a worker proposal or research citation.
import {agentCloud} from './agent-cloud-auth.js';
let owner=null,token=0,loaded=false,setting=null,ideas=[],patterns=[],phases=[],pending=null;
const emit=()=>window.dispatchEvent(new CustomEvent('agenthq-initiatives-changed',{detail:{owner_id:owner}}));
async function refresh(){
 if(!owner)throw Error('Sign in to Agent HQ to view private worker initiatives.');
 if(pending)return pending;
 const localOwner=owner,epoch=token;
 const op=(async()=>{
  const [a,b,c,d]=await Promise.all([
   agentCloud.from('agent_hq_autonomy_settings').select('*').eq('owner_id',localOwner).maybeSingle(),
   agentCloud.from('agent_hq_autonomy_ideas').select('*').eq('owner_id',localOwner).order('created_at',{ascending:false}).limit(100),
   agentCloud.from('agent_hq_worker_patterns').select('*').eq('owner_id',localOwner).order('last_seen_at',{ascending:false}).limit(100),
   agentCloud.from('agent_project_sessions').select('assignment_id,phase,review_status').eq('owner_id',localOwner).limit(150)
  ]);
  if([a,b,c,d].some(x=>x.error))throw Error('Could not load the private initiative register.');
  if(token!==epoch||owner!==localOwner)return;
  setting=a.data||null;ideas=b.data||[];patterns=c.data||[];phases=d.data||[];loaded=true;emit();
 })().finally(()=>{if(pending===op)pending=null});
 pending=op;return op;
}
async function updateSetting(patch){
 if(!setting||!owner)throw Error('Worker initiative settings unavailable.');
 const allowed={};
 if(typeof patch.enabled==='boolean')allowed.enabled=patch.enabled;
 if(patch.max_new_projects_week!==undefined){
  const n=Number(patch.max_new_projects_week);
  if(!Number.isInteger(n)||n<0||n>3)throw Error('Choose 0–3 new internal projects per week.');
  allowed.max_new_projects_week=n;
 }
 if(patch.max_active_initiatives!==undefined){
  const n=Number(patch.max_active_initiatives);
  if(!Number.isInteger(n)||n<0||n>3)throw Error('Choose 0–3 active internal initiatives.');
  allowed.max_active_initiatives=n;
 }
 if(!Object.keys(allowed).length)return setting;
 const {data,error}=await agentCloud.from('agent_hq_autonomy_settings').update({...allowed,updated_at:new Date().toISOString()})
  .eq('owner_id',owner).select('*').single();
 if(error||!data)throw Error('Worker settings were not saved: '+(error?.message||'Unknown error'));
 setting=data;emit();return data;
}
async function controlIdea(id,action){
 if(!owner||!ideas.some(i=>i.id===id&&i.owner_id===owner))throw Error('This initiative was not found under your account.');
 if(!['dismiss','pause','resume'].includes(action))throw Error('Unsupported initiative action');
 const {data,error}=await agentCloud.rpc('agent_hq_owner_autonomy_idea_control',{p_idea:id,p_action:action});
 if(error||data!==true)throw Error('This worker initiative could not be changed.');
 await refresh();return true;
}
async function disablePattern(id,disabled=true){
 if(!owner||!patterns.some(p=>p.id===id&&p.owner_id===owner))throw Error('This observed pattern was not found.');
 const {data,error}=await agentCloud.from('agent_hq_worker_patterns').update({disabled})
  .eq('owner_id',owner).eq('id',id).select('id,disabled').single();
 if(error||!data)throw Error('Could not change the stored observation.');
 patterns=patterns.map(p=>p.id===id?{...p,disabled}:p);emit();
}
async function authChanged(next){
 if(next===owner&&loaded)return;
 owner=next||null;token++;loaded=false;setting=null;ideas=[];patterns=[];phases=[];pending=null;emit();
 if(owner)try{await refresh()}catch(e){window.dispatchEvent(new CustomEvent('agenthq-initiatives-error',{detail:{message:String(e.message||e)}}));}
}
window.agentHQInitiatives={owner:()=>owner,loaded:()=>loaded,setting:()=>setting,ideas:()=>ideas.slice(),
 patterns:()=>patterns.slice(),phases:()=>phases.slice(),refresh,updateSetting,controlIdea,disablePattern};
agentCloud.auth.onAuthStateChange((_event,session)=>{void authChanged(session?.user?.id||null)});
agentCloud.auth.getUser().then(({data})=>authChanged(data?.user?.id||null)).catch(()=>{});
window.addEventListener('focus',()=>{if(owner)void refresh().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(owner&&!document.hidden)void refresh().catch(()=>{})});
