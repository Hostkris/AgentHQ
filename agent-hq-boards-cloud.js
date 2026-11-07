// Private owner-approved copies of the five planning boards. Never put amounts in public JavaScript.
import {agentCloud} from './agent-cloud-auth.js';
import {BOARD_KEYS} from './agent-eleanor-boards-data.js';
let owner=null,epoch=0,loaded=false,snapshots=[],checks=[],pending=null;
const announce=()=>window.dispatchEvent(new CustomEvent('agenthq-boards-changed',{detail:{owner_id:owner}}));
async function refresh(){
 if(!owner)throw Error('Sign in to see your five private planning boards.');
 if(pending)return pending;
 const id=owner,ticket=epoch;
 const request=(async()=>{
  const [a,b]=await Promise.all([
   agentCloud.from('agent_hq_board_snapshots').select('board_key,payload,source_label,updated_at').eq('owner_id',id).limit(10),
   agentCloud.from('agent_hq_board_checks').select('board_key,local_date,checklist_key,checked,updated_at').eq('owner_id',id).order('local_date',{ascending:false}).limit(1400)
  ]);
  if(a.error||b.error)throw Error('Could not load private scheduling boards: '+(a.error?.message||b.error?.message));
  if(ticket!==epoch||id!==owner)return;
  snapshots=(a.data||[]).filter(x=>BOARD_KEYS.includes(x.board_key));
  checks=b.data||[];loaded=true;announce();
 })().finally(()=>{if(pending===request)pending=null});
 pending=request;return request;
}
async function setChecked(board,day,key,checked){
 const id=owner;if(!id||!BOARD_KEYS.includes(board)||!['cleaning','weekly'].includes(board))throw Error('Sign in to update a weekly or cleaning checklist.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!key||key.length>160)throw Error('Choose a valid dated checklist item.');
 // All checklist entries are owner-confirmed; schedules never mark themselves done.
 if(checked){
  const {data,error}=await agentCloud.from('agent_hq_board_checks').upsert({
   owner_id:id,board_key:board,local_date:day,checklist_key:key,checked:true,updated_at:new Date().toISOString()
  },{onConflict:'owner_id,board_key,local_date,checklist_key'})
   .select('board_key,local_date,checklist_key,checked,updated_at').single();
  if(error||!data)throw Error('Could not confirm the completed checklist entry.');
  checks=[...checks.filter(x=>!(x.board_key===board&&x.local_date===day&&x.checklist_key===key)),data];
 }else{
  const {error}=await agentCloud.from('agent_hq_board_checks').delete().eq('owner_id',id).eq('board_key',board).eq('local_date',day).eq('checklist_key',key);
  if(error)throw Error('Could not clear this checklist entry.');
  checks=checks.filter(x=>!(x.board_key===board&&x.local_date===day&&x.checklist_key===key));
 }
 announce();
}
async function signedIn(id){
 if(owner===id&&loaded)return;
 owner=id||null;epoch++;loaded=false;snapshots=[];checks=[];pending=null;announce();
 if(!owner)return;
 try{await refresh()}catch(e){window.dispatchEvent(new CustomEvent('agenthq-boards-error',{detail:{message:String(e.message||e)}}))}
}
window.agentHQBoardsCloud={
 owner:()=>owner,loaded:()=>loaded,boards:()=>snapshots.slice(),
 checks:()=>checks.slice(),refresh,setChecked
};
agentCloud.auth.onAuthStateChange((_event,session)=>{void signedIn(session?.user?.id||null)});
agentCloud.auth.getUser().then(({data})=>signedIn(data?.user?.id||null)).catch(()=>{});
window.addEventListener('focus',()=>{if(owner)void refresh().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(owner&&!document.hidden)void refresh().catch(()=>{})});
