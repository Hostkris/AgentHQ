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


## Notes, Calendar and morning check-ins (2026-11-07 implementation draft)

The existing **Reminders** desk has a Daily check-in tab and Notes review tab. Eleanor also has a Today shortcut to each. At sign-in the desk schedules one owner-private, recurring **Eleanor daily check-in** routine at the owner's already-saved briefing time (currently 7 AM America/New_York), unless a matching active, paused or stopped reminder already exists. This follows the existing scheduler and optional notification opt-in; no separate background ChatGPT session is assumed. The owner can pause or stop the reminder from Reminders.

**Daily check-in:** The owner manually reports a measured heart rate (bpm), tracked water (fl oz), whether they took their multivitamin drink and apple cider vinegar, went on TikTok Live, checked posts and checked messages, and any pasted messages requiring draft replies. An optional request asks what Eleanor can help execute. Every status defaults to *not yet / not reported*. Entries are device-local, account-scoped drafts until the user explicitly selects **Save and send check-in to Eleanor**; then a confirmed send to her existing Messages conversation adds the report for discussion. A matching successfully sent report is not resent on an identical form submit. No doses, target quantities, completion, diagnoses or measurements are guessed. No Apple Health, heart-rate sensor or TikTok API connection is implied, and a draft is not a server-synced health log.

**Native Agent HQ Notes:** The Home Notes widget now uses the signed-in owner's private `agent_hq_notes` table in the existing Agent HQ Supabase database. Notes are available on the owner's Agent HQ devices. Existing on-device Notes are imported with unique client keys, kept locally if an import fails, and removed from the local migration queue only after a confirmed server write. No Apple Notes, external device Notes, or paid connector is required. An owner can add, edit or delete private Notes in Agent HQ itself. Row-level security separates owners and the database maintains a revision history marker for each Note.

**Eleanor's proactive review:** A private database trigger reviews new or edited Notes for practical keywords that indicate an appointment, task, or project. This conservative triage records a proposed next action and creates a saved Eleanor Messages notice plus a pending in-app reminder. It does not itself delegate work, alter the calendar, use an AI model, send anything externally, or spend money. When the owner opens Notes review, they see Eleanor's recommendation and can choose **Approve**, **No, leave it as a note**, or **Ask Eleanor for ideas**. Calendar approval requests a future local date and time. Approved internal actions use Eleanor's existing verified Task, Meeting or Project saves; project handoffs still go to Alex and relevant specialists for owner review. Declining a proposal preserves the Note and dismisses the corresponding notice. Background note triage is deterministic rather than full AI reasoning; deeper idea development is available through the existing Eleanor chat.

**Calendar:** The Home Calendar widget now lists upcoming saved Eleanor meetings and task deadlines after an authenticated read of Eleanor's records. This is an Agent HQ calendar view **only**. It is not proof of live iOS, iCloud or Google Calendar read/write access, and no external calendar is touched. Creating, changing or cancelling real external events requires separately authorized integration and verified write confirmation.

**TikTok:** Check-in questions and explicit pasted messages can prompt suggestions from Eleanor and the appropriate specialists, but Agent HQ does not have unrestricted automatic access to TikTok DMs, comments or posts. No public reply or content is posted without the required permission.

**Code/testing:** `agent-eleanor-workflow.js`, secretary UI, Home Notes/Calendar, CSS and asset versions; `tests/eleanor-workflow.test.mjs` adds owner-isolation, manual check-in and proposal-path checks. Existing AI execution limits and external permission barriers remain unchanged. Device alerts still require owner opt-in.


### Native-first policy (November 7, 2026)

Agent HQ Notes, Calendar, Reminders, Messages, pop-ups, agent approvals, and project files are the primary systems of record. Eleanor should prefer these internal tools; she must **not** request an Apple Notes or iCloud calendar connection to use them. Internal appointment creation is already supported through the saved Meetings register, and upcoming events appear in Agent HQ's Home Calendar. Other calendar services may remain disconnected. Notes and appointments are kept owner-private; lock-screen notifications are generic and never include note content. Existing per-platform social permissions still control any permitted outside research, reading or account actions.

## Proactive internal Calendar and daily check-ins (2026-11-07)

