# Agent HQ — Messages-first creative work and connection approvals

## Single place to ask and approve

**Messages is the control center.** Open a conversation with Alex (the manager) or the appropriate specialist (for example, Casey or Maya for marketing, Jordan for scripts) and type what to create in ordinary language. The conversation asks one detail at a time when needed.

Alex routes work to specialists and writes a plan inside Messages. Reply **green light** or **approved** to approve an *internal drafting plan only*. The app never interprets this as permission to publish, send an email or access a private account.

Once the work is complete, the same Messages thread displays draft text. Reply **approve draft** for the single identifiable completed draft to record final editorial approval; or text a revision request. Approving text never posts it.

**Creative Desk** is now a read-only history/library of creative assignments and finished drafts. The previous "New Content Request" form, approval buttons and ChatGPT import form have been removed. To resume any assignment, open the worker's Messages conversation.

## In-conversation connections

When the recent conversation requires access to a supported service, Agent HQ presents an **incoming message bubble** with a provider-specific hyperlink:

- **Gmail**: an official Google OAuth flow is connected to the existing Agent HQ Gmail service. If Google OAuth setup is not configured, the link goes to Gmail setup instead. After successful connection, the owner separately grants a worker short-lived, limited read access.
- **Meta Ads**: official Meta OAuth for *read-only advertising reporting*, when configured. Worker read permission is separate; this is **not** Facebook/Instagram publishing authorization.
- **ChatGPT**: clearly displays **"Awaiting OpenAI authorization (not connected)"**, with an official OpenAI partner interest-form hyperlink and an optional manual ChatGPT website link. Submitting the form does not automatically connect the app.
- **Facebook, Instagram, TikTok, YouTube, Shopify, Pinterest**: direct publishing connections do not exist yet. A Messages hyperlink opens Settings → Accounts & Sign-Ins to see the actual status. A normal provider website login is not an integration.
- **iCloud**: official guidance only, not a one-tap Agent HQ connection.

No password fields or session cookies are collected. The app does not ask a user to paste tokens into Messages. Approvals remain scoped to the actual connected provider and operation.

## ChatGPT usage boundary

Agent HQ is a GitHub Pages PWA with managed Supabase. Direct, automated use of a ChatGPT subscription requires an officially supported hosted client registration/authorization; it is **not yet authorized**. The user must choose whether to apply through https://openai.com/form/sign-in-with-chatgpt-interest/ and OpenAI must approve a relevant integration. In the meantime, Agent HQ's worker writing models use the **existing separate provider**, not a ChatGPT subscription. The owner can use https://chatgpt.com directly, but that website session is not an Agent HQ token.

The previous Creative Desk copy/paste workflow has been removed from its UI at the owner's request. This update does not activate OpenAI API billing or enable Stage 2 provider publishers.

## Security invariant

Internal team-plan approval, internal content approval, per-worker scope approval and actual external publishing approval are **distinct**. No outside posting is implemented. The Social Publishing preference alone cannot grant platform access.

Sources:
- https://developers.openai.com/siwc/website
- https://openai.com/form/sign-in-with-chatgpt-interest/
