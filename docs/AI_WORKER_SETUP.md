# Agent HQ — Phase 5: Manual AI worker setup

Agent HQ's worker function lives at `supabase/functions/agent-hq-worker/index.ts`
and is deployed in the existing Agent-HQ Supabase project as `agent-hq-worker`.

## Turn on the worker engine

1. In Agent HQ, open **Settings** and confirm you are signed in.
2. Open the **same Agent-HQ Supabase project** at https://supabase.com/dashboard.
3. Open **Authentication → Users**. Copy the **User ID (UUID)** for the account
   you use to sign into Agent HQ.
4. Open **Edge Functions → Secrets** in that project. Add:
   - `AGENT_HQ_ALLOWED_OWNER_IDS` = your Supabase Auth User ID.
     For multiple accounts you own, use comma-separated UUIDs.
   - Exactly one of `GROQ_API_KEY` or `OPENROUTER_API_KEY` = the API key issued
     by the provider. If both are set, the worker uses Groq first.
   - Optional `AGENT_HQ_AI_MODEL` = a currently supported model ID for that provider.
5. Refresh Agent HQ, open **Assignments → a team assignment**, then tap
   **Check AI connection**. If it says connected, choose an assigned
   worker's **Draft next step** button.

Do not paste secrets into GitHub, Agent HQ messages, or public code.
API availability, free allowances, and prices vary by provider; review the
provider's usage dashboard before running workers.

## What manual worker steps do

- Only your explicitly allowlisted, signed-in account can run the Edge Function.
- One manually initiated worker step uses the assigned worker's role,
  task brief, requested information, and up to 12 recent team notes.
- It saves a role-attributed **AI-generated draft** to the shared team thread.
  It also copies the draft to the worker's private Messages conversation.
- Runs are audited in the owner-protected `agent_worker_runs` database table.
- Only one run may be active per owner; maximum 10 starts per hour.
- Worker scripts can draft text; they cannot browse websites, log in, access
  private accounts, pay, download, publish, or trigger an automatic workflow.
- Approving a research test request **does not** give the worker browsing access.
  Real browsing permissions must be enforced by a separate browsing service.

## What is not connected yet

- Live web research or fact checking
- Automated 24/7 execution, background agents, or worker-to-worker autonomous loops
- Personal website, email, bank or social-platform access
- Sending emails, scheduling social posts or making purchases

To change worker behavior, update the version-controlled Edge Function source,
review it, and then deploy it with JWT verification enabled.
