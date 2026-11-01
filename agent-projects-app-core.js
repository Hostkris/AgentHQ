export const escapeProjectText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function projectStatus(project){const s=project.session||{};return project.owner_paused?'Paused':({review:'Ready for review',approved:'Approved',waiting_owner:'Needs information',waiting_permission:'Needs authorization',planning:'Planning',discussion:'Workers completing steps',drafting:'Creating the draft',checking:'Team review',polishing:'Finishing revisions'})[s.phase]||'In progress';}
export function projectMatches(project,filter,query){const phase=project.session?.phase;return (filter==='all'||filter==='ready'&&phase==='review'||filter==='approved'&&phase==='approved'||filter==='working'&&!['review','approved'].includes(phase))&&String(project.title||'').toLowerCase().includes(String(query||'').toLowerCase());}
export function projectFileType(file){return ['image/png','image/jpeg','image/webp'].includes(file?.mime_type)?'image':file?.mime_type==='application/pdf'?'pdf':/^(text\/|application\/json)/.test(file?.mime_type||'')?'text':'file';}
export function finalReviewAvailable(session,file,reference=false){return session?.phase==='review'&&!!session.output_version&&!!session.final_output&&!reference&&(!file||(file.revision===session.revision&&['final','original'].includes(file.artifact_kind)));}
export const fileRole=file=>({final:'Final deliverable',original:'Original final text',step:'Worker handoff'})[file.artifact_kind]||'Saved file';
export function downloadedBlob(value){
 if(!value?.filename||!value.mime_type||typeof value.base64!=='string')throw Error('The download was not returned');
 const bytes=Uint8Array.from(atob(value.base64),c=>c.charCodeAt(0));if(!bytes.length)throw Error('The download was empty');
 return new Blob([bytes],{type:value.mime_type});
}
export function saveProjectBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
