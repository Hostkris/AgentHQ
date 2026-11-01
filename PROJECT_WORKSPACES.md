# Projects and worker handoffs

Company HQ supports personal, household, creative, educational and business projects. Business information is optional. Alex plans the work; two to nine relevant specialists complete their own steps, and a specialist lead combines the result. All ten built-in workers can participate when the project needs them.

## Start and update work

Open **Projects** on the Home Screen and choose **New project**, use Company HQ, or assign the work in Alex's conversation. Save the goal, requirements, desired file format and optional **Finished means** criteria. Each project keeps its own references, decisions, research, worker outputs and revisions.

## Visual review in Projects

Projects is the visual workspace for saved worker work. Filter ready, ongoing and approved projects; open the current final deliverable or earlier versions; view actual PNG/JPEG/WebP files at full size; read every PDF page with page controls and zoom; and download original files. PDFs render with the pinned PDF.js 6.4.299 browser library. A native full-PDF link and download remain available as alternatives. Text and HTML files are shown as text rather than executed.

Approve the exact final version or enter revision feedback directly in Projects. A reference photo, a worker handoff or an earlier revision cannot be approved as the current final deliverable. Feedback resumes the same project. **View progress in Messages** opens that project's Company HQ conversation. Thread progress and existing sensitive-action approvals continue to work.

Add reference photos with the photo picker on iPhone/iPad or drag and drop on a computer. Add a note about the palette, typography, layout or branding to follow. Up to four photos can be added in one batch, with twelve per project. The existing photo preparation converts supported device formats to metadata-free JPEGs up to 1600 pixels and 3 MB. Uploads are private, checksum-verified, scoped to the owned project and idempotent. Adding a photo revises the project context while retaining older outputs.

Reference images remain separate from finished assets. The background runner uses the existing Groq vision connection to save factual observations, which all assigned workers receive in their shared context. Each photo review uses one existing worker turn and respects owner pauses and the shared usage allowance. Reference analysis does not generate new artwork; producing new image assets still requires an image creator.

Handbooks can be downloaded as PDF or original Markdown. Finished project text can also be exported as a PDF without changing the saved review version.

Use **Add reference** for TXT, Markdown, CSV and JSON sources up to 512 KB. Large sources and handoffs are shown as labelled excerpts in model context and the details view; divide large material into focused sources for the work. PDF and office-file extraction are not installed. Existing photo-message controls remain separate.

Use **Update project** to add requirements, change the output format, link an approved business handbook or restart from an affected worker. Earlier completed steps are preserved when a later affected worker is selected; previous outputs are archived. Choose **Replan the team** when the responsibilities change.

In a selected project conversation, send `Add this information: ...`, or name the affected worker: `Add this information for Jordan: Use this revised outline.` Without a uniquely identified project, the app asks you to select one. Approval, pause and resume messages retain their existing scope. A pending sensitive authorization must be resolved before changing that project's scope.

## Handbooks

**Handbooks** opens versioned, private reference records. Approved general handbooks are shared across the owner's projects. An approved business handbook applies only to a linked project; naming one uniquely matching business handbook in a new brief also links it. Existing owners receive shared working agreements, and new owners receive them with their first project.

A business handbook template covers identity, products, approved claims, verified prices and effective dates, customers, business voice, policies and unknowns. The app does not invent business facts. Editing an approved handbook refreshes affected active projects. A stale editor cannot overwrite a newer version. Handbooks grant no new account access or action authority.

## What workers can execute

| Capability | Behavior |
| --- | --- |
| Public research | Existing role-scoped Groq public search, with saved source evidence and provider limits |
| Calculations | Trusted arithmetic parser; workers can request labelled calculations and use their results |
| Files | Real Markdown, TXT, PDF, CSV, JSON, safe HTML and ICS calendar import files |
| Calendar account writes | Require an authorized calendar connection and a supported provider adapter; ICS creation does not book events |
| Email | Existing Email Center and exact-message approval; project workers receive no automatic send grant |
| Publishing and store changes | Require supported adapters, worker grants and the specific action's authorization |

CSV output is checked for row consistency and escaped against spreadsheet formula injection. JSON is parsed. HTML output is script-free. ICS requires explicit time zones. PDFs are paginated and include a companion Markdown original; the download notes identify unsupported font characters if any.

## Completion, recovery and privacy

The server saves each step's actual work before moving to the next worker. Completed dependencies must belong to the current project revision. The specialist lead drafts, peers review, and the lead applies corrections before final review.

Output objects are private, read back and checksum-verified. Completion publishes file metadata only when the leased worker turn commits successfully. Repeated identical staging reuses the file; different content, missing objects and corrupt bytes are rejected. Downloads use short-lived owner-authorized links. A final editorial approval does not authorize publishing, sending, spending or account changes.

The existing ten-worker-turns-per-hour allowance is retained. Long projects wait for the allowance to reset and continue from saved state. Existing server leases, scheduled runner, diagnosis and recovery handle interruptions. Owner pauses remain in force after updates; stale or superseded turns cannot replace current work.

The workspace endpoint validates the signed-in allowed owner. New database tables use forced owner-scoped row-level security, client access is read-only, mutation RPCs are service-only, and the storage bucket is private.

## Validation

Run `node --test tests/*.test.mjs` on Node 24 with `pdf-lib@1.17.1` installed. The PDF test creates and reopens actual paginated PDF bytes. Server tests verify checksum failures, idempotency, owner isolation, scoped approvals and structured calculation outputs.

`tests/project-workspace-rollback.sql` runs inside a transaction on the migrated schema, followed by `ROLLBACK`. It exercises Alex plus all nine specialists, usage-limit pauses, real handoff state, file-gated completion, selective revisions, stale leases, handbook versioning and owner isolation using synthetic fixtures. Its artifact rows are synthetic metadata; separate file-writer tests verify actual bytes.

`tests/project-workspace.browser.mjs` uses synthetic data with the actual UI to check project creation, visible work products, selective updates, handbooks and iPhone layout. The Safari CI job runs it alongside the existing collaboration and activity browser tests. No test sends email, publishes content, modifies a store or books a calendar event.
