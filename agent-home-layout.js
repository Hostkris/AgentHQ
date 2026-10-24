// iPhone-style editable Agent HQ Home Screen.
// Layout and widgets are preferences local to this browser; work data remains in Supabase.
const KEY="agenthq-home-layout-v1";
const APPS=[
 ["office","Office","🏢"],["messages","Messages","💬"],["email","Email Center","✉️"],
 ["contacts","Contacts","👥"],["accounts","My Accounts","🔐"],["studio","Worker Studio","🧬"],
 ["assignments","Assignments","📋"],["operations","Operations","📈"],
 ["creative","Creative Desk","🎨"],["hq","Company HQ","🧑‍💼"],
 ["approvals","Approvals","🔐"],["research","Research","🔎"],
 ["browser","Browser","🌐"],["reminders","Reminders","📅"],["settings","Settings","⚙️"]
];
// Compact icon captions only. Full names stay in accessibility labels and navigation.
const HOME_LABELS=Object.freeze({
 office:"Office",messages:"Messages",email:"Email",contacts:"Contacts",
 accounts:"Accounts",studio:"Studio",assignments:"Assignments",operations:"Operations",
 creative:"Creative",hq:"Company HQ",approvals:"Approvals",research:"Research",
 browser:"Browser",reminders:"Reminders",settings:"Settings"
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
  .replace('class="tile"','class="tile" data-home-tile="'+id+'" '+(editing?'draggable="true"':''))
  .replace(/(<span class="tile-label">)[\s\S]*?(<\/span>)/,
   (_full,open,close)=>open+escapeHTML(HOME_LABELS[id]||def[1])+close);
 return '<div class="home-tile-wrap">'+html+
  (editing?'<div class="home-edit-arrows">'+
   '<button type="button" data-home-shift="-1" data-home-id="'+id+'" aria-label="Move '+def[1]+' left">‹</button>'+
   '<button type="button" data-home-shift="1" data-home-id="'+id+'" aria-label="Move '+def[1]+' right">›</button>'+
   (state.pages.length>1?'<button type="button" data-home-next-page="'+id+'" aria-label="Move '+def[1]+' to next page">⇥</button>':'')+
   '</div>':'')+'</div>';
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
 const edit=target.closest('[data-home-edit]');if(edit){editing=!editing;menu=false;update();return true}
 const page=target.closest('[data-home-page]');if(page){state.current=Number(page.dataset.homePage);update();return true}
 const nav=target.closest('[data-home-nav]');if(nav){state.current=Math.max(0,Math.min(state.pages.length-1,state.current+Number(nav.dataset.homeNav)));update();return true}
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
 const shift=target.closest('[data-home-shift]');if(shift){
  const id=shift.dataset.homeId,p=state.pages[state.current],index=p.apps.indexOf(id),to=index+Number(shift.dataset.homeShift);
  if(index>=0&&to>=0&&to<p.apps.length)move(id,state.current,to);
  else if(index>=0&&to>=p.apps.length&&state.current<state.pages.length-1)move(id,state.current+1,0);
  else if(index===0&&to<0&&state.current>0)move(id,state.current-1,state.pages[state.current-1].apps.length);
  return true
 }
 const next=target.closest('[data-home-next-page]');if(next){
  if(state.pages.length>1)move(next.dataset.homeNextPage,(state.current+1)%state.pages.length,0);
  return true
 }
 const widgetLink=target.closest('[data-home-widget-nav]');if(widgetLink){
  const id=widgetLink.dataset.homeWidgetNav;
  if(!editing){const button=document.createElement('button');button.dataset.nav=id;document.querySelector('#app')?.append(button);button.click();button.remove()}
  return true
 }
 const tile=target.closest('[data-home-tile]');
 if(tile&&editing)return true;
 return false;
}
let dragId=null,longTimer=null,origin=null,suppressClick=false;
function init(){
 document.addEventListener('click',e=>{
  if(!e.target.closest?.('.home-pages'))return;
  if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();return}
  if(action(e.target,e)){e.preventDefault();e.stopImmediatePropagation()}
 },true);
 document.addEventListener('pointerdown',e=>{
  const tile=e.target.closest?.('.home-pages [data-home-tile]');
  const blank=e.target.closest?.('.home-pages .home-dashboard');
  // Like iOS, a long press on an icon OR empty grid space enters jiggle mode.
  // Never intercept widget controls, navigation, or accessibility buttons.
  if((!tile&&!blank)||e.target.closest('[data-home-shift],[data-home-next-page],[data-home-page],[data-home-widget-nav]'))return;
  dragId=tile?.dataset.homeTile||null;origin={x:e.clientX,y:e.clientY};
  if(!editing){
   longTimer=setTimeout(()=>{
    editing=true;menu=false;suppressClick=true;
    if(navigator.vibrate)navigator.vibrate(12);
    update();
   },550);
  }
 });
 document.addEventListener('pointermove',e=>{
  if(!origin)return;
  if(Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>10&&longTimer){clearTimeout(longTimer);longTimer=null}
 });
 document.addEventListener('pointerup',e=>{
  if(longTimer){clearTimeout(longTimer);longTimer=null}
  if(editing&&dragId&&origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>28){
   const dest=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-home-tile]');
   if(dest&&dest.dataset.homeTile!==dragId){
    const p=state.pages[state.current];move(dragId,state.current,p.apps.indexOf(dest.dataset.homeTile));
    suppressClick=true;
   }
  }
  dragId=null;origin=null;
 });
 document.addEventListener('pointercancel',()=>{if(longTimer)clearTimeout(longTimer);longTimer=null;dragId=null;origin=null});
 document.addEventListener('contextmenu',e=>{
  const surface=e.target.closest?.('.home-pages .home-dashboard');
  if(surface){e.preventDefault();editing=true;menu=false;suppressClick=true;update()}
 });
 document.addEventListener('dragstart',e=>{
  const tile=e.target.closest?.('.home-pages [data-home-tile]');
  if(tile&&editing){dragId=tile.dataset.homeTile;if(e.dataTransfer)e.dataTransfer.setData('text/plain',dragId)}
 });
 document.addEventListener('dragover',e=>{if(editing&&e.target.closest?.('.home-pages [data-home-tile]'))e.preventDefault()});
 document.addEventListener('drop',e=>{
  const to=e.target.closest?.('.home-pages [data-home-tile]');if(!editing||!to||!dragId)return;
  e.preventDefault();move(dragId,state.current,state.pages[state.current].apps.indexOf(to.dataset.homeTile));dragId=null;
 });
 let swipe=null;
 document.addEventListener('touchstart',e=>{
  if(editing||!e.target.closest?.('.home-pages'))return;
  const t=e.touches[0];swipe={x:t.clientX,y:t.clientY};
 },{passive:true});
 document.addEventListener('touchend',e=>{
  if(!swipe||editing){swipe=null;return}
  const t=e.changedTouches[0],dx=t.clientX-swipe.x,dy=t.clientY-swipe.y;swipe=null;
  if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dy)*1.4){
   const next=Math.min(state.pages.length-1,Math.max(0,state.current+(dx<0?1:-1)));
   if(next!==state.current){state.current=next;update()}
  }
 },{passive:true});
}
export function connectHomeScreen(onChange){change=onChange;init()}
