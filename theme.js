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
 let prefs={palette:"lavender",mode:"auto",wallpaper:"",contactColor:"#c5b5f2",iconStyle:"color",glass:55,largerText:false,reduceMotion:false};
 try{prefs={...prefs,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{}
 let settingsView="home",wallpaperRequest=0;
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const symbol=name=>window.AgentHQIcons?.svg(name)||"";
 const titles={home:"Settings",account:"Account & Sign-In",appearance:"Appearance",icons:"App Icons",wallpaper:"Wallpaper",accessibility:"Text & Accessibility",connections:"Connected Apps",ai:"AI Connection",research:"Web Research",hosted:"Hosted Browser",permissions:"Privacy & Permissions",voice:"Voice & Dictation",about:"About Agent HQ"};
 const modeNames={auto:"Automatic",light:"Light",dark:"Dark"};
 function save(){try{localStorage.setItem(KEY,JSON.stringify(prefs));return true}catch{alert("This change could not be saved on this device. Try a smaller photo or free some browser storage.");return false}}
 function apply(){
  const root=document.documentElement;
  root.dataset.themeMode=prefs.mode;
  root.dataset.iconStyle=prefs.iconStyle;
  root.dataset.largerText=String(!!prefs.largerText);
  root.dataset.reduceMotion=String(!!prefs.reduceMotion);
  root.style.setProperty("--accent-soft",palettes[prefs.palette]?.[0]||palettes.lavender[0]);
  root.style.setProperty("--accent-color",palettes[prefs.palette]?.[1]||palettes.lavender[1]);
  root.style.setProperty("--contact-color",prefs.contactColor);
  root.style.setProperty("--ui-glass-alpha",String(.48+Math.max(0,Math.min(100,Number(prefs.glass)||0))*.0048));
  root.style.setProperty("--ui-font",prefs.largerText?"19px":"17px");
  root.style.setProperty("--wallpaper",prefs.wallpaper?'url("'+prefs.wallpaper+'")':"none");
 }
 const row=(icon,title,note,view,extra="",nav=false)=>'<button type="button" class="settings-entry" '+(nav?'data-nav="':'data-settings-view="')+view+'" data-search="'+esc((title+' '+note+' '+extra).toLowerCase())+'">'+
  '<span class="settings-entry-icon app-icon--'+icon+'">'+symbol(icon)+'</span><span class="settings-entry-copy"><span>'+title+'</span>'+(note?'<small>'+esc(note)+'</small>':"")+'</span><span class="settings-chevron">'+symbol('chevron')+'</span></button>';
 const group=(title,body)=>'<section class="settings-group"><h2 class="settings-section-label">'+title+'</h2><div class="settings-list">'+body+'</div></section>';
 const note=text=>'<p class="settings-footnote">'+text+'</p>';
 const switchRow=(title,key,description)=>'<label class="settings-toggle-row"><span><span>'+title+'</span>'+(description?'<small>'+description+'</small>':"")+'</span><input type="checkbox" data-preference="'+key+'"'+(prefs[key]?' checked':'')+' role="switch"><span class="ios-switch" aria-hidden="true"></span></label>';
 function home(){return '<div class="settings-search">'+symbol('search')+'<input id="settings-search" type="search" placeholder="Search" aria-label="Search settings" autocomplete="off"></div>'+
  '<button type="button" class="settings-profile" data-settings-view="account"><span class="settings-profile-icon">HQ</span><span><strong>Agent HQ Account</strong><small>Sign-in, password and sync</small></span><span class="settings-chevron">'+symbol('chevron')+'</span></button>'+
  group('Personalize',row('appearance','Appearance',modeNames[prefs.mode]||'Automatic','appearance','display light dark liquid glass colors')+
   row('wallpaper','Wallpaper','Landscapes & your photos','wallpaper','background photo picture')+
   row('studio','App Icons',({color:'Color',clear:'Clear',tinted:'Tinted'})[prefs.iconStyle]||'Color','icons','home screen')+
   row('accessibility','Text & Accessibility','Text size & motion','accessibility','larger reduced'))+
  group('Workspace',row('accounts','Account & Sign-In','','account','login password recovery sync')+
   row('email','Connected Apps','Gmail, profiles & Meta Ads','connections','email social')+
   row('ai','AI Connection','Provider status & connection check','ai','groq openrouter workers')+
   row('research','Web Research','Public web search & reports','research','browser internet sources groq')+
   row('approvals','Privacy & Permissions','Access requests & worker approvals','permissions','security accounts'))+
  group('General',row('voice','Voice & Dictation','','voice','microphone speech read aloud')+
   row('info','About Agent HQ','','about','version information')+
   '<button type="button" class="settings-entry settings-blue" data-settings-action="refresh" data-search="refresh app update reload"><span class="settings-entry-icon app-icon--refresh">'+symbol('refresh')+'</span><span class="settings-entry-copy">Refresh Agent HQ</span></button>')+
  '<p id="settings-no-results" class="settings-footnote" hidden>No matching settings.</p>'+
  '<p class="settings-footer">Your workspace. Your choices.</p>';
 }
 function appearance(includeMode=true){
  let body=includeMode?group('Appearance','<div class="appearance-options">'+[['light','sun','Light'],['dark','moon','Dark'],['auto','appearance','Automatic']].map(([value,icon,label])=>
   '<button type="button" data-theme-mode="'+value+'" class="appearance-option" aria-pressed="'+(prefs.mode===value)+'"><span class="appearance-preview preview-'+value+'"><i></i><i></i><i></i></span><span>'+label+'</span><span class="appearance-radio">'+(prefs.mode===value?symbol('check'):'')+'</span></button>').join('')+'</div>')+note('Automatic follows your iPhone’s Light or Dark appearance.')+group('Liquid Glass','<label class="settings-slider"><span>Glass appearance <output id="glass-value">'+prefs.glass+'%</output></span><input type="range" min="0" max="100" value="'+prefs.glass+'" id="glass-slider" aria-label="Glass appearance"><span class="slider-endpoints"><small>Clear</small><small>Tinted</small></span></label>')+note('Adjust the frost on home-screen labels and navigation controls.'):'';
  body+=group('App Icon Style','<div class="icon-style-options">'+[['color','Color'],['clear','Clear'],['tinted','Tinted']].map(([value,label])=>
   '<button type="button" data-icon-style="'+value+'" aria-pressed="'+(prefs.iconStyle===value)+'"><span class="icon-style-sample sample-'+value+'">'+symbol('messages')+'</span><span>'+label+'</span><span class="appearance-radio">'+(prefs.iconStyle===value?symbol('check'):'')+'</span></button>').join('')+'</div>');
  body+=group('Accent Color','<div class="settings-swatches">'+Object.entries(palettes).map(([name,colors])=>
   '<button type="button" data-palette="'+name+'" aria-label="'+name+' accent" aria-pressed="'+(prefs.palette===name)+'"><span style="background:'+colors[1]+'">'+(prefs.palette===name?symbol('check'):'')+'</span><small>'+name[0].toUpperCase()+name.slice(1)+'</small></button>').join('')+'</div>');
  body+=group('Contacts','<label class="settings-color-row"><span>Avatar color</span><input id="contact-color" type="color" value="'+esc(prefs.contactColor)+'" aria-label="Contact avatar color"></label>');
  return body;
 }
 function wallpaper(){
  const item=landscapes.find(x=>x.src===prefs.wallpaper);
  return '<div class="settings-wallpaper-current"><div class="wallpaper-phone-preview"><img id="wallpaper-current-photo" '+(prefs.wallpaper?'src="'+esc(item?.src||prefs.wallpaper)+'"':'hidden')+' alt="Current wallpaper"><span>'+symbol('messages')+symbol('email')+symbol('contacts')+symbol('settings')+'</span></div><strong>Home & Conversations</strong></div>'+
   group('Your Photos','<button type="button" class="settings-entry settings-blue" data-settings-action="photo"><span class="settings-entry-icon app-icon--wallpaper">'+symbol('photo')+'</span><span class="settings-entry-copy">Choose from Photos</span><span class="settings-chevron">'+symbol('chevron')+'</span></button>'+
    '<button type="button" class="settings-entry settings-danger" data-settings-action="remove-wallpaper"><span class="settings-entry-copy">Remove Wallpaper</span></button>')+
   '<input id="wallpaper-file" type="file" accept="image/*" aria-label="Upload wallpaper from Photos" hidden>'+
   '<p id="wallpaper-status" class="settings-footnote" role="status" aria-live="polite"></p>'+
   '<section class="settings-group"><h2 class="settings-section-label">Landscape Collection</h2><div class="wallpaper-grid" role="group" aria-label="Landscape backgrounds">'+landscapes.map(x=>
    '<button type="button" class="wallpaper-card" data-wallpaper="'+x.id+'" aria-label="Use '+x.name+' background" aria-pressed="'+(prefs.wallpaper===x.src)+'"><span class="wallpaper-thumbnail"><img src="'+x.thumb+'" alt="" width="360" height="220" loading="lazy"><span class="wallpaper-check">'+symbol('check')+'</span></span><span class="wallpaper-name">'+x.name+'</span><small>'+x.collection+'</small></button>').join('')+'</div></section>'+
   note('Tap a landscape to apply it. Your photo and appearance choices stay on this device.')+
   '<details class="wallpaper-credits"><summary>Wallpaper credits</summary><p>Apple macOS landscape stills via <a href="https://9to5mac.com/2026/08/17/macos-27-golden-gate-beta-6-adds-fifth-dynamic-wallpaper-get-them-all-here-gallery/" target="_blank" rel="noopener noreferrer">9to5Mac</a> and <a href="https://basicappleguy.com/basicappleblog/tahoe-aerial-wallpapers" target="_blank" rel="noopener noreferrer">Basic Apple Guy</a>.</p></details>';
 }
 function page(view){
  if(view==='home')return home();
  if(view==='appearance')return appearance();
  if(view==='icons')return appearance(false);
  if(view==='wallpaper')return wallpaper();
  if(view==='account')return note('Sign in to access your saved conversations, assignments and connected services.')+'<div data-settings-account-host><p class="settings-footnote">Loading account controls…</p></div>';
  if(view==='connections')return group('Apps & Accounts',row('browser','Hosted Browser','iPhone & iPad · Facebook setup','hosted','cloud browser personal profile')+row('email','Gmail','Inbox, drafts & email connection','email','',true)+row('accounts','My Profiles','Social profiles & worker permissions','accounts','',true)+row('operations','Meta Ads','Advertising connection & reporting','operations','',true))+note('Open a service to review its connection. Nothing connects until you choose to authorize it.');
  if(view==='permissions')return group('Your Control',row('approvals','Access Requests','Review pending requests and saved decisions','approvals','',true)+row('accounts','Worker Permissions','Review or revoke planning permissions','accounts','',true)+row('email','Email Permissions','Gmail connection & AI drafting controls','email','',true))+note('You control account connections and approvals. Appearance settings and photos are saved in this browser on this device.');
  if(view==='hosted')return window.agentHQSettingsBrowserHost?.()||note('Hosted browser controls are loading. Return to Settings and try again.');
  if(view==='research')return (window.agentHQSettingsResearch?.()||'')+group('Reports',row('research','Research History','Request research or read saved reports','research','',true))+note('Approve one topic at a time in Messages. A report is saved only when live search returns source links.');
  if(view==='ai')return (window.agentHQSettingsAI?.()||'<p class="settings-footnote">AI connection status is loading. Return to Settings and try again.</p>')+note('This checks your existing provider connection. It does not create an assignment or generate a reply.');
  if(view==='accessibility')return group('Display',switchRow('Larger Text','largerText','Use larger interface text.'))+group('Motion',switchRow('Reduce Motion','reduceMotion','Limit animations and moving effects.'))+note('Agent HQ also respects your device’s reduced-motion preference.');
  if(view==='voice')return group('Voice Features','<div class="settings-value-row"><span>Dictation</span><span>'+(window.SpeechRecognition||window.webkitSpeechRecognition?'Available':'Depends on your browser')+'</span></div><div class="settings-value-row"><span>Read Aloud</span><span>'+(window.speechSynthesis?'Available':'Not available here')+'</span></div>')+group('Use Voice',row('messages','Open Messages','Use the microphone in a conversation','messages','',true))+note('Your browser asks for microphone permission when you start dictation. Dictation enters text; it does not send the message.');
  return '<div class="settings-about"><span class="settings-profile-icon">HQ</span><h2>Agent HQ</h2><p>Your personal AI workspace.</p></div>'+group('App Information','<div class="settings-value-row"><span>Design</span><span>iPhone-inspired</span></div><div class="settings-value-row"><span>Interface build</span><span>2026.10.23</span></div>')+group('Updates','<button type="button" class="settings-entry settings-blue" data-settings-action="refresh"><span class="settings-entry-icon app-icon--refresh">'+symbol('refresh')+'</span><span class="settings-entry-copy">Refresh Agent HQ</span></button>');
 }
 function wallpaperSelection(panel,message){
  panel.querySelectorAll('[data-wallpaper]').forEach(b=>b.setAttribute('aria-pressed',String(prefs.wallpaper===landscapes.find(x=>x.id===b.dataset.wallpaper)?.src)));
  const item=landscapes.find(x=>x.src===prefs.wallpaper),status=panel.querySelector('#wallpaper-status');
  if(status)status.textContent=message||(item?'Selected: '+item.name:prefs.wallpaper?'Selected: Your photo':'Choose a landscape or a photo.');
  const image=panel.querySelector('#wallpaper-current-photo');if(image){image.hidden=!prefs.wallpaper;if(prefs.wallpaper)image.src=prefs.wallpaper;else image.removeAttribute('src')}
 }
 function commitWallpaper(panel,value,message){const before=prefs.wallpaper;prefs.wallpaper=value;if(!save()){prefs.wallpaper=before;wallpaperSelection(panel,'Could not save this wallpaper. Your previous background is still selected.');return}apply();wallpaperSelection(panel,message)}
 function renderSettings(view){
  const panel=document.querySelector('#theme-settings');if(!panel)return;
  settingsView=titles[view]?view:'home';panel.dataset.page=settingsView;
  panel.innerHTML=page(settingsView);
  const title=document.querySelector('.settings-shell>h1');if(title)title.textContent=titles[settingsView];
  const back=document.querySelector('.settings-shell .main-navigation .back');
  if(back){if(settingsView==='home'){back.setAttribute('data-nav','home');back.removeAttribute('data-settings-view');back.innerHTML=symbol('back')+'<span>Home</span>'}else{back.removeAttribute('data-nav');back.setAttribute('data-settings-view','home');back.innerHTML=symbol('back')+'<span>Settings</span>'}back.setAttribute('aria-label',settingsView==='home'?'Go back':'Back to Settings')}
  if(settingsView==='wallpaper')wallpaperSelection(panel);
  window.agentHQMountAccount?.();
 }
 function pickPhoto(input,panel){
  const file=input.files?.[0];if(!file)return;
  if((!file.type.startsWith('image/')&&!/\.(heic|heif|jpe?g|png|webp|avif)$/i.test(file.name))||file.size>12000000){alert('Choose an image smaller than 12 MB.');input.value='';return}
  const request=++wallpaperRequest,url=URL.createObjectURL(file),image=new Image();wallpaperSelection(panel,'Opening your photo…');
  image.onload=()=>{try{if(request!==wallpaperRequest)return;const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);commitWallpaper(panel,canvas.toDataURL('image/jpeg',.8),'Selected: Your photo')}catch{wallpaperSelection(panel,'Could not save this photo. Try another image.')}finally{URL.revokeObjectURL(url);input.value=''}};
  image.onerror=()=>{URL.revokeObjectURL(url);input.value='';if(request===wallpaperRequest)wallpaperSelection(panel,'Could not open this photo. Try a JPEG or PNG.')};image.src=url;
 }
 function controls(){
  const root=document.querySelector('#settings-root');if(!root||document.querySelector('#theme-settings'))return;
  const panel=document.createElement('div');panel.id='theme-settings';panel.className='ios-settings';root.append(panel);
  panel.addEventListener('input',event=>{
   const t=event.target;
   if(t.id==='settings-search'){
    const q=t.value.toLowerCase().trim();let count=0;
    panel.querySelectorAll('[data-search]').forEach(el=>{el.hidden=!el.dataset.search.includes(q);if(!el.hidden)count++});
    panel.querySelectorAll('.settings-group').forEach(group=>{group.hidden=![...group.querySelectorAll('[data-search]')].some(el=>!el.hidden)});
    panel.querySelector('#settings-no-results').hidden=count>0;return;
   }
   if(t.id==='glass-slider'){prefs.glass=Number(t.value);save();apply();panel.querySelector('#glass-value').textContent=t.value+'%'}
   if(t.id==='contact-color'){prefs.contactColor=t.value;save();apply()}
  });
  panel.addEventListener('change',event=>{
   const t=event.target;
   if(t.dataset.preference){prefs[t.dataset.preference]=t.checked;save();apply()}
   if(t.id==='wallpaper-file')pickPhoto(t,panel);
  });
  panel.addEventListener('click',event=>{
   const option=event.target.closest('button[data-theme-mode],button[data-icon-style],button[data-palette]');
   if(option){if(option.dataset.themeMode)prefs.mode=option.dataset.themeMode;if(option.dataset.iconStyle)prefs.iconStyle=option.dataset.iconStyle;if(option.dataset.palette)prefs.palette=option.dataset.palette;save();apply();renderSettings(settingsView);return}
   const choice=event.target.closest('[data-wallpaper]');
   if(choice){const item=landscapes.find(x=>x.id===choice.dataset.wallpaper);if(!item)return;const request=++wallpaperRequest,image=new Image();wallpaperSelection(panel,'Loading '+item.name+'…');image.onload=()=>{if(request===wallpaperRequest)commitWallpaper(panel,item.src,'Selected: '+item.name)};image.onerror=()=>{if(request===wallpaperRequest)wallpaperSelection(panel,'This background could not load. Try it again.')};image.src=item.src;return}
   const action=event.target.closest('[data-settings-action]')?.dataset.settingsAction;
   if(action==='photo')panel.querySelector('#wallpaper-file').click();
   if(action==='remove-wallpaper'){++wallpaperRequest;commitWallpaper(panel,'','Wallpaper removed.')}
   if(action==='refresh'){const url=new URL(location.href);url.searchParams.set('agenthq_refresh',String(Date.now()));location.replace(url.toString())}
  });
  renderSettings(settingsView);
 }
 const app=document.getElementById('app');
 app.addEventListener('click',event=>{const choice=event.target.closest('[data-settings-view]');if(choice){renderSettings(choice.getAttribute("data-settings-view"));window.scrollTo(0,0)}});
 apply();
 new MutationObserver(()=>{if(document.querySelector('#settings-root'))controls();else settingsView='home'}).observe(app,{childList:true,subtree:true});
 controls();
})();