**Agent HQ is the system of record.** Eleanor now checks saved Agent HQ Notes proposals, the Calendar (saved Meetings and Tasks), and the owner's reports. In the Home Calendar widget, upcoming appointments and dated task deadlines appear alongside open tasks without a deadline. The owner can explicitly mark a task completed from the Calendar after confirming it actually happened. Note recommendations remain approval-gated and never schedule or delegate work on their own. No Apple Notes, iCloud, or external Calendar linking is required.

**Daily check-in:** A repeating `Eleanor daily check-in` reminder is already active at 7:00 AM Eastern (according to the saved Agent HQ setting). The scheduled server message now asks about **measured** heart rate, multivitamin drink, apple cider vinegar, reported water intake, TikTok Live, posts, messages and what needs a draft reply. These are questions, not claims that she measured or read these sources. Actual input is saved to owner-private `agent_hq_daily_checkins` records. On-device drafts migrate to that register after sign-in and confirmed saves. The report is sent to Eleanor's existing Messages conversation after the cloud save succeeds, with deduplication of exact already-sent reports. The morning briefing contains confirmed reported answers, pending Notes suggestions, overdue tasks and social-connection *status*. It does not invent a workout, measurement, target or completion.

**Social reading:** `agent_personal_accounts` currently lists Facebook and TikTok with `integration_status = not_connected`. A stored account directory entry is not proof of permission to read private DMs, comments or posts. The check-in includes **Ask Eleanor to review authorized social activity**, which asks her to verify the actually available integration, coordinate Casey and Taylor, and prepare replies only for owner-provided or properly authorized information. If a working read capability is unavailable, she should ask for a specific approved source or pasted comment/message, not claim that she inspected the account. No posting or sending is authorized merely by the daily check-in.

**Notifications and privacy:** The existing scheduled secretary Messages and optionally enabled Web Push carry these daily questions. Lock-screen pushes show generic text, not health or private-account contents. Note/calendar work and check-ins remain in Agent HQ and require a valid owner sign-in. Cloud storage is first-party Agent HQ infrastructure; it does not mean data is stored only on the phone or that no backend is used.


## Saturday rest, reading, missed-work and Agent HQ Home improvements (2026-11-07)

**Rest and autonomy:** Eleanor's previously saved recurring routine days were changed to Sunday-Friday. The 7 AM Eastern briefing retains its time, but the secretary scheduler and unattended team project runner now skip Saturday. Specialists continue bounded owner-approved internal projects autonomously on eligible days. External accounts, spending, publishing and irreversible commitments still require scoped approvals.

**Automatic reminder times:** 7:45 AM multivitamin drink, 8 AM apple cider vinegar, 4:45 PM the owner's 5 PM food cutoff, 7 PM four-page reading, and 9 AM monthly body weight on the first eligible date of the month. Times remain editable in Eleanor's desk. These are owner-requested reminders, not medical recommendations, dosing instructions, proof of ingestion or a required fasting protocol. Saturday stays free. For a nonclinical recurring request without a time, Eleanor selects a deterministic default based on the type of task; she does not invent medication times.

**Book and check-in:** The existing read-books reminder asks which actual title the owner wants. Daily check-in lets the owner save a book name, a four-page target, daily or alternate *eligible* days, and a reading time to the Agent HQ Calendar. It records pages actually read, optional monthly body weight and the 5 PM preference privately; no values are guessed.

**Missed work:** The service-role-only database functions agent_hq_capture_unfinished_reading and agent_hq_rollover_missed_tasks convert unfinished reading sessions into remaining-page tasks and move missed flexible internal tasks to the next non-Saturday opening. Appointment and task collisions are checked. Fixed deadlines, actual meetings and outside commitments are excluded. The owner gets a private Eleanor message and a generic notification, and can edit or complete the rescheduled task.

**Weather:** Open-Meteo current WMO weather codes map to clear, cloudy, fog, rain, snow and storm icons, with day/night display, wind, highs/lows and precipitation chances. Saved-city forecasts refresh when requested or stale.

**Dock:** Long-press a Home Screen app to enter edit mode. Select any Agent HQ app for each of the four dock positions or move entries left/right. Selecting an app already in the dock swaps slots. These choices stay on the device and never change external permissions.

**Verification:** Database migrations 20261107195242 and 20261107195657 were applied; rollback-only tests verified missed-work rescheduling. Regression tests cover alternate reading, Saturday rest, monthly weight, weather mapping and editable dock. Edge Functions and GitHub Pages need separate deployment.
