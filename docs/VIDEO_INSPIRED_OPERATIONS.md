# Agent HQ — Video-inspired business-worker conversations (Phase 7)

The reference video demonstrates a manager of multiple AI specialists who reports
campaign results, coordinates employees, proposes ad-budget changes, drafts/posts
social content, builds Manychat automations and communicates through chat/voice.

## What this phase implements

- An **Operations** dashboard reachable from the home screen.
- Example prompts open the right worker's conversation with an **editable, unsent**
  draft. You still press **Send** before the worker receives anything.
- Groq/OpenRouter now classifies requests for external account operations
  separately from ordinary text drafting and team assignments.
- An AI coworker can propose a scoped outside action (platform, type, precise
  summary and scope) and ask **yes/no** in its Messages thread.
- Every proposal is persisted in owner-protected `agent_action_proposals`.
  Approving/declining updates the specific proposal only.
- **The real external action is not executed.** All records have a hard database
  constraint `execution_status='not_connected'`.
- Proposed changes appear in Operations with whether they're pending, approved
  or denied and the label **External action not executed**.
- Office thought bubbles can reflect a real pending approval (📝🔐) or an
  approved request blocked by an unconnected account (🔌).
- Optional browser-native microphone dictation (where supported) populates
  your unsent message. An optional speaker button uses the device's standard
  text-to-speech voice to read the latest worker reply. Neither feature
  clones a person's voice; recordings are not stored by Agent HQ.

## Supported proposed operations

| Provider | Action types | Current execution |
| --- | --- | --- |
| Meta Ads | Read ad metrics, propose budget change | Not connected |
| Instagram, Facebook, TikTok, YouTube | Prepare/publish content, reply to comments, read metrics | Not connected |
| Manychat | Create customer automation | Not connected |
| Business email | Send email | Not connected |

The worker cannot report actual ad spending, ROAS, cost per acquisition or
account changes unless trustworthy account data is connected and available.
The app never invents results or implies actions happened.

## Try it

1. Refresh https://hostkris.github.io/AgentHQ/
2. Open **Operations** on the Agent HQ home screen.
3. Choose **Review ad spending** to open Avery's chat with an editable prompt.
4. Send it. The worker should explain that it needs authorized account access;
   it may prepare an action proposal, which appears in Operations.
5. Try **Propose a budget change** with Alex. The assistant should ask for
   your yes/no decision about the *specific proposal*. Replying yes records
   approval and does not change an ad budget.
6. Test voice dictation in Messages if your browser supports it; it never
   sends automatically.

## Still required for actual operations

- OAuth connection and scoped permissions for each external platform.
- A secure server-side provider adapter for each action, with provider-specific
  scopes, rate limits, audit logs and revocation.
- Explicit approval for sensitive actions at the time of execution.
- Background scheduling and monitoring infrastructure for always-on workflows.
- Trusted, live analytics via authenticated provider APIs; no invented numbers.
- A separate, consent-based voice service if voice cloning is desired.

The video is promotional content and its claims are not verification of any
third-party application's actual capabilities. Agent HQ must not imitate
branding or pretend that API connections exist.
