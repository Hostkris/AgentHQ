# Agent HQ: Activepieces + Nango (combined rollout)

This branch adds **one paired integration surface** under Settings → Accounts & Sign-Ins and a **single authenticated Supabase Edge Function**. No existing Gmail or Meta OAuth credentials are moved, no AI worker DNA is changed, and no provider receives a global "do anything" permission.

## Architecture and security

- **Activepieces** is the workflow execution service, hosted outside GitHub Pages and Supabase. Its *Catch Webhook* trigger provides a constrained, harmless delivery pilot. The Edge Function sends a test event with a randomly generated request ID, protected by an **x-agenthq-webhook-secret** that the Activepieces Catch Webhook trigger must validate. It does not prove a workflow completed.
- **Nango** is the authentication service. Each signed-in Agent HQ owner requests a short-lived Connect session. Nango handles credential collection and OAuth. Server-side API keys never reach GitHub Pages. Only integrations explicitly included in the backend allowlist can be authorized.
- Requests require a valid Supabase access token **and** AGENT_HQ_ALLOWED_OWNER_IDS matching the signed-in owner. Results disclose neither provider secrets nor tokens, except the short-lived Nango UI session token to its own authorized user.
- The UI accurately distinguishes server configuration from a verified connection. **No arbitrary external action dispatcher or auto-publisher has been enabled**. Authorizing an outside account does not yet let an AI worker read or write to it.
- Nango callback events are informational; do not record them as a trusted connection until a server-side verification/connection registry and appropriate tenant checks are implemented.

## Required setup (both services as one deployment)

1. Provision an Activepieces instance (or use its hosted service), create a flow with a *Catch Webhook* trigger. Set header-based authentication to require the long random secret configured below. Configure a no-op response/logging step and activate the pilot flow. The flow MUST NOT publish, spend, or export data.
2. Configure Nango Cloud or self-host Nango. Set up specifically approved integrations/providers there and their developer/OAuth settings.
3. In **Agent-HQ** Supabase Edge Function secrets (not GitHub, not browser), set:
   - `AGENT_HQ_NANGO_SECRET_KEY`: secret Nango environment API key
   - `AGENT_HQ_NANGO_INTEGRATIONS`: comma-separated Nango integration IDs explicitly approved for this pilot
   - `AGENT_HQ_ACTIVEPIECES_PILOT_WEBHOOK`: HTTPS URL of the protected Catch Webhook flow
   - `AGENT_HQ_ACTIVEPIECES_PILOT_SECRET`: random header secret matching Catch Webhook authentication
   - Keep the existing `AGENT_HQ_ALLOWED_OWNER_IDS`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` values in place.
4. Deploy Edge Function `agent-hq-automation` with JWT verification enabled.
5. Open Settings → Accounts & Sign-Ins and select **Check both integrations**; this only checks config presence. Then authorize one *new* Nango account and use **Test safe workflow delivery**. Confirm the event was processed in Activepieces' run logs before claiming end-to-end success.
6. Only after permission mapping, external execution audit trail, tenant binding verification, idempotency, retries and failure recovery are implemented should real agent-to-provider execution be enabled.

## License / hosting caveats

Activepieces' official embeddable workflow builder requires an enterprise license. This integration uses Agent HQ's own UI and an API/webhook, not the licensed embed. Activepieces requires separately running infrastructure. Nango's hosted and self-hosted plans vary in what functionality is included; account OAuth alone is not equivalent to executing a full action on an account.

## Acceptance

- Two services appear together within the existing settings design.
- Secrets are server-only; owner authentication is validated on every request.
- No changes to live Gmail/Meta authorization or existing worker project execution.
- An absence of either service's credentials results in **Setup required**, not a false green connection.
- A 2xx response from Activepieces means webhook delivery was accepted **not** execution verified.
- No production publishing/spending/financial operation is available through this adapter.

This is an implementation foundation, not a claim that separate provider accounts or hosts have been provisioned.

## Activation update

The combined UI is a separate release from the draft real-time activity upgrade. Nango sessions use the current `tags.end_user_id` owner binding. The Connect UI SDK is pinned to 0.71.12. Setup status is not a live-provider health check.
