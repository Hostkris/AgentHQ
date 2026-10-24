# Stage 1 — OpenAI for Agent HQ

## What works right now (no additional paid API required)

Agent HQ **Creative Desk** offers a safe owner-mediated ChatGPT workflow:

1. Sign in to **Agent HQ** and create a Creative Desk text assignment.
2. Open the saved assignment. Tap **Copy request for ChatGPT**.
3. Tap **Open ChatGPT**. Sign in directly at **https://chatgpt.com** if needed, and paste the copied request.
4. Create or revise the requested text using your own ChatGPT subscription. You can close or switch back to the Agent HQ browser tab.
5. Paste the resulting **text** under **Save text to this assignment**. It will be saved to the signed-in owner's existing Supabase team discussion.
6. Review it in Creative Desk, choose **Approve text content** or create a revision assignment.
7. No content is posted, emailed, or uploaded from this workflow. Final editorial approval does not authorize publication.

**This is an owner-mediated handoff, not OAuth, an automatic agent-to-ChatGPT connection, or a verified ChatGPT response.** Agent HQ labels owner-imported text accordingly and cannot prove whether you generated it in ChatGPT or wrote it elsewhere. It never requests the ChatGPT password, session cookie or token. Only plain text is imported; images/video attachments are not supported by this particular handoff.

Alex can still plan and route specialist drafting through the existing separately configured Agent HQ AI provider. The handoff does not change Alex's permission rules or consume additional OpenAI API credits.

## What must happen before agents can automatically call the user's ChatGPT subscription

Agent HQ currently runs as a remotely hosted **GitHub Pages Safari PWA** with a **managed Supabase backend**.

OpenAI has two distinct Sign in with ChatGPT (SIWC) paths:

1. **Hosted website/partner integration.** Requires OpenAI approval, a registered client ID, registered redirect URI, and a compliant implementation of the supported OpenID Connect / OAuth PKCE flow. SIWC and ChatGPT plan-usage eligibility are distinct permissions. OpenAI's hosted-website program is a limited trial.
2. **Open-source local client.** Allows eligible ChatGPT plan usage with dynamic client registration, but requests must originate from the user's own local or user-controlled remote runtime. The OpenAI OSS authorization flow requires a loopback server at \`127.0.0.1\`, PKCE, ID token validation, and locally controlled token storage. Do not redirect or mirror this to GitHub Pages or store tokens in a managed Supabase service.

**Next blocker:** obtain supported hosted-app approval/client registration, or create a truly user-controlled local companion runtime in a separate explicitly approved design. OpenAI access cannot be activated by adding a fake login field, browser cookies, API token sharing, or a pay-per-use API key disguised as ChatGPT plan access.

### Official registration

- Partner sign-in requirements: https://developers.openai.com/siwc/website
- Request OAuth client ID: https://developers.openai.com/siwc/request-client-id
- Application interest form: https://openai.com/form/sign-in-with-chatgpt-interest/
- Subscription usage terms: https://openai.com/policies/sign-in-with-chatgpt-terms/
- Local OSS alternative: https://developers.openai.com/siwc/token-sharing-open-source

Suggested description for the owner's official application:

> Agent HQ is a user-operated personal business assistant, delivered as an iPhone/iPad Safari PWA with a GitHub Pages frontend and an authenticated Supabase backend. It has specialist drafting agents coordinated by a manager and always requires explicit owner approval before posting, emailing, or changing external accounts. We request Sign in with ChatGPT and eligible plan usage for owner-authorized content drafting, with clear per-task limits and no access to ChatGPT conversations. We want to integrate through an officially supported hosted application flow without collecting ChatGPT passwords or session cookies. Site: https://hostkris.github.io/AgentHQ/. Source: https://github.com/Hostkris/AgentHQ.

Do not claim this description is submitted; only the owner can finish the external application and permissions process. **No OpenAI client ID has yet been issued or configured.**

## What we are NOT doing in Stage 1

- No separately billed OpenAI API secret has been installed or used.
- No ChatGPT session cookies or user credentials are read or saved.
- No false "ChatGPT connected" status is displayed.
- No automated account access, background browser activity, or social publishing.
- **Stage 2** (Instagram, Facebook, TikTok, YouTube, iCloud, Shopify and other connections) remains intentionally untouched until Stage 1's direct integration method is authorized, implemented and verified.
