// ==UserScript==
// @name         Agent HQ — YouTube Safari Reader
// @namespace    https://hostkris.github.io/AgentHQ/
// @version      1.0.0
// @description  Review and manually copy visible YouTube page text for Riley; no automatic sending or account access.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://youtube.com/*
// @downloadURL  https://raw.githubusercontent.com/Hostkris/AgentHQ/main/AgentHQ_YouTube_Safari_Reader.user.js
// @updateURL    https://raw.githubusercontent.com/Hostkris/AgentHQ/main/AgentHQ_YouTube_Safari_Reader.user.js
// @grant        none
// @noframes
// @run-at       document-idle
// ==/UserScript==

(()=>{
  'use strict';
  if (window.top !== window.self || document.getElementById('agenthq-manual-platform-reader')) return;
  const CFG={"name":"YouTube","hosts":["www.youtube.com","m.youtube.com","youtube.com"],"blocked":["^/(?:signin|login|account|settings|paid_memberships|logout|feed/history|feed/library)(?:/|$)"]};
  if (!CFG.hosts.includes(location.hostname.toLowerCase()) || location.protocol !== 'https:') return;
  if (CFG.blocked.some(x => new RegExp(x,'i').test(location.pathname))) return;
  if (!document.documentElement) return;
  const host=document.createElement('div');
  host.id='agenthq-manual-platform-reader';
  document.documentElement.appendChild(host);
  const shadow=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');
  style.textContent=":host{all:initial}.panel{position:fixed;bottom:calc(10px + env(safe-area-inset-bottom));right:10px;left:10px;z-index:2147483647;box-sizing:border-box;max-width:500px;margin:0 auto;padding:12px 13px 13px;border-radius:19px;border:1px solid #c4d0df;background:rgba(248,250,253,.96);box-shadow:0 8px 38px #1422393d;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);font:14px -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#14283b}header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;font-weight:700}p{margin:6px 0 10px;line-height:1.4;color:#354457}button{appearance:none;-webkit-appearance:none;border:0;border-radius:11px;padding:10px 12px;min-height:44px;background:#146b8b;color:white;font:600 14px -apple-system,BlinkMacSystemFont,Arial,sans-serif;cursor:pointer}button:disabled{opacity:.45}button.secondary{background:#e4ebf2;color:#132a3d}button.dismiss{padding:6px 10px;min-width:44px;background:transparent;color:#243849;font-size:23px;line-height:1}div.actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0}textarea{box-sizing:border-box;width:100%;min-height:92px;max-height:160px;resize:vertical;padding:9px;border:1px solid #bdcad9;border-radius:10px;background:#fff;color:#20313d;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}small{display:block;margin:7px 0 0;color:#4c6277;font-size:12px;line-height:1.35}";
  shadow.appendChild(style);
  const panel=document.createElement('section');panel.className='panel';panel.setAttribute('aria-label','Agent HQ '+CFG.name+' reader');shadow.appendChild(panel);
  const head=document.createElement('header');panel.appendChild(head);
  const title=document.createElement('span');title.textContent='Agent HQ · '+CFG.name;head.appendChild(title);
  const close=document.createElement('button');close.type='button';close.className='dismiss';close.textContent='×';close.setAttribute('aria-label','Close Agent HQ reader');head.appendChild(close);
  close.addEventListener('click',()=>host.remove());
  const desc=document.createElement('p');desc.textContent='Preview visible page text before sharing anything with Riley. Nothing is automatically transmitted.';panel.appendChild(desc);
  const actions=document.createElement('div');actions.className='actions';panel.appendChild(actions);
  const previewButton=document.createElement('button');previewButton.type='button';previewButton.textContent='Preview page';actions.appendChild(previewButton);
  const copyButton=document.createElement('button');copyButton.type='button';copyButton.textContent='Copy for Riley';copyButton.className='secondary';copyButton.disabled=true;actions.appendChild(copyButton);
  const preview=document.createElement('textarea');preview.setAttribute('aria-label','Review text that will be copied');preview.readOnly=true;preview.hidden=true;panel.appendChild(preview);
  const hint=document.createElement('small');hint.textContent='Only text currently displayed on this Safari webpage is available. Form fields, drafts and hidden content are excluded.';panel.appendChild(hint);
  function safePageUrl(){
    const url=new URL(location.href);url.hash='';
    const kept=new URLSearchParams();
    const allowed=CFG.name==='YouTube'?['v','list','t','start']:['q'];
    allowed.forEach(k=>{for(const v of url.searchParams.getAll(k).slice(0,1))kept.append(k,v.slice(0,300));});
    url.search=kept.toString();return url.href.slice(0,1200);
  }
  function capture(){
    if(document.hidden)throw Error('Bring Safari to the foreground before reading.');
    if(CFG.blocked.some(x=>new RegExp(x,'i').test(location.pathname)))throw Error('That page is blocked from reading.');
    const root=document.body;if(!root)throw Error('Page has not loaded.');
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const parts=[];let n=0,truncated=false;
    for(let item=walker.nextNode();item;item=walker.nextNode()){
      const el=item.parentElement;
      if(!el || el.closest('script,style,noscript,svg,header,nav,footer,input,textarea,select,form,button,[contenteditable],[hidden],[aria-hidden="true"],#agenthq-manual-platform-reader'))continue;
      if(!el.getClientRects().length)continue;
      const st=getComputedStyle(el);
      if(st.display==='none'||st.visibility!=='visible')continue;
      const value=(item.textContent||'').replace(/\s+/g,' ').trim();
      if(!value)continue;
      if(n+value.length+1>24000){const remain=24000-n;if(remain>0)parts.push(value.slice(0,remain));truncated=true;break;}
      parts.push(value);n+=value.length+1;
    }
    const text=parts.join('\n').slice(0,24000);
    if(text.length<30)throw Error('Not enough visible text. Open the post/video, expand its description or comments, and try again.');
    return {url:safePageUrl(),title:document.title.slice(0,200),text,truncated};
  }
  let packet=null;
  previewButton.addEventListener('click',()=>{
    try{
      packet=capture();
      preview.hidden=false;
      preview.value='Platform: '+CFG.name+'\nURL: '+packet.url+'\nTitle: '+packet.title+'\n\n'+packet.text+(packet.truncated?'\n\n[Text truncated to 24,000 characters.]':'');
      copyButton.disabled=false;
      hint.textContent='Review before copying. '+packet.text.length.toLocaleString()+' characters collected'+(packet.truncated?' (truncated).':'.')+' No information has been sent.';
    }catch(err){packet=null;preview.hidden=true;copyButton.disabled=true;hint.textContent=err.message||'Reading was not possible on this page.';}
  });
  copyButton.addEventListener('click',async()=>{
    if(!packet || document.hidden)return;
    const value=preview.value;
    let ok=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);ok=true;}}catch{}
    if(!ok){try{preview.focus();preview.select();ok=document.execCommand('copy');}catch{}}
    hint.textContent=ok?'Copied. Open Agent HQ and paste the text into Riley’s conversation.':'Safari blocked automatic copying. The preview is selected; use Copy from the selection menu, then paste into Riley’s chat.';
  });
})();
