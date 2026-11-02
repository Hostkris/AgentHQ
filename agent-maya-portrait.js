// Approved Maya portrait overlay for Agent HQ shared profile surfaces.
(()=>{
 const namespace="http://www.w3.org/2000/svg";
 function rect(group,x,y,width,height,fill){
  const r=document.createElementNS(namespace,"rect");
  for(const [k,v] of Object.entries({x,y,width,height,fill}))r.setAttribute(k,String(v));
  group.appendChild(r);
 }
 function createPortrait(){
  const svg=document.createElementNS(namespace,"svg");
  svg.setAttribute("class","rpg-portrait-svg rpg-maya-selected");
  svg.setAttribute("data-portrait-id","maya");
  svg.setAttribute("style","--rpg-delay:-.82s");
  svg.setAttribute("viewBox","0 0 64 64");
  svg.setAttribute("shape-rendering","crispEdges");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Maya approved pixel portrait");
  const photo=document.createElementNS(namespace,"image");
  photo.setAttribute("href","./maya-approved-portrait.svg");
  photo.setAttribute("width","64");photo.setAttribute("height","80");
  photo.setAttribute("x","0");photo.setAttribute("y","0");
  photo.style.imageRendering="pixelated";
  svg.appendChild(photo);
  const lids=document.createElementNS(namespace,"g");
  lids.setAttribute("class","rpg-eyelids");
  rect(lids,30,27,5,2,"#c47a46");rect(lids,40,27,5,2,"#c47a46");
  svg.appendChild(lids);
  const speech=document.createElementNS(namespace,"g");
  speech.setAttribute("class","rpg-speaking-mouth");
  rect(speech,34,35,5,2,"#8c3b2f");rect(speech,35,37,3,1,"#efad87");
  svg.appendChild(speech);
  return svg;
 }
 function update(){
  const targets=[
   ...document.querySelectorAll('[data-rpg-worker="maya"]'),
   ...document.querySelectorAll('button[data-chat="maya"] .avatar')
  ];
  for(const target of new Set(targets)){
   if(!target.querySelector(".rpg-maya-selected")){
    target.replaceChildren(createPortrait());
    target.classList.add("rpg-avatar");
   }
   const active=window.agentHQActivity?.snapshot?.("maya")?.some(s=>s.active===true&&s.actor==="maya")===true;
   target.querySelector(".rpg-maya-selected")?.classList.toggle("rpg-speaking",active);
  }
 }
 const app=document.getElementById("app");if(!app)return;
 let queued=false;
 const schedule=()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;update()});
 };
 new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("focus",schedule);
 document.addEventListener("visibilitychange",schedule);
 schedule();
})();
