import {WORKERS,WORKER_ROLES} from './agent-initiative-core.js?v=20261107-initiative-1';
const labels={working:'Research and drafting underway',review:'Ready for your review',blocked:'Needs an owner decision',paused:'Paused in initiative list',dismissed:'Dismissed'};
const kinds={standing_goal:'Saved ongoing goal',repeated_work:'Observed across multiple records',scheduled_routine:'Recurring scheduled work',prior_project:'Earlier saved project'};
const fmt=(v,zone)=>{try{return v?new Intl.DateTimeFormat('en-US',{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'Not yet': 'Not yet'}catch{return 'Not yet'}};
function info(){
 const state=window.agentHQInitiatives;
 return {ready:!!state?.loaded?.(),setting:state?.setting?.(),ideas:state?.ideas?.()||[],
  patterns:state?.patterns?.()||[],phases:state?.phases?.()||[]};
}
function savedRefText(ref){
 const [type]=String(ref||'').split(':');
 return type==='goal'?'Saved goal':type==='project'?'Prior project':type==='task'?'Calendar task or reminder':type==='board'?'Personal planning board':'Saved owner record';
}
function stateOf(idea,phases){
 if(idea.status==='dismissed'||idea.status==='paused')return idea.status;
 const project=phases.find(p=>p.assignment_id===idea.project_id);
 if(project?.phase==='review')return 'review';
 if(['waiting_owner','waiting_permission'].includes(project?.phase))return 'blocked';
 return idea.status;
}
export function renderEleanorInitiatives(state,E,compact=false){
 const data=info(),zone=state?.settings?.timezone||'America/New_York';
 if(!data.ready)return '<section class="secretary-card"><h3>Autonomous agent initiatives</h3><p>Loading the private initiative and observed-work records…</p><button type="button" data-initiative-refresh>Refresh</button></section>';
 const {setting,ideas,patterns,phases}=data,enabled=setting?.enabled===true;
 const actionable=ideas.filter(i=>i.status!=='dismissed');
 const working=actionable.filter(i=>stateOf(i,phases)==='working').length;
 const review=actionable.filter(i=>stateOf(i,phases)==='review').length;
 if(compact)return '<section class="secretary-card hq-initiative-compact"><h3>Independent worker initiatives</h3>'+
  '<p>'+E(enabled?'Enabled · one specialist evaluation per eligible day when capacity permits':'Paused · no new initiatives')+
  ' · '+working+' working · '+review+' ready for review</p>'+
  '<button type="button" data-secretary-tab="initiatives">Open initiative and memory board</button></section>';
 const workerCounts=new Map(WORKERS.map(w=>[w,ideas.filter(i=>i.worker===w&&i.status!=='dismissed').length]));
 return '<section class="hq-initiative-desk"><div class="secretary-card"><h3>Independent agent initiative board</h3>'+
  '<p>All ten workers rotate through verified Agent HQ goals, recurring schedules, Calendar items and project history. They can discover work, use their real model, open a bounded internal team project, research public evidence through available tools, and report through Eleanor. No fabricated browsing or remembered activity is accepted.</p>'+
  '<p><strong>Latest evaluation:</strong> '+E(setting?.last_evaluated_on||'Not recorded')+
   ' · '+E(setting?.last_worker?setting.last_worker+' ('+(setting.last_outcome||'unknown')+')':'No worker has evaluated yet')+
   (setting?.last_error?' · Last blocker: '+E(setting.last_error):'')+'</p>'+
  '<form data-initiative-settings><label class="secretary-check"><input name="enabled" type="checkbox" '+(enabled?'checked':'')+'> Enable worker-generated internal project ideas</label>'+
   '<label>New projects per week<select name="max_week"><option value="0"'+(setting?.max_new_projects_week===0?' selected':'')+'>0 · evaluate without creating</option>'+
    [1,2,3].map(n=>'<option value="'+n+'"'+(setting?.max_new_projects_week===n?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
   '<label>Maximum concurrent self-initiated projects<select name="max_active">'+[0,1,2,3].map(n=>'<option value="'+n+'"'+(setting?.max_active_initiatives===n?' selected':'')+'>'+n+'</option>').join('')+'</select></label>'+
   '<button type="submit">Save autonomy limits</button><button type="button" data-initiative-refresh>Refresh records</button>'+
  '</form><p class="secretary-subtle">The scheduler normally evaluates one rotating specialist on each eligible Sunday–Friday day, only while configured model access and project capacity are available. Saturday is fully off. Pausing stops new ideas; existing projects remain separately controllable in Projects. Zero spending, publishing, account-change or private-inbox authority is granted.</p></div>'+
  '<section class="secretary-card"><h3>All ten specialist roles</h3><div class="hq-initiative-workers">'+WORKERS.map(w=>
   '<div><strong>'+E(w.charAt(0).toUpperCase()+w.slice(1))+'</strong><small>'+E(WORKER_ROLES[w])+
   '</small><span>'+workerCounts.get(w)+' saved initiative(s)</span></div>').join('')+'</div></section>'+
  '<section class="secretary-card"><h3>Worker-initiated projects and questions</h3>'+
   (!ideas.length?'<p>No independent proposals have been recorded yet. That is not evidence that a worker has already researched or created anything.</p>':
    ideas.filter(x=>x.status!=='dismissed').slice(0,30).map(i=>{
     const status=stateOf(i,phases);
     return '<article class="hq-initiative-entry"><div class="hq-initiative-heading"><strong>'+E(i.title)+'</strong><small>'+
      E(i.worker.charAt(0).toUpperCase()+i.worker.slice(1))+' · '+E(labels[status]||'Work status unknown')+
      ' · '+E(fmt(i.created_at,zone))+'</small></div>'+
      '<p><strong>Why:</strong> '+E(i.rationale)+'</p><p><strong>Observed need:</strong> '+E(i.observed_need)+'</p>'+
      '<p><strong>Real deliverable:</strong> '+E(i.deliverable)+'</p>'+
      '<p><strong>Evidence basis:</strong> '+E(kinds[i.pattern_kind]||'Saved data')+' · '+
      (Array.isArray(i.evidence_refs)?i.evidence_refs.map(r=>E(savedRefText(r))).join(', '):'not supplied')+'</p>'+
      '<p><strong>Public research questions:</strong> '+(Array.isArray(i.research_questions)&&i.research_questions.length?
        '<ul>'+i.research_questions.map(q=>'<li>'+E(q)+'</li>').join('')+'</ul>':
        'The project team will decide whether new external evidence is needed.')+'</p>'+
      '<div class="secretary-actions"><button type="button" data-initiative-project="'+E(i.project_id)+'">Open actual project</button>'+
       '<button type="button" data-initiative-dismiss="'+E(i.id)+'">Dismiss this entry</button></div>'+
      '<small>Questions are proposed, not proof of completed research. Project work and source citations appear only after the saved team actually produces them.</small></article>';
    }).join(''))+'</section>'+
  '<section class="secretary-card"><h3>What workers have grounded in your records</h3>'+
   (!patterns.length?'<p>As workers complete verified initiative assessments, their narrow source-linked observations will appear here. They do not have access to unspecified past conversations or unconnected accounts.</p>':
    '<div class="hq-initiative-memory">'+patterns.slice(0,30).map(p=>
     '<article><strong>'+E(p.worker.charAt(0).toUpperCase()+p.worker.slice(1))+' · '+E(kinds[p.pattern_kind]||'Observed work')+'</strong>'+
     '<p>'+E(p.summary)+'</p><small>'+E(savedRefText(p.focus_ref))+' · Last seen '+E(fmt(p.last_seen_at,zone))+'</small>'+
     '<button type="button" data-initiative-pattern="'+E(p.id)+'" data-disabled="'+(p.disabled?'false':'true')+'">'+
     (p.disabled?'Re-enable this observation':'Exclude this observation')+'</button></article>').join('')+'</div>')+
  '<p class="secretary-subtle">Excluded observations are no longer reused as worker memory. The original source goal, Calendar item or project is not removed.</p></section></section>';
}
export function bindEleanorInitiatives(root,helpers){
 const cloud=window.agentHQInitiatives;if(!cloud)return;
 const notify=v=>helpers.message(v);
 const run=async(btn,fn)=>{if(btn.disabled)return;btn.disabled=true;try{await fn()}catch(e){notify('Initiative change not confirmed: '+String(e.message||e))}finally{btn.disabled=false}};
 root.querySelectorAll('[data-initiative-refresh]').forEach(btn=>btn.onclick=()=>void run(btn,async()=>{await cloud.refresh();notify('Worker initiative records refreshed.');}));
 if(!cloud.loaded?.())return;
 const settings=root.querySelector('[data-initiative-settings]');
 settings?.addEventListener('submit',ev=>{ev.preventDefault();const btn=settings.querySelector('[type=submit]');void run(btn,async()=>{
  const f=new FormData(settings);
  await cloud.updateSetting({enabled:f.get('enabled')==='on',max_new_projects_week:Number(f.get('max_week')),max_active_initiatives:Number(f.get('max_active'))});
  notify('Saved: your internal worker initiative limits are active. Existing projects have not been approved for outside actions.');
 });});
 root.querySelectorAll('[data-initiative-project]').forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.initiativeProject;
  if(id&&window.agentHQOpenProjects)window.agentHQOpenProjects(id);
  else notify('Open Agent HQ Projects to review the saved worker assignment.');
 });
 root.querySelectorAll('[data-initiative-dismiss]').forEach(btn=>btn.onclick=()=>void run(btn,async()=>{
  await cloud.controlIdea(btn.dataset.initiativeDismiss,'dismiss');
  notify('Entry dismissed from Eleanor’s initiative board. The existing internal project remains accessible in Projects.');
 }));
 root.querySelectorAll('[data-initiative-pattern]').forEach(btn=>btn.onclick=()=>void run(btn,async()=>{
  await cloud.disablePattern(btn.dataset.initiativePattern,btn.dataset.disabled==='true');
  notify('The worker observation preference was saved. Original records were left unchanged.');
 }));
}
