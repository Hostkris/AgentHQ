# Agent HQ Intelligence — owner-approved knowledge + bounded draft self-check

## What is installed

This change adds a shared internal intelligence layer for the existing Agent HQ built-in specialist workflow. It **does not install Noema**, train a new LLM, create unlimited AI generation, or allow autonomous external actions.

### 1. Permanent, revocable owner-approved knowledge

When the owner reviews a single complete written assignment and replies **green light, approved, 👍, I like it**, or another accepted editorial approval in **Messages**, the UI first saves its normal owner-authored version-specific approval note. It then attempts to save a bounded excerpt of the approved specialist outputs into the new `public.agent_approved_knowledge` table:

- `owner_id`, `assignment_id`, `review_version`, `topic`, `approved_excerpt`, `source_worker`, timestamps.
- Owner-only read/insert/delete Row-Level Security. No anonymous access or owner-side record editing.
- Unique owner+assignment+review version avoids duplicates. Deleting a team assignment cascades to its associated learned examples.
- Nothing from a denied, unfinished, or unapproved draft is automatically saved. No hidden ChatGPT connection or external account data is imported.
- This stores a copy of **approved text**, not an LLM's model weights. It is retrieval memory, not neural fine-tuning.

For privacy, approved drafts can contain business text. The owner can open **Settings → Agent Knowledge → Forget example** to delete one. Saved knowledge is never shared between separate Agent HQ sign-in users.

On later specialist tasks, the server reads at most the latest 60 examples **for the same authenticated owner only**, ranks them by meaningful topic overlap and attaches at most **two snippets of 950 characters each**. These examples are labeled explicitly as *untrusted prior style references*, never factual evidence, instructions, or permission to take actions. A different brand or unrelated topic should not receive a sample that has no meaningful topic overlap.

The owner might see approval succeed but knowledge save fail (e.g. offline, expired sign-in); the message will explicitly report the failed example save. The editorial approval remains valid even if memory saving fails. The Settings page can verify saved entries. Historic prior approvals are **not silently imported**.

### 2. Quality checking + bounded self-correction

Each specialist's model instructions ask it to verify that the output is a real draft satisfying the brief, rather than a promise to work; that unknown facts are marked for verification; and that it claims no website visits, account access, mailing or publishing.

After initial generation, a **free deterministic check** looks for short or evasive answers, false first-person claims of external actions, and unsafe localhost references. **Only if that check flags a problem**, Agent HQ makes a *single* additional model request, asking for a corrected version under the same strict no-external-action policy. A corrected draft must pass the checks to replace the original; a hard false-action safety issue prevents saving the faulty draft.

This retry can consume additional tokens from the **existing Groq/OpenRouter AI provider**, even when it is on a free tier. No new provider or OpenAI API key is installed. The feature does not guarantee accuracy or verify current external facts. The owner remains the final reviewer.

### 3. Limits

- No automatic web browsing, photo generation, social posting, bank access or external services are added by this feature.
- Does not change Alex's manager-only privileges, per-task permissions, publishing approvals or separate account OAuth.
- No background work while Safari is suspended is created.
- Only built-in coordinated specialist text drafts use server-side retrieval and self-check. Custom Worker Studio bots are unchanged.
- Knowledge retrieval is based on exact topic overlap and may skip useful but differently worded examples. The next enhancement could use embeddings if supported by the user's budget.

## Verification

GitHub Actions runs `tests/agent-intelligence.test.mjs` covering topic relevance, self-check defects, bounded retries, approval-only persistence, RLS, forget controls, and unchanged outside-action boundaries. Supabase live table must have owner RLS policies, and the changed `agent-hq-coordinate` Edge Function must be deployed after merging. No database migration is required for the existing notes or assignments.
