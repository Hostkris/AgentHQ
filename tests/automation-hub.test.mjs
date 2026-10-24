import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../",import.meta.url);
const read=p=>readFileSync(new URL(p,base),"utf8");
const api=read("supabase/functions/agent-hq-automation/index.ts");
const ui=read("agent-automation-hub.js");
const html=read("index.html");
const settings=read("agent-settings-integrations.js");
test("Both connectors share one Agent HQ controls surface and are loaded safely",()=>{
 assert.match(html,/agent-automation-hub\.js/);
 assert.match(settings,/agenthq-automation-root/);
 assert.match(ui,/Activepieces · Workflows/);
 assert.match(ui,/Nango · New Accounts/);
 assert.match(ui,/Configured · unverified/);
});
test("Nango credentials remain server-only and scopes are allowlisted",()=>{
 assert.match(api,/AGENT_HQ_NANGO_SECRET_KEY/);
 assert.match(api,/AGENT_HQ_NANGO_INTEGRATIONS/);
 assert.match(api,/connect\/sessions/);
 assert.match(api,/tags:\{end_user_id:owner/);
 assert.doesNotMatch(ui,/SECRET_KEY|SERVICE_ROLE_KEY/);
});
test("every request is JWT authenticated and owner restricted",()=>{
 assert.match(api,/db\.auth\.getUser\(token\)/);
 assert.match(api,/AGENT_HQ_ALLOWED_OWNER_IDS/);
 assert.match(api,/owners\.includes\(owner\.toLowerCase\(\)\)/);
 assert.match(api,/originAllowed/);
 assert.match(api,/POST only/);
});
test("Activepieces only receives a protected harmless pilot without customer content",()=>{
 assert.match(api,/agenthq\.pilot\.ping/);
 assert.match(api,/x-agenthq-webhook-secret/);
 assert.match(api,/Webhook accepted the test/);
 assert.doesNotMatch(api,/input\.url|input\.webhook|input\.payload/);
 assert.doesNotMatch(api,/publish_post|transfer_funds|send_email/);
});

test("current Nango Connect API uses owner tags and supported frontend SDK",()=>{
 assert.match(api,/tags:\{end_user_id:owner/);
 assert.doesNotMatch(api,/end_user:\{id:owner/);
 assert.match(ui,/@nangohq\/frontend@0\.71\.12/);
 assert.match(ui,/ui\.setSessionToken\(sessionToken\)/);
});
