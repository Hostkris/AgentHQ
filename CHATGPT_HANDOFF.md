# Agent HQ ↔ ChatGPT project handoff

This connector lets an owner start creative work in ChatGPT using an explicitly handed-over Agent HQ project. It does not invoke a paid image API, use a ChatGPT password, or start ChatGPT in the background. ChatGPT account permissions, tools and limits still apply. Account authorization and the first real ChatGPT file return must be verified separately from the server tests.

## Connect once

1. Open Agent HQ → Projects → a project → **Connection setup**. The same setup is available in Settings → Accounts & Sign-Ins → ChatGPT → Handoff setup.
2. Copy the server address: `https://slekcezduwnygywiiitp.supabase.co/functions/v1/agent-chatgpt-bridge/mcp`.
3. On ChatGPT's web Plugins page, choose **Add custom MCP server**, name it **Agent HQ**, paste the address, and select **OAuth**. Availability depends on the account and workspace. If asked for client registration, use the advertised automatic CIMD or DCR registration; there is no manually entered client secret.
4. Sign in to Agent HQ on the authorization page and explicitly allow project handoffs. Only projects you release, their relevant approved handbooks and references, and file returns for review are in scope.
5. Select the Agent HQ connector in a ChatGPT conversation. The connection screen changes from authorized to verified only after a real authenticated tool call succeeds. A successful file return is tracked separately.

## Use a project

- Add the project brief and reference photos in Projects, including what colors, packaging, typography or layout to follow.
- Choose **Prepare ChatGPT handoff** and describe the requested real output files. This creates a new revision, preserves previous files and holds internal workers.
- Copy the handoff prompt, open ChatGPT, select the Agent HQ connector and send the prompt. ChatGPT retrieves the actual brief, approved handbook and worker outputs. The reference-photo tool supplies actual pixels.
- ChatGPT uses its available creation tools and forwards real files using `return_project_files`. The server checks ownership, revision, claim, bytes, file format and stored checksum before making those files visible.
- Refresh Projects or choose **Check for returned files**. Preview and download the files, then approve the exact current version or request changes. Changes to a returned ChatGPT deliverable create another ChatGPT handoff with the full owner feedback.
- Messages remains the progress conversation. Final approval grants no publishing, sending, spending or account-editing permission.
- If ChatGPT lacks image creation or file forwarding, it reports that specific blocker in Projects. A written image description is not accepted as an image file.

## Limits and recovery

Return one to four files, each at most 5 MB: PNG, JPEG, WebP, PDF, plain text or Markdown. PDFs must parse and have one to 200 pages. Files are fetched only from supported ChatGPT file hosts; expired file links must be attached again. References remain distinct from deliverables.

The connector stores hashes of short-lived access/refresh tokens, binds codes to S256 PKCE, client, exact ChatGPT redirect and MCP resource, rotates refresh credentials and supports revocation. Owner sessions remain separate from connector tokens. A per-project return lease prevents concurrent saves; repeated successful returns reuse the saved result.

If requirements change after handing over, the old handoff cannot return files. Use **Update handoff** for current context. Cancel a pending handoff to restore the prior internal-work hold setting. Disconnect a connection in Connection setup to revoke future tool access. Existing ready files remain subject to normal project review.

The service uses stateless Streamable HTTP JSON responses. Protected-resource discovery is advertised by `WWW-Authenticate`. For a path-based issuer, the OIDC-shaped discovery fallback publishes the OAuth endpoints; there are no OpenID scopes, ID tokens or JWT signing keys. The official pinned MCP client exercises discovery, initialization and tools in CI. Anonymous OAuth endpoints have bounded bodies and minute-based request limits.

## Validation

Node tests cover scoped OAuth, explicit consent, source bytes, file-return verification, retries, failures and owner isolation. Transactional schema fixtures cover one-use codes, refresh rotation, project revision isolation, concurrent return leases, revocation, final review and ChatGPT change routing. WebKit tests cover iPhone and larger-screen handoff setup, preparation, cancellation and authorization UI using synthetic account data. Server tests do not prove the user's ChatGPT account has authorized the connector or that its image and file tools are available together.
