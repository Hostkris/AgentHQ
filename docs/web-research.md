> Current capability: see [All-worker public research](all-worker-public-research.md). The approval-based flow below remains for older clients and already-pending requests. New direct public research and team projects use role-scoped task authorization.

# Public web research

Open **Settings → Web Research → Check connection** while signed in. This checks the server-side Groq key and research model access without requesting a generated answer. The model is `openai/gpt-oss-120b`, using only Groq's `browser_search` tool. Groq's retired Compound model IDs are not used.

From **Browser** or **Research**, choose one of the ten built-in workers and enter a topic. The worker saves a scoped proposal in Messages. Reply **Yes** within 15 minutes to start one report, or **No** to cancel. You can also ask a built-in worker to research directly in Messages. Reports and source links are saved in the conversation and Research history. Company HQ chat can also request public research. Custom workers created in Worker Studio still use their separate drafting backend.

Only the approved topic goes to the research provider. Conversation history, email messages, account tokens and saved personal profiles are not forwarded. Public research does not sign into accounts, submit forms, publish, purchase or send messages. Account actions still require their own integrations and permissions.

## Server setup

- Apply `supabase/migrations/20261023160000_live_web_research.sql`.
- Deploy `agent-hq-converse` with both `index.ts` and `research.ts`, an empty imports map, and JWT verification enabled.
- Keep `GROQ_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `AGENT_HQ_ALLOWED_OWNER_IDS` in Supabase Secrets. Never enter these in chat, browser code or GitHub. Existing Supabase environment keys remain server-side.
- The research connection requires a Groq key even if ordinary chat uses OpenRouter. A key's presence alone does not prove search availability; the connection check and a successful approved report verify successive parts of the connection.
- Provider rate limits, tool availability and charges may apply. The application allows eight report attempts per owner per hour, one running report per owner, a 55-second provider timeout, low reasoning effort and a bounded output token count. A report may involve multiple provider search calls; the report limit is not a hard dollar cap. Set any spending limits in the provider console.

## Permissions and failures

Authenticated clients can read only their owner's research rows and cannot write approvals or call the execution RPCs. The authenticated Edge Function verifies the owner allowlist. It records the decision for the specific worker/job, then atomically claims that one-use approval. The database serializes claims and hourly limits. Completion atomically saves the report and its chat message.

A report is completed only when the provider returns search execution metadata with public source URLs. Only source URLs observed in tool results are retained as verified links. This validates retrieval provenance, not the accuracy of every model sentence; reports still need human review. Errors, missing evidence, provider rejection and timeouts are saved as failures with no silent retry. Request and approve a new report to retry. Abandoned running jobs are marked failed when the next claim occurs after three minutes.

## Validation

Run `node --experimental-strip-types --test tests/research.test.mjs` with Node 24. Tests cover unsafe URLs, missing search evidence, topic isolation, repeat claim rejection, provider/save failures, model connection checks, chat approval, denial, expiry and authentication. Database checks should run in a rolled-back transaction to verify owner checks, server-only RPCs, one-use claims, completion, expiry and hourly budgets without retaining test messages.

Official provider documentation: [Browser Search](https://console.groq.com/docs/tool-use/built-in-tools/browser-search), [API reference](https://console.groq.com/docs/api-reference), and [deprecations](https://console.groq.com/docs/deprecations).
