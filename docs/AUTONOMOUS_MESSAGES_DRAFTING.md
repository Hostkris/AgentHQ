# Agent HQ — autonomous text drafting and natural Messages approvals

## Owner experience

A message like **“Create a promotional post”** starts an internal writing assignment; workers should not ask “Should I create an assignment?” or loop on “Resume the team? Yes or no?”.

Alex selects the smallest available specialists, stores a bounded plan and the original signed-in owner instruction automatically authorizes only the **internal, text-only drafting steps**. This is not publishing authorization. Specialists do their best with the information provided, using labeled placeholders instead of fabricating prices, claims, website research, account metrics or other facts.

If a genuine blocker exists, the worker asks **one clear question** in the existing Messages conversation. Answering it unblocks the queued drafting step **without another yes/no prompt**. Returning "yes" to a legacy pending-resume state clears that state once and resumes only the owner-owned active assignment.

On completing a single unambiguously identified assignment, a Messages reply of **approve draft, approved, green light, thumbs up, 👍, I like it, looks good** accepts the text. **Red light, thumbs down, 👎, I dislike it, reject draft** marks the exact version as rejected; the owner can describe revisions in the thread. A changed draft needs a new review. Multiple eligible drafts do not silently share one approval.

## Limits and security

Current team projects use a private server runner and automatic recovery, including when the app is closed. See [PROJECT_AUTONOMY.md](PROJECT_AUTONOMY.md). Hands-off completion percentages are goals, not measured guarantees. Server limits still cap each set of worker drafting steps and model use. The workers have text-only capabilities unless specifically integrated otherwise. They must escalate unavailable systems, owner-only factual input, safety issues or authenticated sites they cannot access.

Ordinary role-scoped public web research is already authorized. Platform sign-ins, new private-account access, sending email, social publishing outside existing authorization, money/spending, purchases, and material account changes still require a **specific scoped human authorization** and a genuinely working connection. A green light on a draft never authorizes them. The sensitive-action confirmation function deliberately **does not accept emoji likes/dislikes**, even though editorial approval does.

## Implementation

- The `agent-hq-converse` server function interprets the original owner message as task consent, repairs old `confirm_task` and `confirm_resume` states and automatically resumes drafting after a worker's blocker is answered.
- The `agent-hq-coordinate` server function selects the smallest specialist team and emphasizes draft-first problem solving, placeholders, true blockers, and no fabricated external work.
- The client `agent-coordination-cloud.js` records the specific owner-scoped **internal plan approval** immediately after Alex proposes the task requested in that same Messages send. The database retains an auditable decision; any other plan still requires the usual owner approval path.
- The client `app.js` interprets natural final-review phrases as editorial decisions **only for one unique, finished draft**, saves them in that assignment's existing owner-authored review notes, and never calls a publisher.
- `agent-hq-worker` already requires verified owner plan decisions and remains unchanged.
- Regression tests validate task start, legacy resume, blocker handling, natural editorial feedback, and separation from outside-account approvals.

After merging code, the two changed Supabase Edge Functions (`agent-hq-converse`, `agent-hq-coordinate`) must also be deployed. GitHub Pages only deploys the frontend.
