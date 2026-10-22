# Agent HQ — Connect accounts from worker Messages

This phase adds *provider connection cards inside existing coworker conversations*.
To test, open https://hostkris.github.io/AgentHQ/, sign in, open **Contacts → Maya → Messages** and type:

> Maya, check my Gmail inbox and prioritize my emails. Prepare replies for review, but do not send anything.

## Gmail: real authorization + named-worker priority summaries

1. The conversation shows a **Connect Gmail with Google** button when a relevant request mentions Gmail, inbox or email.
2. That button invokes Agent HQ's existing signed-in `agent-gmail` server-side OAuth flow and navigates to Google's official consent screen. **No password is requested in chat.**
3. The app returns to the same coworker's conversation after Google's callback on that device/browser. If Google configuration is missing, use **Gmail setup/status** and follow `GMAIL_EMAIL_ASSISTANT.md` first.
4. Once connected, a **separate** button asks permission to **Allow Maya to read priority summaries · 24 hours**. The owner confirms it. This grant is restricted to the named worker, lasts at most 24 hours and can be revoked right in Messages.
5. Tap **Check Gmail inbox now**. The signed-in owner initiates a fresh Gmail scan through the existing `agent-gmail` service, then asks the same worker to summarize the newly cached priorities in its conversation.
6. Worker summaries show counts by Urgent, High, Medium, Low and up to five prioritized email headers/subjects, with a timestamp. The service uses cached email **metadata and subject lines**, not entire email bodies or attachments. The latest 12 inbox messages within 30 days are checked per click.
7. **Email Center** remains where the owner can read full plain-text messages, enable optional AI reply preparation, review/edit suggested replies and explicitly confirm *each* send. No worker chat can send email.

### Authorization separation

- Google OAuth gives **Agent HQ** API permission, not arbitrary authority to every AI worker.
- `agent_gmail_worker_grants` stores named-worker permissions, one record per owner and employee.
- Owner-approved permissions are limited to `priority_summaries`. There is no email-send, delete, archive, attachment or background scope. Grants are revoked on Gmail disconnect or switching to a different Gmail address.
- The owner can revoke a worker without disconnecting Gmail for themselves. An expired/revoked grant is checked on each chat request before reading any metadata.
- The public GitHub Pages website never stores or sees Gmail OAuth access/refresh tokens. The server uses previously implemented encrypted token storage.
- Email subject/sender content is treated as untrusted data, never instructions or commands for the worker.
- There is **no recurring background inbox watcher** in this phase.

## Meta Ads

For an advertising query (e.g. "Check my Meta Ads"), the chat displays the existing **Connect Meta Ads** OAuth option where available. Only *read-only advertising account* access is supported by the implemented API integration. Each worker also needs the existing per-ad-account read grant under Operations. A Meta Ads OAuth login is **not** a general Facebook or Instagram personal-profile login.

## Facebook / Instagram personal profiles

The chat shows **Manage personal accounts** and truthfully labels their provider connections unavailable. Existing My Accounts profiles and planning permissions **do not** grant a Facebook/Instagram login or publishing. Real account access will need a separate Meta-supported OAuth integration and scopes applicable to the exact profile/Page type. We do not route users to a fake Facebook login.

## iCloud Mail

The chat shows an **Apple iCloud Mail instructions** button linking to Apple's official IMAP/SMTP guidance. Unlike Gmail, Apple's supported generic iCloud Mail setup currently uses an **app-specific password**, not a Google-style OAuth button. **Never** enter an Apple Account password or app-specific password in Agent HQ chats. A separately secured server-side iCloud adapter would be needed before Agent HQ can process iCloud inbox data.

Official Apple reference: https://support.apple.com/en-us/102525

## Technical files

- `app.js`, `styles.css`, and `index.html`: context-specific in-thread connection/approval cards, return-to-chat after OAuth, responsive styling.
- `agent-gmail-cloud.js`: Gmail status and named-worker grant/revoke RPCs.
- `supabase/migrations/20261022235500_agent_gmail_worker_grants.sql`: RLS-protected grant table and authenticated owner-only grant/revoke RPCs.
- `supabase/functions/agent-hq-converse/index.ts`: fixed-rule Gmail summary path that checks connection and grant *before* querying owner email metadata.
- `supabase/functions/agent-gmail/index.ts`: revoke worker grants on disconnect or mailbox switch; all sends remain separately reviewed.

## Confirmed vs not yet tested

- Confirmed: code committed to GitHub, Supabase schema migration applied, both Edge Functions deployed, JavaScript syntax validated, and six UI card states exercised with isolated test inputs. The grants table has owner-only RLS, no anonymous access, and no direct authenticated write privileges.
- Not confirmed: a live Google sign-in, reading a real connected inbox, browser return-to-chat on the user's device or a successful worker reply from the user's session. No Gmail account was connected during implementation. These tests must be performed after the owner's private Google OAuth setup.
