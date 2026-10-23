export async function alexBrief(db:any,owner:string,period:string){
 const days=period==="weekly"?7:1;
 const after=new Date(Date.now()-86400000*days).toISOString();
 const [jobs,runs]=await Promise.all([
  db.from("agent_team_assignments").select("status,updated_at").eq("owner_id",owner),
  db.from("agent_worker_runs").select("status,created_at").eq("owner_id",owner).gte("created_at",after)
 ]);
 if(jobs.error||runs.error)return "The saved task activity is unavailable, so I cannot give an accurate briefing.";
 const work=jobs.data||[],activity=runs.data||[];
 const active=work.filter((x:any)=>x.status==="in_progress").length;
 const blocked=work.filter((x:any)=>x.status==="blocked").length;
 const finished=work.filter((x:any)=>x.status==="completed"&&x.updated_at>=after).length;
 const failed=activity.filter((x:any)=>x.status==="failed").length;
 return (days===7?"Weekly":"Daily")+" operations brief: "+active+" active tasks, "+blocked+
 " blocked, "+finished+" drafts finished this period, "+failed+
 " AI runs failed. These are saved drafting records, not external-action confirmations. Dollar costs are not tracked.";
}