# Agent HQ Worker Studio — Bot Marketplace & Worker Architect

Agent HQ adds a **private, native AI worker builder** inspired by the *interaction*
shown in the owner's October 22 screen recording of the Grok Bot Marketplace.

## What the video shows

The recording shows the Grok Bot Marketplace with featured bots, including
**dr eggbot** by Lauren Tan. It also shows specialized bot conversations, project
messages, a bot named Clipper, an overnight update and collaborators.

**dr eggbot** is a designer for other Grok Bots. It gathers requirements, then
uses Grok Bot's proprietary `CreateAgent` tool to create a specialized bot.

Official page:
https://x.ai/bot/marketplace/bots/dr-eggbot-v2

This Agent HQ implementation is an **independently written Worker Architect**,
not a copy of Lauren Tan's private prompts or tool implementation. Importing
the official template into Grok Bot does not install that proprietary runtime
in Agent HQ. The botdirectory.ai public Markdown listing provides a brief
published description, not the full original bot's source code:
https://github.com/elie222/botdirectory.ai/blob/main/bots/dr-eggbot.md

## Delivered in Agent HQ

1. **Worker Studio tile** on the home screen. Tabs: Discover, Create, My workers.
2. **Private marketplace-style catalog:** Inbox Priority Assistant,
   Research Brief Writer, Personal Social Planner, Personal Project Planner,
   Bot Quality Reviewer, and Writing & Reply Helper.
3. **Worker Architect:** A four-question intake about the exact job, explicit
   anti-jobs, output, voice, and category. The existing server-side Groq or
   OpenRouter integration generates a **draft** bot specification.
4. **Preview:** Name, role, mission, tone, skills, prohibited jobs, instructions.
   Nothing is silently saved or activated during preview.
5. **Save worker:** Owner chooses when to save the design as a draft.
6. **Add to team:** Owner activates the draft; only then it joins Contacts and
   gains a desk with an animated emoji in the RPG Office.
7. **Conversation:** Each active bot can message the owner with its own role
   and mission. Conversations are saved in owner-protected Supabase tables.
   Messages appears only once actual text has been saved.
8. **Worker handoffs:** In a worker conversation, expand
   **📄➡️🤝 Pass paperwork to another worker**. Select another active bot,
   describe the transfer, confirm it, and the backend produces a short
   context brief. An atomic database function stores matching handoff
   messages and an audit row. The other bot sees the written brief when
   the owner opens its chat. The RPG Office briefly animates the transfer.
9. **Archive / reactivate / delete:** Archived workers cannot reply.
   Deletion requires first archiving the bot and then confirming permanent
   removal of both the bot and its saved conversation.

## Important limits

- **This is NOT the Grok Bot runtime.** Custom workers currently use
  their saved role instructions and the configured Groq/OpenRouter model.
- **No external tools:** Custom workers cannot browse, sign in to Gmail,
  publish social posts, purchase anything, manipulate files, schedule
  background work or initiate live team assignments.
- **Handoffs are actual saved text**, not automatic background execution.
  They transfer task context; recipient bots only produce a new response
  when the owner messages them.
- **Skills are descriptions**, not enabled capabilities. Saving a bot does
  not automatically grant platform access or take any sensitive action.
- No GitHub marketplace clone or proprietary Dr Eggbot prompt is embedded.
- The iOS/desktop website can display these features, but actual
  continuous bots would require a persistent worker runtime, explicit
  integration permissions, and a job scheduler.
- The Groq/OpenRouter provider needs an existing working server-side
  API key; the app never stores private provider keys in the browser.

## Repository references reviewed

- Nexora: https://github.com/ParendumOU/Nexora — MIT-licensed
  self-hosted agent/orchestration/marketplace platform. Good architecture
  reference for a future standalone agent runtime; not directly
  deployable as GitHub Pages.
- AG2 Agent Plugins: https://github.com/ag2ai/ag2-claude-plugins —
  Apache-2.0 agent-scaffolding and handoff patterns.
- xAI Grok Build: https://github.com/xai-org/grok-build —
  Apache-2.0 coding agent CLI, **not** the full Grok Bot iOS teammate app.
- Public dr eggbot directory description:
  https://github.com/elie222/botdirectory.ai/blob/main/bots/dr-eggbot.md

These repos are references only. Their code was **not copied** into the
new Agent HQ Worker Studio. Licensing does not remove the need for
integration testing, authentication, hosting, or consent.

## Privacy and safety

- All custom workers, messages and handoff records belong to one authenticated
  owner; database Row Level Security prevents cross-account reads.
- Browser database clients get SELECT only; bot creation, updates, chat
  messages and handoff commits happen through a signed-in Edge Function.
- An atomic handoff SQL function can only be executed by the service role.
- User approves the destination and handoff instruction explicitly.
- Model output cannot acquire permissions or run tools by itself.
- The GitHub Pages website is publicly reachable; personal data and
  saved worker records are protected behind Agent HQ sign-in.

## Testing checklist

1. Sign in under Agent HQ Settings.
2. Home → Worker Studio → Discover.
3. Select a specialist or Create from scratch.
4. Describe its purpose, restrictions, desired output and voice.
5. Tap Design my worker. Preview the result.
6. Tap Save worker as draft, then My workers → Add to team.
7. Open Contacts or Office and tap the new worker.
8. Send a message, wait for its actual response, then refresh and check
   the conversation remains saved.
9. Create and activate a second worker. Open the first worker's chat,
   choose Pass paperwork to another worker, enter a handoff reason and
   confirm.
10. Open the recipient worker's chat: the transferred note should appear.
11. Archive the worker and ensure new messages are blocked.
