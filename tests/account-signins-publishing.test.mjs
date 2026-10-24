import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../agent-settings-integrations.js",import.meta.url),"utf8");
const theme=readFileSync(new URL("../theme.js",import.meta.url),"utf8");
const schema=readFileSync(new URL("../supabase/migrations/20261024000418_agent_hq_owner_social_publishing_controls.sql",import.meta.url),"utf8");
function harness(){
 const callbacks={};
 const app={addEventListener:(name,fn)=>{callbacks[name]=fn;}};
 const fakeAuth={getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>{}};
 const sandbox={
  agentCloud:{auth:fakeAuth},
  document:{getElementById:id=>id==="app"?app:null,addEventListener:()=>{}},
  window:{addEventListener:()=>{},open:()=>{}},
  setTimeout:()=>{},console
 };
 const js=source.replace(/^import\s+.+?;\s*/m,"");
 runInNewContext(js+"\nglobalThis.__unit={SERVICES,state,renderConnections,renderPublishing,renderPublishingCompact,socialBadge};",sandbox);
 return sandbox.__unit;
}
test("All requested accounts are shown, with truthful connection status",()=>{
 const u=harness();
 const ids=u.SERVICES.map(s=>s.id);
 for(const name of ["chatgpt","gmail","facebook","instagram","tiktok","youtube","icloud","meta"])
  assert.ok(ids.includes(name),name+" not in Settings");
 const html=u.renderConnections();
 assert.match(html,/Manual use ready/);
 assert.match(html,/Request OpenAI access/);
 assert.match(html,/Open ChatGPT/);
 assert.match(html,/Not linked to Agent HQ/);
 assert.match(html,/Connect with Google|Set up Gmail/);
 assert.match(html,/Open official website/);
 assert.doesNotMatch(html,/type=["']password/);
 assert.doesNotMatch(html,/ChatGPT connected|Instagram connected|TikTok connected/i);
});
test("Publishing switch defaults off and requires sign-in",()=>{
 const u=harness();
 assert.equal(u.state.publishing,false);
 assert.match(u.renderPublishingCompact(),/Enable Authorized Social Publishing/);
 assert.match(u.renderPublishingCompact(),/disabled/);
 u.state.signedIn=true;u.state.prefLoaded=true;
 const html=u.renderPublishing();
 assert.match(html,/approval of the exact content and destination/);
 assert.match(html,/until a supported publishing integration exists/i);
 assert.doesNotMatch(html,/data-post-now|data-auto-post/);
 u.state.publishing=true;
 assert.match(u.renderPublishingCompact(),/checked/);
 assert.match(u.renderPublishing(),/Live social publishing is NOT connected/);
});
test("General settings exposes switch, not only a nested page",()=>{
 assert.ok(theme.includes('agenthq-settings-publishing-compact'));
 assert.match(theme,/Accounts & Sign-Ins/);
 assert.ok(theme.includes('agenthq-settings-integrations-root'));
 assert.match(theme,/window\.agentHQSettingsDidOpen/);
});
test("Owner preferences are isolated by RLS; individual approval is mandatory",()=>{
 assert.match(schema,/force row level security/i);
 assert.match(schema,/for select to authenticated using\(owner_id=\(select auth\.uid\(\)\)\)/i);
 assert.match(schema,/for insert to authenticated with check\(owner_id=\(select auth\.uid\(\)\)\)/i);
 assert.match(schema,/for update to authenticated using\(owner_id=\(select auth\.uid\(\)\)\)/i);
 assert.match(schema,/per_post_approval_required boolean not null default true check\(per_post_approval_required is true\)/i);
});
test("No browser publishing endpoints, credential harvesting or token copying",()=>{
 assert.doesNotMatch(source,/\b(fetch|XMLHttpRequest|sendBeacon)\s*\(/);
 assert.doesNotMatch(source,/document\.cookie|localStorage\.setItem|service_role/i);
 assert.doesNotMatch(source,/input\s+type=["']password/i);
 assert.match(source,/Publishing controls are a saved/);
});
