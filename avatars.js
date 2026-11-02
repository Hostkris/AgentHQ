(()=>{
const ids=["alex","maya","jordan","riley","taylor","casey","morgan","avery","jamie","quinn"];
function workerId(value){const key=String(value||"");if(ids.includes(key))return key;const bot=window.agentHQBotStudioSnapshot?.rows?.find(b=>b.id===key)||[];return bot.template_key==="eleanor-secretary-v1"?"eleanor":key;}
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
 const known=ids.indexOf(id);
 const key=workerId(id);
 let hash=0;for(const code of key){hash=(hash*33+code.codePointAt(0))>>>0}
 const eleanor=key==="eleanor"||/^eleanor(?:-|$)/i.test(key);
 const index=eleanor?3:known>=0?known:hash%people.length,p=people[index];
 const [hair,skin,shirt,background,style,detail]=eleanor?["#35201e","#edb48a","#29395f","#e9dfd3","updo","glasses"]:p;
 if(key==="alex")return '<svg class="rpg-portrait-svg rpg-alex-selected" data-portrait-id="alex" style="--rpg-delay:-.4s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges" role="img" aria-label="Alex approved pixel-art portrait">'+
 '<image href="./alex-approved-portrait.svg" x="-6" y="-5" width="75" height="75" preserveAspectRatio="none" style="image-rendering:pixelated"/>'+
 '<g class="rpg-eyelids"><rect x="25" y="22" width="5" height="2" fill="#b86b34"/><rect x="38" y="22" width="5" height="2" fill="#b86b34"/></g>'+
 '<g class="rpg-speaking-mouth"><rect x="30" y="30" width="7" height="3" fill="#4a2421"/><rect x="31" y="32" width="5" height="1" fill="#a75846"/></g></svg>';

 if(eleanor)return '<svg class="rpg-portrait-svg rpg-eleanor-selected" data-portrait-id="eleanor" style="--rpg-delay:-1.25s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges" role="img" aria-label="Eleanor selected pixel portrait">'+
 '<image href="./eleanor-selected-portrait.svg" x="0" y="0" width="64" height="64" preserveAspectRatio="none"/>'+
 '<g class="rpg-eyelids"><rect x="23" y="29" width="7" height="2" fill="#d69c78"/><rect x="35" y="29" width="7" height="2" fill="#d69c78"/></g>'+
 '<g class="rpg-speaking-mouth"><rect x="30" y="38" width="5" height="2" fill="#8f4941"/><rect x="31" y="40" width="3" height="1" fill="#ecb8a8"/></g></svg>';

 const r=(x,y,w,h,color)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+color+'"/>';
 let pixels=r(0,0,24,24,background)+r(1,1,22,22,"#ffffff16")+
 r(4,20,16,4,shirt)+r(6,18,12,3,shirt)+r(9,16,6,4,skin)+
 r(6,6,12,12,skin)+r(5,9,2,6,skin)+r(17,9,2,6,skin);
 if(style==="updo"){pixels+=r(4,3,16,7,hair)+r(6,1,10,4,hair)+r(3,7,4,7,hair)+r(17,7,4,7,hair)+r(5,14,2,4,hair)+r(17,14,2,4,hair)+r(8,20,8,2,"#f6eddf");}
 else if(style==="afro"){pixels+=r(4,3,16,8,hair)+r(2,7,4,8,hair)+r(18,7,4,8,hair)+r(7,1,10,4,hair)}
 else if(style==="braids"){pixels+=r(5,4,14,5,hair)+r(4,7,2,12,hair)+r(18,7,2,12,hair)+r(3,12,2,8,hair)+r(19,12,2,8,hair)}
 else if(style==="long"||style==="bob"){pixels+=r(5,3,14,5,hair)+r(4,7,3,12,hair)+r(17,7,3,12,hair)+(style==="long"?r(4,17,3,4,hair)+r(17,17,3,4,hair):"")}
 else if(style==="curly"||style==="wavy"){pixels+=r(5,3,14,5,hair)+r(3,6,4,4,hair)+r(17,5,4,5,hair)+r(7,2,3,3,hair)+r(13,2,4,3,hair)}
 else pixels+=r(5,3,14,6,hair)+r(5,8,3,2,hair)+r(16,8,3,2,hair);
 pixels+='<g class="rpg-eye-pixels">'+r(8,11,2,2,"#282331")+r(14,11,2,2,"#282331")+'</g>'+
 '<g class="rpg-eyelids">'+r(8,11,2,2,skin)+r(14,11,2,2,skin)+'</g>'+
 '<g class="rpg-mouth-pixels">'+r(10,15,4,1,"#934c49")+'</g>'+
 '<g class="rpg-speaking-mouth">'+r(11,15,2,2,"#77383c")+r(11,16,2,1,"#e8a0a1")+'</g>';
 if(detail==="glasses")pixels+=r(7,10,5,4,"#262b38")+r(12,11,2,1,"#262b38")+r(14,10,4,4,"#262b38")+r(8,11,3,2,"#cfdfed")+r(15,11,2,2,"#cfdfed");
 if(eleanor)pixels+=r(4,22,16,2,"#27344f")+r(5,21,3,1,"#f4e8d5")+r(16,21,3,1,"#f4e8d5");
 if(detail==="beard")pixels+=r(8,15,2,3,hair)+r(14,15,2,3,hair)+r(10,17,4,2,hair);
 pixels+=r(5,21,3,3,"#ffffff35")+r(16,21,3,3,"#ffffff22");
 return '<svg class="rpg-portrait-svg" data-portrait-id="'+key+'" style="--rpg-delay:-'+(index*.41)+'s" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges" role="img" aria-label="Pixel-art portrait">'+pixels+'</svg>';
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
  const portrait=avatar?.querySelector(".rpg-portrait-svg");
  if(portrait){
   const active=window.agentHQActivity?.snapshot?.(id)?.some(a=>a.active===true&&a.actor===id)===true;
   portrait.classList.toggle("rpg-speaking",active);
  }
 });
 document.querySelectorAll("[data-rpg-worker]").forEach(el=>{
  const key=workerId(el.dataset.rpgWorker);
  if(key==="eleanor")el.dataset.avatarIdentity="eleanor";

  const id=el.dataset.rpgWorker;
  if((ids.includes(id)||/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))&&!el.querySelector(".rpg-portrait-svg"))el.innerHTML=image(id);
  const live=window.agentHQActivity?.snapshot?.(id)||[];
  const isWorking=live.some(a=>a.active===true&&(a.actor===id||a.actor===key))||!!document.querySelector('[data-agent-activity-thread="'+id+'"] [data-activity-running="true"]');
  const portrait=el.querySelector(".rpg-portrait-svg");
  if(portrait&&portrait.classList.contains("rpg-speaking")!==isWorking)portrait.classList.toggle("rpg-speaking",isWorking);
 });
}
const root=document.getElementById("app");
if(root){
 new MutationObserver(()=>queueMicrotask(update)).observe(root,{childList:true,subtree:true});
 update();
}
})();