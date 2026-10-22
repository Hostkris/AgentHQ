# Connect Meta Ads to Agent HQ (read-only)

This integration provides authenticated read-only Meta advertising reports in Agent HQ.
**It does not change budgets, pause campaigns, publish posts, or send messages.**

## 1. Prepare your Meta developer app

1. Go to https://developers.facebook.com/apps/ and sign in yourself.
2. Create or open your own Meta developer app with Marketing API support.
3. Configure Facebook Login for Business (or the Facebook Login product supported by your app).
4. Locate **Valid OAuth Redirect URIs** and add this exact URL:

`https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-meta-ads?op=callback`

5. Ensure the Meta app requests and permits `ads_read`. This integration **does not request `ads_management`**.
6. Ensure you can view your own ad accounts in Meta Ads Manager and that your
   Meta login has the needed advertising account access.
7. While the Meta app is in Development mode, Meta may restrict sign-in to
   people with an app role. If you intend to connect someone else's ad account
   or use the integration publicly, check Meta's current App Review and
   Advanced Access requirements. Privacy policy and data deletion URLs may be
   required before switching the Meta app to Live.

Official Marketing API resources:
https://developers.facebook.com/docs/marketing-api/
https://www.postman.com/meta/facebook-marketing-api/overview

## 2. Save secrets in the **Agent-HQ** Supabase project

Open https://supabase.com/dashboard/project/slekcezduwnygywiiitp
then **Edge Functions → Secrets**.

Create these secrets using their exact **names**:

| Secret name | Where the value comes from |
| --- | --- |
| `META_APP_ID` | Meta app dashboard → Settings → Basic → App ID |
| `META_APP_SECRET` | Meta app dashboard → Settings → Basic → App Secret |
| `META_TOKEN_ENCRYPTION_KEY` | A unique randomly generated 32-byte key in base64 |

On your own Mac Terminal, generate the encryption key by running:

```sh
openssl rand -base64 32
```

Copy the output **directly into the Supabase secret value**.
Never paste any API secret, token or encryption key into Agent HQ Messages,
a GitHub repository, a screenshot or this chat.

Optional: `META_GRAPH_VERSION` may be set to a supported Graph API version
(e.g., `v26.0`). Leave it unset to use Agent HQ's default.

## 3. Connect Meta safely

1. Go to https://hostkris.github.io/AgentHQ/ and sign in under **Settings**.
2. Open **Operations** → **Meta Ads reporting**.
3. Tap **Check setup**. When the configuration is ready, tap
   **Connect Meta Ads (read-only)**.
4. The browser takes you to Meta's **own** authorization screen.
5. Sign in and review the `ads_read` permission yourself.
6. Meta returns you to Agent HQ; no access token appears in the browser URL.
7. In Operations, choose your advertising account and reporting period.
8. Tap **Get live report** to show actual Meta account totals and campaigns.

If Meta reports no ad account, check the app's permissions and your Ads Manager access,
then tap **Refresh accounts**. You can disconnect Agent HQ locally at any time.

## 4. Approve one employee for one advertising account

Connecting your Meta account does **not** automatically authorize any AI employee.
In **Operations → Meta Ads reporting**:

1. Select the advertising account the worker should read.
2. Under **Employee permission**, choose **Avery — Business Analysis** (or another employee).
3. Tap **Allow read-only access for 24 hours** and confirm the exact worker and account.
4. To end access sooner, tap **Revoke employee access** for the same account and worker.

The permission is account-specific, expires after 24 hours, and allows only
read-only insights. Selecting another advertising account requires another grant.
Company HQ does not automatically inherit individual-worker permissions.

## 5. Ask Avery for a live answer

Open Avery in Messages and send:

> What did we spend yesterday on Meta Ads?

When a valid read-only Meta connection, the selected ad account, and a live
per-worker read-only grant all exist, the server fetches the numbers directly
from Meta before Avery replies.
Avery should report actual spend, clicks, impressions, cost per click and CTR
with a source and retrieval time. If no account is connected, Avery must say so
instead of inventing results.

## Security design

- OAuth `state` is generated server-side, expires in 10 minutes, and can be
  consumed only once, atomically.
- OAuth code exchange and Meta app secret use Supabase Edge Functions.
- Tokens are encrypted using AES-256-GCM before database storage and are
  inaccessible to browser database roles.
- The Meta OAuth callback is public so Meta can return to it; all other
  actions require a validated Agent HQ Supabase user session.
- All ad-account selection and insights checks are restricted to the signed-in owner.
- Each AI worker requires a separate, revocable 24-hour grant for the selected ad account. The server verifies that grant on every worker report.
- The integration uses only `ads_read` and Graph API GET endpoints.
- Clicking **Disconnect** removes Agent HQ's local encrypted token and stored
  account metadata. To separately revoke Meta's authorization, do so in your
  own Meta account's app settings.
- Current reporting periods: yesterday, last 7 days, last 30 days. The
  Insights API can use the ad-account timezone.
- Meta's standard API restrictions, rate limits, app review, and token expiry
  continue to apply.

## Planned future phase (not active)

The next phase can add separately consented, narrowly scoped
`ads_management` authorization, an audited action executor for approved
ad changes, and user-confirmed budget changes only after the provider
integration and rollback checks have been tested. **Do not treat an
approved proposal as an executed Meta action.**
