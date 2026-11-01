# ClipFactory

Automated video processing and content growth SaaS starter.

## Stack
- Cloudflare Pages: static frontend
- Cloudflare Workers: API
- Cloudflare D1: users, projects, points ledger and top-ups
- Cloudflare R2: media storage (binding prepared)
- Cloudflare Queues: asynchronous processing (binding prepared)

## Deploy
1. Import this repository into Cloudflare Pages. Build command: leave empty. Build output directory: `/`.
2. Deploy `worker/` as a Cloudflare Worker using `worker/wrangler.toml`.
3. Create a D1 database and run `worker/schema.sql`.
4. Configure Worker variables: `ADMIN_EMAIL` (the first admin account email) and `ALLOWED_ORIGIN` (your exact Pages origin).
5. Bind D1 as `DB`; optionally bind R2 as `MEDIA` and Queue as `VIDEO_QUEUE`.
6. Set the frontend API URL in `app.js` (or leave same-origin if you proxy `/api/*` to the Worker).

## Important launch notes
- Video processing is currently a job-queue integration scaffold, not a deployed FFmpeg rendering service. Do not promise completed renders until a processor consumes the queue and writes outputs to R2.
- Top-ups are created as pending payment requests. Points are credited only after an authenticated admin approval. Connect a payment provider and verify signed webhooks before enabling automatic fulfillment.
- Configure the first admin account by setting `ADMIN_EMAIL` to the email used at registration. The API promotes that account to admin on login/register.
- Add production email verification, password reset, rate limiting, abuse controls, and privacy/terms pages before public launch.

## Features in this starter
- Responsive dark SaaS dashboard
- Account registration and login
- Points wallet, package catalog, top-up requests and ledger
- Projects dashboard and processing queue UI
- Bulk upload interface (upload UI scaffold)
- Viral template library
- Growth tools for hooks, captions and hashtags
- Worker API and D1 schema

No payment provider credentials or storage credentials are included in this repository.
