// Approved Riley portrait for Agent HQ's existing worker identity.
// Show in the office and Messages; lip movement follows verified worker activity.
(()=>{
 const NS="http://www.w3.org/2000/svg";
 const make=(name,attrs={})=>{
  const el=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
  return el;
 };
 function create(){
  const svg=make("svg",{
   class:"rpg-portrait-svg rpg-riley-selected",
   "data-portrait-id":"riley",
   style:"--rpg-delay:-1.67s",
   viewBox:"0 0 80 80", "shape-rendering":"crispEdges",
   role:"img","aria-label":"Riley approved pixel portrait"
  });
  const base=make("image",{href:"./riley-approved-portrait.svg",x:0,y:0,width:80,height:80});
  base.style.imageRendering="pixelated";
  svg.appendChild(base);
  const lids=make("g",{class:"rpg-eyelids"});
  // Place pixel eyelids directly over Riley's real eyes, leaving the headwrap untouched.
  for(const [x,y,width,height,fill] of [
   [34,27,7,2,"#b95b27"],[45,27,6,2,"#ae5727"],
   [35,28,6,1,"#733b25"],[46,28,5,1,"#733b25"]
  ])lids.appendChild(make("rect",{x,y,width,height,fill}));
  svg.appendChild(lids);
  const speech=make("g",{class:"rpg-speaking-mouth"});
  speech.appendChild(make("rect",{x:39,y:36,width:6,height:3,fill:"#6b3028"}));
  speech.appendChild(make("rect",{x:40,y:38,width:4,height:1,fill:"#d78873"}));
  svg.appendChild(speech);
  return svg;
 }
 let scheduled=false;
 function update(){
  const targets=[...document.querySelectorAll('[data-rpg-worker="riley"]'),
   ...document.querySelectorAll('button[data-chat="riley"] .avatar')];
  const working=window.agentHQActivity?.snapshot?.("riley")?.some(a=>a.active===true&&a.actor==="riley")===true;
  for(const root of new Set(targets)){
   let sprite=root.querySelector(".rpg-riley-selected");
   if(!sprite){
    root.replaceChildren(create());
    root.classList.add("rpg-avatar");
    sprite=root.querySelector(".rpg-riley-selected");
   }
   sprite?.classList.toggle("rpg-speaking",working);
  }
 }
 function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;update();});
 }
 const app=document.getElementById("app");if(!app)return;
 new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("focus",schedule);
 document.addEventListener("visibilitychange",schedule);
 schedule();
})();