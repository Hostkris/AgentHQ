import {socialUrl} from './policy.ts';
// Only direct, whole-message decisions count. Quotes, negation, conditions and
// discussions of approval are never converted into an approval by an AI model.
export function readChatInput(value:unknown){
 if(typeof value!=='string'||!value.trim()||value.length>1000)throw Error('Keep this Facebook research message between 1 and 1,000 characters.');
 const text=value.trim(),normal=text.toLowerCase().replace(/[’]/g,"'").replace(/[.!]+$/,'').trim();
 let intent='other',choice:number|null=null;
 const numbered=normal.match(/^(approve|approved|deny|denied|revoke|stop|continue|read)\s+(\d{1,2})$/);
 if(numbered){intent=/^approv/.test(numbered[1])?'approve':/^(deny|denied)$/.test(numbered[1])?'deny':/^(revoke|stop)$/.test(numbered[1])?'revoke':'continue';choice=Number(numbered[2])}
 else if(/^(approved|approve|yes|yes please|yes approved|authorized|authorised|you are approved|you're approved|you are authorized|you're authorized|you have my permission|green light|you got the green light|you have the green light|go ahead|go ahead please|proceed)$/.test(normal))intent='approve';
 else if(/^(no|no thanks|denied|deny|not approved|do not approve|don't approve|red light|stop|stop please|cancel|cancel it|revoke|don't do it|do not do it)$/.test(normal))intent='deny';
 else if(/^(continue|continue please|try the reader again|start the read|read it|resume)$/.test(normal))intent='continue';
 else if(/^\d{1,2}$/.test(normal))choice=Number(normal);
 const urls=text.match(/https:\/\/[^\s<>"']+/gi)||[];
 let source_url:string|null=null;
 if(urls.length===1){try{source_url=socialUrl(urls[0].replace(/[.,;!?)]+$/,''))}catch{}}
 if(!numbered&&intent==='other'&&/\b(facebook|messenger)\b/i.test(text)&&/\b(read|research|review|check|analy[sz]e|audit|look|engagement)\b/i.test(text)&&!/\b(don't|do not|not|never|stop|cancel)\b/i.test(normal))intent='request';
 // A bare link only continues an explicit question; it cannot approve a read.
 return {text,intent,choice,source_url,needs_url:urls.length>0&&!source_url};
}
