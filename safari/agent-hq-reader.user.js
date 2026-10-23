// ==UserScript==
// @name         Agent HQ — Read for Agent HQ
// @namespace    https://hostkris.github.io/AgentHQ/
// @version      1.0.0
// @description  Preview and copy visible page text for an owner-approved Riley request. No automatic upload or Facebook actions.
// @match        https://www.facebook.com/*
// @match        https://m.facebook.com/*
// @match        https://mbasic.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://facebook.com/*
// @match        https://www.messenger.com/*
// @match        https://messenger.com/*
// @grant        GM.setClipboard
// @run-at       document-idle
// ==/UserScript==
(()=>{
 'use strict';
 if(window.top!==window.self||document.getElementById('agenthq-safari-reader'))return;
 function pageUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['facebook.com','www.facebook.com','m.facebook.com','mbasic.facebook.com','web.facebook.com','messenger.com','www.messenger.com'].includes(u.hostname))throw Error('Open a Facebook or Messenger content page.');if(/^\/(login|checkpoint|recover|oauth|dialog|reg|security|settings)(?:[/.]|$)/i.test(u.pathname))throw Error('Finish signing in, then open the page you want to share.');u.hostname=u.hostname.endsWith('messenger.com')?'www.messenger.com':'www.facebook.com';u.hash='';const keep=new URLSearchParams();for(const key of ['id','story_fbid','fbid','v','set','sk','q'])for(const v of u.searchParams.getAll(key))keep.append(key,v);keep.sort();u.search=keep.toString();u.pathname=u.pathname.replace(/\/+$/,'')||'/';if(u.href.length>1200)throw Error('Page URL is too long.');return u.href}
 const host=document.createElement('div');host.id='agenthq-safari-reader';document.documentElement.append(host);const root=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=':host{all:initial}button,textarea{font:16px -apple-system,BlinkMacSystemFont,sans-serif}button{border:0;border-radius:14px;padding:13px 16px;background:#176f86;color:white;font-weight:600;min-height:44px;cursor:pointer}.launcher{position:fixed;right:12px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:2147483647;box-shadow:0 4px 20px #0003}.panel{position:fixed;inset:8px;z-index:2147483647;display:flex;flex-direction:column;gap:12px;background:#f7f8fa;color:#18232b;border:1px solid #ccd3da;border-radius:20px;padding:18px;box-sizing:border-box;font:16px -apple-system,BlinkMacSystemFont,sans-serif;overflow:auto;padding-bottom:calc(18px + env(safe-area-inset-bottom))}.panel[hidden]{display:none}h2,p{margin:0}p{line-height:1.45}textarea{width:100%;min-height:150px;flex:1;box-sizing:border-box;border:1px solid #aab9c7;border-radius:12px;padding:12px;background:white;color:#18232b}.actions{display:flex;gap:10px;flex-wrap:wrap}.secondary{background:#e2e8ef;color:#18232b}.source{font-size:12px;overflow-wrap:anywhere}';root.append(style);
 const launcher=document.createElement('button');launcher.className='launcher';launcher.textContent='Read for Agent HQ';root.append(launcher);
 const panel=document.createElement('section');panel.className='panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Review text to share with Agent HQ');root.append(panel);
 let packet=null;
 launcher.addEventListener('click',()=>{
  panel.replaceChildren();panel.hidden=false;
  const title=document.createElement('h2');title.textContent='Review before sharing';panel.append(title);
  const intro=document.createElement('p');intro.textContent='Approve the exact page in Riley’s Agent HQ thread first. This captures only loaded, visible text. You choose what to copy; nothing is uploaded automatically.';panel.append(intro);
  const info=document.createElement('p');info.className='source';panel.append(info);
  const field=document.createElement('textarea');field.setAttribute('aria-label','Page text to share');panel.append(field);
  const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
  const actions=document.createElement('div');actions.className='actions';panel.append(actions);
  const copy=document.createElement('button');copy.textContent='Copy capture';actions.append(copy);
  const close=document.createElement('button');close.className='secondary';close.textContent='Cancel';actions.append(close);
  close.addEventListener('click',()=>{packet=null;field.value='';panel.hidden=true});
  try{
   const url=pageUrl(location.href);
   if([...document.querySelectorAll('input[type="password"]')].some(e=>e.getClientRects().length))throw Error('Sign-in fields are visible. Finish signing in before capturing content.');
   const main=document.querySelector('[role="main"]')||document.body;const text=String(main?.innerText||'').trim();
   if(text.length<30)throw Error('No readable page content was found. Open and load the content in Safari first.');
   packet={kind:'agenthq.safari-page.v1',url,title:document.title.slice(0,200),text:text.slice(0,24000),captured_at:new Date().toISOString(),truncated:text.length>24000};
   info.textContent=url;field.value=packet.text;if(packet.truncated)status.textContent='Only the first 24,000 characters are included. Review and remove anything you do not want to share.';
  }catch(e){packet=null;copy.disabled=true;status.textContent=e.message}
  copy.addEventListener('click',async()=>{
   if(!packet)return;packet.text=field.value.trim();if(packet.text.length<30||packet.text.length>24000){status.textContent='Keep 30–24,000 characters.';return}
   const data=JSON.stringify(packet);
   try{if(typeof GM!=='undefined'&&GM.setClipboard)await GM.setClipboard(data,'text/plain');else await navigator.clipboard.writeText(data);status.textContent='Capture copied. Return to the approved request in Riley’s Agent HQ thread, paste it, then tap Share approved text & analyze.'}catch{status.textContent='Clipboard access failed. Select and copy the full capture below, then paste it in Riley’s approved request.';field.value=data;field.select()}
  });
 });
})();
