# Camera and Messages on iPhone and iPad

Camera opens a full-screen live viewfinder with reachable controls, safe-area spacing, front/back switching and an X. The shutter saves a photo to the owner's Agent HQ photo collection; it never picks a worker or sends a message. Captures are cached by account on this device and synced to the existing private Camera Roll. If sync fails, the interface identifies the local copy rather than claiming a cloud save. Safari's native capture input remains available if live camera access is denied or unsupported.

In any built-in worker, Company HQ or active custom-worker conversation, + opens Camera, Photo Library and Saved Photos. The conversation supplies the destination. Selected photos appear beside the typed message, can be removed, and leave the device for that worker only when the owner presses the regular send arrow. Native Photo Library allows up to four attachments. Per-contact drafts preserve their destination and typed text. Existing dictation, message selection, individual X controls and confirmed bulk deletion remain available.

Camera's saved-photo preview has Share, which uses the device's native file share sheet when supported (including the available Apple Photos / Messages destinations). A browser cannot silently write to Apple Photos or send iMessage/SMS; unsupported sharing falls back to a photo download. No native-only OS modes or permissions are simulated. This is an original iPhone-inspired web interface, not a replacement for iOS.

## Data and delivery

- Sent built-in photos keep using `agent_message_photos`; custom workers use the additive `agent_custom_message_photos` table with owner RLS and an active-worker check. Existing photo rows, storage rules and the private `agent_camera_photos` Camera Roll are preserved.
- Photos are decoded, oriented, resized to at most 1600 px, and re-encoded as JPEG up to 3 MB. SVG and arbitrary file uploads are rejected. No original EXIF/location metadata is copied.
- Storage is private. Signed URLs last ten minutes and refresh on focus and periodically. No public-image URL API or tracking service is added.
- Attachment IDs remain stable on an uncertain upload retry. Sending is serialized per conversation. The composer reports delivery without waiting for image analysis.
- The existing authenticated `agent-hq-image-review` function now supports custom workers. It checks owner, exact target, storage path, JPEG signature and one-use analysis status. It has no sending, publishing or browsing tools and no new provider or paid fallback.
- A service-only, invoker database function commits the worker reply and completion together; deletion or worker archival prevents a late reply. Client roles cannot write AI replies or call that completion function.
- Account changes clear draft object URLs, queued file-picker state, camera streams and photo views. Cancelled/late camera permission responses stop their tracks. Camera capture never invokes the AI provider.

Home retains the existing sliding pages and widgets. Dragging uses animation-frame transforms, stable layout slots, smooth drop animation, cross-page holding and reduced-motion support. Counter refreshes cannot replace the held icon. The Done control remains responsive immediately after a drop. Keyboard Alt+arrow movement is also available without adding visible movement arrows.

## Verification

`node --experimental-strip-types --test tests/*.test.mjs`: 103 passing checks at release. Existing source-extraction and research mocks were aligned with the repository's current selection and short-message / full-report behavior.

`node tests/camera-messages.browser.mjs`: 15 browser scenarios using synthetic pictures, native IndexedDB, real touch events and a mocked Supabase client. Playwright 1.62.1 was used with Chromium 153. Set `AGENTHQ_TEST_CHROME` for a locally installed Chromium; `AGENTHQ_BROWSER_TEST` optionally filters scenario names. No private photos, real messages or model usage are involved.

Scenarios cover phone/tablet/landscape layouts, capture, private saving, album reopening, all eleven built-in destinations, custom workers, caption preservation, draft removal, retries, nonblocking image review, photo selection/deletion, camera denial and late responses, pointer/touch cross-page dragging, swipe navigation, dictation layout, reduced motion and account isolation. Screenshot inspection is browser emulation; physical iPhone/iPad camera permissions and native sharing still depend on Safari and the device.

`tests/photo-messages-rollback.sql` verifies owner isolation, active-worker inserts, client denial for AI completions, correct reply destinations, replay rejection and deletion during analysis. All fixtures and changes are rolled back. No existing owner messages are deleted. Security advisors show no new findings.
