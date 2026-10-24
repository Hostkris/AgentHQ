# Live activity in Messages

Each built-in worker and custom Worker Studio conversation has a three-dot activity area immediately above its composer. Company HQ shows both current team work and direct worker requests. The area stays visible while reading older messages and updates without replacing the text field, moving its caret or discarding an unsent draft.

Activity comes from pending requests in this device and owner-scoped saved run metadata. Project stages name the actual worker: planning, a teammate’s answer, public research, drafting, peer review or corrections. Assigned teammates see the same actual speaker, rather than all appearing to generate at once. Between turns, the area names the next handoff. Paused projects, waiting questions or approvals, deferred free allowances, failures and finished reviews have static status text. Expired leases and lost connections stop the animation. Reduced Motion keeps the dots visible without animation.

`agent-activity-view.js` derives these states without a network dependency. `agent-activity-cloud.js` reads only run identifiers, worker identifiers, assignment labels and timestamps. RLS and explicit owner filters scope these reads; activity caches reset on account changes. Message content, credentials and model reasoning are not queried by the activity module.

The project coordinator now refreshes saved sessions and team messages throughout an in-flight request. A single early refresh could miss a slow server claim; repeated metadata reads catch it without starting another model call. Same-owner authentication token refreshes preserve the in-flight lock. Published project/research changes also refresh activity through the existing Realtime listener. Other activity uses foreground polling and reconnects when the app becomes visible. Polling adds no paid service or model requests. iOS can suspend Agent HQ in the background; these indicators describe observed activity while the app is open.

Validation:

```sh
node --test tests/*.test.mjs
AGENTHQ_TEST_CHROME=/path/to/chromium node tests/live-activity.browser.mjs
AGENTHQ_TEST_CHROME=/path/to/chromium node tests/company-hq.browser.mjs
AGENTHQ_TEST_CHROME=/path/to/chromium node tests/camera-messages.browser.mjs
```

Browser scenarios use held synthetic requests with the production frontend modules, including a server claim delayed beyond 700 ms. They cover all ten workers and HQ, custom workers, direct replies, failures, handoffs, research, owner changes, token refresh, reconnects, drafts, caret and scroll preservation, iPhone/iPad/landscape layouts, light/dark appearance and Reduced Motion. They do not simulate private account access or claim a physical-device test.
