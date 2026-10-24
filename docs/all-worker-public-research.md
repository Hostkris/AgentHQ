# Public web research for every worker

All ten built-in agents, Company HQ's coordinator and the owner's active custom workers can request public research for their own role and assigned task. No Safari extension, Mac or browser-host account is required for public research.

## Owner experience

Message a worker directly, for example: “Casey, research current Instagram Reels recommendations for a skincare business. Include primary sources and dates.” For teamwork: “Alex, have the team create a launch campaign. Let each specialist research the public information needed for their part, then review the combined work.”

Workers can research during discussion, drafting, peer review or polishing. Alex researches management and coordination while specialists execute their own roles. Mixed requests that include both research and a deliverable stay in the project router. Public research never replaces the requested final work.

A direct research instruction or assigned project authorizes relevant public searches. Private accounts, publishing, sending, purchases and calendar writes retain separate permissions. Existing pending research confirmations remain supported for older clients.

Company HQ shows the actual research worker with an expandable source report. Private and custom-worker chats attach the full report below a short response. Research history links back to the correct conversation or project. Private follow-ups can retrieve the latest report from that same worker's conversation. Project evidence is scoped to the exact assignment and revision.

## Evidence and scope

The server prepares or receives one narrow public query, validates its role/task relevance, and rejects credentials, email addresses, phone-like identifiers and private/local URLs. Only the public query and role are sent to browser search. Private chat history, inbox content, access tokens and the full project brief are not forwarded as web-search context.

Only Groq's browser_search with openai/gpt-oss-120b is enabled. Structured task decisions and browser research are separate steps because the browser tool does not support structured outputs. Completed reports require provider-executed search metadata and public source URLs. Invented prose links are omitted. Reports include retrieval dates and limitations; observed retrieval does not certify every page or factual claim.

Website text and saved reports are untrusted evidence, never instructions to grant permissions or perform outside actions. Specialist responsibilities and custom-worker anti-jobs remain in force. Saved evidence improves task context; no automatic model training occurs.

## Free setup and saved work

The existing Groq connection is reused. No paid provider, billing upgrade, browser host or paid fallback was added. The shared allowance is eight reports per owner per hour across new and legacy research, one active report per owner, and two completed searches per worker per project revision. Provider quota errors stop the operation. The API cannot verify the account's billing tier; the Groq project must remain on its existing Free plan. Report limits are not a provider dollar spending cap.

Search has one bounded 45-second deadline. A provider-confirmed tool-selection error permits one same-provider retry; ordinary errors never trigger another service. Query preparation has a separate 18-second deadline.

A queued team query persists through a quota pause and resumes after its retry time while Agent HQ is open. Safari can suspend the app in the background; reopening resumes saved work. No unattended 24/7 execution is claimed.

## Integrity and verification

agent_role_research is owner-readable through RLS and writable only by the trusted server. begin_agent_role_research requires an exact owned request/conversation, active owned custom worker, or current project worker/run/revision/lease. A unique owner request key prevents duplicate execution.

finish_agent_role_research atomically saves evidence and its response, rechecking project pause/revision and custom-worker activation. Removed, stopped, expired or archived destinations reject late results. Research preserves the project phase; it cannot mark the deliverable complete, bypass peer review or approve a final version.

Migration: supabase/migrations/20261024060141_role_scoped_public_web_research.sql.

Deploy agent-hq-converse, agent-hq-coordinate and agent-bot-studio with shared/role-research.ts, agent-hq-converse/research.ts and their other dependencies. JWT verification and owner allowlisting remain enabled.

Run all Node tests, tests/role-research-rollback.sql and the Company HQ / Camera browser scenarios. Validation uses synthetic provider responses and rollback-only database fixtures, not real auth tokens or private account browsing.

Primary contracts: https://console.groq.com/docs/tool-use/built-in-tools/browser-search and https://console.groq.com/docs/billing-faqs. Deprecated Compound and browser-automation systems are not used.
