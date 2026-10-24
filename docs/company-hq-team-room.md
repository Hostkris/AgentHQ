# Company HQ team conversations

New owner-assigned projects use workflow version 2. Earlier work orders and saved work remain intact. Company HQ displays the assigned team’s actual saved messages; older completed work shows its result without the old routing instructions.

## Owner experience

1. Assign a project in Alex’s or a specialist’s Messages conversation.
2. Alex selects a lead and an appropriate peer reviewer (two specialists, at most three). The direct assignment authorizes their bounded internal collaboration. It grants no outside account or execution permission.
3. Company HQ shows one named speaker per actual model turn, including questions to a teammate, their answers, draft decisions and concrete peer-review feedback. It never generates an entire pretend multi-person transcript in one completion.
4. Essential missing information or a specific permission request goes to the requesting specialist’s private Messages thread. Reply normally there; with multiple pending projects, choose “Reply to this project”. Approve/deny buttons are tied to the exact saved request. Private conversation history is not swept into shared context; only the question’s project-scoped answer is shared.
5. The lead creates a shared working draft, the peer checks it, and the lead applies corrections. Intermediate drafts stay in working context. Only the finished combined deliverable gets a review card.
6. Alex sends one private completion message and a “Review in Company HQ” shortcut. Approve the exact finished version there, request changes, or type feedback. Revisions reopen the same project and preserve its previous result as context. Rejection without details causes the lead to ask privately what should change.
7. Only approved combined work becomes an owner-scoped reusable example. Approval is editorial: it never publishes, sends, spends, or grants account access.

## Runtime and limits

- Existing Groq/OpenRouter configuration is reused. No new paid service, browser host, recurring job, or outside execution tool was added.
- One real model call per team turn; owner-wide reservation and the existing ten worker calls/hour cap apply. There are at most eighteen turns per revision and three teammate question exchanges. No recursive agent loop.
- A four-second gap between saved turns makes messages readable. Typing dots appear only while an actual worker holds a live model-call lease, with that worker’s name. They are not a staged thinking animation and do not expose hidden reasoning.
- A private server runner advances due projects once per minute even when Agent HQ is closed. The app can also advance work while open; both use the same lease and usage checks. This does not add phone push delivery.
- All assigned workers can request role-scoped public browser research and share dated source reports in the project. Saved evidence remains labelled by date; it never implies a fresh search. Private-account gaps still use the requesting worker’s individual Messages and existing connector permissions. See all-worker-public-research.md.

## Integrity

- `agent_project_sessions` is owner-readable through RLS; browser roles cannot write it or invoke any project writer RPC.
- Every model turn is claimed transactionally against owner scope, assignment, expected speaker, active run, revision and lease. Replays cannot double-commit. Pausing invalidates an active lease; late responses cannot add messages or complete a stopped project.
- Final approval requires the exact saved `output_version` UUID and a project still awaiting review. Old cards and duplicate approvals fail visibly.
- Provider failures, expiry and the free allowance retain shared work. A failed turn offers explicit retry instead of a fabricated successful result. A pending expired site request is rejected rather than silently authorized.
- Team-message X controls reuse the durable owner dismissal mechanism. Final card dismissal does not publish or erase project source data. Account changes clear the visible room and reply context.
- Existing worker DNA remains authoritative; Alex routes and verifies stored evidence, while specialists draft and review inside their assigned roles.

## Verification

`node --experimental-strip-types --test tests/*.test.mjs`

`AGENTHQ_TEST_CHROME=/path/to/chromium node tests/company-hq.browser.mjs`

`AGENTHQ_TEST_CHROME=/path/to/chromium node tests/camera-messages.browser.mjs`

`tests/company-hq-rollback.sql` verifies actual Postgres transitions, private question routing, versioned review, same-project revision, pause/replay handling, hourly limits and RLS. It creates only synthetic assignment/message/run fixtures under an existing owner foreign key and always rolls them back. It never calls a provider, changes existing rows, creates an auth account or mints a login token.

Browser tests use synthetic projects and model responses, with phone/iPad/landscape viewports. They do not claim physical signed-in iPhone testing or live Facebook access.
## Response validation and recovery

Wrong-stage, self-addressed, malformed and incomplete replies are rejected before they can replace saved work. Routine errors now correct and retry automatically. Repeated faults go to Alex for a workflow diagnosis, then back to the responsible specialist. The project, draft, review feedback and version remain intact. A delayed retry notice is informational: no owner click is needed.

An essential private fact or sensitive authorization still pauses the exact project in the requesting worker's thread. Answering it resumes automatically. Finished combined work waits for the owner's final review. See [PROJECT_AUTONOMY.md](PROJECT_AUTONOMY.md) for the scheduler, approval categories and verification details.
