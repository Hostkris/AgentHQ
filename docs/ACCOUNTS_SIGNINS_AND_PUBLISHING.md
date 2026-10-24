# Agent HQ — Accounts & Sign-Ins and publishing preference

## Where the settings are

- **Settings → Accounts & Sign-Ins** groups ChatGPT, Gmail, Facebook, Instagram, TikTok, YouTube, iCloud, Meta Ads, Shopify, X and Pinterest.
- **Settings → General → Enable Authorized Social Publishing** provides a real toggle. **Settings → Social Publishing Details** explains permissions and access requirements.
- **Settings → Agent HQ Sign-In** retains the owner’s existing login controls, account recovery and cross-device synchronization.

## What is actually connected

| Provider | Current capability |
|---|---|
| Gmail | Uses existing genuine Google OAuth flow and Agent HQ Email Center. Where Google credentials/configuration are missing, presents setup rather than fake success. |
| Meta Ads | Uses existing genuine Meta OAuth and permits **read-only advertising reporting**. Not a Facebook/Instagram publishing grant. |
| Facebook, Instagram, TikTok, YouTube, iCloud, Shopify, X, Pinterest | Listed with *not linked* status. An Open official website action is **only a browser login**, never a connection to Agent HQ. Existing My Profiles can store labels, not account tokens. |
| ChatGPT | Listed with the accurate unsupported status. The app cannot reuse ChatGPT website sessions or a subscription without a supported client authentication. **Do not request ChatGPT credentials or claim connected.** |

## Publishing authorization

The General switch is stored on the **Agent-HQ Supabase project** under `public.agent_publishing_controls` with owner-isolated RLS.

The default value is **off**. Enabling it means only **the owner allows agents to PREPARE publication requests**. The database enforces `per_post_approval_required = true`. This does **not** grant outside scopes, auto-publish, log in to provider accounts, or perform API posting. No live social publishing service is connected by this change.

A future publisher MUST verify *server-side*:
1. A signed-in, authorized owner for the post.
2. `publish_requests_enabled` is true for that owner.
3. The worker holds an unexpired, scoped owner grant for the exact provider/account/action.
4. The owner approved the exact draft, platform account and publication action; draft approval alone is insufficient.
5. The platform OAuth token and scopes are valid and stored server-side.
6. The post is idempotent with audit evidence and an owner-visible result.

Absent any item, stop without posting. Existing Agent HQ worker text cannot be treated as proof of completion.

## ChatGPT connection requirements

As of Oct 2026, OpenAI Sign in with ChatGPT exists, but plan-sharing is available only to supported app integrations and compatible open-source clients. Current open-source authorization requires an on-device local loopback redirect; a GitHub Pages PWA cannot complete that flow simply by displaying a password box. The Settings card links to official integration requirements until Agent HQ has a proper supported mechanism.

References:
- https://developers.openai.com/siwc/quickstart
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Verification

Tests verify provider statuses, explicit saved preference, visible General toggle, absence of password fields, lack of publishing endpoints and linked CSS/JS. This migration was deployed through Supabase with migration name `agent_hq_owner_social_publishing_controls`, then confirmed using information_schema and RLS policies.

No third-party user passwords, cookies, refresh tokens, service-role keys or social publishing credentials are stored by this Settings UI.
