# Agent HQ — Private Gmail Email Assistant

Agent HQ's **Email Center** gives the user's personal Gmail inbox a review queue.
Alex coordinates the priority review; Taylor prepares response drafts using the
AI provider already configured in Agent HQ **only after the owner explicitly
enables AI drafting**.

No email is sent without the owner opening a specific message, reviewing or
editing its reply, saving the exact text, and confirming **Send approved reply**.

## 1. Create a personal-use Google OAuth app

1. Open https://console.cloud.google.com/ under your own Google account.
2. Create or select your own Google Cloud project.
3. Enable the **Gmail API** for that project.
4. Under **Google Auth Platform**, configure its **Branding**, **Audience**
   and **Data Access** settings.
5. For personal testing, add your own Google email address as a **test user**
   when using the External / Testing consent-screen mode.
6. Declare exactly the following permissions:
   - `https://www.googleapis.com/auth/gmail.readonly` — reading and
     classifying mail. Google marks this as a **restricted** scope.
   - `https://www.googleapis.com/auth/gmail.send` — sending only a reply
     you've explicitly reviewed and confirmed. Google marks this as a
     **sensitive** scope.
7. Create an OAuth client of type **Web application** and set the exact
   authorized redirect URI:

```text
https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-gmail?op=callback
```

8. Copy the OAuth Client ID and OAuth Client Secret to your own
   password manager for the next step.

Google's app verification requirements still apply to API scopes even for a
personal-use tool. A Google test app is not the same as a fully verified
public application. Testing-mode access may expire and require reconnection;
Google can require additional verification and a security assessment for
broadly deployed use of restricted Gmail data.

Official docs:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/web-server

## 2. Add secrets in the **Agent-HQ** Supabase project

Open:
https://supabase.com/dashboard/project/slekcezduwnygywiiitp

Navigate to **Edge Functions → Secrets**. Set these exact secret names:

| Secret | Secret value |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID from Google Cloud |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret from Google Cloud |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Your own random 32-byte encryption key, base64 encoded |

Generate the random encryption key locally on your own Mac:

```sh
openssl rand -base64 32
```

Copy the output **directly** into Supabase Edge Function Secrets.
Don't paste API credentials, Gmail refresh tokens, verification codes or
this secret value into Agent HQ Messages, your public GitHub repo, or ChatGPT.

The configured Agent HQ `GROQ_API_KEY` (or `OPENROUTER_API_KEY`)
is also used for suggested replies when you explicitly enable AI drafting.
There is no need to submit an extra AI secret if the same project already
has a working one.

## 3. Connect your own Gmail inbox

1. Open https://hostkris.github.io/AgentHQ/ and sign in under **Settings**.
2. Tap **Email Center** on the home screen.
3. Tap **Check setup** after the secrets are saved.
4. Tap **Connect my Gmail** and review Google's official consent screen.
5. Google returns you to Email Center without exposing access tokens in
   the browser URL.
6. Choose **Enable AI drafts** to consent to sending relevant email text
   to your configured Groq/OpenRouter model. Without this permission, Agent
   HQ can still assign priorities and you may draft messages yourself.
7. Tap **Check Inbox Now**.

Only the newest **12 Gmail inbox messages from the last 30 days** are checked
per click. Spam and Trash are excluded by the Gmail Inbox query. Low-priority
bulk mail is generally not drafted automatically.

Priority levels:

| Label | Examples | Automatic draft when AI enabled |
| --- | --- | --- |
| Urgent | Time-sensitive, overdue, due today | Only when a legitimate reply appears appropriate |
| High | Important or explicit response request | Yes, when a reply is needed |
| Medium | Personal question, meeting or appointment | Yes, when a reply is needed |
| Low | Unrequested update, newsletter, routine message | Usually no |

Priority is an **initial heuristic**, not a guarantee of importance. You can
change an email's priority manually at any time. Security notifications and
verification-code messages are flagged for caution, **never answered
automatically**. Never rely solely on an AI-drafted response to judge whether
an email, payment request or sender is legitimate.

## 4. Review and send one reply

1. Choose a priority category or **Needs attention**.
2. Open an email and tap **Read message** to see its original plain-text
   content. Agent HQ does not open email attachments.
3. Read the suggested response. You can edit it freely.
4. Tap **Save draft** after editing, or keep the generated saved draft.
5. Tap **Send approved reply**.
6. Agent HQ displays the recipient, subject and exact reply text for
   final confirmation. Confirm explicitly to send using the account you
   connected with Google.

No worker can send mail by text chat alone. AI classification or draft
generation **never** calls Gmail's sending endpoint. A separate authenticated
send request verifies the owner, stored draft, recipient, connected
account, and the final reviewed text. A one-at-a-time claim prevents
duplicate requests. Uncertain sending outcomes block retries until you
check **Gmail → Sent**.

Google reply threads use Gmail's original `threadId`, subject and valid
`In-Reply-To` / `References` headers. Sending only addresses the email's
`Reply-To` (if valid) or original `From`; never an AI-chosen destination.

## 5. Security / private use

- All Gmail tokens are encrypted server-side with AES-256-GCM and inaccessible
  from the public GitHub Pages site or from database browser roles.
- Gmail OAuth uses a cryptographically random, single-use 10-minute state.
- Gmail account and recipient are never set by an AI model.
- Gmail stores the original mail. Agent HQ caches only sender information,
  subject, snippet, priority explanation and a drafted reply (not full
  attachments or original full body).
- Data is owner-scoped in Supabase with Row Level Security.
- Suggested replies may be processed by Groq/OpenRouter when you enable it;
  review the provider's privacy policy before enabling AI drafts.
- Gmail authorization is not the same as authorization to send. Clicking
  **Send approved reply** and confirming the specific message is necessary.
- Disconnect removes the saved OAuth tokens, cached priority list and drafts
  from Agent HQ; it does not delete Gmail messages. To separately revoke
  Google OAuth authorization, remove Agent HQ's permission in your Google
  Account settings.
- Background hourly monitoring is **not yet running**. Checks currently
  happen only when you tap **Check Inbox Now**. Future scheduled checking
  will require a private scheduler and consent to its cadence.

## Existing team roles

- **Executive Assistant / Alex:** inbox organization, triage, follow-ups,
  deadlines and urgent notifications
- **Communications / Taylor:** clear, editable reply drafts
- **You:** final review, correction, explicit sending approval

Neither a reply draft nor an approved permission record grants unattended
sending, forwarding, deletion, unsubscribing or attachment access.
