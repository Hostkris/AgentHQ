// Goal math only reflects work actually marked complete in Agent HQ.
// An unverified sale, a scheduled task or a prepared draft does not earn progress.
export function goalProgress(goal,steps=[]){
 const own=steps.filter(step=>step.goal_id===goal.id);
 const total=own.reduce((sum,step)=>sum+(Number.isInteger(step.weight)?step.weight:1),0);
 const completed=own.reduce((sum,step)=>sum+(step.status==='done'?(Number.isInteger(step.weight)?step.weight:1):0),0);
 const percent=total?Math.round(100*completed/total):0;
 return {percent,completedSteps:own.filter(s=>s.status==='done').length,totalSteps:own.length,next:own.find(s=>s.status!=='done')||null};
}
export function budgetStatus(goal){
 const cap=goal.budget_cap_cents;
 const spent=Math.max(0,Number(goal.spent_cents)||0);
 if(cap===null||cap===undefined)return {cap:null,spent,remaining:null,over:false};
 const amount=Number(cap);
 return {cap:amount,spent,remaining:amount-spent,over:spent>amount};
}
export function dollars(cents){
 return '$'+(Number(cents)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function toCents(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const raw=String(value).trim();
 if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a nonnegative dollar amount with at most two decimal places.');
 const [d,c='']=raw.split('.');
 return Number(d)*100+Number(c.padEnd(2,'0'));
}
export function localDay(clock=new Date(),zone='America/New_York'){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(clock).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
export function localClock(clock=new Date(),zone='America/New_York'){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(clock).map(x=>[x.type,x.value]));
 return p.hour+':'+p.minute;
}
export function nextWorkSlot(items=[],zone='America/New_York',clock=new Date()){
 const today=localDay(clock,zone),now=localClock(clock,zone);
 const slots=['15:30','16:30','18:00','19:00','20:00','10:00','11:00','13:00'];
 const used=[];
 for(const item of items){
  if(item.status!=='active')continue;
  const time=item.kind==='meeting'?item.scheduled_at:item.kind==='task'?item.due_at:null;
  if(time){const date=new Date(time);if(!Number.isNaN(date.getTime()))used.push(localDay(date,zone)+'T'+localClock(date,zone));}
 }
 const wall=v=>Date.parse(v+':00Z');
 for(let offset=0;offset<=30;offset++){
  const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);
  if(d.getUTCDay()===6)continue; // Never assign ordinary work on Saturday.
  const day=d.toISOString().slice(0,10);
  for(const time of slots){
   if(day===today&&time<=now)continue;
   const candidate=day+'T'+time;
   if(used.some(x=>Math.abs(wall(candidate)-wall(x))<56*60000))continue;
   return candidate;
  }
 }
 throw Error('Eleanor could not find an available non-Saturday work slot in the next 30 days.');
}
export const HOME_STEPS=Object.freeze([
 {title:'Describe the repair or improvement and inspect its condition',details:'Note the actual location, dimensions, photos, urgency, hazards and what success would look like.'},
 {title:'Confirm safe scope and whether a qualified contractor is needed',details:'Check electrical, structural, roofing, gas, permits and other safety-sensitive work before any DIY plan.'},
 {title:'Prepare materials, labor and contingency estimate within the spending cap',details:'Gather real current prices, compare options and show what fits your stated budget. No purchase or contract is approved by making this plan.'},
 {title:'Choose the practical sequence and schedule the work',details:'Arrange dependencies, available tools and your Sunday–Friday schedule; leave Saturday completely free.'},
 {title:'Complete the approved household work',details:'Record work actually performed, material receipts and any outstanding defects. Do not mark it complete early.'},
 {title:'Inspect the result and close the house project',details:'Confirm it functions safely, clean up, document actual spending and mark the project done only after inspection.'}
]);
