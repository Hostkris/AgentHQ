# Eleanor — personal executive secretary

The foreground reminder card starts from an owner-bound copy of notices previously loaded on this device, while the authenticated API refreshes in the background. It loads before the external auth SDK, has no entrance delay, and shows all pending reminder text in its scrolling list. Fresh results update the notice list without replacing a reply in progress. A first visit still needs its initial server response; already saved notices appear before overdue work finishes processing. Cached text is labelled as saved while updating. Signing out or changing accounts closes the card and invalidates that account’s preview. Reminder edits and acknowledgements clear the preview before the desk reloads it. Closing the card preserves its existing dismissal behavior and does not complete or approve the underlying work.

Eleanor is an additional private worker. The original ten staff retain their roles. Her full standing instructions live in `eleanor-secretary-core.js`, are stored in her Worker Studio profile and appear under Reminders → Work ethics. She follows through on authorized internal administration while preserving the existing approval boundaries for outside actions.

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

The baseline main revision c1649c244f6310d1f02510de2d024857ec4f1584 already has ten failing Node tests: eight older app-version expectations, an Eleanor profile instruction-length limit, and an older reminder-confirmation expectation. The full suite returns the same ten failures with this change, plus six passing snapshot tests (299/309 passing versus 293/303 on baseline). The existing desk browser fixture also waits for the older “Secretary settings saved.” message. These baseline failures were verified separately and are not represented as passing; the focused secretary-startup job tests the new behavior independently.
