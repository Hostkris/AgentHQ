(()=>{
 const KEY="agenthq-theme-v1";
 const palettes={blush:["#fff1f4","#f3b6c7"],lavender:["#f3efff","#c5b5f2"],sage:["#eff8f1","#a9d5b7"],peach:["#fff3e9","#f4c6a2"],sky:["#eef6ff","#a8c9ed"],pearl:["#f5f5f7","#c8ced8"]};
 const landscapes=[
  ["golden-gate-day","Golden Gate · Day","macOS Golden Gate"],
  ["golden-gate-sunset","Golden Gate · Sunset","macOS Golden Gate"],
  ["golden-gate-evening","Golden Gate · Evening","macOS Golden Gate"],
  ["golden-gate-night","Golden Gate · Night","macOS Golden Gate"],
  ["goa-beach","Goa Beach","macOS Tahoe aerials"],
  ["goa-coast","Goa Coast","macOS Tahoe aerials"],
  ["himalayan-valley","Himalayan Valley","macOS Tahoe aerials"],
  ["himalayan-peaks","Himalayan Peaks","macOS Tahoe aerials"],
  ["tea-gardens","Tea Gardens","macOS Tahoe aerials"],
  ["mountain-reservoir","Mountain Reservoir","macOS Tahoe aerials"]
 ].map(([id,name,collection])=>({id,name,collection,src:"./assets/wallpapers/"+id+".jpg",thumb:"./assets/wallpapers/"+id+"-thumb.jpg"}));
 let prefs={palette:"lavender",mode:"auto",wallpaper:"",contactColor:"#c5b5f2"};
 try{prefs={...prefs,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{}
 let wallpaperRequest=0;
 const save=()=>{
  try{localStorage.setItem(KEY,JSON.stringify(prefs));return true}
  catch{alert("This photo is too large to save on this device. Please try a smaller image.");return false}
 };
 function apply(){
  const root=document.documentElement;
  root.dataset.themeMode=prefs.mode;
  root.style.setProperty("--accent-soft",palettes[prefs.palette]?.[0]||palettes.lavender[0]);
  root.style.setProperty("--accent-color",palettes[prefs.palette]?.[1]||palettes.lavender[1]);
  root.style.setProperty("--contact-color",prefs.contactColor);
  root.style.setProperty("--wallpaper",prefs.wallpaper?'url("'+prefs.wallpaper+'")':"none");
 }
 function wallpaperSelection(panel,message){
  panel.querySelectorAll("[data-wallpaper]").forEach(button=>{
   const item=landscapes.find(p=>p.id===button.dataset.wallpaper);
   button.setAttribute("aria-pressed",String(prefs.wallpaper===item?.src));
  });
  const item=landscapes.find(p=>p.src===prefs.wallpaper);
  panel.querySelector("#wallpaper-status").textContent=message||
   (item?"Selected: "+item.name:prefs.wallpaper?"Selected: Your photo":"Choose a landscape or a photo from your phone.");
 }
 function commitWallpaper(panel,value,message){
  const previous=prefs.wallpaper;
  prefs.wallpaper=value;
  if(!save()){prefs.wallpaper=previous;wallpaperSelection(panel,"Wallpaper could not be saved. Your previous background is still selected.");return}
  apply();wallpaperSelection(panel,message);
 }
 function controls(){
  const shell=document.querySelector(".shell");
  if(!shell||document.querySelector("h1")?.textContent!=="Settings"||document.getElementById("theme-settings"))return;
  const panel=document.createElement("section");
  panel.id="theme-settings";panel.className="theme-panel";
  panel.innerHTML='<h2>Personalize Agent HQ</h2><button id="refresh-app" type="button" class="back">↻ Refresh Agent HQ</button>'+
   '<p class="muted">Customize colors and backgrounds on this device.</p><h3>Appearance</h3>'+
   '<button id="appearance-toggle" class="appearance-toggle" type="button" aria-label="Toggle day and night mode">☀️ Day mode</button>'+
   '<h3>Soft color themes</h3><div class="swatches" id="swatches"></div>'+
   '<label>Contact avatar color<input id="contact-color" type="color"></label>'+
   '<h3>Home &amp; chat wallpaper</h3><p class="wallpaper-help">Tap a landscape to use it, or choose a photo from your phone.</p>'+
   '<div class="wallpaper-actions"><button id="choose-wallpaper-photo" class="back" type="button">Choose from Photos</button>'+
   '<button id="remove-wallpaper" class="back" type="button">Remove wallpaper</button></div>'+
   '<input id="wallpaper-file" type="file" accept="image/*" aria-label="Upload wallpaper from Photos" hidden>'+
   '<p id="wallpaper-status" class="wallpaper-status" role="status" aria-live="polite"></p>'+
   '<details class="wallpaper-library" open><summary>Browse 10 landscape backgrounds</summary>'+
   '<div class="wallpaper-grid" role="group" aria-label="Landscape backgrounds">'+landscapes.map(item=>
    '<button type="button" class="wallpaper-card" data-wallpaper="'+item.id+'" aria-label="Use '+item.name+' background" aria-pressed="false">'+
    '<span class="wallpaper-thumbnail"><img src="'+item.thumb+'" alt="" loading="lazy" decoding="async" width="360" height="220">'+
    '<span class="wallpaper-check" aria-hidden="true">✓</span></span><span class="wallpaper-name">'+item.name+'</span>'+
    '<small>'+item.collection+'</small></button>').join("")+'</div></details>'+
   '<details class="wallpaper-credits"><summary>Wallpaper credits</summary><p>Apple macOS landscape stills. Golden Gate frames via '+
   '<a href="https://9to5mac.com/2026/08/17/macos-27-golden-gate-beta-6-adds-fifth-dynamic-wallpaper-get-them-all-here-gallery/" target="_blank" rel="noopener noreferrer">9to5Mac</a>; '+
   'Tahoe frames via <a href="https://basicappleguy.com/basicappleblog/tahoe-aerial-wallpapers" target="_blank" rel="noopener noreferrer">Basic Apple Guy</a>.</p></details>'+
   '<p class="notice">Your choice is saved on this device. Photos you choose stay in this browser’s storage. Clearing website data may remove them.</p>';
  shell.append(panel);
  panel.querySelector("#refresh-app").addEventListener("click",()=>{
   const button=panel.querySelector("#refresh-app");button.disabled=true;button.textContent="↻ Checking for updates…";
   const url=new URL(location.href);url.searchParams.set("agenthq_refresh",String(Date.now()));location.replace(url.toString());
  });
  const toggle=panel.querySelector("#appearance-toggle");
  const updateMode=()=>{toggle.textContent=prefs.mode==="dark"?"🌙 Night mode":"☀️ Day mode";toggle.setAttribute("aria-pressed",String(prefs.mode==="dark"))};
  toggle.addEventListener("click",()=>{prefs.mode=prefs.mode==="dark"?"light":"dark";save();apply();updateMode()});updateMode();
  panel.querySelector("#swatches").innerHTML=Object.entries(palettes).map(([name,colors])=>
   '<button type="button" class="swatch" data-palette="'+name+'" style="background:linear-gradient(135deg,'+colors.join(",")+')" aria-label="'+name+' theme" title="'+name+'">'+name+'</button>').join("");
  panel.querySelectorAll("[data-palette]").forEach(button=>button.addEventListener("click",()=>{prefs.palette=button.dataset.palette;save();apply()}));
  const contact=panel.querySelector("#contact-color");contact.value=prefs.contactColor;
  contact.addEventListener("input",event=>{prefs.contactColor=event.target.value;save();apply()});
  panel.querySelectorAll("[data-wallpaper]").forEach(button=>button.addEventListener("click",()=>{
   const item=landscapes.find(p=>p.id===button.dataset.wallpaper);if(!item)return;
   const request=++wallpaperRequest;
   wallpaperSelection(panel,"Loading "+item.name+"…");
   const image=new Image();
   image.onload=()=>{if(request===wallpaperRequest)commitWallpaper(panel,item.src,"Selected: "+item.name)};
   image.onerror=()=>{if(request===wallpaperRequest)wallpaperSelection(panel,"This background could not load. Try it again.")};
   image.src=item.src;
  }));
  panel.querySelector("#remove-wallpaper").addEventListener("click",()=>{++wallpaperRequest;commitWallpaper(panel,"","Wallpaper removed.")});
  const fileInput=panel.querySelector("#wallpaper-file");
  panel.querySelector("#choose-wallpaper-photo").addEventListener("click",()=>fileInput.click());
  fileInput.addEventListener("change",event=>{
   const file=event.target.files?.[0];if(!file)return;
   if((!file.type.startsWith("image/")&&!/\.(heic|heif|jpe?g|png|webp|avif)$/i.test(file.name))||file.size>12000000){alert("Choose an image smaller than 12 MB.");fileInput.value="";return}
   const request=++wallpaperRequest;
   wallpaperSelection(panel,"Opening your photo…");
   const url=URL.createObjectURL(file),image=new Image();
   image.onload=()=>{
    try{
     if(request!==wallpaperRequest)return;
     const canvas=document.createElement("canvas"),scale=Math.min(1,1600/Math.max(image.width,image.height));
     canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
     canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
     commitWallpaper(panel,canvas.toDataURL("image/jpeg",.8),"Selected: Your photo");
    }catch{wallpaperSelection(panel,"Could not save this photo. Try a different image.")}
    finally{URL.revokeObjectURL(url);fileInput.value=""}
   };
   image.onerror=()=>{URL.revokeObjectURL(url);fileInput.value="";if(request===wallpaperRequest)wallpaperSelection(panel,"Could not open this photo. Try a JPEG or PNG image.")};
   image.src=url;
  });
  wallpaperSelection(panel);
 }
 apply();
 new MutationObserver(()=>{if(!document.getElementById("theme-settings"))controls()}).observe(document.getElementById("app"),{childList:true,subtree:true});
 controls();
})();
