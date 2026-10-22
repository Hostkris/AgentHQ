// Meta Ads reporting controls for the Operations page.
// Renders only verifiable Meta API results; no outside actions are possible here.
(()=>{
 const app=document.getElementById("app");
 if(!app)return;
 let state={configured:false,connected:false,accounts:[],message:"Checking Meta Ads…"};
 let selected="",period="last_7d",report=null,busy=false,message="";
 const callbackText={
  connected:"Meta authorized the read-only connection. Select an ad account and retrieve a report.",
  accounts:"Meta authorized your login but account discovery needs attention. Tap Refresh accounts.",
  cancelled:"Meta authorization was cancelled. No account was connected.",
  invalid:"The Meta authorization link expired or was already used. Please try again.",
  permission:"Meta did not grant ads_read permission. Reconnect and allow read-only reporting.",
  setup:"Configure the Meta developer app in Supabase Secrets.",
  error:"The Meta connection could not finish. Check the app settings and redirect URI."
 };
 const callback=typeof location!=="undefined"?callbackText[new URLSearchParams(location.search).get("meta")]||"":"";
 const html=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
 const number=n=>Number.isFinite(Number(n))?Number(n):0;
 function money(n,code){
  try{return new Intl.NumberFormat("en-US",{style:"currency",currency:code||"USD"}).format(number(n))}
  catch{return number(n).toFixed(2)+" "+(code||"")}
 }
 function format(){
  const accounts=Array.isArray(state.accounts)?state.accounts:[];
  const connected=state.connected===true;
  const account=accounts.find(a=>a.account_id===selected)||accounts[0];
  const curr=report?.account?.currency||account?.currency||"USD";
  const absent=Array.isArray(state.missing)&&state.missing.length>0;
  const disabled=busy?" disabled":"";
  let content="";
  if(absent){
   content='<p>Finish configuring your Meta developer app. These are <strong>secret names</strong> to add to the Agent-HQ Supabase project:</p>'+
    '<p class="meta-secret-names">'+state.missing.map(html).join(" · ")+'</p>'+
    '<p>Keep the secret values private. When they are saved, check setup again.</p>'+
    '<p><a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Open Meta for Developers ↗</a></p>'+
    '<div class="meta-redirect"><strong>Valid OAuth Redirect URI</strong><code>https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-meta-ads?op=callback</code></div>'+
    '<button type="button" class="meta-btn" data-meta="refresh"'+disabled+'>↻ Check setup</button>';
  }else if(!connected){
   content='<p>Connect through Meta’s official sign-in page. Agent HQ requests <strong>ads_read</strong> only. No ad-budget or publishing permissions are requested.</p>'+
    '<button type="button" class="meta-btn" data-meta="connect"'+disabled+'>Connect Meta Ads (read-only) ↗</button>'+
    (state.reconnect_required?'<p>Your previous session expired or needs renewed permission.</p>':"");
  }else{
   content='<p class="meta-readonly">🔒 Read-only · ads_read · No changes to campaigns</p>'+
   '<div class="meta-form"><label>Advertising account<select data-meta-select="account" aria-label="Meta advertising account"'+disabled+'>'+
    accounts.map(a=>'<option value="'+html(a.account_id)+'"'+(a.account_id===selected?" selected":"")+'>'+html(a.name+" · "+a.currency)+'</option>').join("")+
   '</select></label><label>Reporting period<select data-meta-select="period" aria-label="Reporting period"'+disabled+'>'+
    [["yesterday","Yesterday"],["last_7d","Last 7 days"],["last_30d","Last 30 days"]].map(x=>'<option value="'+x[0]+'"'+(x[0]===period?" selected":"")+'>'+x[1]+'</option>').join("")+
   '</select></label></div>'+
   '<div class="meta-actions"><button type="button" class="meta-btn" data-meta="report"'+(disabled||(!account?" disabled":""))+'>📊 Get live report</button>'+
   '<button type="button" class="meta-secondary" data-meta="accounts"'+disabled+'>↻ Refresh accounts</button>'+
   '<button type="button" class="meta-danger" data-meta="disconnect"'+disabled+'>Disconnect</button></div>'+
   (!account?'<p>Meta did not list an accessible ad account. Confirm your Meta ad-account access and refresh accounts.</p>':"");
   if(report?.source==="meta_marketing_api_live"&&report.account?.id===selected){
    const m=report.overview||{},campaigns=report.campaigns||[];
    content+='<div class="meta-report"><h4>'+html(report.account.name)+'</h4>'+
      '<p class="meta-source">From Meta Marketing API · '+html(report.period.replaceAll("_"," "))+
      ' · '+html(new Date(report.received_at).toLocaleString())+'</p>'+
      '<div class="meta-stat-grid">'+[
        ["Spend",money(m.spend,curr)],["Clicks",number(m.clicks).toLocaleString()],
        ["Impressions",number(m.impressions).toLocaleString()],
        ["CTR",number(m.ctr).toFixed(2)+"%"],["Cost per click",money(m.cpc,curr)]
      ].map(v=>'<div><small>'+v[0]+'</small><strong>'+html(v[1])+'</strong></div>').join("")+'</div>'+
      '<h4>Campaigns</h4>'+
      (campaigns.length?campaigns.slice(0,20).map(c=>
       '<div class="meta-campaign"><strong>'+html(c.name)+'</strong><span>'+
       money(c.spend,curr)+' · '+number(c.clicks).toLocaleString()+' clicks</span></div>'
      ).join(""):'<p>No campaign insights returned for this date range.</p>')+
      (report.campaigns_truncated||campaigns.length>20?'<p class="meta-source">Some campaign rows are hidden or paginated. Account totals come from a separate full-account insight query.</p>':"")+
      '<p class="meta-source">These are real Meta-reported figures, not AI estimates. The report has no access to change budgets.</p></div>';
   }
  }
  return '<div class="meta-header"><strong>📊 Meta Ads reporting</strong><span class="meta-status">'+
   (connected?"Connected":absent?"Setup needed":"Not connected")+'</span></div>'+
   (callback?'<p class="meta-notice">'+html(callback)+'</p>':"")+
   '<p class="meta-feedback" role="status">'+html(message||state.message||"")+'</p>'+content;
 }
 function mount(){
  const parent=app.querySelector(".operations-page");
  if(!parent)return;
  let panel=parent.querySelector(".meta-ads-panel");
  if(!panel){
   panel=document.createElement("section");
   panel.className="meta-ads-panel";
   const connection=parent.querySelector(".operations-connection");
   if(connection)parent.insertBefore(panel,connection);else parent.appendChild(panel);
  }
  const content=format();
  if(panel.__lastContent!==content){
   panel.__lastContent=content;
   panel.innerHTML=content;
  }
  const service=parent.querySelector(".operations-services span em");
  const label=state.connected?"Read-only connected":"Not connected";
  if(service&&service.textContent!==label)service.textContent=label;
 }
 function update(data){
  state={...data,accounts:Array.isArray(data.accounts)?data.accounts:[]};
  if(state.preferred_account_id&&state.accounts.some(x=>x.account_id===state.preferred_account_id)&&
    selected!==state.preferred_account_id){
   selected=state.preferred_account_id;
   report=null;
  }else if(!state.accounts.some(x=>x.account_id===selected)){
   selected=state.accounts[0]?.account_id||"";
   report=null;
  }
  if(!state.connected)report=null;
  mount();
 }
 window.agentHQMetaStatus=update;
 window.agentHQMetaError=err=>{message=String(err||"Meta connection failed");mount()};
 async function perform(action){
  const cloud=window.agentHQMetaCloud;
  if(!cloud)throw Error("Meta service is still loading. Refresh Agent HQ.");
  if(action==="refresh"){await cloud.refresh();message="Setup status checked."}
  if(action==="connect"){message="Opening Meta's authorization page…";mount();await cloud.connect()}
  if(action==="accounts"){const result=await cloud.reloadAccounts();report=null;message="Found "+result.accounts.length+" advertising account(s)."}
  if(action==="report"){const result=await cloud.report(selected,period);report=result;message="Live Meta report retrieved."}
  if(action==="disconnect"){
   if(!window.confirm("Disconnect Meta Ads? This deletes the local encrypted access token and account list from Agent HQ."))return;
   await cloud.disconnect();report=null;message="Meta Ads disconnected locally.";
  }
 }
 app.addEventListener("click",async event=>{
  const button=event.target.closest("[data-meta]");
  if(!button||busy)return;
  const action=button.dataset.meta;
  busy=true;message="Processing "+action+"…";mount();
  try{await perform(action)}catch(err){message=err?.message||"Meta request failed"}
  finally{busy=false;mount()}
 });
 app.addEventListener("change",async event=>{
  const select=event.target.closest("[data-meta-select]");
  if(!select||busy)return;
  if(select.dataset.metaSelect==="account"){
   selected=select.value;report=null;
   busy=true;message="Saving your reporting account…";mount();
   try{await window.agentHQMetaCloud.chooseAccount(selected);message="Reporting account selected."}
   catch(error){message=error.message||"Account selection failed"}
   finally{busy=false;mount()}
  }
  if(select.dataset.metaSelect==="period"){period=select.value;report=null;mount()}
 });
 const observer=new MutationObserver(()=>mount());
 observer.observe(app,{childList:true,subtree:true});
 mount();
 window.agentHQMetaUI={get state(){return state},get report(){return report},get selected(){return selected},refresh:mount};
})();
