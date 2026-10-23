export const READER_KIND='agenthq.safari-page.v1';
export function socialUrl(value:unknown){
 if(typeof value!=='string'||value.length>1500)throw Error('Enter the exact Facebook or Messenger page URL.');
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Use a secure Facebook or Messenger URL.');
 const hosts=['facebook.com','www.facebook.com','m.facebook.com','mbasic.facebook.com','web.facebook.com','messenger.com','www.messenger.com'];
 if(!hosts.includes(u.hostname.toLowerCase()))throw Error('Only Facebook and Messenger pages are supported.');
 if(/^\/(login|checkpoint|recover|oauth|dialog|reg|security|settings)(?:[/.]|$)/i.test(u.pathname))throw Error('Choose a content page, not a sign-in or settings page.');
 u.hostname=u.hostname.endsWith('messenger.com')?'www.messenger.com':'www.facebook.com';
 u.hash='';const keep=new URLSearchParams();
 for(const key of ['id','story_fbid','fbid','v','set','sk','q'])for(const v of u.searchParams.getAll(key))keep.append(key,v);
 keep.sort();u.search=keep.toString();u.pathname=u.pathname.replace(/\/+$/,'')||'/';
 if(u.href.length>1200)throw Error('Page URL is too long.');return u.href;
}
export function capturePacket(value:unknown,now=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Paste a capture from Read for Agent HQ.');
 const p=value as Record<string,unknown>;
 if(p.kind!==READER_KIND||typeof p.text!=='string'||p.text.trim().length<30||p.text.length>24000||p.text.includes('\0'))throw Error('The Safari capture is invalid or too large.');
 const when=Date.parse(String(p.captured_at));
 if(!Number.isFinite(when)||when>now+60000||now-when>20*60*1000)throw Error('Capture the page again; this capture is too old.');
 return {source_url:socialUrl(p.url),captured_at:new Date(when).toISOString(),text:p.text,title:String(p.title||'').slice(0,200),truncated:p.truncated===true};
}
