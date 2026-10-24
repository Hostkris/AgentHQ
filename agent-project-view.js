// Pure presentation helpers, shared by the app and browser/Node checks.
export const projectPhaseLabel=s=>s.assignment?.owner_paused?'Paused':s.last_error?'Needs attention':s.pending_research_query&&s.active_run?'Researching public sources':
 ({planning:'Alex is assembling the team',discussion:'Team discussion',drafting:'Writing the shared draft',checking:'Peer review',polishing:'Applying the team’s feedback',waiting_owner:'Waiting for a private answer',waiting_permission:'Waiting for a private approval',review:'Ready for your review',approved:'Approved'})[s.phase]||'Team project';
export function projectIsTyping(s,now=Date.now()){
 return !!s.active_run&&!!s.active_worker&&Date.parse(s.lease_until)>now&&!s.assignment?.owner_paused&&
  ['planning','discussion','drafting','checking','polishing'].includes(s.phase);
}
export function projectRoomHTML({projects,selected,notes,escape,format,remove,label,deleted,inlineTyping=true}){
 if(!projects.length)return '<div class="hq-project-empty"><span aria-hidden="true">✧</span><h2>A room for your team</h2><p>Assign a project in Alex’s conversation. The team will work together here, ask you questions privately, and bring back the finished result.</p><button type="button" data-chat="alex">Message Alex</button></div>';
 const s=projects.find(p=>p.assignment_id===selected)||projects[0],a=s.assignment||{};
 const chips=projects.map(p=>'<button type="button" data-project-open="'+escape(p.assignment_id)+'" class="hq-project-chip'+(p.assignment_id===s.assignment_id?' selected':'')+'" aria-pressed="'+(p.assignment_id===s.assignment_id)+'">'+
  (p.phase==='review'?'<span class="hq-ready-dot" aria-label="Ready for review"></span>':'')+'<span>'+escape(p.assignment?.title||'Team project')+'</span></button>').join('');
 const isPaused=!!a.owner_paused;
 const controls=!['review','approved'].includes(s.phase)?'<button type="button" data-project-control="'+(isPaused?'resume':'pause')+'" data-project-id="'+escape(s.assignment_id)+'">'+(isPaused?'Resume':'Pause')+'</button>':'';
 const feed=(notes||[]).filter(n=>n.assignment_id===s.assignment_id&&n.sender_kind==='agent'&&n.project_kind&&n.project_kind!=='owner_context'&&!deleted('team',n.id))
  .map(n=>'<article class="hq-team-turn ios-message-row incoming" data-project-message="'+escape(n.id)+'">'+
   '<div class="hq-team-avatar" aria-hidden="true">'+escape(label(n.sender_id).slice(0,1))+'</div><div class="ios-message-bubble theirs">'+remove('team',n.id)+
   '<div class="hq-team-speaker"><strong>'+escape(label(n.sender_id))+'</strong>'+(n.recipient_id?'<span>to '+escape(label(n.recipient_id))+'</span>':'')+
   '<time datetime="'+escape(n.created_at||'')+'">'+escape(new Date(n.created_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))+'</time></div>'+
   '<div class="hq-team-copy">'+((n.project_kind==='research'||String(n.body).startsWith('PUBLIC_RESEARCH_V1\n'))?'<p>Here are the findings and sources for my part of this project.</p><details><summary>Read public research and sources</summary>'+format(String(n.body).replace(/^PUBLIC_RESEARCH_V1\n/,''))+'</details>':format(n.body))+'</div>'+(n.project_revision<s.revision?'<small class="hq-turn-version">Version '+escape(n.project_revision)+'</small>':'')+'</div></article>').join('');
 const typing=inlineTyping&&projectIsTyping(s)?'<div class="hq-team-typing" role="status" aria-label="'+escape(label(s.active_worker))+' is preparing a response"><span>'+escape(label(s.active_worker))+'</span><div class="ios-typing" aria-hidden="true"><span></span><span></span><span></span></div></div>':'';
 const notice=s.last_error?'<div class="hq-project-notice" role="status">'+escape(s.last_error)+' <button type="button" data-project-control="retry" data-project-id="'+escape(s.assignment_id)+'">Retry this turn</button></div>':
  Date.parse(s.next_run_at)>Date.now()+15000&&!['review','approved','waiting_owner','waiting_permission'].includes(s.phase)?'<p class="hq-project-notice">Work is saved. The free worker allowance resets '+escape(new Date(s.next_run_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))+'. Keep Agent HQ open to continue then.</p>':
  ['waiting_owner','waiting_permission'].includes(s.phase)?'<p class="hq-project-notice">'+escape(label(s.waiting_worker))+' has sent you a private '+(s.phase==='waiting_permission'?'approval request':'question')+'. <button type="button" data-project-answer-thread="'+escape(s.assignment_id)+'">Open their message</button></p>':'';
 const final=['review','approved'].includes(s.phase)&&s.final_output?'<article class="hq-finished-project" data-project-final="'+escape(s.assignment_id)+'">'+
  '<div class="hq-finished-heading">'+remove('work',s.assignment_id)+'<span class="hq-finished-check" aria-hidden="true">✓</span><div><small>FINISHED TEAM WORK · VERSION '+escape(s.revision)+'</small><h3>'+escape(a.title||'Completed project')+'</h3></div></div>'+
  '<div class="hq-finished-content">'+format(s.final_output)+'</div>'+
  (s.phase==='approved'?'<p class="hq-approved-label">✓ Approved · Saved for future reference</p>':
   '<div class="hq-review-actions"><button type="button" data-project-review="approve" data-project-id="'+escape(s.assignment_id)+'" data-project-version="'+escape(s.output_version)+'">Approve</button><button type="button" data-project-review="changes" data-project-id="'+escape(s.assignment_id)+'" data-project-version="'+escape(s.output_version)+'">Request changes</button></div><p class="hq-review-hint">You can also text your changes below, or reply “approved”. Approval covers this finished work only.</p>')+'</article>':'';
 return '<section class="hq-project-room" data-project-room="'+escape(s.assignment_id)+'"><nav class="hq-project-picker" aria-label="Team projects">'+chips+'</nav>'+
  '<div class="hq-project-heading"><div><h2>'+escape(a.title||'Team project')+'</h2><p>'+escape(projectPhaseLabel(s))+' · Version '+escape(s.revision)+'</p></div>'+controls+'</div>'+
  '<div class="hq-project-people">'+escape((s.team_order?.length?s.team_order:['alex']).map(label).join(' · '))+'</div>'+
  '<div class="hq-team-timeline">'+(feed||(['review','approved'].includes(s.phase)?'':'<p class="hq-project-starting">The team is preparing the next contribution.</p>'))+typing+notice+(deleted('work',s.assignment_id)?'':final)+'</div></section>';
}
export function projectPrivateHTML({projects,worker,escape,label,remove=()=>'',deleted=()=>false}){
 const questions=projects.filter(s=>['waiting_owner','waiting_permission'].includes(s.phase)&&s.waiting_worker===worker&&!deleted('message',s.question_message_id));
 const ready=worker==='alex'?projects.filter(s=>s.phase==='review'&&!deleted('work',s.assignment_id)):[];
 return questions.map(s=>'<aside class="hq-private-project" data-project-question="'+escape(s.assignment_id)+'">'+(s.question_message_id?remove('message',s.question_message_id):'')+'<small>'+escape(s.assignment?.title||'Team project')+'</small><p>'+escape(s.pending_question)+'</p>'+
  (s.phase==='waiting_permission'?'<div class="hq-private-decisions"><button type="button" data-project-permission="approved" data-project-id="'+escape(s.assignment_id)+'">Approve request</button><button type="button" data-project-permission="denied" data-project-id="'+escape(s.assignment_id)+'">Deny</button></div>':
   '<button type="button" data-project-answer-select="'+escape(s.assignment_id)+'">Reply to this project</button>')+'</aside>').join('')+
  ready.map(s=>'<aside class="hq-private-project hq-manager-ready">'+remove('work',s.assignment_id)+'<small>Ready for your review · Version '+escape(s.revision)+'</small><strong>'+escape(s.assignment?.title||'Finished team project')+'</strong><button type="button" data-project-open="'+escape(s.assignment_id)+'">Review in Company HQ <span aria-hidden="true">›</span></button></aside>').join('');
}
