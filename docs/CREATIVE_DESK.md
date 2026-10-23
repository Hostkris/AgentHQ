# Agent HQ Creative Desk — owner approval workflow

Creative Desk is an **owner-controlled interface for TEXT deliverables**, implemented on top of the app's existing Supabase assignments, Alex planning, and worker drafts. It does not create new privileged database operations or bypass the existing specialist restrictions.

## In the app

1. Open **Creative Desk**, fill out the business, destination, content type, responsible creative specialist and brief, and save. This creates an ordinary owner-scoped Agent HQ team assignment; it does not consume AI generation usage.
2. Tap **Ask Alex to plan**. Alex builds a short specialist routing plan. Review the specialists and tap **Approve specialist plan**. This is approval to create internal text only.
3. Tap **Draft next specialist steps** to trigger the existing configured worker model (currently Groq/OpenRouter). Drafts appear in the Creative Desk and the existing team/message thread. The plan and worker steps use the preexisting rate limits and server-side owner checks.
4. When all specialist steps are complete, review each actual draft. Choose **Approve text content** or type a revision note and create a **revision assignment**.
5. **Copy draft** lets the owner manually use the approved text. A separate authenticated social-platform integration and separate explicit publishing authorization must be built before an agent can publish.

Approval records are saved as owner-authored team notes using a version fingerprint. Only the exact completed draft version can be approved in the UI. An approval never executes a post, sends an email, connects a third-party account or grants account access.

## ChatGPT subscription connection — not yet enabled

The hosted Agent HQ GitHub Pages application currently uses Supabase Auth and an existing configured AI worker provider. **It is not connected to a ChatGPT plan.** Do not mistake an OpenAI-branded model running on Groq with a ChatGPT subscription connection.

OpenAI's current open-source *Sign in with ChatGPT* token-sharing flow requires a user-controlled local runtime, HTTP loopback callback on 127.0.0.1, PKCE, validated ID token and on-device token storage. The Agent HQ browser-only GitHub Pages PWA cannot safely pretend that loopback callback or persist a user plan token in Supabase. Do not collect passwords, session cookies, refresh tokens, or bearer credentials through Messages or host them on the managed Supabase backend.

Use a separate, verified OpenAI-approved hosted web integration when available, or a user-controlled local companion client following the official guide. Do not enable an in-app "Connect ChatGPT" button without a working supported authorization and verified user-owned token storage.

Sources: https://developers.openai.com/siwc/token-sharing-open-source and https://developers.openai.com/siwc/token-sharing-open-source/sign-in and https://openai.com/policies/sign-in-with-chatgpt-terms/

## Security and practical limits

- All creative requests are ordinary owner-scoped team assignments protected by existing RLS and authenticated RPCs.
- Alex plans only; specialists draft text only. The browser cannot impersonate worker output or call third-party publishers.
- Approval of Alex's plan, generation, approval of final content and publishing are distinct actions.
- Deliverables are **text**, not AI-generated image attachments or video files.
- No new paid services are activated. Worker draft usage depends on existing Groq/OpenRouter setup and provider limits.
- The app has no connected automatic publishing engine for Creative Desk.
- GitHub changes update only the front end. Existing Supabase Edge Functions and database migrations must already be deployed for backend generation. 
