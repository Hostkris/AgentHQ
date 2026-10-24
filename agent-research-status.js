// Public error descriptions only. Raw provider payloads, keys and request text
// must never be copied into an error card, log summary or research report.
const messages={
 missing_key:'Groq public research is not configured on the server. The account owner must restore GROQ_API_KEY in server settings; never send a key in chat.',
 authentication:'Groq rejected the server credentials (HTTP 401). Restore the Groq connection before retrying.',
 permission:'Groq denied access to the research model or browser_search tool (HTTP 403). Check the Groq project permissions before retrying.',
 rate_limited:'Groq rate-limited public research (HTTP 429). The request can be retried after the limit resets; no paid fallback was used.',
 request_rejected:'Groq rejected the browser-search request (HTTP 400). The team must correct the model/tool request before retrying.',
 model_unavailable:'The configured Groq research model is unavailable for this project. Restore model access before retrying.',
 provider_unavailable:'Groq public research is temporarily unavailable. The saved request can be retried.',
 network:'Groq could not be reached. The saved request can be retried after the connection returns.',
 timeout:'Groq browser search timed out. No completed research report was confirmed; retry the saved request.',
 no_evidence:'Groq returned no provider-confirmed search sources. No research report was marked complete. Retry the search rather than relying on an unsupported answer.',
 incomplete:'Groq returned an incomplete research report. No report was marked complete. Retry the same topic or narrow it.',
 invalid_report:'The research response claimed an outside action without evidence. No report was marked complete; the team will correct the response.',
 save_failed:'The research result could not be confirmed as saved. Check research history before retrying.',
 unknown:'Public research did not complete. No verified findings were returned; the saved request can be retried.'
};
const ownerCodes=new Set(['missing_key','authentication','permission','model_unavailable']);
export class ResearchProviderError extends Error{
 constructor(code,{status=0,field='',retryAt=null}={}){
  const known=Object.hasOwn(messages,code)?code:'unknown';
  const safeField=/^(?:model|messages|tools|tool_choice|reasoning_effort|reasoning_format|citation_options|max_completion_tokens|response_format|search_settings)(?:[.\[\]a-z0-9_]+)?$/i.test(field)?field:'';
  const http=known==='provider_unavailable'&&Number.isInteger(status)&&status>=500&&status<=599?' HTTP '+status+'.':'';
  super('[research:'+known+'] '+messages[known]+http+(safeField?' Field: '+safeField+'.':'')+(retryAt?' Retry after '+retryAt+'.':''));
  this.name='ResearchProviderError';this.code=known;this.status=status;this.retryAt=retryAt;this.requiresOwner=ownerCodes.has(known);
 }
}
export function researchFailureInfo(value){
 const raw=value instanceof Error?value.message:String(value||'');
 const match=raw.match(/\[research:([a-z_]+)\]/),known=match&&Object.hasOwn(messages,match[1])?match[1]:null;
 let code=known;
 if(!code){
  code=/quota|rate.limit|HTTP 429/i.test(raw)?'rate_limited':/HTTP 401|credentials/i.test(raw)?'authentication':/HTTP 403|did not authorize|denied.*tool/i.test(raw)?'permission':/HTTP 400|invalid_request/i.test(raw)?'request_rejected':/GROQ_API_KEY|needs.*Groq.*connection/i.test(raw)?'missing_key':/did not confirm.*search|no verifiable|no.*search.*evidence/i.test(raw)?'no_evidence':/incomplete|complete report|narrower topic/i.test(raw)?'incomplete':/not committed|could not be saved/i.test(raw)?'save_failed':/outside action/i.test(raw)?'invalid_report':/timed out|timeout|TimeoutError|AbortError/i.test(raw)?'timeout':/network|connection|fetch failed/i.test(raw)?'network':'unknown';
 }
 const retryAt=raw.match(/Retry after (\d{4}-\d\d-\d\dT[0-9:.]+Z)/)?.[1]||null;
 const field=raw.match(/Field: ((?:model|messages|tools|tool_choice|reasoning_effort|reasoning_format|citation_options|max_completion_tokens|response_format|search_settings)[.\[\]a-z0-9_]*)(?:\.|$)/i)?.[1]?.replace(/\.$/,'');
 const http=code==='provider_unavailable'?raw.match(/HTTP (5\d\d)/)?.[1]:null;
 return {code,message:messages[code]+(http?' HTTP '+http+'.':'')+(field?' Field: '+field+'.':''),retryAt,requiresOwner:ownerCodes.has(code),retryLabel:'Retry research'};
}
export function researchFailure(error){
 if(error instanceof ResearchProviderError)return error;
 const info=researchFailureInfo(error);
 return new ResearchProviderError(info.code==='unknown'&&['TimeoutError','AbortError'].includes(error?.name)?'timeout':info.code,{retryAt:info.retryAt});
}
