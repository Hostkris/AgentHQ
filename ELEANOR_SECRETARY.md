# Eleanor — personal executive secretary

The foreground reminder card starts from an owner-bound copy of notices previously loaded on this device, while the authenticated API refreshes in the background. It loads before the external auth SDK, has no entrance delay, and shows all pending reminder text in its scrolling list. Fresh results update the notice list without replacing a reply in progress. A first visit still needs its initial server response; already saved notices appear before overdue work finishes processing. Cached text is labelled as saved while updating. Signing out or changing accounts closes the card and invalidates that account’s preview. Reminder edits and acknowledgements clear the preview before the desk reloads it. Closing the card preserves its existing dismissal behavior and does not complete or approve the underlying work.

Eleanor is an additional private worker. The original ten staff retain their roles. Her full standing instructions live in `eleanor-secretary-core.js`, are stored in her Worker Studio profile and appear under Reminders → Work ethics. She follows through on authorized internal administration while preserving the existing approval boundaries for outside actions.

Eleanor’s profile supports 8,000 characters, enough for the complete standing instructions and retained owner guidance. Other Worker Studio profiles retain their 4,500-character limit. Both the authenticated save route and database enforce their limits using Unicode character counts. Oversized instructions are rejected before saving; they are never silently shortened. The existing live Eleanor profile was updated with the complete instructions while preserving its previously saved additional guidance and all other profile fields.

## Work ethic

Discretion, punctuality, accurate records, calm initiative, preparation, one accountable next action, clear deadlines, verified completion and concise escalation. No fabricated bookings, research, permissions, health decisions or notification delivery. A saved instruction is confirmed only after its database write succeeds. The owner can pause or stop records using ordinary commands and desk controls.

## Persistent registers

- **Daily_Reminders:** owner-supplied intake labels or routines, instructions, exact local times, timezones and repeat weekdays. No medication, dosage, frequency or missed-dose guidance is invented. Each day’s acknowledgement is separate from the recurring schedule. Early completion can be logged before the scheduled alert. Stop/pause prevents future alerts without deleting the audit record.
- **Workout_Schedule and Fitness_Log:** an owner-provided weekly split, rest days, exact exercises, sets, repetitions and targets, with completion or skipped outcomes logged separately. No workout is activated until supplied.
- **Active_Tasks:** one-time administrative work, next actions and optional deadlines. Completion is explicit. Internal projects can be handed to Alex through the existing saved-project workflow; no outside action is thereby authorized.
- **Meetings:** saved meeting dates, times, attendees and roles, preparation notes and intended outcomes. A brief is queued 30 minutes before a saved meeting. The brief contains Context, Prep Assets and Objectives. Live calendar sync is not connected; the owner must currently add meetings to Eleanor’s desk. Gmail is read only after the dedicated opt-in and only for recent email matching supplied attendee addresses. Missing roles and sources are marked missing.

## Briefing and delivery

The owner selected **7:00 AM, America/New_York** (Columbus, Ohio). This is a real persisted daily schedule, not a chat promise. The minute-based private dispatcher queues due work independently of the browser and saves notices in Eleanor’s Messages conversation. Briefings list the saved day’s priorities, workout, intakes and upcoming meetings. No workout plan or intake records were guessed from the uploaded role description.

Routine scheduled work is deterministic and uses no AI generation calls. Simple explicit daily-reminder, stop/pause/resume and reported-intake commands also have a deterministic path. More complex chat planning shares the existing ten-per-hour worker AI allowance; exceeding that allowance does not stop deterministic notices or desk edits.

Notices use stable occurrence keys, private processing leases, retry backoff and owner/revision checks. Completion is logged, never inferred. One bounded follow-up is available for an unacknowledged intake; snoozes are owner initiated. A daily acknowledgement never permanently completes a recurring intake.

## Device alerts

Saved priority messages work without push. Web Push is optional. On iPhone/iPad, add Agent HQ to the Home Screen and open it there, then use Reminders → Settings → Enable alerts on this device. Permission must be granted by the owner. Registration is not delivery verification; accepted push requests and user acknowledgement are tracked separately. OS Focus, connectivity and permission settings still affect alerts.

