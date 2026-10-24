// Agent HQ Home: iPhone-like swipe navigation and uninterrupted long-press dragging.
// Preferences are local; no external account data is stored here.
const KEY="agenthq-home-layout-v1";
const APPS=[
 ["office","Office","🏢"],["messages","Messages","💬"],["email","Email Center","✉️"],
 ["contacts","Contacts","👥"],["accounts","My Accounts","🔐"],["studio","Worker Studio","🧬"],
 ["assignments","Assignments","📋"],["operations","Operations","📈"],
 ["creative","Creative Desk","🎨"],["hq","Company HQ","🧑‍💼"],
 ["approvals","Approvals","🔐"],["research","Research","🔎"],
 ["browser","Browser","🌐"],["reminders","Reminders","📅"],["camera","Camera","📷"],["settings","Settings","⚙️"]
];
const LABELS={office:"Office",messages:"Messages",email:"Email",contacts:"Contacts",accounts:"Accounts",studio:"Studio",assignments:"Assignments",operations:"Operations",creative:"Creative",hq:"Company HQ",approvals:"Approvals",research:"Research",browser:"Browser",reminders:"Reminders",camera:"Camera",settings:"Settings"};
const valid=new Set(APPS.map(p=>p[0])),kinds=["inbox","approvals","work","research"];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const empty=()=>({apps:[],widgets:[]});
const defaultLayout=()=>({pages:[{apps:APPS.slice(0,12).map(p=>p[0]),widgets:[]},{apps:APPS.slice(12).map(p=>p[0]),widgets:[]}],current:0});
function load(){
 try{
  const data=JSON.parse(localStorage.getItem(KEY)||"null");
  if(!data||!Array.isArray(data.pages)||!data.pages.length)return defaultLayout();
  const seen=new Set(),pages=data.pages.slice(0,6).map(p=>({
   apps:(Array.isArray(p.apps)?p.apps:[]).filter(id=>{if(!valid.has(id)||seen.has(id))return false;seen.add(id);return true}).slice(0,24),
   widgets:(Array.isArray(p.widgets)?p.widgets:[]).filter(k=>kinds.includes(k)).slice(0,4)
  }));
  for(const [id] of APPS)if(!seen.has(id))pages[0].apps.push(id);
  // One-screen legacy installations could not swipe; migrate overfilled layouts.
  if(pages.length===1&&pages[0].apps.length>12)pages.push({apps:pages[0].apps.splice(12),widgets:[]});
  return {pages,current:Math.min(pages.length-1,Math.max(0,Number(data.current)||0))};
 }catch{return defaultLayout()}
}
let state=load(),editing=false,menu=false,change=()=>{};
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
const update=()=>{save();change()};
function tile(id,renderButton){
 const def=APPS.find(p=>p[0]===id);if(!def)return "";
 const html=renderButton(def[1],def[0],def[2])
  .replace('class="tile"','class="tile" data-home-tile="'+id+'"')
  .replace(/(<span class="tile-label">)[\s\S]*?(<\/span>)/,(_f,a,b)=>a+esc(LABELS[id]||def[1])+b);
 return '<div class="home-tile-wrap" data-home-item="'+id+'">'+html+'</div>';
}
function widget(kind,values){
 const c={
  inbox:["Messages","💬",values.messages||0,"Unread messages and approvals","messages"],
  approvals:["Approvals","✅",values.approvals||0,"Requests waiting for your decision","approvals"],
  work:["Assignments","📋",values.assignments||0,"Tasks needing attention","assignments"],
  research:["Research","🔎",values.research||0,"Completed saved research reports","research"]
 }[kind];if(!c)return "";
 return '<div class="home-widget">'+(editing?'<button class="home-widget-remove" type="button" data-home-remove-widget="'+kind+'" aria-label="Remove '+c[0]+' widget">×</button>':"")+
 '<button type="button" class="home-widget-open" data-home-widget-nav="'+c[4]+'"><span class="home-widget-name">'+c[1]+' '+c[0]+'</span><strong class="home-widget-count">'+Number(c[2])+'</strong><small>'+c[3]+'</small></button></div>';
}
function slide(index,renderButton,values){
 const page=state.pages[index]||empty();
 return '<section class="home-slide" data-home-slide="'+index+'" aria-label="Home page '+(index+1)+'"><div class="grid home-dashboard'+(editing?" home-is-editing":"")+'" role="navigation" aria-label="Home apps">'+page.apps.map(id=>tile(id,renderButton)).join("")+'</div>'+
 (page.widgets.length?'<div class="home-widgets">'+page.widgets.map(k=>widget(k,values)).join("")+'</div>':"")+'</section>';
}
let lastRenderButton=null,lastValues={};
export function renderHomeScreen(renderButton,values={}){
 lastRenderButton=renderButton;lastValues=values;
 const paging=state.pages.map((_p,i)=>'<button type="button" data-home-page="'+i+'" class="home-page-dot'+(i===state.current?" active":"")+'" aria-label="Home page '+(i+1)+'" aria-current="'+(i===state.current?"page":"false")+'"></button>').join("");
 return '<section class="home-pages" aria-label="Home Screen">'+
 (editing?'<div class="home-toolbar is-editing"><button type="button" data-home-widget-menu class="home-add-widget-circle" aria-label="Add a widget">+</button><button type="button" data-home-edit class="home-edit-toggle">Done</button></div>':"")+
 '<div class="home-slide-viewport"><div class="home-slide-track" style="transform:translate3d(-'+(state.current*100)+'%,0,0)">'+state.pages.map((_p,i)=>slide(i,renderButton,values)).join("")+'</div></div>'+
 (editing?'<div class="home-widget-picker">'+
 (menu?'<div class="home-widget-choices">'+kinds.map(k=>'<button type="button" data-home-add-widget="'+k+'">'+esc(k==="work"?"Assignments":k==="inbox"?"Messages":k==="research"?"Research":"Approvals")+'</button>').join("")+'</div>':"")+
 (state.pages.length<6?'<button type="button" data-home-add-page>+ Add Home Page</button>':"")+
 (state.pages.length>1?'<button type="button" data-home-remove-page>Remove Empty Page</button>':"")+'</div>':"")+
 '<div class="home-page-navigation"><div class="home-page-dots">'+paging+'</div></div></section>';
}
const root=()=>document.querySelector(".home-pages");
const track=()=>root()?.querySelector(".home-slide-track");
const gridAt=i=>root()?.querySelector('[data-home-slide="'+i+'"] .home-dashboard');
const clock=()=>Date.now();
let gesture=null,drag=null,holdTimer=null,edgeTimer=null,edgeDirection=0,ignoreClicksUntil=0,swipe=null,frame=0;
const reflows=new WeakMap();let dropping=false;
const reducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
export const homeDragInProgress=()=>Boolean(gesture||drag||dropping||swipe?.moving);
function clearHold(){if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null}}
function clearEdge(){if(edgeTimer!==null){clearTimeout(edgeTimer);edgeTimer=null}edgeDirection=0}
function setTrackPosition(page,animate=true,offset=0){
 const el=track();if(!el)return;
 el.style.transition=animate&&!reducedMotion()?"transform .46s cubic-bezier(.22,.72,.22,1)":"none";
 el.style.transform='translate3d(calc(-'+(page*100)+'% + '+offset+'px),0,0)';
}
function showPage(index,animated=true){
 state.current=Math.max(0,Math.min(state.pages.length-1,index));save();
 setTrackPosition(state.current,animated);
 for(const dot of root()?.querySelectorAll("[data-home-page]")||[]){
  const current=Number(dot.dataset.homePage)===state.current;
  dot.classList.toggle("active",current);
  dot.setAttribute("aria-current",current?"page":"false");
 }
}
function action(target){
 if(target.closest('[data-home-edit]')){finishDrag();editing=false;menu=false;update();return true}
 const page=target.closest('[data-home-page]');
 if(page){if(!drag)showPage(Number(page.dataset.homePage));return true}
 const add=target.closest('[data-home-add-page]');
 if(add){if(state.pages.length<6){state.pages.push(empty());state.current=state.pages.length-1;update()}return true}
 if(target.closest('[data-home-remove-page]')){
  const page=state.pages[state.current];
  if(state.pages.length<=1)return true;
  if(page.apps.length||page.widgets.length){window.alert('Move the apps and remove widgets before removing this page.');return true}
  state.pages.splice(state.current,1);state.current=Math.min(state.current,state.pages.length-1);update();return true
 }
 if(target.closest('[data-home-widget-menu]')){menu=!menu;update();return true}
 const addWidget=target.closest('[data-home-add-widget]');
 if(addWidget){const kind=addWidget.dataset.homeAddWidget,p=state.pages[state.current];if(kinds.includes(kind)&&p.widgets.length<4&&!p.widgets.includes(kind))p.widgets.push(kind);menu=false;update();return true}
 const removeWidget=target.closest('[data-home-remove-widget]');
 if(removeWidget){const p=state.pages[state.current];p.widgets=p.widgets.filter(k=>k!==removeWidget.dataset.homeRemoveWidget);update();return true}
 const widgetLink=target.closest('[data-home-widget-nav]');
 if(widgetLink){if(!editing){const button=document.createElement('button');button.dataset.nav=widgetLink.dataset.homeWidgetNav;document.querySelector('#app')?.append(button);button.click();button.remove()}return true}
 return Boolean(editing&&target.closest('[data-home-tile]'));
}
function sourceTile(){return drag?.source||null}
function animateReflow(grid,before){
 for(const el of grid.querySelectorAll(':scope > [data-home-item]')){
  if(el===sourceTile())continue;
  const first=before.get(el);if(!first)continue;
  const previous=reflows.get(el);if(previous)previous.cancel();
  const next=el.getBoundingClientRect();
  const dx=first.left-next.left,dy=first.top-next.top;
  if(Math.abs(dx)+Math.abs(dy)<1)continue;
  if(!reducedMotion()&&typeof el.animate==='function'){
   const animation=el.animate([{transform:'translate3d('+dx+'px,'+dy+'px,0)'},{transform:'translate3d(0,0,0)'}],
    {duration:330,easing:'cubic-bezier(.2,.75,.2,1)'});
   reflows.set(el,animation);
  }
 }
}
function animateGhost(){
 frame=0;if(!drag)return;
 drag.ghost.style.transform='translate3d('+(drag.x-drag.offsetX)+'px,'+(drag.y-drag.offsetY)+'px,0) scale(1.07)';
 reorderAt(drag.x,drag.y);edgeAt(drag.x);
}
function setGhostPosition(x,y){if(!drag)return;drag.x=x;drag.y=y;if(!frame)frame=requestAnimationFrame(animateGhost)}
function activateHeld(){
 if(!gesture||swipe?.moving)return;
 clearHold();editing=true;menu=false;ignoreClicksUntil=clock()+800;
 const id=gesture.id,source=gesture.element;
 if(!id||!source?.isConnected){update();return}
 const rect=source.getBoundingClientRect(),ghost=source.cloneNode(true);
 ghost.removeAttribute('data-home-item');ghost.querySelector('[data-home-tile]')?.removeAttribute('data-home-tile');
 ghost.classList.add('home-drag-ghost');ghost.setAttribute('aria-hidden','true');
 ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';
 document.body.append(ghost);
 // Do not redraw the held element: Safari would cancel its original touch stream.
 root()?.querySelectorAll('.home-dashboard').forEach(g=>g.classList.add('home-is-editing'));
 drag={id,source,ghost,offsetX:gesture.startX-rect.left,offsetY:gesture.startY-rect.top,x:gesture.x,y:gesture.y};
 source.classList.add('home-drag-placeholder');
 setGhostPosition(gesture.x,gesture.y);
 if(navigator.vibrate)try{navigator.vibrate(10)}catch{}
}
function reorderAt(x,y){
 if(!drag)return;
 const grid=gridAt(state.current),source=sourceTile();if(!grid||!grid.contains(source))return;
 const under=document.elementFromPoint(x,y);
 const hovered=under?.closest?.('.home-dashboard [data-home-item]');
 const bounds=grid.getBoundingClientRect();
 if(x<bounds.left-12||x>bounds.right+12||y<bounds.top-12||y>bounds.bottom+12)return;
 const all=[...grid.querySelectorAll(':scope > [data-home-item]')];
 // Ignore neighbors' temporary animation transforms when choosing a drop slot.
 let target=hovered,distance=Infinity;
 for(const item of all){
  if(!item.offsetWidth)continue;
  const cx=bounds.left+item.offsetLeft+item.offsetWidth/2,cy=bounds.top+item.offsetTop+item.offsetHeight/2;
  const d=Math.hypot(x-cx,y-cy);if(d<distance){target=item;distance=d}
 }
 if(!target||target===source||!grid.contains(target))return;
 const from=all.indexOf(source),to=all.indexOf(target);if(from<0||to<0)return;
 const before=new Map(all.map(el=>[el,el.getBoundingClientRect()]));
 if(from<to)target.after(source);else target.before(source);
 animateReflow(grid,before);
}
function commitGridOrders(){
 for(let i=0;i<state.pages.length;i++){
  const grid=gridAt(i);if(grid)state.pages[i].apps=[...grid.querySelectorAll(':scope > [data-home-item]')].map(e=>e.dataset.homeItem).filter(valid.has.bind(valid));
 }
}
function switchDragPage(direction){
 if(!drag)return;
 const next=state.current+direction;
 if(next<0||next>=6)return;
 if(next===state.pages.length){
  state.pages.push(empty());
  const slideDOM=document.createElement('section');
  slideDOM.className='home-slide';slideDOM.dataset.homeSlide=String(next);slideDOM.setAttribute('aria-label','Home page '+(next+1));
  slideDOM.innerHTML='<div class="grid home-dashboard home-is-editing" role="navigation" aria-label="Home apps"></div>';
  track()?.append(slideDOM);
 }
 const src=gridAt(state.current),dst=gridAt(next),source=sourceTile();
 if(!src||!dst||!source)return;
 const before=new Map([...dst.children].map(el=>[el,el.getBoundingClientRect()]));
 if(direction>0)dst.prepend(source);else dst.append(source);
 animateReflow(dst,before);
 commitGridOrders();
 showPage(next,true);setGhostPosition(drag.x,drag.y);
}
function edgeAt(x){
 if(!drag)return;
 const w=window.innerWidth||390,band=Math.max(30,Math.min(55,w*.12));
 const wanted=x<band?-1:x>w-band?1:0;
 if(!wanted){clearEdge();return}
 if(wanted===edgeDirection)return;
 clearEdge();edgeDirection=wanted;
 if((wanted<0&&state.current===0)||(wanted>0&&state.current>=5))return;
 edgeTimer=setTimeout(()=>{const direction=edgeDirection;clearEdge();if(direction) switchDragPage(direction)},550);
}
function moveHeld(x,y){
 if(!gesture)return;
 gesture.x=x;gesture.y=y;
 if(drag){setGhostPosition(x,y);return}
 const dx=x-gesture.startX,dy=y-gesture.startY;
 if(holdTimer!==null&&Math.hypot(dx,dy)>10)clearHold();
}
function finishDrag(){
 clearHold();clearEdge();
 if(frame){cancelAnimationFrame(frame);frame=0}
 if(drag){
  reorderAt(drag.x,drag.y);commitGridOrders();const held=drag,slot=held.source.getBoundingClientRect();
  drag=null;dropping=true;ignoreClicksUntil=clock()+350;gesture=null;
  const finish=()=>{held.source.classList.remove('home-drag-placeholder');held.ghost.remove();dropping=false;update()};
  if(!reducedMotion()&&typeof held.ghost.animate==='function'){
   held.ghost.animate([{transform:held.ghost.style.transform},{transform:'translate3d('+slot.left+'px,'+slot.top+'px,0) scale(1)'}],{duration:210,easing:'cubic-bezier(.22,.85,.25,1)',fill:'forwards'}).finished.then(finish,finish);
  }else finish();
  return;
 }
 gesture=null;
}
function startHold(tile,x,y){
 if(gesture||drag||dropping)return;
 gesture={id:tile?.dataset.homeTile||null,element:tile?.closest('[data-home-item]')||null,startX:x,startY:y,x,y};
 if(editing&&gesture.id)activateHeld();
 else if(!editing&&gesture.id)holdTimer=setTimeout(activateHeld,480);
}
function cancelHold(){clearHold();gesture=null}
function startSwipe(x,y){
 swipe={x,y,lastX:x,lastY:y,lastTime:clock(),moving:false};
}
function progressSwipe(x,y,event){
 if(!swipe||drag||editing)return;
 const dx=x-swipe.x,dy=y-swipe.y;
 if(!swipe.moving){
  if(Math.abs(dx)<9&&Math.abs(dy)<9)return;
  if(Math.abs(dx)<=Math.abs(dy)*1.15){swipe=null;return}
  swipe.moving=true;cancelHold();
 }
 if(event?.cancelable)event.preventDefault();
 const w=root()?.clientWidth||window.innerWidth||390;
 let offset=dx;
 if((state.current===0&&dx>0)||(state.current===state.pages.length-1&&dx<0))offset=dx*.24;
 setTrackPosition(state.current,false,offset);
 swipe.lastX=x;swipe.lastTime=clock();
}
function finishSwipe(x,y){
 if(!swipe)return;
 const s=swipe;swipe=null;
 if(!s.moving)return;
 const dx=x-s.x,w=root()?.clientWidth||window.innerWidth||390;
 const direction=Math.abs(dx)>Math.min(60,w*.17)?(dx<0?1:-1):0;
 showPage(state.current+direction,true);
 ignoreClicksUntil=clock()+350;
}
let connected=false;
function init(){
 if(connected)return;connected=true;
 document.addEventListener('click',event=>{
  if(!event.target.closest?.('.home-pages'))return;
  if(clock()<ignoreClicksUntil&&!event.target.closest?.('[data-home-edit]')){event.preventDefault();event.stopImmediatePropagation();return}
  if(action(event.target)){event.preventDefault();event.stopImmediatePropagation()}
 },true);
 document.addEventListener('touchstart',event=>{
  if(!event.target.closest?.('.home-pages'))return;
  if(event.touches.length!==1){finishDrag();swipe=null;return}
  const t=event.touches[0],tile=event.target.closest?.('[data-home-tile]');
  const interactive=event.target.closest?.('input,textarea,select,summary,[data-home-edit],[data-home-add-page],[data-home-page],[data-home-widget-menu],[data-home-widget-nav],[data-home-add-widget],[data-home-remove-widget],[data-home-remove-page]');
  if(interactive)return;
  startSwipe(t.clientX,t.clientY);
  if(tile)startHold(tile,t.clientX,t.clientY);
 },{passive:true});
 document.addEventListener('touchmove',event=>{
  const t=event.touches[0];if(!t)return;
  if(drag){if(event.cancelable)event.preventDefault();moveHeld(t.clientX,t.clientY)}
  else{if(gesture)moveHeld(t.clientX,t.clientY);progressSwipe(t.clientX,t.clientY,event)}
 },{passive:false});
 document.addEventListener('touchend',event=>{
  const t=event.changedTouches[0],hadDrag=!!drag;
  if(hadDrag){finishDrag();swipe=null;return}
  if(gesture)cancelHold();
  if(t)finishSwipe(t.clientX,t.clientY);else swipe=null;
 },{passive:true});
 document.addEventListener('touchcancel',()=>{finishDrag();swipe=null;setTrackPosition(state.current,true)},{passive:true});
 document.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||event.button!==0||!event.target.closest?.('.home-pages'))return;
  const tile=event.target.closest('[data-home-tile]');if(tile)startHold(tile,event.clientX,event.clientY);
 });
 document.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch')return;if(gesture)moveHeld(event.clientX,event.clientY);
 });
 document.addEventListener('pointerup',event=>{if(event.pointerType==='touch')return;if(drag)finishDrag();else cancelHold()});
 document.addEventListener('pointercancel',event=>{if(event.pointerType!=='touch')finishDrag()});
 document.addEventListener('contextmenu',event=>{
  const tile=event.target.closest?.('.home-pages [data-home-tile]');if(!tile)return;
  event.preventDefault();if(!drag){if(!gesture)startHold(tile,event.clientX,event.clientY);activateHeld()}
 });
 document.addEventListener('dragstart',event=>{if(event.target.closest?.('.home-pages [data-home-tile]'))event.preventDefault()});
 document.addEventListener('keydown',event=>{
  if(!root())return;
  if(event.key==='Escape'){finishDrag();editing=false;menu=false;update();return}
  const tile=event.target.closest?.('[data-home-tile]');
  if(!tile||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const grid=gridAt(state.current),element=tile.closest('[data-home-item]'),items=[...grid.children],from=items.indexOf(element);
  const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-4,ArrowDown:4}[event.key],to=Math.max(0,Math.min(items.length-1,from+step));
  if(from<to)items[to].after(element);else if(from>to)items[to].before(element);
  commitGridOrders();save();tile.focus();
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){finishDrag();swipe=null}});
}
export function connectHomeScreen(onChange){change=onChange;init()}

