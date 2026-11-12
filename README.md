# ClipFactory

ClipFactory is a creator workspace for uploading, organizing, processing, and exporting short-form video.

## Production architecture

- **Cloudflare Pages:** `https://clipfactory-aer.pages.dev` (static frontend; no build command, output directory `.`).
- **API Worker:** `clipfactory-api` (authentication, projects, points, media upload, video library, admin APIs).
- **Transcription Worker:** `clipfactory-transcribe` (authenticated Whisper transcription using Workers AI).
- **D1:** `clipfactory-db` (users, sessions, projects, points, media metadata, finished video library, activity and admin logs).
- **Primary R2:** `clipfactory-media`.
- **Backup R2:** `clipfactory-backup`, accessed through the separate `clipfactory-storage-backup` Worker in the secondary Cloudflare account.

## Video processing model

Most video processing currently runs **in the user's browser** with FFmpeg WASM. The tab must remain open while a render or upload is running. Completed exports are uploaded to R2 and registered in the permanent video library as each export finishes.

The Processing Queue currently displays project status saved in D1. It is **not** a server-side background rendering queue. The Cloudflare Queues producer/consumer integration is not enabled.

Supported workflows in the current UI:
- Resize for social formats (9:16, 1:1, 16:9).
- Compress video.
- Split a source into clips of the selected duration.
- Generate editable AI subtitles, preview and style them, download VTT/SRT, and burn captions into an MP4.

The 9:16 resize workflow uses a blurred, cropped background with the full source frame fitted in front. Subtitle transcription extracts 45-second mono 16 kHz WAV chunks locally, then sends those audio chunks to the authenticated transcription Worker. The source video itself is not sent to the transcription endpoint.

## Storage and upload

- Multipart uploads use 16 MB chunks.
- The API accepts individual video uploads up to 500 MB.
- Source uploads are charged at 10 points per 100 MB, rounded up; admin uploads are free.
- The API can route objects to the secondary R2 bucket when primary storage is near its configured threshold or when primary upload initialization fails.
- Backup fallback is implemented, but real upload/download/delete and failover tests must be completed before relying on it as a verified disaster-recovery path.

## Authentication and administration

- Email/password registration and login.
- 30-day sessions, hashed session tokens, password change, and admin password reset.
- Admin tools for member details, suspension, point adjustments, top-up review, media management, and audit/activity history.
- The configured first admin email is set through the API Worker variable `ADMIN_EMAIL`.

## Database setup

For a fresh D1 database, apply `worker/schema.sql`.

For an existing database, apply the relevant migrations in order when not already applied:
1. `worker/admin-migration.sql`
2. `worker/media-migration.sql`
3. `worker/finished-videos-migration.sql`

Do not blindly re-run migrations containing `ALTER TABLE`; check the current schema first. The production database already contains the finished video and media tables.

## Remaining production work

- Run real end-to-end tests for upload, each FFmpeg workflow, AI transcription, subtitle burn-in, MP4 audio/video sync, and saved video playback/download.
- Complete and verify cross-account backup transfer, retrieval, deletion, and automatic fallback.
- Implement a real server-side job processor if background rendering must continue after a tab closes.
- Add automated payment provider/webhook integration before enabling self-service paid top-ups. The current UI keeps purchases disabled; admin-reviewed top-up requests are not proof of payment.
- Add rate limiting and abuse controls, email verification/account recovery, and publish privacy/terms/support information before public launch.
- Keep deployment and storage health checks observable; a configured binding alone does not prove that an operation works end-to-end.

## Transcription service

Deploy `worker/transcribe/` as the `clipfactory-transcribe` Worker with:
- Workers AI binding named `AI`.
- D1 binding named `DB`, pointing to `clipfactory-db`.
- `ALLOWED_ORIGIN` set to the production Pages origin.

The endpoint requires a valid ClipFactory session token and enforces a daily transcription-segment limit.

## Notes

No payment-provider credentials or secret values belong in this repository. Store secrets as Cloudflare Worker secrets, not as committed source code.
