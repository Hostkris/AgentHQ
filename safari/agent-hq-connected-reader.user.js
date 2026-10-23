// ==UserScript==
// @name         Agent HQ — Connected Safari reader
// @namespace    https://hostkris.github.io/AgentHQ/
// @version      1.0.0
// @description  Send one explicitly approved Facebook/Messenger page to Riley. Foreground only; no posting, cookies, passwords or app control.
// @match        https://hostkris.github.io/AgentHQ/*
// @match        https://www.facebook.com/*
// @match        https://facebook.com/*
// @match        https://m.facebook.com/*
// @match        https://mbasic.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://www.messenger.com/*
// @match        https://messenger.com/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// @grant        GM.openInTab
// @inject-into  content
// @noframes
// @run-at       document-idle
// ==/UserScript==
(async()=>{
 'use strict';
 if(window.top!==window.self||typeof GM==='undefined')return;
 const KEY='agenthq-one-page-handoff-v1',ENDPOINT='https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-safari-bridge';
 function pageUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!['facebook.com','www.facebook.com','m.facebook.com','mbasic.facebook.com','web.facebook.com','messenger.com','www.messenger.com'].includes(u.hostname))throw Error('Open the approved Facebook or Messenger page.');if(/^\/(login|checkpoint|recover|oauth|dialog|reg|security|settings)(?:[/.]|$)/i.test(u.pathname))throw Error('Finish signing in, then return to Riley’s thread.');u.hostname=u.hostname.endsWith('messenger.com')?'www.messenger.com':'www.facebook.com';u.hash='';const keep=new URLSearchParams();for(const key of ['id','story_fbid','fbid','v','set','sk','q'])for(const v of u.searchParams.getAll(key))keep.append(key,v);keep.sort();u.search=keep.toString();u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.href}
 const valid=g=>g&&g.kind==='agenthq.safari-handoff.v1'&&/^[0-9a-f]{64}$/.test(g.token||'')&&typeof g.id==='string'&&Date.parse(g.expires_at)>Date.now()&&Date.parse(g.expires_at)<=Date.now()+16*60*1000;
 const hq=location.origin==='https://hostkris.github.io'&&location.pathname.startsWith('/AgentHQ/');
 if(hq){
  document.addEventListener('agenthq-safari-command',async event=>{
   let command;try{command=JSON.parse(event.detail)}catch{return}
   const answer=(ok,message)=>document.dispatchEvent(new CustomEvent('agenthq-safari-result',{detail:JSON.stringify({nonce:command.nonce,ok,message})}));
   if(typeof command.nonce!=='string'||command.nonce.length>100)return;
   if(command.action==='ping'){answer(true,'Connected Safari reader is available.');return}
   if(command.action==='clear'){await GM.deleteValue(KEY);answer(true,'Safari handoff cleared.');return}
   if(command.action!=='connect')return;
   try{
    const grant=command.handoff;if(!valid(grant))throw Error('This reading approval expired.');
    if(pageUrl(grant.source_url)!==grant.source_url)throw Error('Invalid approved page.');
    // Discard any previous page capability. No permanent account pairing.
    await GM.setValue(KEY,{kind:grant.kind,id:grant.id,token:grant.token,source_url:grant.source_url,expires_at:grant.expires_at});
    try{await GM.openInTab(grant.source_url,false);answer(true,'Approved page opened. Keep Safari open while Riley reads it.')}catch{answer(true,'Connected. Tap Open approved page to start the read in Safari.')}
   }catch(e){answer(false,e.message||'Safari connection failed.')}
  });
  return;
 }
 let grant=await GM.getValue(KEY);if(!valid(grant)){if(grant)await GM.deleteValue(KEY);return}
 let here;try{here=pageUrl(location.href)}catch{return}
 if(here!==grant.source_url)return; // No access to other sites, pages or conversations.
 if(document.getElementById('agenthq-connected-reader'))return;
 const host=document.createElement('div');host.id='agenthq-connected-reader';document.documentElement.append(host);const root=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=':host{all:initial}.bar{position:fixed;inset:auto 10px calc(10px + env(safe-area-inset-bottom));z-index:2147483647;padding:14px;background:#f5f8ffed;color:#172535;box-shadow:0 3px 24px #0003;border:1px solid #b5c7dd;border-radius:18px;font:15px -apple-system,BlinkMacSystemFont,sans-serif;backdrop-filter:blur(20px)}p{margin:0 0 10px;line-height:1.4}button,a{display:inline-block;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;margin:0 8px 0 0;padding:10px 12px;min-height:44px;box-sizing:border-box;border:0;border-radius:12px;background:#e0e7f1;color:#172535}a{background:#176f86;color:white;text-decoration:none}';root.append(style);
 const bar=document.createElement('section');bar.className='bar';root.append(bar);
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Agent HQ: one approved page read will start in 5 seconds. Only loaded text will be shared with Riley and Groq.';bar.append(status);
 const stop=document.createElement('button');stop.textContent='Stop this read';bar.append(stop);
 const back=document.createElement('a');back.href='https://hostkris.github.io/AgentHQ/';back.textContent='Agent HQ';bar.append(back);
 let stopped=false,submitted=false;
 const forget=async()=>{const current=await GM.getValue(KEY);if(current?.token===grant.token)await GM.deleteValue(KEY)};
 stop.addEventListener('click',async()=>{stopped=true;await forget();status.textContent=submitted?'Local handoff cleared. To stop analysis already submitted, revoke permission in Riley’s thread.':'Stopped. No page text was shared. Revoke the permission in Riley’s thread to close the request.';stop.disabled=true});
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const ensure=()=>{if(stopped||document.hidden||!valid(grant)||pageUrl(location.href)!==grant.source_url)throw Error('Read paused, page changed or approval expired. Return to Riley’s thread to reconnect.');if([...document.querySelectorAll('input[type="password"]')].some(e=>e.getClientRects().length))throw Error('Sign-in fields are visible. Finish signing in, then reconnect from Riley’s thread.')};
 async function call(body){const response=await GM.xmlHttpRequest({method:'POST',url:ENDPOINT,headers:{'Content-Type':'application/json',Authorization:'Bearer '+grant.token},data:JSON.stringify(body),timeout:65000,responseType:'text'});let data;try{data=JSON.parse(response.responseText)}catch{throw Error('The connection did not return a result. Check Riley’s thread; do not submit again blindly.')};if(response.status!==200||!data.success)throw Error(data.error||'The approved read was not accepted.');return data}
 function pageText(){
  const main=document.querySelector('[role="main"]')||document.body,parts=[];let length=0,truncated=false;
  const walker=document.createTreeWalker(main,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
   const el=node.parentElement;if(!el||el.closest('script,style,noscript,input,textarea,select,[contenteditable],#agenthq-connected-reader,#agenthq-safari-reader,[hidden],[aria-hidden="true"]'))continue;
   if(!el.getClientRects().length)continue;const css=getComputedStyle(el);if(css.visibility==='hidden'||css.display==='none')continue;
   const text=node.textContent.replace(/\s+/g,' ').trim();if(!text)continue;parts.push(text);length+=text.length+1;if(length>24000){truncated=true;break}
  }
  return {text:parts.join('\n').slice(0,24000),truncated};
 }
 try{
  // The owner explicitly chose "Connect Safari & read" in the approved card.
  // Wait for a foreground tab; never read another page or run hidden.
  while(document.hidden&&!stopped&&valid(grant))await wait(500);
  await wait(5000);ensure();
  await call({action:'check',source_url:grant.source_url});ensure();
  let captured=pageText();for(let i=0;captured.text.length<80&&i<20;i++){await wait(1000);ensure();captured=pageText()}
  if(captured.text.length<80)throw Error('Not enough readable text loaded. Open the content, then reconnect from Riley’s thread.');
  ensure();const latest=await GM.getValue(KEY);if(latest?.token!==grant.token)throw Error('The handoff changed. Return to Riley’s thread.');
  const capture={kind:'agenthq.safari-page.v1',url:grant.source_url,title:document.title.slice(0,200),text:captured.text,captured_at:new Date().toISOString(),truncated:captured.truncated};
  status.textContent='Sending this approved page to Riley. Keep Safari open until the result is confirmed…';submitted=true;
  // Consume the local capability before sending. No automatic retry on an
  // uncertain response, reload, duplicate tab or provider error.
  await forget();ensure();await call({action:'analyze',source_url:grant.source_url,capture});
  status.textContent='Riley’s report is saved in Agent HQ. This reading permission has been used.';stop.hidden=true;
 }catch(e){await forget();status.textContent=e.message||'The read stopped. Check Riley’s thread before reconnecting.';stop.hidden=true}
})();
