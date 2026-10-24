/* Original vector glyphs for Agent HQ's iPhone-style interface. */
(()=>{
 const glyphs={
  office:'<path d="M4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15M2 21h20M9 21v-5h6v5M8 8h1m6 0h1M8 12h1m6 0h1"/>',
  messages:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-5 2 1.6-5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M7 11h.01M12 11h.01M17 11h.01" stroke-width="3"/>',
  email:'<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="m3.5 6 8.5 7 8.5-7"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  contacts:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-2a6.5 6.5 0 0 1 13 0v2M16 5a3.5 3.5 0 0 1 0 7m2 3a5 5 0 0 1 3.5 5"/>',
  accounts:'<rect x="3" y="10" width="18" height="11" rx="3"/><path d="M7 10V7a5 5 0 0 1 10 0v3m-5 5v2"/>',
  studio:'<rect x="3" y="6" width="18" height="14" rx="5"/><path d="M12 3v3M8 12h.01M16 12h.01M8 16h8M1 11v4m22-4v4"/>',
  assignments:'<rect x="4" y="4" width="16" height="18" rx="3"/><rect x="8" y="2" width="8" height="4" rx="2"/><path d="m8 13 2 2 5-5m-7 8h8"/>',
  operations:'<path d="M3 3v18h18M7 15l5-5 4 3 5-7M17 6h4v4"/>',
  hq:'<path d="m2 10 10-7 10 7M4 9v12h16V9M9 21v-8h6v8"/>',
  approvals:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  research:'<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 6 6M7 10h7m-7 3h4"/>',
  browser:'<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="4" ry="10"/><path d="M2 12h20M4 6h16M4 18h16"/>',
  reminders:'<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M7 2v4m10-4v4M3 9h18m-13 5h.01M12 14h4m-8 4h.01M12 18h4"/>',
  settings:'<path d="m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1Z" transform="translate(.5 .5) scale(.92)"/><circle cx="12" cy="12" r="3.3"/>',
  appearance:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',
  wallpaper:'<rect x="2" y="3" width="20" height="18" rx="4"/><circle cx="8" cy="9" r="2"/><path d="m3 18 5-5 4 4 4-6 6 7"/>',
  accessibility:'<circle cx="12" cy="4" r="2"/><path d="M4 8h16m-8 0v7m0 0-5 7m5-7 5 7M8 8l4 4 4-4"/>',
  ai:'<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z"/>',
  voice:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  refresh:'<path d="M20 7A9 9 0 1 0 21 15M20 2v5h-5"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  back:'<path d="m15 5-7 7 7 7"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1.5 1.5m13 13L20 20M4 20l1.5-1.5m13-13L20 4"/>',
  moon:'<path d="M21 14A9.5 9.5 0 0 1 10 3a9.5 9.5 0 1 0 11 11Z"/>',
  photo:'<rect x="2" y="4" width="20" height="17" rx="3"/><circle cx="8" cy="10" r="2"/><path d="m3 18 5-5 4 4 4-6 5 6M17 1v6m-3-3h6"/>',
  logout:'<path d="M9 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5m7-14 5 5-5 5m-9-5h14"/>'
 };
 const svg=name=>'<svg class="hq-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(glyphs[name]||glyphs.ai)+'</svg>';
 window.AgentHQIcons={svg};
 const app=document.getElementById('app');
 function decorate(){
  const actions={'.ios-refresh':'refresh','.voice-read-last':'voice','.voice-dictate':'voice'};
  for(const [selector,name] of Object.entries(actions))for(const button of app.querySelectorAll(selector)){
   if(!button.querySelector('.hq-symbol'))button.innerHTML=svg(name);
  }
  const headings={'✉️':'email','📊':'operations','✨':'ai','🧬':'studio','🔒':'accounts','✍️':'assignments','🏢':'office'};
  for(const el of app.querySelectorAll('h2,h3,.email-reply-header strong')){
   const first=el.firstChild;if(first?.nodeType!==3)continue;
   for(const [emoji,name] of Object.entries(headings))if(first.textContent.startsWith(emoji)){
    first.textContent=first.textContent.slice(emoji.length).trimStart();
    const span=document.createElement('span');span.className='heading-symbol';span.innerHTML=svg(name);el.prepend(span);break;
   }
  }
 }
 new MutationObserver(decorate).observe(app,{childList:true,subtree:true});decorate();
})();

