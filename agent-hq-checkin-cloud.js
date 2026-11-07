// Agent HQ's owner-private daily check-ins, independent of Apple Health and external social APIs.
import {agentCloud} from './agent-cloud-auth.js';
const KEY='agenthq-eleanor-daily-checkin-v1:';
const dayOK=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'));
let owner=null,epoch=0,loaded=false,rows=new Map(),inFlight=null;
const signal=()=>window.dispatchEvent(new CustomEvent('agenthq-checkins-changed',{detail:{owner_id:owner}}));
function ensureOwner(){if(!owner)throw Error('Sign in to Agent HQ for private daily check-ins.');return owner;}
function verify(fields){
 if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Provide a daily check-in record.');
 for(const key of ['multivitamin','apple_cider_vinegar','tiktok_live','posts','messages'])
  if(fields[key]!==undefined&&!['yes','no','not_yet'].includes(fields[key]))throw Error('Choose a valid '+key+' status.');
 if(fields.heart_rate!==undefined&&(!Number.isInteger(fields.heart_rate)||fields.heart_rate<20||fields.heart_rate>250))
  throw Error('Enter a measured heart rate between 20 and 250 bpm or leave it blank.');
 if(fields.water_oz!==undefined&&(!Number.isFinite(fields.water_oz)||fields.water_oz<0||fields.water_oz>500))
  throw Error('Enter water in fluid ounces or leave it blank.');
 if(JSON.stringify(fields).length>6000)throw Error('Daily check-in is too long.');
}
async function refresh(){
 if(inFlight)return inFlight;
 const id=ensureOwner(),ticket=epoch;
 const work=(async()=>{
  const {data,error}=await agentCloud.from('agent_hq_daily_checkins')
   .select('owner_id,local_date,fields,submitted_at,sent_signature,updated_at')
   .eq('owner_id',id).order('local_date',{ascending:false}).limit(45);
  if(error)throw Error('Could not read private check-ins: '+error.message);
  if(ticket!==epoch||id!==owner)return;
  rows=new Map((data||[]).map(x=>[x.local_date,x]));loaded=true;signal();
 })().finally(()=>{if(inFlight===work)inFlight=null});
 inFlight=work;return work;
}
function record(day){return rows.get(day)||null}
async function save(day,fields){
 const id=ensureOwner();if(!dayOK(day))throw Error('Choose a valid check-in date.');verify(fields);
 const signature=JSON.stringify(fields),old=rows.get(day),same=old?.sent_signature===signature;
 const {data,error}=await agentCloud.from('agent_hq_daily_checkins').upsert({
  owner_id:id,local_date:day,fields,
  submitted_at:same?old.submitted_at:null,sent_signature:same?signature:null,
  updated_at:new Date().toISOString()
 },{onConflict:'owner_id,local_date'}).select('owner_id,local_date,fields,submitted_at,sent_signature,updated_at').single();
 if(error||!data)throw Error('The check-in was not saved in Agent HQ: '+(error?.message||'unknown error'));
 rows.set(day,data);signal();return data;
}
async function markSent(day,fields){
 const id=ensureOwner();const signature=JSON.stringify(fields);
 const {data,error}=await agentCloud.from('agent_hq_daily_checkins')
  .update({submitted_at:new Date().toISOString(),sent_signature:signature,updated_at:new Date().toISOString()})
  .eq('owner_id',id).eq('local_date',day)
  .select('owner_id,local_date,fields,submitted_at,sent_signature,updated_at').maybeSingle();
 if(error||!data)throw Error('Eleanor received the check-in, but its sent status was not confirmed in the Agent HQ register.');
 rows.set(day,data);signal();return data;
}
async function migrate(id){
 let old;try{old=JSON.parse(localStorage.getItem(KEY+id)||'{}')}catch{return}
 if(!old||typeof old!=='object'||Array.isArray(old))return;
 for(const day of Object.keys(old).sort()){
  if(id!==owner)return;
  const prior=old[day],fields=prior?.fields;if(!dayOK(day)||!fields||rows.has(day))continue;
  try{
   await save(day,fields);
   if(prior?.sent_at&&prior?.sent_signature===JSON.stringify(fields))await markSent(day,fields);
   delete old[day];localStorage.setItem(KEY+id,JSON.stringify(old));
  }catch{return;} // Keep unsynced local entries for retry.
 }
}
async function signedIn(next){
 if(next===owner&&loaded)return;owner=next||null;epoch++;loaded=false;rows.clear();inFlight=null;signal();
 if(!owner)return;
 const id=owner,ticket=epoch;
 try{await refresh();if(ticket===epoch)await migrate(id)}
 catch(error){if(ticket===epoch)window.dispatchEvent(new CustomEvent('agenthq-checkins-error',{detail:{message:String(error?.message||error)}}))}
}
window.agentHQCheckins={
 owner:()=>owner,loaded:()=>loaded,record,all:()=>[...rows.values()],
 refresh,save,markSent
};
agentCloud.auth.onAuthStateChange((_event,session)=>{void signedIn(session?.user?.id||null)});
agentCloud.auth.getUser().then(({data})=>signedIn(data?.user?.id||null)).catch(()=>{});
window.addEventListener('focus',()=>{if(owner)void refresh().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(owner&&!document.hidden)void refresh().catch(()=>{})});
