# Agent HQ — Phase 6: Messages-first teamwork

## How to assign a task
1. Open **Messages → worker** (or **Contacts → worker**). Company HQ also accepts tasks.
2. Type the instructions in the conversation.
3. Tap **Assign Task**. The regular **Send** button only saves a message.
4. The task is saved immediately and opens in **Assignments**.
5. Alex, the AI general manager, plans specialist steps using your connected Groq/OpenRouter model. The assigned workers then draft text in order, with handoffs saved in the team discussion and employee Messages.
6. The initial action executes at most **three** specialist model steps after Alex's plan; **Continue teamwork** advances up to three more steps while the browser page stays open.
7. If a worker needs information, open that worker's Messages conversation and use **Answer and resume team** in the task question card. The reply is tied to the specific assignment.

## What you can track
- Progress bar: completed drafting steps / planned steps
- Current queued, drafting, completed, or blocked worker
- Alex's manager summary and specialist assignments
- AI handoff messages and worker drafts in both team discussion and employee Messages
- Questions and permission requests that need your input

## Important restrictions
- This is **bounded, user-initiated text teamwork**, not a 24/7 autonomous agent service. Work continues while the page remains open; refresh or page closure does not guarantee continuation. Resume via **Continue teamwork**.
- No external websites are visited by the AI workers. Approval requests are saved for your review, but **approval does not create browser access**. When needed, provide reviewed source information in Messages.
- No account sign-ins, financial actions, email delivery, publishing or purchasing.
- All AI progress updates are written server-side, with owner-scoped RLS. Other signed-in users cannot see the work.
- Model drafts are not independently fact-checked. Avoid sending passwords or sensitive personal data in assignments.
- The shared worker-run budget remains 10 AI model requests per signed-in owner per hour, counting planning and specialist steps. Groq's own free-tier limits also apply.

## Technical references
- `agent-coordination-cloud.js`: signed-in web client, inbox assignment, handoff polling and limited in-page runner
- `supabase/functions/agent-hq-coordinate/index.ts`: signed-in server-side AI manager and specialist router
- `supabase/migrations/20261022065000_phase6_message_assignments.sql`: task steps, owner RPCs and RLS
- `supabase/migrations/20261022070000_phase6_server_coordination.sql`: service-role-only plan/handoff transaction functions
- `supabase/migrations/20261022073000_phase6_fix_waiting_question.sql`: safe waiting-question result
