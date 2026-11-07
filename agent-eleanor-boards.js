import {agentCloud} from './agent-cloud-auth.js';
import {BOARD_KEYS,BOARD_LABELS,BOARD_COLOR,BOARD_CONFLICT_LABELS,BOARD_CONFIRMED_EATING_RULE} from './agent-eleanor-boards-data.js?v=20261107-confirmed-5pm-cutoff-1';
let selected='weekly';
const usd=v=>'$'+(Number(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=(zone='America/New_York')=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
};
const dow=day=>new Date(day+'T12:00:00Z').getUTCDay();
const panel=(title,body)=>'<section class="hq-board-panel"><h3>'+title+'</h3>'+body+'</section>';
const grid=(items,num=2)=>'<div class="hq-board-grid hq-board-grid-'+num+'">'+items.join('')+'</div>';
const list=(items,E)=>'<ul class="hq-board-list">'+(items||[]).map(x=>'<li>'+E(Array.isArray(x)?x.join(' — '):x)+'</li>').join('')+'</ul>';
const table=(items,E,isMoney=false)=>'<div class="hq-board-table">'+(items||[]).map(r=>'<div><span>'+E(r[0])+'</span><strong>'+E(isMoney?usd(r[1]):r[1])+'</strong></div>').join('')+'</div>';
const donut=(ratio,center,E)=>'<div class="hq-board-donut" role="img" aria-label="'+E(ratio.toFixed(1)+' percent allocated')+'" style="--board-share:'+Math.max(0,Math.min(100,ratio))+'%"><div>'+center+'</div></div>';
const alloc=(items,values,E)=>'<div class="hq-board-allocation">'+(items||[]).map(([name,pct],i)=>'<div><strong>'+E(pct)+'%</strong><span>'+E(name)+'</span>'+(values?'<b>'+usd(values[i])+'</b>':'')+'</div>').join('')+'</div>';
const callout=(text,E)=>'<p class="hq-board-muted">'+E(text)+'</p>';
function financial(p,E){
 const bills=Number(p.bills_total)||0,income=Number(p.monthly_income)||0,remainder=Number(p.left_after_bills)||0;
 return grid([
  panel('▤ Bills',table((p.bills||[]).map(row=>row[0]==='Food'?['Food · '+p.food_range,row[1]]:row),E,true)+
    '<p class="hq-board-total">Total Bills: <strong>'+usd(bills)+'</strong></p>'+callout(p.sources,E)),
  '<div>'+panel('💰 Paychecks',table(p.paychecks,E)+
   '<p class="hq-board-total">Paycheck Total: <strong>'+usd(p.paycheck_total)+' × '+E(p.periods)+'</strong></p>'+
   '<p class="hq-board-green hq-board-large">Estimated Monthly Income: '+usd(income)+'</p>')+
   panel('🐖 Money Saved','<p class="hq-board-green hq-board-large">'+usd(p.saved_range[0])+' to '+usd(p.saved_range[1])+'</p><small>Reported savings range</small>')+'</div>'
 ])+panel('▥ Quick Breakdown',grid([
  '<div><p>Bills vs income leaves about <strong class="hq-board-green">'+usd(remainder)+'</strong> remaining.</p>'+
  '<p>Bills use about '+E(p.bills_percent)+'% of monthly income.</p><p>Money left after bills is about '+E(p.remaining_percent)+'%.</p>'+
  '<p>Biggest bill areas: <strong>Food, AEP, and Misc.</strong></p></div>',
  '<div class="hq-board-chart">'+donut(income?bills/income*100:0,usd(income)+'<small>Monthly Income</small>',E)+
  '<div><p>🟨 Bills: '+usd(bills)+'</p><p>🟩 Left after bills: '+usd(remainder)+'</p></div></div>'
 ]))+panel('◎ Focus Areas',list(p.focus,E));
}
function scenario(p,E,flipping){
 return grid((p.scenarios||[]).map(s=>panel(E(s.name),
  '<div class="hq-board-stats">'+[['Total Saved',usd(s.saved)],['Keep Saved',usd(s.keep)],[flipping?'Deploy':'Invest',usd(s.deploy)]].map(([title,num])=>
   '<div><small>'+E(title)+'</small><strong>'+num+'</strong></div>').join('')+'</div>'+
   '<div class="hq-board-scenario">'+donut(s.saved?s.deploy/s.saved*100:0,usd(s.saved)+'<small>Total Saved</small>',E)+
   '<div>'+alloc(p.allocations,s.shares,E)+
   (s.illustrative_profit_range?'<p class="hq-board-green">Illustrative possible side-profit target: '+usd(s.illustrative_profit_range[0])+'–'+usd(s.illustrative_profit_range[1])+'/month (not guaranteed)</p>':'')+'</div></div>'
  )),2);
}
function flip(p,E){
 return grid([
  panel('▣ Savings Snapshot',table([
   ['Reported Saved Range',usd(p.saved_range[0])+' to '+usd(p.saved_range[1])],
   ['Liquid Safety Buffer',usd(p.liquid_floor)+' kept saved'],
   ['Working Capital',usd(p.working_capital_range[0])+' to '+usd(p.working_capital_range[1])]
  ],E)),
  panel('⚡ Faster-Turn Vehicles',list(p.vehicles,E))
 ])+grid([
  panel('◉ Company & Platform Ideas',grid([
   '<div><h4>Source From</h4>'+list(p.source_from,E)+'</div>',
   '<div><h4>Sell On</h4>'+list(p.sell_on,E)+'</div>',
   '<div><h4>Tools / Setup</h4>'+list(p.use_for_tools,E)+'</div>'
  ],3)),
  panel('◴ Example Working-Capital Allocation',alloc(p.allocations,null,E)+
   callout('Only the amount above the $1,000 safety buffer, not the emergency reserve.',E))
 ])+scenario(p,E,true)+panel('▤ Quick Breakdown',list([
  'The first $1,000 stays protected and liquid.',
  'Only the overflow from '+usd(p.working_capital_range[0])+' to '+usd(p.working_capital_range[1])+' is considered.',
  'Example outcomes are not guaranteed income.'
 ],E))+panel('◎ Focus Areas',list(p.focus,E))+callout(p.caveat,E);
}
function investment(p,E){
 return grid([
  panel('▣ Savings Snapshot',table([
   ['Reported Saved Money',usd(p.saved_range[0])+' to '+usd(p.saved_range[1])],
   ['Cash Safety Buffer',usd(p.liquid_floor)+' kept saved'],
   ['Investable Amount',usd(p.investable_range[0])+' to '+usd(p.investable_range[1])]
  ],E)),
  panel('◷ Investment Vehicles',list(p.vehicles,E))
 ])+grid([
  panel('◴ Example Allocation — Investable Portion Only',alloc(p.allocations,null,E)+
   callout('Applies only to money above the protected $1,000 floor.',E)),
  panel('▤ Quick Breakdown',list([
   'Your first $1,000 stays protected and liquid.',
   'Only '+usd(p.investable_range[0])+' to '+usd(p.investable_range[1])+' is illustrated as investable.',
   'The example portfolio remains a proposal; no investments are placed automatically.'
  ],E))
 ])+scenario(p,E,false)+panel('◎ Focus Areas',list(p.focus,E))+callout(p.caveat,E);
}
const checked=(state,board,day,key)=>(state.board_checks||[]).some(r=>r.board_key===board&&r.local_date===day&&r.checklist_key===key&&r.checked);
const checkbox=(state,board,day,key,title,E,disabled=false)=>
 '<label class="hq-board-check"><input type="checkbox" data-hq-board-check="'+E(board+'|'+day+'|'+key)+'"'+
 (checked(state,board,day,key)?' checked':'')+(disabled?' disabled':'')+'><span>'+E(title)+'</span></label>';
function cleaning(p,state,E){
 const date=today(state.settings.timezone),weekday=dow(date);
 const daily=(p.daily_reset||[]).map((name,i)=>checkbox(state,'cleaning',date,'reset-'+i,name,E,weekday===6)).join('');
 const days='<div class="hq-board-seven-days">'+(p.days||[]).map(d=>
  '<section class="hq-board-day hq-board-day-'+d.dow+'"><h4>'+E(d.day)+'</h4><strong>'+E(d.title)+'</strong>'+
  (d.dow===6?'<p class="hq-board-rest">☀️ REST<br>FAMILY<br>FAITH<br>RELAX<br>NO CLEANING</p>':
   d.items.map((name,i)=>checkbox(state,'cleaning',date,'focus-'+d.dow+'-'+i,name,E,d.dow!==weekday||weekday===6)).join(''))+
  '</section>').join('')+'</div>';
 return grid([
  panel('◷ Daily Reset | '+E(p.daily_reset_minutes)+' Minutes',daily),
  panel('◷ Best Times to Clean',table(p.best_times,E)),
  panel('✧ Clean Home Goals',list(['Keep a clean and organized home','Spend only 20–40 minutes a day',
    'Focus on one area each day','Keep main areas presentable','Reduce clutter through the week',
    'Have everything in its place','Sabbath day of rest (no cleaning)'],E))
 ],3)+days+grid([
  panel('Cleaning Supply Checklist',list(p.supplies,E)),
  panel('Home Zone Guide',table(p.zones,E)),
  panel('Quick Tips',list(p.tips,E))
 ],3)+callout('Today: '+date+'. Checkboxes are enabled only for today’s scheduled chores, not Saturday. Eleanor saves your reported completion.',E);
}
function weekly(p,state,E){
 const date=today(state.settings.timezone),weekday=dow(date);
 const rhythm='<div class="hq-board-table">'+(p.rhythm||[]).map(([start,end,title])=>
  '<div><strong>'+E(start)+'–'+E(end||'onward')+'</strong><span>'+E(title)+'</span></div>').join('')+'</div>';
 const work=(p.business_days||[]).map(d=>[d.day,d.title+' — '+d.description]);
 const gym=(p.gym_days||[]).map(d=>[d.day,d.details]);
 const reporting='<div class="hq-board-report">'+[
  ['business-'+weekday,'Completed today’s scheduled business focus',weekday===0||weekday===6],
  ['gym-'+weekday,'Completed today’s scheduled gym session',weekday===0||weekday===6],
  ['math','Completed today’s math practice',weekday===0||weekday===6]
 ].map(([key,label,disabled])=>checkbox(state,'weekly',date,key,label,E,disabled)).join('')+'</div>';
 return grid([
  panel('Monday–Friday | Daily Rhythm',rhythm),
  '<div>'+panel('Weekday Business Rotation (3–4 PM)',table(work,E))+
   panel('Gym Rotation (5–6:30 PM)',table(gym,E)+list(p.gym_notes,E))+'</div>'
 ])+grid([
  panel('Home Reset | 20 Min / Day',table(p.home_reset,E)),
  panel('Weekend | Protect Your Energy',
   '<div class="hq-board-weekend"><div><h4>Saturday — Sabbath</h4>'+list(p.weekend.saturday,E)+'</div>'+
   '<div><h4>Sunday — Light Day</h4>'+list(p.weekend.sunday,E)+'</div></div>')
 ])+panel('◎ Sales Goal (Starting)',
  '<p>Work toward first <strong>'+usd(p.sales_target_net_monthly)+'/month net profit</strong> (not guaranteed). '+E(p.tips[1])+'</p>')+
 panel('Report today’s actual outcomes',reporting+callout('These boxes record your report, not independent sales, income or gym records.',E));
}
const renderers={financial,flip,investment,cleaning,weekly};
export function renderEleanorBoards(state,E){
 const rows=state.board_snapshots||[];
 const row=rows.find(r=>r.board_key===selected)||rows.find(r=>r.board_key==='weekly')||rows[0];
 const key=row?.board_key||selected,p=row?.payload;
 const nav=BOARD_KEYS.map(k=>'<button type="button" data-hq-board-select="'+k+'" aria-pressed="'+(k===key)+'">'+E(BOARD_LABELS[k])+'</button>').join('');
 const content=p&&renderers[key]?(['weekly','cleaning'].includes(key)?renderers[key](p,state,E):renderers[key](p,E)):
  '<p>These private reference boards have not been loaded for this account.</p>';
 return '<section class="hq-board-desk"><h3>Five saved personal planning boards</h3>'+
 '<p class="secretary-subtle">Your uploaded reference numbers and schedule are private Agent HQ records, not live financial account data. Saturday remains free of ordinary work.</p>'+
 '<p class="secretary-subtle"><strong>Confirmed eating schedule:</strong> '+E(BOARD_CONFIRMED_EATING_RULE)+'</p>'+
 '<nav class="hq-board-navigation">'+nav+'</nav>'+
 '<div data-hq-board-sheet class="hq-board-sheet hq-board-sheet-'+(BOARD_COLOR[key]||'home')+'">'+
 '<header class="hq-board-heading"><span>📈</span><div><h2>'+E(p?.title||BOARD_LABELS[key])+'</h2><p>'+E(p?.subtitle||'Owner-provided planning board')+'</p></div><span>🌱</span></header>'+
 '<div class="hq-board-main">'+content+'</div></div>'+
 '<details class="secretary-card hq-board-conflicts"><summary>Items Eleanor must reconcile before changing your plan</summary>'+
 list(BOARD_CONFLICT_LABELS,E)+'</details>'+
 '<p class="secretary-subtle">Bills, balances and expected profits shown here are user-supplied snapshots. They do not authorize spending, investing or moving money.</p></section>';
}
export function bindEleanorBoards(root,state,helpers,E){
 const notice=t=>helpers.message(String(t));
 const attachChecks=()=>{
  root.querySelectorAll('[data-hq-board-check]').forEach(box=>box.addEventListener('change',async event=>{
   const el=event.currentTarget,[board_key,local_date,checklist_key]=el.dataset.hqBoardCheck.split('|'),value=el.checked;
   if(!['cleaning','weekly'].includes(board_key)||!/^\d{4}-\d{2}-\d{2}$/.test(local_date)||!checklist_key){el.checked=!value;return;}
   if(dow(local_date)===6){el.checked=false;notice('Saturday is reserved for rest.');return;}
   el.disabled=true;
   try{
    const {data:auth,error:authError}=await agentCloud.auth.getUser();
    if(authError||auth.user?.id!==state.settings.owner_id)throw Error('Sign-in changed.');
    const {error}=await agentCloud.from('agent_hq_board_checks').upsert({
      owner_id:auth.user.id,board_key,local_date,checklist_key,checked:value,updated_at:new Date().toISOString()
    },{onConflict:'owner_id,board_key,local_date,checklist_key'});
    if(error)throw Error(error.message);
    state.board_checks=(state.board_checks||[]).filter(r=>!(r.board_key===board_key&&r.local_date===local_date&&r.checklist_key===checklist_key));
    state.board_checks.push({board_key,local_date,checklist_key,checked:value});
    notice((value?'Completed: ':'Reopened: ')+el.parentElement?.textContent?.trim()+'. Eleanor has the latest owner-reported status.');
   }catch(error){el.checked=!value;notice('Could not save this checkmark: '+String(error?.message||error));}
   finally{el.disabled=false;}
  }));
 };
 root.querySelectorAll('[data-hq-board-select]').forEach(button=>button.addEventListener('click',()=>{
  selected=button.dataset.hqBoardSelect;
  const outer=document.createElement('div');outer.innerHTML=renderEleanorBoards(state,E);
  const fresh=outer.querySelector('[data-hq-board-sheet]'),old=root.querySelector('[data-hq-board-sheet]');
  if(fresh&&old)old.replaceWith(fresh);
  root.querySelectorAll('[data-hq-board-select]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.hqBoardSelect===selected)));
  attachChecks();
 }));
 attachChecks();
}
