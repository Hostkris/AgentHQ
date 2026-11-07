export async function requestChatGPT(db:any,owner:string,worker:string,question:string,reason:string,key:string,project?:string,revision?:number,run?:string){
 const {data,error}=await db.rpc('request_agent_chatgpt_help',{p_owner:owner,p_worker:worker,p_question:question,p_reason:reason,p_key:key,p_project:project||null,p_revision:revision??null,p_run:run||null});
 if(error||!data)throw Error(error?.message||'Eleanor could not save the ChatGPT request');
 return data;
}
export function chatGPTRequestReply(result:any){
 if(result.status==='owner_required')return 'Eleanor saved this ChatGPT request for your approval because it involves money or automatic approval is disabled. Open the ChatGPT app in Agent HQ to review the exact request. Nothing was sent to ChatGPT.';
 return 'Eleanor approved and saved this ChatGPT handoff. The worker and reason are in the ChatGPT app and Eleanor’s notices. Open ChatGPT from the app to start the session; the answer and files will return for your review.';
}