The service worker displays only a generic private-update notice, never medication names, meeting details or task contents. Subscription endpoints and keys are service-only, allowlisted and owner scoped. Expired devices are deactivated; signing out unsubscribes the local browser where supported. No new paid service or image API is required.

## Verification

Transactional SQL fixtures cover daily-brief preferences, daylight-saving transitions, duplicate requests, occurrence/recurrence separation, early acknowledgement, stop, stale edits, owner isolation, processing leases and the shared AI allowance. Unit tests cover source-grounded intake changes, workout fidelity, factual meeting briefs, permission-gated email, deterministic scheduling, scoped authentication and real Web Push payload encryption. WebKit fixtures cover iPhone and larger-screen desk forms, completion controls, meeting fields, settings and the Messages link. Actual device receipt remains unverified until the owner enables alerts and a due notice reaches that device.


### Reminder startup validation (2026-11-07)

The dedicated startup browser fixture holds both the auth module and authenticated API response. It verifies that all previously loaded notices appear before either is released, fresh results preserve the reply and caret, completed/dismissed work does not replay, account changes remove private previews, and overdue processing does not delay already saved notices.

The ten previously identified Node failures are resolved: Eleanor’s actual instruction capacity is fixed, eight checks verify a versioned application script without pinning an obsolete release name, and the reminder confirmation check verifies the saved operation and deterministic reply. A failed-write regression verifies that no success confirmation is saved when the database rejects an operation. The full Node suite passes 315/315 tests. The desk browser fixture follows the current settings confirmation and native Messages conversation, including the portrait button back to Eleanor’s desk. Startup ownership, draft preservation and sign-out checks remain in place.

`tests/worker-instructions.test.mjs` exercises the actual authenticated Worker Studio save handler with full instructions, exact limits, overflow, template scoping and Unicode boundaries. `tests/worker-instructions-rollback.sql` verifies real secretary creation, unchanged text, idempotent creation, database boundaries, failed-update preservation and existing privacy controls, with all fixture data rolled back.

## Team consulting guides

All ten built-in workers retain their specialties and share the consulting standard in `agent-consulting-policy.js`. Practical creation and how-to requests become saved projects. Alex selects relevant specialists; their actual work, methods and observed public research feed the final deliverable. Eleanor accepts these requests directly without another approval for routine internal drafting. Explicit requests for additional AI assistance retain their existing approval flow.

New projects must save a separate practical guide before they can finalize. The guide covers the goal, materials, ordered steps, an example, quality checks and the next action. It stays separate from the requested file content so CSV, JSON and calendar files remain valid. The trusted final transaction copies the full guide, completed work and dated observed source links into Eleanor’s existing Messages conversation in numbered parts. A project button opens the matching project for files, feedback and existing review controls. Direct public research and custom-worker tutorials also relay through Eleanor. No delivery approves or publishes the work. A private idempotency ledger prevents retries from duplicating or resurrecting deleted guides. Existing projects can finish without a newly mandatory guide.

Consulting validation includes real authenticated secretary intake, role prompts, guide-required finalization, unchanged structured output, safe source links, and the current native Messages UI. The transactional `tests/consulting-rollback.sql` fixture completes an actual two-specialist project, verifies long Unicode guide delivery and source retention, prevents duplicate and cross-owner delivery, preserves final review, and checks direct research/custom-worker relays. All fixture data rolls back. The full Node suite passes 321 tests.

## ChatGPT requests

The Home Screen ChatGPT app lets all staff request scoped ChatGPT help through Eleanor. The owner’s saved delegation setting controls nonfinancial auto-approval; financial requests always require the owner before the connector can read them. Eleanor’s pop-ups report the requester, reason and actual handoff status. Open ChatGPT to start an approved session, then review returned answers/files in Eleanor’s Messages, the ChatGPT app or Projects. This does not enable paid API calls or unattended control of a live chat. See `CHATGPT_APP.md` for the workflow and validation.
