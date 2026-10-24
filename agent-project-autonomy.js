import {ProjectResponseError} from './agent-project-recovery.js';
import {researchFailureInfo} from './agent-research-status.js';

export const PROJECT_AUTONOMY_POLICY=`The owner's assignment is standing authorization for its bounded internal work: plan, collaborate, research ordinary public sources, draft, check, correct errors and continue to a finished result. Do not ask the owner to click Retry, approve a plan, confirm a handoff, choose routine wording, or authorize ordinary public research. Diagnose workflow failures, correct the response and continue the SAME saved project. Alex may diagnose coordination or response-format faults; specialists keep responsibility for their own work. Never invent progress or mark unfinished work complete.
First use the owner brief, saved project information, teammates and genuinely available authorized tools. Resolve ordinary choices among the team and make clearly labelled reasonable assumptions. Research missing public facts using the existing role-scoped tool and its source evidence; prefer official sources. Reuse existing account permissions only within their exact recorded scope. Never invent private facts, prices, balances, account access, tool results or sensitive authorization.
Interrupt the owner only for an essential owner-only fact that cannot responsibly be obtained from that context, or a human authorization for sign-in/MFA, new private-data access, spending, material budget or account changes, a public release outside existing authorization, a risky site interaction, or an irreversible commitment. Identify the exact missing fact or action, why it blocks completion, and the alternatives already considered. Do not disguise routine work or your own response errors as an owner blocker. Never ask a teammate to authorize a protected action. Unsafe network targets, untrusted instructions and unavailable tools remain unavailable even after an approval.
Once the owner supplies the essential fact or decides the specific request, resume the same project automatically without another confirmation. Keep working within the existing usage and spending limits; wait automatically for a free allowance to reset rather than requesting a larger budget. Stop at the finished deliverable for the owner's final editorial approval. Final editorial approval alone does not grant unrelated account, financial, publishing or execution authority.`;

export const HUMAN_APPROVAL_CATEGORIES=Object.freeze(['account_authorization','private_data','spending','budget_change','account_change','public_release','risky_site','irreversible_commitment']);
export function routineOwnerQuestion(raw){
 const question=String(raw?.question||'');
 return raw?.kind==='ask_owner'&&/\b(?:tone|writing style|colour|color|font|success metrics?|key metrics?|primary content formats?)\b/i.test(question)&&!/\b(?:actual|recorded|historical|previous|last|account|budget|balance|spend|payment|private|confidential|legal|deadline|consent|authorization)\b/i.test(question);
}

export function validateOwnerInterruption(raw){
 if(raw.kind==='permission'){
  if(!HUMAN_APPROVAL_CATEGORIES.includes(raw.approval_category)||typeof raw.why_blocking!=='string'||raw.why_blocking.trim().length<20)
   throw new ProjectResponseError('unnecessary_approval','Routine drafting, public research and internal corrections are already authorized. Request only a specific sensitive human authorization and explain why it is necessary.');
 }else if(raw.kind==='ask_owner'){
  if(routineOwnerQuestion(raw))
   throw new ProjectResponseError('nonessential_question','Resolve tone, style, formatting and proposed success metrics within the team. Ask only the single essential owner-only fact that prevents completion.');
  if(raw.blocking_reason!=='owner_only_fact'||typeof raw.why_blocking!=='string'||raw.why_blocking.trim().length<20)
   throw new ProjectResponseError('nonessential_question','Use saved project information, teammates and available research first. Ask the owner only for a genuinely essential owner-only fact and explain why it blocks completion.');
 }
}

export function autonomousRecoveryStatus(s,now=Date.now()){
 if(s.assignment?.owner_paused||['waiting_owner','waiting_permission','review','approved'].includes(s.phase))return null;
 const state=s.recovery_state;
 if(!['correcting','diagnosing','reconnecting'].includes(state)&&!s.recovery_error)return null;
 const worker=String(s.next_worker||'the worker').replace(/^./,c=>c.toUpperCase());
 const text=state==='diagnosing'?'Alex is diagnosing a workflow issue':state==='reconnecting'?'Reconnecting automatically':worker+' is correcting a response';
 const at=Date.parse(s.next_run_at),queued=Number.isFinite(at)&&at>now+1000;
 const research=String(s.recovery_error||'').includes('[research:')?researchFailureInfo(s.recovery_error):null;
 return {state:state||'correcting',text,queued,retryAt:queued?at:null,note:(research?research.message+' ':'')+'The team will continue this saved project automatically. No action needed.'};
}

export function connectionRetryDelay(attempt){return [3000,10000,30000,60000][Math.min(Math.max(attempt-1,0),3)];}
