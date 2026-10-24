// Shared, deterministic rules. Model output never chooses its own stage or speaker.
const phases={planning:'team planning',discussion:'team discussion',drafting:'drafting',checking:'peer review',polishing:'final editing'};
const kinds={planning:'plan',discussion:'contribute',drafting:'draft',checking:'check',polishing:'final'};
const codes=new Set(['invalid_response','empty_response','wrong_stage','wrong_worker','self_address','invalid_recipient','recipient_mismatch','invalid_plan','invalid_query','missing_question','unsafe_site','incomplete_deliverable','unnecessary_approval','nonessential_question','invalid_diagnosis']);
const label=id=>String(id||'worker').replace(/^./,c=>c.toUpperCase());
export class ProjectResponseError extends Error{
 constructor(code,message){super(message);this.name='ProjectResponseError';this.code=codes.has(code)?code:'invalid_response';this.responseKind='';}
}
export function projectResponseContract(s){
 const worker=s.active_worker||s.next_worker;
 const recipients=(s.team_order||[]).filter(id=>id!==worker);
 const primary=s.peer_target?'answer':kinds[s.phase];
 const allowed=s.phase==='planning'?['plan','research']:s.peer_target?['answer','ask_owner','permission','research']:
  [primary,'ask_owner','permission','research',...(s.peer_exchanges<3&&recipients.length?['ask_team']:[])];
 return {worker,phase:s.phase,stage:phases[s.phase]||'this project stage',primary,allowed,recipients};
}
export function projectResponseFailure(error,s){
 const code=error instanceof ProjectResponseError?error.code:null;
 const message=error instanceof Error?error.message:'The team turn was interrupted';
 const kind=['plan','research','ask_team','answer','contribute','draft','check','final','ask_owner','permission'].includes(error?.responseKind)?'/'+error.responseKind:'';
 return code?'Response correction ['+code+'/'+s.phase+'/'+s.active_worker+'/'+s.revision+kind+']. '+message:message;
}
export function projectResponseRecovery(s,message=s.last_error){
 if(!message)return null;
 const match=String(message).match(/^Response correction \[([a-z_]+)\/([a-z]+)\/([a-z]+)\/(\d+)(?:\/([a-z_]+))?\]\. /);
 const c=projectResponseContract(s);
 if(match&&(match[2]!==s.phase||match[3]!==c.worker||Number(match[4])!==s.revision))return null;
 // Existing failures remain recoverable after upgrading the app.
 const code=match&&codes.has(match[1])?match[1]:
  String(message).startsWith('The worker returned a response for the wrong project stage')?'wrong_stage':
  String(message).startsWith('The question must be addressed to another assigned teammate')?'invalid_recipient':null;
 const summary=match?String(message).slice(match[0].length):String(message);
 const target=['self_address','invalid_recipient','recipient_mismatch'].includes(code);
 const required=['unnecessary_approval','nonessential_question'].includes(code)?c.primary:match?.[5]&&c.allowed.includes(match[5])?match[5]:target&&c.allowed.includes('ask_team')&&s.phase==='discussion'?'ask_team':code==='invalid_query'?'research':code==='unsafe_site'?'permission':c.primary;
 const recipients=required==='answer'?[s.peer_return_worker]:required==='check'?[s.lead_worker]:c.recipients;
 let instruction='Retry '+label(c.worker)+"’s saved turn in "+c.stage+'.';
 if(code){
  instruction='Respond only as '+c.worker+' in '+c.phase+'. Return one JSON object with kind '+required+'. Allowed kinds: '+c.allowed.join(', ')+'.';
  if(c.allowed.includes('ask_team'))instruction+=' For ask_team, set recipient to '+c.recipients.join(' or ')+', address that teammate in the text, and never address yourself.';
  if(s.peer_target)instruction+=' Answer the saved question from '+s.peer_return_worker+'; do not start another team question.';
  if(required==='check')instruction+=' Address the review to the lead '+s.lead_worker+'.';
  if(['unnecessary_approval','nonessential_question'].includes(code))instruction+=' Do the already-authorized work using saved context, teammates and public research. Do not repeat this unnecessary owner interruption.';
  instruction+=' Keep the owner brief, saved draft, teammate feedback and current revision. Do not skip ahead, restart the project or claim outside actions.';
 }
 const hint=code?(target?'The retry will ask '+label(c.worker)+' to address '+(recipients.map(label).join(' or ')||'the assigned teammate')+'.':
  'The retry will ask '+label(c.worker)+' for '+(s.peer_target?'an answer to the saved teammate question':c.stage==='peer review'?'a review of the saved draft':'the response required for '+c.stage)+'.'):
  'Retry the current turn when the worker connection is available.';
 return {code,summary,instruction,hint,button:target?'Correct recipient & retry':code?'Correct response & retry':'Retry this turn'};
}
