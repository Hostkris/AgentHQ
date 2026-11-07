const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
function sourceURL(value){
 try{const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':')||/\.(?:local|internal|localhost)$/i.test(u.hostname))return null;
  return u.href;
 }catch{return null;}
}
export function consultingMessageHTML(message){
 const body=String(message.body||'');let result='',last=0;
 for(const match of body.matchAll(/https:\/\/[^\s<>"'\]\)]+/gi)){
  const raw=match[0],url=raw.replace(/[.,;!?]+$/,''),safe=sourceURL(url);
  result+=escape(body.slice(last,match.index));
  result+=safe?'<a href="'+escape(safe)+'" target="_blank" rel="noopener noreferrer">'+escape(url)+'</a>'+escape(raw.slice(url.length)):escape(raw);
  last=match.index+raw.length;
 }
 result+=escape(body.slice(last));
 if(uuid(message.consultation_project_id))result+='<button type="button" class="custom-msg-project" data-consultation-project="'+message.consultation_project_id+'">Open project</button>';
 return result;
}
