# Hosted browser setup for iPhone and iPad

Agent HQ remains a Safari/Home Screen web app on iPhone and iPad. A hosted worker would execute in the cloud, so no Mac would need to stay awake. Browserbase documents mobile live views and persistent browser contexts, making it a candidate for an initial connection test. It does not grant Facebook permission to automate a personal account.

## Implemented in this change

Settings → Connected Apps → Hosted Browser contains provider setup instructions and a read-only connection check. The `agent-browser-host` Edge Function verifies an authorized Agent HQ owner with `getUser()` and the existing owner allowlist. It checks the configured project using `GET https://api.browserbase.com/v1/projects/{id}`. The API key stays server-side. Raw project metadata is not returned.

The connection check never creates a session, stores a Facebook login, grants an agent access, publishes or sends a message. Host verification is explicitly separate from Facebook authentication and execution. All responses report `facebook_connected: false` and `execution_enabled: false` until those capabilities are actually implemented and verified.

## Required owner setup

1. Create your own Browserbase account at https://www.browserbase.com/. Start with its free testing allowance; do not upgrade just to run this connection check.
2. Find the API key and project ID in the Browserbase dashboard.
3. In the Agent HQ Supabase project, open Edge Functions → Secrets and save `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`. Do not paste the values into chat, GitHub, or an app text field.
4. Sign into Agent HQ on iPhone/iPad and tap Check hosted connection.

No Browserbase account or paid subscription is created by this change. A missing key is reported as setup needed, not as a working Facebook connection.

## Required before approved sending can be enabled

- Confirm the provider can support the Facebook personal-profile use case and applicable platform restrictions.
- Implement an isolated, owner-scoped context and secure mobile login/takeover session. The owner handles Facebook credentials and verification prompts. Session recording and logging need explicit privacy controls.
- Verify the signed-in account and specific target recipient/post, then bind one-time approval to the exact content, target and version. Edits, expiry, revocation and uncertain outcomes must invalidate execution or pause it.
- Implement and test the posting/reply adapter against the owner's actual Facebook interface. A browser service or approval record alone does not implement this adapter.
- Pause on login, CAPTCHA, security checks, wrong account/recipient, interface mismatch or uncertain send status. Do not automatically retry an uncertain send.
- Verify results before marking a task sent. These steps remain outstanding; they are not represented as completed features.

Personal-profile posting and personal Messenger are not supported by the standard Page publishing/Messenger API integration. Page APIs are a separate option; no Page connection is substituted for the owner's requested personal profile.

## Validation

Run `node --experimental-strip-types --test tests/browser-host.test.mjs` with Node 24. Tests verify missing-secret handling, read-only project verification, no key disclosure, owner/auth/origin restrictions and rejection of session creation or sending actions.

Official references:
- https://www.browserbase.com/pricing
- https://docs.browserbase.com/reference/api/get-a-project
- https://docs.browserbase.com/platform/browser/observability/session-live-view
- https://docs.browserbase.com/platform/browser/core-features/contexts
- https://developers.facebook.com/documentation/pages-api/posts
- https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview
