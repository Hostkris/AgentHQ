// iPhone-style editable Agent HQ Home Screen.
// Layout and widgets are preferences local to this browser; work data remains in Supabase.
const KEY="agenthq-home-layout-v1";
const APPS=[
 ["office","Office","🏢"],["messages","Messages","💬"],["email","Email Center","✉️"],
 ["contacts","Contacts","👥"],["accounts","My Accounts","🔐"],["studio","Worker Studio","🧬"],
 ["assignments","Assignments","📋"],["operations","Operations","📈"],
 ["creative","Creative Desk","🎨"],["hq","Company HQ","🧑‍💼"],
 ["approvals","Approvals","🔐"],["research","Research","🔎"],
 ["browser","Browser","🌐"],["reminders","Reminders","📅"],["camera","Camera","📷"],["settings","Settings","⚙️"]
];
// Compact icon captions only. Full names stay in accessibility labels and navigation.
const HOME_LABELS=Object.freeze({
 office:"Office",messages:"Messages",email:"Email",contacts:"Contacts",
 accounts:"Accounts",studio:"Studio",assignments:"Assignments",operations:"Operations",
 creative:"Creative",hq:"Company HQ",approvals:"Approvals",research:"Research",
 browser:"Browser",reminders:"Reminders",camera:"Camera",settings:"Settings"
});
const valid=new Set(APPS.map(a=>a[0]));
const kinds=["inbox","approvals","work","research"];
const escapeHTML=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const defaultLayout=()=>({pages:[{apps:APPS.map(a=>a[0]),widgets:[]}],current:0});
function load(){
 try{
  const parsed=JSON.parse(localStorage.getItem(KEY)||"null");
  if(!parsed||!Array.isArray(parsed.pages))return defaultLayout();
  let seen=new Set();
  const pages=parsed.pages.slice(0,6).map(p=>({
   apps:(Array.isArray(p.apps)?p.apps:[]).filter(id=>{
    if(!valid.has(id)||seen.has(id))return false;
    seen.add(id);return true;
   }).slice(0,24),
   widgets:(Array.isArray(p.widgets)?p.widgets:[]).filter(x=>kinds.includes(x)).slice(0,4)
  }));
  if(!pages.length)pages.push({apps:[],widgets:[]});
  for(const [id] of APPS)if(!seen.has(id))pages[0].apps.push(id);
  return {pages,current:Math.max(0,Math.min(pages.length-1,Number(parsed.current)||0))};
 }catch{return defaultLayout()}
}
let state=load(),editing=false,menu=false,change=()=>{};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
const update=()=>{save();change()};
function move(id,toPage,toIndex){
 const from=state.pages.findIndex(p=>p.apps.includes(id));
 if(from<0||toPage<0||toPage>=state.pages.length)return;
 const src=state.pages[from].apps;
 src.splice(src.indexOf(id),1);
 const dst=state.pages[toPage].apps;
 dst.splice(Math.max(0,Math.min(dst.length,toIndex)),0,id);
 state.current=toPage;update();
}
function tile(id,renderButton){
 const def=APPS.find(a=>a[0]===id);if(!def)return "";
 const html=renderButton(def[1],def[0],def[2])
  .replace('class="tile"','class="tile" data-home-tile="'+id+'"')
  .replace(/(<span class="tile-label">)[\s\S]*?(<\/span>)/,
   (_full,open,close)=>open+escapeHTML(HOME_LABELS[id]||def[1])+close);
 // Tiles have NO visible arrows, shift buttons or other move controls.
 // Long pressing and dragging the icon itself is the entire interaction.
 return '<div class="home-tile-wrap" data-home-item="'+id+'">'+html+'</div>';
}
function widget(kind,values){
 const config={
  inbox:{name:"Messages",icon:"💬",count:values.messages||0,desc:"Unread messages and approvals",target:"messages"},
  approvals:{name:"Approvals",icon:"✅",count:values.approvals||0,desc:"Requests waiting for your decision",target:"approvals"},
  work:{name:"Assignments",icon:"📋",count:values.assignments||0,desc:"Tasks needing attention",target:"assignments"},
  research:{name:"Research",icon:"🔎",count:values.research||0,desc:"Completed saved research reports",target:"research"}
 }[kind];
 if(!config)return "";
 return '<div class="home-widget">'+
  (editing?'<button class="home-widget-remove" type="button" data-home-remove-widget="'+kind+'" aria-label="Remove '+config.name+' widget">×</button>':'')+
  '<button type="button" class="home-widget-open" data-home-widget-nav="'+config.target+'">'+
  '<span class="home-widget-name">'+config.icon+' '+config.name+'</span>'+
  '<strong class="home-widget-count">'+Number(config.count)+'</strong>'+
  '<small>'+config.desc+'</small></button></div>';
}
export function renderHomeScreen(renderButton,values={}){
 const page=state.pages[state.current]||state.pages[0];
 const paging=state.pages.map((p,i)=>'<button type="button" data-home-page="'+i+'" class="home-page-dot'+(i===state.current?' active':'')+'" aria-label="Home page '+(i+1)+'" aria-current="'+(i===state.current?'page':'false')+'"></button>').join("");
 return '<section class="home-pages" aria-label="Home Screen">'+
 (editing?'<div class="home-toolbar is-editing">'+
  '<button type="button" data-home-widget-menu class="home-add-widget-circle" aria-label="Add a widget">+</button>'+
  '<button type="button" data-home-edit class="home-edit-toggle">Done</button></div>':'')+
 '<div class="grid home-dashboard'+(editing?' home-is-editing':'')+'" role="navigation" aria-label="Home apps">'+
 page.apps.map(id=>tile(id,renderButton)).join("")+'</div>'+
 (page.widgets.length?'<div class="home-widgets">'+page.widgets.map(k=>widget(k,values)).join("")+'</div>':'')+
 (editing?'<div class="home-widget-picker">'+
  (menu?'<div class="home-widget-choices">'+kinds.map(k=>'<button type="button" data-home-add-widget="'+k+'">'+escapeHTML(k==="work"?"Assignments":k==="inbox"?"Messages":k==="research"?"Research":"Approvals")+'</button>').join("")+'</div>':'')+
  (state.pages.length<6?'<button type="button" data-home-add-page>+ Add Home Page</button>':'')+
  (state.pages.length>1?'<button type="button" data-home-remove-page>Remove Empty Page</button>':'')+
  '</div>':'')+
 '<div class="home-page-navigation">'+
 (state.pages.length>1?'<button type="button" data-home-nav="-1" '+(state.current===0?'disabled':'')+' aria-label="Previous home page">‹</button>':'')+
 '<div class="home-page-dots">'+paging+'</div>'+
 (state.pages.length>1?'<button type="button" data-home-nav="1" '+(state.current===state.pages.length-1?'disabled':'')+' aria-label="Next home page">›</button>':'')+'</div>'+
 '</section>';
}
function action(target,event){
 const edit=target.closest('[data-home-edit]');if(edit){
  finishDrag();editing=false;menu=false;update();return true
 }
 const page=target.closest('[data-home-page]');if(page){
  if(drag)return true;
  state.current=Number(page.dataset.homePage);update();return true
 }
 const nav=target.closest('[data-home-nav]');if(nav){
  if(drag)return true;
  state.current=Math.max(0,Math.min(state.pages.length-1,state.current+Number(nav.dataset.homeNav)));update();return true
 }
 const addPage=target.closest('[data-home-add-page]');if(addPage){
  if(state.pages.length<6){state.pages.push({apps:[],widgets:[]});state.current=state.pages.length-1;update()}return true
 }
 const removePage=target.closest('[data-home-remove-page]');if(removePage){
  const p=state.pages[state.current];
  if(state.pages.length<=1)return true;
  if(p.apps.length||p.widgets.length){window.alert('Move the apps and remove widgets first. You can only delete an empty page.');return true}
  state.pages.splice(state.current,1);state.current=Math.min(state.current,state.pages.length-1);update();return true
 }
 const menuButton=target.closest('[data-home-widget-menu]');if(menuButton){menu=!menu;update();return true}
 const addWidget=target.closest('[data-home-add-widget]');if(addWidget){
  const kind=addWidget.dataset.homeAddWidget,p=state.pages[state.current];
  if(kinds.includes(kind)&&p.widgets.length<4&&!p.widgets.includes(kind))p.widgets.push(kind);
  menu=false;update();return true
 }
 const removeWidget=target.closest('[data-home-remove-widget]');if(removeWidget){
  const p=state.pages[state.current];p.widgets=p.widgets.filter(k=>k!==removeWidget.dataset.homeRemoveWidget);update();return true
 }
 const widgetLink=target.closest('[data-home-widget-nav]');if(widgetLink){
  const id=widgetLink.dataset.homeWidgetNav;
  if(!editing){const button=document.createElement('button');button.dataset.nav=id;document.querySelector('#app')?.append(button);button.click();button.remove()}
  return true
 }
 return Boolean(editing&&target.closest('[data-home-tile]'));
}

