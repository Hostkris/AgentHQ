// Approved Jordan portrait. Present in the office, Messages, and chat header.
// The image stays still between genuine work states; only eyelids/breathing animate.
(()=>{
 const NS="http://www.w3.org/2000/svg";
 const make=(tag,props={})=>{
  const node=document.createElementNS(NS,tag);
  for(const [name,value] of Object.entries(props))node.setAttribute(name,String(value));
  return node;
 };
 const portrait=()=>{
  const svg=make("svg",{class:"rpg-portrait-svg rpg-jordan-selected",
   "data-portrait-id":"jordan",viewBox:"0 0 80 80",
   "shape-rendering":"crispEdges",role:"img","aria-label":"Jordan approved pixel-art portrait",
   style:"--rpg-delay:-1.21s"});
  const image=make("image",{href:"./jordan-approved-portrait.svg",x:0,y:0,width:80,height:80});
  image.style.imageRendering="pixelated";
  svg.appendChild(image);
  const lids=make("g",{class:"rpg-eyelids"});
  for(const [x,y,w,h,color] of [[34,24,8,4,"#f8943f"],[47,25,7,4,"#b76a38"],[34,27,8,1,"#462621"],[47,28,7,1,"#462621"]]){
    lids.appendChild(make("rect",{x,y,width:w,height:h,fill:color}));
  }
  svg.appendChild(lids);
  const mouth=make("g",{class:"rpg-speaking-mouth"});
  mouth.appendChild(make("rect",{x:39,y:34,width:9,height:5,fill:"#713c2a"}));
  mouth.appendChild(make("rect",{x:41,y:36,width:6,height:1,fill:"#f8a17d"}));
  svg.appendChild(mouth);
  return svg;
 };
 let scheduled=false;
 function update(){
  const targets=[...document.querySelectorAll('[data-rpg-worker="jordan"]'),
   ...document.querySelectorAll('button[data-chat="jordan"] .avatar')];
  const working=window.agentHQActivity?.snapshot?.("jordan")?.some(a=>a.active===true&&a.actor==="jordan")===true;
  for(const el of new Set(targets)){
   let sprite=el.querySelector(".rpg-jordan-selected");
   if(!sprite){
    el.replaceChildren(portrait());
    el.classList.add("rpg-avatar");
    sprite=el.querySelector(".rpg-jordan-selected");
   }
   sprite?.classList.toggle("rpg-speaking",working);
  }
 }
 const request=()=>{
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;update();});
 };
 const root=document.getElementById("app");
 if(!root)return;
 new MutationObserver(request).observe(root,{childList:true,subtree:true});
 window.addEventListener("focus",request);
 document.addEventListener("visibilitychange",request);
 request();
})();