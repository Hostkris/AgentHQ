(()=>{
const ids=["alex","maya","jordan","riley","taylor","casey","morgan","avery","jamie","quinn"];
const people=[
["#855338","#f0c5a4","#303443","#28485f","short","beard"],
["#20172b","#8f533b","#70359d","#ebad4e","long","none"],
["#542d24","#d79b6d","#255f65","#46398b","wavy","none"],
["#221a18","#f2ca9d","#4275a7","#3f754e","curly","glasses"],
["#40302a","#b87958","#a0446c","#4a6592","bob","none"],
["#14121b","#70442f","#b16c32","#f0b855","afro","none"],
["#67412b","#e4b58c","#45856e","#223f60","short","glasses"],
["#131c27","#a46d49","#63468a","#bd874c","braids","none"],
["#49311f","#efd3ae","#345e99","#8a5d95","wavy","none"],
["#31251f","#c4875e","#a45e6c","#287d7c","curly","none"]
];
function image(id){
 const index=Math.max(0,ids.indexOf(id)),p=people[index];
 const [hair,skin,shirt,background,style,detail]=p;
 const r=(x,y,w,h,color)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+color+'"/>';
 let pixels=r(0,0,24,24,background)+r(1,1,22,22,"#ffffff16")+
 r(4,20,16,4,shirt)+r(6,18,12,3,shirt)+r(9,16,6,4,skin)+
 r(6,6,12,12,skin)+r(5,9,2,6,skin)+r(17,9,2,6,skin);
 if(style==="afro"){pixels+=r(4,3,16,8,hair)+r(2,7,4,8,hair)+r(18,7,4,8,hair)+r(7,1,10,4,hair)}
 else if(style==="braids"){pixels+=r(5,4,14,5,hair)+r(4,7,2,12,hair)+r(18,7,2,12,hair)+r(3,12,2,8,hair)+r(19,12,2,8,hair)}
 else if(style==="long"||style==="bob"){pixels+=r(5,3,14,5,hair)+r(4,7,3,12,hair)+r(17,7,3,12,hair)+(style==="long"?r(4,17,3,4,hair)+r(17,17,3,4,hair):"")}
 else if(style==="curly"||style==="wavy"){pixels+=r(5,3,14,5,hair)+r(3,6,4,4,hair)+r(17,5,4,5,hair)+r(7,2,3,3,hair)+r(13,2,4,3,hair)}
 else pixels+=r(5,3,14,6,hair)+r(5,8,3,2,hair)+r(16,8,3,2,hair);
 pixels+=r(8,11,2,2,"#282331")+r(14,11,2,2,"#282331")+r(10,15,4,1,"#934c49");
 if(detail==="glasses")pixels+=r(7,10,5,4,"#262b38")+r(12,11,2,1,"#262b38")+r(14,10,4,4,"#262b38")+r(8,11,3,2,"#cfdfed")+r(15,11,2,2,"#cfdfed");
 if(detail==="beard")pixels+=r(8,15,2,3,hair)+r(14,15,2,3,hair)+r(10,17,4,2,hair);
 pixels+=r(5,21,3,3,"#ffffff35")+r(16,21,3,3,"#ffffff22");
 return '<svg class="rpg-portrait-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" role="img" aria-label="Pixel-art portrait">'+pixels+'</svg>';
}
window.agentHQPortrait=image;
function update(){
 document.querySelectorAll("button[data-chat]").forEach(btn=>{
  const id=btn.dataset.chat;
  if(!ids.includes(id))return;
  const avatar=btn.querySelector(".avatar");
  if(avatar&&!avatar.querySelector(".rpg-portrait-svg")){
   avatar.innerHTML=image(id);avatar.classList.add("rpg-avatar");
  }
 });
 document.querySelectorAll("[data-rpg-worker]").forEach(el=>{
  const id=el.dataset.rpgWorker;
  if(ids.includes(id)&&!el.querySelector(".rpg-portrait-svg"))el.innerHTML=image(id);
 });
}
const root=document.getElementById("app");
if(root){
 new MutationObserver(()=>queueMicrotask(update)).observe(root,{childList:true,subtree:true});
 update();
}
})();