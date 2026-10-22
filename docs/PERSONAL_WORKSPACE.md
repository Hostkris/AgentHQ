# Agent HQ — Private Personal Workspace

This version of Agent HQ is configured as an owner-controlled personal workspace,
not a commercial agency or multi-customer product. The RPG Office, Contacts,
Messages, team assignments, and light/dark appearance remain available.

## My Accounts — personal social media and your own advertising

1. Open **Agent HQ → My Accounts**.
2. Sign in with your existing Agent HQ account under Settings if prompted.
3. Choose **Add my social or advertising profile**.
4. Select Instagram, Facebook, TikTok, YouTube, Threads, Pinterest, X, Snapchat,
   Google Ads, TikTok Ads or Pinterest Ads.
5. Enter a short nickname and **public handle/account label only** (for example
   `@myprofile`). Do not enter passwords, login codes, cookies or API tokens.
6. The profile is saved **only as a label**, marked **Not connected**. This is
   not a login, OAuth connection or permission to read its data.

For your own **Meta Ads** advertising account, **My Accounts → Manage Meta Ads**
opens the existing read-only connection in Operations. That is the only advertising
platform integration currently implemented; it requires your Meta authorization.

## Separate authorization for each AI coworker

Every account can have its own purpose-specific permission plans. The supported
scope labels are:

- **Draft posts** — text preparation
- **Draft replies** — written suggestions
- **Plan content** — strategy and schedules
- **Request account analytics** — future account reporting
- **Request publishing** — future external publishing
- **Request inbox management** — future external messages

To create a worker permission plan:

1. Expand **Worker permissions** beneath your saved account.
2. Select the **specific employee** and **task scope**.
3. Describe the assignment and why they need that scope.
4. Tap **Prepare permission request**.
5. Review the pending request, then choose **Approve plan** or **Deny**.
6. An approval lasts **24 hours** and can be revoked sooner with **Revoke now**.

The request may also originate from an AI worker's conversation when the worker
asks for an external social action connected to one of your saved profile labels.
A pending request will be opened for review in My Accounts. The worker does not
approve its own request, sign you in, or receive a password.

**Important:** These are auditable **permission plans**, not live social account
grants. A hard database constraint requires
`external_execution_enabled = false`. Even after you approve a plan, no
external social account access, account data retrieval, posting, reading private
messages, or automation runs. That would require the real provider integration,
a separately scoped authorization, and a per-action approval when sensitive.

## Meta Ads reporting — a separate real connection

Meta Ads has an independent read-only OAuth flow, encrypted tokens on the
server, and explicit **per-employee, per-ad-account** read permissions lasting
24 hours. It never grants campaign editing. See
[Meta Ads setup](./META_ADS_CONNECTION.md).

## Privacy and boundaries

- Saved profiles, worker plans and their approval history use owner-scoped
  Supabase Row Level Security. Anonymous browser visitors cannot read or write
  these records.
- Only narrowly scoped authenticated RPCs can change them.
- Public-facing GitHub Pages **site code and the login screen remain publicly
  reachable**. A personal-use workspace does not make the hosting itself
  access-restricted; your account data is behind sign-in.
- Groq/OpenRouter may receive the text you choose to send to AI workers.
  Do not include passwords, verification codes, private access tokens or
  financial credentials in worker conversations.
- You can remove a saved profile label; the associated worker permission plans
  are deleted with it. Removing a label never deletes your real social account.
- A rejected or revoked permission cannot perform an external action.
- Real account APIs may require provider-specific developer setup, review,
  eligibility, and your authorization even for personal use.

## Next integration milestones

1. Enable supported official OAuth for your own Facebook / Instagram assets
   where allowed by Meta's platform rules, including precise scopes,
   private tokens and per-worker revocation.
2. Add the remaining providers one at a time with documented API permission
   limits; personal-profile APIs may differ from professional/business pages.
3. Connect actual authorized read actions; keep publishing, private messages
   and other external changes behind explicit per-action approval.
4. Show accurate Connected/Not connected status and real action logs.
