// Shared, deterministic routine calendar. Saturday (6) is always excluded.
// An "alternate" book plan means every second eligible (non-Saturday) calendar day.
export function localDay(clock=new Date(),timezone='America/New_York'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(clock);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
export function dow(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return -1;
 const dt=new Date(date+'T12:00:00Z');
 return Number.isFinite(dt.getTime())&&dt.toISOString().slice(0,10)===date?dt.getUTCDay():-1;
}
function eligibleSteps(anchor,current){
 const first=Date.parse(anchor+'T12:00:00Z'),last=Date.parse(current+'T12:00:00Z');
 if(!Number.isFinite(first)||!Number.isFinite(last)||last<first)return -1;
 const total=Math.round((last-first)/86400000),weeks=Math.floor(total/7),extra=total%7;
 let days=weeks*6,baseDow=dow(anchor);
 for(let i=0;i<=extra;i++)if((baseDow+i)%7!==6)days++;
 return days-1;
}
export function routineDue(item,day){
 if(dow(day)===-1||dow(day)===6)return false;
 if(item?.status&&item.status!=='active')return false;
 const allowed=item?.weekdays;
 if(Array.isArray(allowed)&&!allowed.includes(dow(day)))return false;
 const info=item?.data||{};
 if(info.monthly_weight===true||info.monthly_weight==='true'){
  const firstDow=dow(day.slice(0,7)+'-01');
  return Number(day.slice(8))===(firstDow===6?2:1);
 }
 if(info.reading_goal){
  if(info.reading_mode==='daily')return true;
  const anchor=String(info.anchor_date||day);
  return eligibleSteps(anchor,day)>=0&&eligibleSteps(anchor,day)%2===0;
 }
 return true;
}
export function nextEligible(day,offset=1){
 const d=new Date(day+'T12:00:00Z');
 if(!Number.isFinite(d.getTime()))return null;
 for(let i=0;i<21;i++){
  if(i>=offset&&d.getUTCDay()!==6)return d.toISOString().slice(0,10);
  d.setUTCDate(d.getUTCDate()+1);
 }
 return null;
}
