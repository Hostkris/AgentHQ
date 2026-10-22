# Agent HQ

Premium iPhone-inspired virtual company assistant — **early frontend prototype**.

## Current status
This initial static prototype includes a virtual phone home screen, ten employee contacts, an internal Company Headquarters thread, browser-session draft messages, refresh icon, and experimental dictation with fallback guidance. **It does not yet contain real AI workers, persistence, authentication, cloud tasks, or account integrations.** Do not enter private information.

## Deployment
In repository Settings → Pages, choose Deploy from a branch, `main`, `/ (root)`, then save. Once GitHub Pages deploys, visit the URL GitHub displays. iPhone Home Screen installation can be tried through Safari Share → Add to Home Screen.

## Security
Do not commit API secrets. Never expose Supabase service-role keys in frontend code. Authentication and owner-only data rules must be implemented before using real business data.

## Next steps
Add secure Supabase backend, real conversations and task router, server-side approval gates, and validated iPhone PWA support. Office HQ is untouched.
