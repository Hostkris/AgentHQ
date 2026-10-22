// Agent HQ secure permission-request adapter.
// Only signed-in users can read their own requests and record decisions.
// No actual agent execution occurs from approval, and no browser opens here.
import { agentCloud } from './agent-cloud-auth.js';

let generation = 0;
let lastError = '';

async function refresh() {
  const current = ++generation;
  const { data: authData, error: authError } = await agentCloud.auth.getUser();
  if (current !== generation) return;
  if (authError) {
    lastError = 'Could not check your sign-in. Try Refresh in Settings.';
    window.agentHQApprovalCloudError?.(lastError);
    return;
  }
  if (!authData?.user) {
    lastError = 'Sign in under Settings to save and sync permission requests.';
    window.agentHQSyncApprovals?.([], lastError);
    return;
  }
  const { data, error } = await agentCloud
    .from('agent_permission_requests')
    .select('id,employee_id,target_url,reason,request_kind,action_kind,status,created_at,expires_at,decided_at')
    .order('created_at', { ascending: true })
    .limit(200);
  if (current !== generation) return;
  if (error) {
    lastError = 'Could not load saved requests: ' + error.message;
    window.agentHQApprovalCloudError?.(lastError);
    return;
  }
  lastError = '';
  window.agentHQSyncApprovals?.(data || [], 'Requests saved securely to Agent HQ. Research approval does not start browsing.');
}

async function requireUser() {
  const { data, error } = await agentCloud.auth.getUser();
  if (error) throw new Error('Could not verify your sign-in: ' + error.message);
  if (!data?.user) throw new Error('Sign in from Settings to save permission requests.');
}

async function create(agentId, website, reason) {
  await requireUser();
  const { data, error } = await agentCloud.rpc('create_agent_demo_permission_request', {
    p_employee_id: agentId,
    p_target_url: website,
    p_reason: reason
  });
  if (error) throw new Error('Request not saved: ' + error.message);
  await refresh();
  return data;
}

async function decide(requestId, decision) {
  await requireUser();
  if (!['approved', 'denied'].includes(decision)) throw new Error('Invalid decision');
  const { data, error } = await agentCloud.rpc('decide_agent_permission_request', {
    p_request_id: requestId,
    p_decision: decision
  });
  if (error) throw new Error('Decision not saved: ' + error.message);
  await refresh();
  return data;
}

window.agentHQCloudApprovals = { create, decide, refresh };
agentCloud.auth.onAuthStateChange(() => {
  setTimeout(() => refresh().catch(e => window.agentHQApprovalCloudError?.(e.message)), 0);
});
window.addEventListener('focus', () => refresh().catch(() => {}));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh().catch(() => {});
});
// Light polling lets another signed-in device's decisions appear without enabling
// public realtime broadcasts; this is not a background notification service.
setInterval(() => {
  if (!document.hidden) refresh().catch(() => {});
}, 30000);
refresh().catch(e => window.agentHQApprovalCloudError?.(e.message));