// Pointer/touch drag uses a fixed icon copy while actual grid elements flow
// around the held position, with automatic Home-page changes at either edge.
let gesture=null,drag=null,holdTimer=null,edgeTimer=null,edgeDirection=0,ignoreClicksUntil=0,swipe=null;
const now=()=>Date.now();
function clearHold(){if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null}}
function clearEdge(){if(edgeTimer!==null){clearTimeout(edgeTimer);edgeTimer=null}edgeDirection=0}
function sourceTile(){
 return document.querySelector('.home-pages .home-dashboard [data-home-item="'+drag?.id+'"]');
}
function hideSource(){sourceTile()?.classList.add('home-drag-placeholder')}
function setGhostPosition(x,y){
 if(!drag)return;
 drag.x=x;drag.y=y;
 drag.ghost.style.left=(x-drag.offsetX)+'px';
 drag.ghost.style.top=(y-drag.offsetY)+'px';
}
function activateHeld(){
 if(!gesture)return;
 clearHold();
 editing=true;menu=false;
 const id=gesture.id,x=gesture.x,y=gesture.y;
 ignoreClicksUntil=now()+800;
 if(navigator.vibrate)try{navigator.vibrate(10)}catch{}
 update();
 if(!id)return;
 const element=document.querySelector('.home-pages [data-home-item="'+id+'"]');
 if(!element)return;
 const rect=element.getBoundingClientRect();
 const ghost=element.cloneNode(true);
 ghost.removeAttribute('data-home-item');
 ghost.querySelector('[data-home-tile]')?.removeAttribute('data-home-tile');
 ghost.classList.add('home-drag-ghost');
 ghost.setAttribute('aria-hidden','true');
 ghost.style.width=rect.width+'px';
 ghost.style.height=rect.height+'px';
 document.body.append(ghost);
 drag={id,ghost,offsetX:rect.width/2,offsetY:rect.height/2,x,y};
 hideSource();
 setGhostPosition(x,y);
}
function gridOrder(){
 const grid=document.querySelector('.home-pages .home-dashboard');
 return grid?[...grid.querySelectorAll(':scope > [data-home-item]')].map(e=>e.dataset.homeItem).filter(valid.has.bind(valid)):null;
}
function commitGridOrder(){
 const order=gridOrder();
 if(order)state.pages[state.current].apps=order;
}
function animateReflow(grid,before){
 // Move neighboring icons smoothly; no rerender until drop or page change.
 for(const item of grid.querySelectorAll(':scope > [data-home-item]')){
  if(item.classList.contains('home-drag-placeholder'))continue;
  const previous=before.get(item.dataset.homeItem);
  if(!previous)continue;
  const next=item.getBoundingClientRect();
  const dx=previous.left-next.left,dy=previous.top-next.top;
  if((Math.abs(dx)>1||Math.abs(dy)>1)&&typeof item.animate==='function'){
   item.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'translate(0,0)'}],
    {duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
 }
}
function reorderAt(x,y){
 if(!drag)return;
 const grid=document.querySelector('.home-pages .home-dashboard');
 if(!grid)return;
 const source=sourceTile();
 const under=document.elementFromPoint(x,y);
 const target=under?.closest?.('.home-pages .home-dashboard [data-home-item]');
 if(!source||!target||source===target||!grid.contains(target))return;
 const all=[...grid.querySelectorAll(':scope > [data-home-item]')];
 const from=all.indexOf(source),to=all.indexOf(target);
 if(from<0||to<0)return;
 const before=new Map(all.map(el=>[el.dataset.homeItem,el.getBoundingClientRect()]));
 if(from<to)target.after(source);else target.before(source);
 animateReflow(grid,before);
}
function switchDragPage(direction){
 if(!drag)return;
 const next=state.current+direction;
 if(next<0||next>state.pages.length)return;
 if(next===state.pages.length){
  if(state.pages.length>=6)return;
  state.pages.push({apps:[],widgets:[]});
 }
 commitGridOrder();
 for(const page of state.pages)page.apps=page.apps.filter(id=>id!==drag.id);
 const destination=state.pages[next].apps;
 if(direction>0)destination.unshift(drag.id);
 else destination.push(drag.id);
 state.current=next;
 update();
 hideSource();
 setGhostPosition(drag.x,drag.y);
}
function edgeAt(x){
 if(!drag)return;
 const w=window.innerWidth||document.documentElement.clientWidth||390;
 const distance=Math.min(36,Math.max(22,w*.065));
 const requested=x<distance?-1:x>w-distance?1:0;
 if(!requested){clearEdge();return}
 if(requested===edgeDirection)return;
 clearEdge();edgeDirection=requested;
 if((requested<0&&state.current===0)||(requested>0&&state.current>=5))return;
 edgeTimer=setTimeout(()=>{
  const wanted=edgeDirection;
  edgeTimer=null;edgeDirection=0;
  if(wanted) switchDragPage(wanted);
 },720);
}
function moveHeld(x,y){
 if(!gesture)return;
 gesture.x=x;gesture.y=y;
 if(drag){
  setGhostPosition(x,y);
  reorderAt(x,y);
  edgeAt(x);
  const h=window.innerHeight||700;
  if(y<75)window.scrollBy?.(0,-9);
  else if(y>h-70)window.scrollBy?.(0,9);
 }else if(holdTimer!==null&&Math.hypot(x-gesture.startX,y-gesture.startY)>12)clearHold();
}
function finishDrag(){
 clearHold();clearEdge();
 if(drag){
  commitGridOrder();
  drag.ghost.remove();
  drag=null;
  ignoreClicksUntil=now()+500;
  update();
 }
 gesture=null;
}
function beginHold(id,x,y){
 if(gesture||drag)return;
 gesture={id,startX:x,startY:y,x,y};
 if(editing&&id){activateHeld();return}
 if(!editing){holdTimer=setTimeout(activateHeld,540)}
}
function cancelHold(){
 clearHold();gesture=null;
}
function init(){
 document.addEventListener('click',event=>{
  if(!event.target.closest?.('.home-pages'))return;
  if(now()<ignoreClicksUntil){
   event.preventDefault();event.stopImmediatePropagation();return
  }
  if(action(event.target,event)){
   event.preventDefault();event.stopImmediatePropagation()
  }
 },true);
 // Touch events are used for Safari to keep finger-tracking alive after the
 // long-press rerender, and to stop iOS page scrolling ONLY during a drag.
 document.addEventListener('touchstart',event=>{
  if(!event.target.closest?.('.home-pages'))return;
  const touch=event.touches[0];if(!touch)return;
  const tile=event.target.closest?.('[data-home-tile]');
  const interactive=event.target.closest?.('button,a,input,textarea,select,summary,[role="button"]');
  swipe={x:touch.clientX,y:touch.clientY};
  if(!tile&&interactive)return;
  beginHold(tile?.dataset.homeTile||null,touch.clientX,touch.clientY);
 },{passive:true});
 document.addEventListener('touchmove',event=>{
  if(!event.touches.length)return;
  const touch=event.touches[0];
  if(drag){
   if(event.cancelable)event.preventDefault();
   moveHeld(touch.clientX,touch.clientY);
  }else if(gesture)moveHeld(touch.clientX,touch.clientY);
 },{passive:false});
 document.addEventListener('touchend',event=>{
  const hadDrag=Boolean(drag),hadHold=Boolean(gesture);
  if(hadDrag){finishDrag();swipe=null;return}
  if(hadHold)cancelHold();
  if(!swipe||editing){swipe=null;return}
  const touch=event.changedTouches[0];if(!touch){swipe=null;return}
  const dx=touch.clientX-swipe.x,dy=touch.clientY-swipe.y;swipe=null;
  if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.35){
   const next=Math.max(0,Math.min(state.pages.length-1,state.current+(dx<0?1:-1)));
   if(next!==state.current){state.current=next;update()}
  }
 },{passive:true});
 document.addEventListener('touchcancel',()=>{finishDrag();swipe=null},{passive:true});
 document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0)return;
  if(!event.target.closest?.('.home-pages'))return;
  const tile=event.target.closest?.('[data-home-tile]');
  if(!tile&&event.target.closest?.('button,a,input,textarea,select,summary,[role="button"]'))return;
  beginHold(tile?.dataset.homeTile||null,event.clientX,event.clientY);
 });
 document.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch')return;
  if(gesture)moveHeld(event.clientX,event.clientY);
 });
 document.addEventListener('pointerup',event=>{
  if(event.pointerType==='touch')return;
  if(drag)finishDrag();else cancelHold();
 });
 document.addEventListener('pointercancel',event=>{
  if(event.pointerType!=='touch')finishDrag();
 });
 document.addEventListener('contextmenu',event=>{
  if(!event.target.closest?.('.home-pages'))return;
  if(!event.target.closest?.('[data-home-tile]')&&
   event.target.closest?.('button,a,input,textarea,select,summary,[role="button"]'))return;
  event.preventDefault();
  clearHold();
  if(!editing){editing=true;menu=false;ignoreClicksUntil=now()+450;update()}
 });
 document.addEventListener('dragstart',event=>{
  if(event.target.closest?.('.home-pages [data-home-tile]'))event.preventDefault()
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)finishDrag();
 });
}
export function connectHomeScreen(onChange){change=onChange;init()}
