// Owner-approved Taylor portrait. Shared animated avatar in Messages and Office.
// Uses the same pixel-art blink and speaking classes as other Agent HQ workers.
(()=>{
 const NS="http://www.w3.org/2000/svg";
 function make(tag,attributes={}){
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attributes))
   node.setAttribute(key,String(value));
  return node;
 }
 function portrait(){
  const svg=make("svg",{
   class:"rpg-portrait-svg rpg-taylor-selected",
   "data-portrait-id":"taylor",
   style:"--rpg-delay:-2.06s",
   viewBox:"0 0 80 80",
   "shape-rendering":"crispEdges",
   role:"img",
   "aria-label":"Taylor approved pixel portrait"
  });
  const image=make("image",{
   href:"./taylor-approved-portrait.svg",
   x:0,y:0,width:80,height:80
  });
  image.style.imageRendering="pixelated";
  svg.appendChild(image);
  const eyes=make("g",{class:"rpg-eyelids"});
  for(const [x,y,w,h,fill] of [
   [35,23,6,2,"#c98553"],[46,23,5,2,"#c98553"],
   [36,25,5,1,"#6e3527"],[46,25,5,1,"#6e3527"]
  ])eyes.appendChild(make("rect",{x,y,width:w,height:h,fill}));
  svg.appendChild(eyes);
  const mouth=make("g",{class:"rpg-speaking-mouth"});
  mouth.appendChild(make("rect",{x:41,y:30,width:6,height:3,fill:"#7b403a"}));
  mouth.appendChild(make("rect",{x:42,y:32,width:4,height:1,fill:"#c67968"}));
  svg.appendChild(mouth);
  return svg;
 }
 let requested=false;
 function update(){
  const targets=[
   ...document.querySelectorAll('[data-rpg-worker="taylor"]'),
   ...document.querySelectorAll('button[data-chat="taylor"] .avatar')
  ];
  const active=window.agentHQActivity?.snapshot?.("taylor")?.some(
   item=>item.active===true&&item.actor==="taylor"
  )===true;
  for(const container of new Set(targets)){
   let sprite=container.querySelector(".rpg-taylor-selected");
   if(!sprite){
    container.replaceChildren(portrait());
    container.classList.add("rpg-avatar");
    sprite=container.querySelector(".rpg-taylor-selected");
   }
   sprite?.classList.toggle("rpg-speaking",active);
  }
 }
 function schedule(){
  if(requested)return;
  requested=true;
  requestAnimationFrame(()=>{
   requested=false;
   update();
  });
 }
 const app=document.getElementById("app");
 if(!app)return;
 new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
 window.addEventListener("focus",schedule);
 document.addEventListener("visibilitychange",schedule);
 schedule();
})();