# Conversation delete controls

Every built-in worker and Company HQ shares the message X control. The same control covers custom-worker owner/reply/handoff messages and welcome text, website approvals, Facebook request cards (including expired and legacy unanchored cards), connection guidance, team work cards and assignment discussion notes.

X confirms the selected removal. It never approves, sends, publishes or runs work. Sending placeholders show a disabled X until the saved message is available.

Ordinary and custom-worker texts are deleted. Permission and team records retain their audit history while an owner-scoped dismissal ledger removes their message presentation on all signed-in devices. A work-card dismissal leaves the assignment and drafting state intact. A Facebook request dismissal also denies pending or revokes active reading, removes any Safari handoff, and removes its prompt. Deleting the prompt through the existing API has the same behavior, preventing the card from returning without an anchor.

The RPC accepts no owner argument. A private function checks auth.uid() against each target; public wrappers run as invoker. Clients can select only their own dismissal ledger and cannot write it directly. Request cancellation shares the existing reading transition lock, so a cancelled request cannot claim a capture or save a late report. No existing messages are deleted by the migration.

Validation: `node --experimental-strip-types --test tests/*.test.mjs` (45 tests at release). Run `tests/message-delete-rollback.sql` against the migrated database; every fixture/deletion is rolled back. Covers all Facebook statuses, legacy cards, owner isolation, repeat taps, cancellation, ordinary/custom texts, approval denial, preserved team audit records and ledger RLS. This does not claim a signed-in iPhone device test.
