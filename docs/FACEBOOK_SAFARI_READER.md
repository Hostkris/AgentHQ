# Facebook sign-in and approved Safari reading

My Accounts → a saved Facebook profile has **Sign in to Facebook**, a copy-link fallback, a specific page URL and task form, and setup instructions for the free Userscripts Safari extension. Facebook owns its Safari cookies. Agent HQ never receives a Facebook password, cookie, browser session or OAuth token and cannot guarantee that Facebook keeps a session signed in. iOS can route links to an app or the default browser; copying the link into Safari is the fallback.

Riley handles these requests. A request can start in My Accounts or from Riley's chat with wording such as "Review my Facebook profile and suggest engagement improvements." If more than one profile matches, or a conversation URL is missing, the thread presents a profile/page/task form. No saved profile is silently selected when ambiguous. An exact content URL and task are required before an approval is created.

The request and Approve/Deny card are saved under the owner's Agent HQ sign-in. A pending request expires after 24 hours; approval permits one analysis for 15 minutes. The server requires the current owner's approved, unexpired request, the exact normalized URL and a capture made after approval. It claims the request atomically before calling Groq. Repeated claims, denial, revocation, wrong pages and expired grants are rejected. Riley cannot send replies or publish content through this feature. Alex's operating instructions and execution guards are unchanged.

## iPhone and iPad flow

1. Sign into Facebook in Safari using the My Accounts link. If iOS opens the Facebook app, copy the link and paste it into Safari.
2. Install Userscripts: https://apps.apple.com/us/app/userscripts/id1463298887 . Open it once, enable its Safari extension and allow only the Facebook/Messenger sites needed.
3. Open `https://hostkris.github.io/AgentHQ/safari/agent-hq-reader.user.js` in Safari, then use the Userscripts extension menu to install it.
4. Request a review from My Accounts or Riley's conversation. Confirm the exact page URL and task. Tap Approve reading in Riley's thread.
5. Open that exact page in Safari, load the relevant content, and tap Read for Agent HQ. Review/edit the visible text, then tap Copy capture.
6. Return to the approved card in Riley's thread. Paste the full capture and tap Share approved text & analyze. The report is stored in the private thread. Copy suggested text and post/send it yourself in Facebook.

The script reads only on a tap. It previews up to 24,000 characters of rendered text and strips tracking/credential parameters from the URL. It does not inspect cookies, storage, input values or hidden messages; it refuses visible password fields and sign-in/settings routes. It has no network permission, uploads, posting or Facebook-click actions. Reading text in this script is a user action; AI access occurs only after owner approval and manual submission to Agent HQ. A capture is user-supplied evidence, not independently verified Facebook data.

Facebook/Messenger may restrict what mobile Safari renders. This does not guarantee personal Messenger access, all comments, live insights, Page status or background monitoring. Approval does not open a browser or bypass a login wall. Use the exact page URL; Facebook redirects to a different profile/post/conversation require a new approval for that URL.

## Storage, provider and limits

`agent_social_read_requests` has owner-only SELECT RLS and no direct client writes. The service-only `agent_social_read_transition` RPC binds owner, saved profile, Riley conversation, page and task. Request/status messages and reports are saved; raw captures are passed to Groq for the approved analysis and are not retained in a capture table or logged by the function. The paste draft is held in page memory and cleared on sign-out. Review/delete unwanted text before sharing.

`agent-social-read` verifies `getUser()` and the existing owner allowlist; JWT verification remains enabled. It accepts no Facebook write operation and no external URL-fetching tool. It uses the existing Groq connection with no paid provider fallback or automatic retry, at most four analysis starts and eight requests per owner per hour. Existing provider billing is not independently verified by this feature. This adds no browser-hosting subscription; the reader works on the foreground Safari page.

## Verification

Run `node --experimental-strip-types --test tests/social-read.test.mjs` and the rollback-only SQL script in `tests/social-read-rollback.sql`. Also verify the mobile extension on the owner's signed-in iPhone/iPad; desktop DOM tests and public checks cannot establish a working personal Facebook session. No live private Facebook content was used in development tests.
