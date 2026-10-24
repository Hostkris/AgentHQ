# Agent HQ autonomous project execution

An owner assignment authorizes its internal work. The team plans, uses ordinary role-scoped public research, drafts, reviews, corrects routine errors and continues to a finished deliverable. The owner does not need to approve internal plans, handoffs, response corrections or retries.

## Recovery and continuation

- Rejected responses retain the same project, stage, responsible specialist, draft, revision and saved discussion. Each correction is validated before saving.
- Routine errors queue automatic retries with increasing delays. After repeated failures, Alex uses a separately counted run to diagnose the workflow and gives correction guidance back to the specialist. Alex does not write the specialist's deliverable.
- A temporary client connection failure reconnects automatically. A late response cannot overwrite a paused, revised or superseded project.
- Public research that cannot finish in the direct conversation becomes a saved team project, so the owner does not need to resend the task.
- Answering an essential private question or deciding its exact sensitive request resumes the project without a second confirmation.
- The private server runner checks for due work once per minute, so projects can continue when the phone app is closed. An open app can also advance due work. Both paths use the same database lease and cannot double-run the same turn.
- The scheduler sends no HTTP request when no work is due. Each invocation advances at most one turn. All model calls, including diagnosis, obey the existing owner-wide ten-runs-per-hour allowance. Projects wait automatically for the allowance to reset; no spending limit is increased.

## Human decisions

Only an essential owner-only fact, a specific sensitive authorization or final editorial review should interrupt the owner. Sensitive categories are account authorization/MFA, new private-data access, spending, budget changes, account changes, public release outside existing authorization, risky site interactions and irreversible commitments. Requests identify the exact scope and why an authorized alternative does not work. Ordinary public searches and internal drafting are not sensitive approvals.

Existing tool limits, account permissions and network restrictions remain enforced. A worker cannot grant itself or another worker permission. Approval cannot create an unavailable connector or make an unsafe target safe. The app cannot override approval rules imposed by ChatGPT or another host environment.

The final combined deliverable waits for the owner's version-specific approval or revision request. Editorial approval finishes that assignment; it does not grant unrelated financial or outside-account powers. Owner Pause remains effective immediately.

## Scheduler security and verification

The new `agent-hq-project-runner` endpoint uses a private 256-bit credential stored in encrypted Supabase Vault, verified by a service-only RPC. It accepts no caller-selected owner, project, action, model or budget. It obtains the owner allowlist from the same existing server configuration and reads due owned projects through a service-only RPC. Browser roles cannot read scheduler credentials, dispatch work, create diagnoses or forge saved progress. Other Edge Functions retain JWT verification.

`tests/project-autonomy.test.mjs` covers automatic recovery, interruption rules, diagnostic role boundaries and scheduler authorization. `tests/project-autonomy-rollback.sql` uses synthetic database-only fixtures and always rolls back. Browser checks cover automatic correction and reconnection without a retry click, preserved drafts, real owner blockers, final review, account switching and iPhone/iPad layouts. A percentage such as “99% autonomous” is a product goal, not a measured completion-rate guarantee.
