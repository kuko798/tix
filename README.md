# GameSwap

GameSwap is a sports-only ticket marketplace for direct sales, ticket swaps, multi-game exchanges, and ticket-plus-cash offers. It uses cautious trust language: uploaded ownership evidence is not issuer verification, official issuer tools perform ticket transfers, and Stripe Connect provides protected payments rather than regulated escrow.

## Architecture

- Next.js 16 App Router and React 19
- Better Auth with Prisma-backed sessions, password reset, rate limiting, and server-side route authorization
- In-house email verification with random links, hashed database tokens, one-hour expiry, atomic single-use confirmation, and resend limits
- Signed-in phone verification through Twilio Verify, with normalized private numbers, destination/user rate limits, and audit events
- PostgreSQL through Prisma, with one production foundation migration
- Stripe Connect Express, manual-capture PaymentIntents, separate transfers, deposit returns, signed webhooks, and idempotency
- Private S3-compatible storage with signed uploads, MIME/size validation, SHA-256 recording, and server-side encryption
- Transactional email through self-managed SMTP by default, with optional Resend delivery
- Ticketmaster Discovery API event import, or a manually maintained event catalog
- Database-backed SSE messaging, unread/read state, blocking, reporting, and spam limits
- Structured JSON logs and the Next.js server error instrumentation hook

Public production pages read only persistent records. Prototype catalog data is disabled unless `NEXT_PUBLIC_ENABLE_DEMO_CATALOG=true` in a non-production environment.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and replace every required placeholder.
3. Choose a database:
   - For full production parity, start PostgreSQL, keep the `postgresql://` URL, and run `npm run db:migrate:deploy`.
   - For local interface work without PostgreSQL, set `DATABASE_URL="file:./dev.db"`. `npm run dev` creates an unseeded, ignored SQLite database automatically. SQLite is rejected when `NODE_ENV=production`.
4. Run `npm run dev` and open `http://localhost:3000`.

The local SQLite path is intentionally empty and is not a production substitute. Concurrency-sensitive offer, payment, and transfer verification must run against PostgreSQL.

To import upcoming events, set `EVENT_SOURCE=ticketmaster` and `TICKETMASTER_API_KEY`, sign in as an admin, then call `POST /api/admin/events/sync`. The admin role is bootstrapped at sign-up from `ADMIN_EMAILS` and is also persisted in the database.

## Required environment

Always required:

- `DATABASE_URL`: PostgreSQL connection URL
- `BETTER_AUTH_SECRET`: high-entropy secret, at least 16 characters
- `BETTER_AUTH_URL`: canonical auth origin
- `NEXT_PUBLIC_APP_URL`: canonical public origin

Email verification and recovery:

- `EMAIL_DELIVERY_ENABLED=true`
- `EMAIL_PROVIDER=smtp` with the SMTP variables below (no email API key required)
- `EMAIL_FROM`
- `NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=true`

For self-managed SMTP, configure:

- `SMTP_HOST`
- `SMTP_PORT=465` with `SMTP_SECURE=true`, or `SMTP_PORT=587` with `SMTP_SECURE=false` for STARTTLS
- `SMTP_USER`
- `SMTP_PASSWORD`: credentials for your mail server (use an app password if using a hosted mailbox)

GameSwap generates its own 256-bit random verification tokens and stores only their SHA-256 hashes in the existing verification table. Resending replaces the prior token. A link opens a confirmation page; an explicit confirmation POST consumes the token and verifies the exact user/email pair in one database transaction. Email scanners opening links cannot consume them. Better Auth still manages sign-up, sign-in, and resend triggers, but its verification endpoint is disabled. After confirmation, users sign in normally.

SMTP transport is already implemented, but this repository does not provision a public mail server. Real delivery requires a reachable mail server and a sending domain configured for delivery. No external email API key is needed with SMTP. Optionally select `EMAIL_PROVIDER=resend` and provide `RESEND_API_KEY` if managed delivery is desired.

Vercel blocks outbound SMTP port 25. Verification and password-reset sends wait for the SMTP server before completing. SMTP avoids a transactional-email API, but it still depends on a mail provider or a mail server you operate; mailbox sending limits and anti-spam policies still apply.

Temporary Gmail SMTP example (do not use the normal Google Account password):

```env
EMAIL_DELIVERY_ENABLED="true"
EMAIL_PROVIDER="smtp"
EMAIL_FROM="GameSwap <your-address@gmail.com>"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="your-address@gmail.com"
SMTP_PASSWORD="your-16-character-app-password"
NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION="true"
```

Enable two-step verification on the Google Account, create a dedicated app password for GameSwap, and store it only as a secret environment variable. The authenticated mailbox and `EMAIL_FROM` address should match. This setup is intended for low-volume testing and an early private launch, not marketplace-scale transactional mail.

Phone verification:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Create a Twilio Verify Service and enable its SMS channel. GameSwap uses the Verify API rather than storing SMS codes locally. Users request and confirm codes from Account settings; the endpoint requires an active session and the number is never added to the public profile response.

Protected payments and seller payouts:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_CONNECT_COUNTRY`
- `STRIPE_CURRENCY`

Private evidence:

- `S3_ENDPOINT` for non-AWS-compatible providers, otherwise blank
- `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

Operations:

- `EVENT_SOURCE`, `TICKETMASTER_API_KEY`
- `ADMIN_EMAILS`
- `LOG_LEVEL`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` shared across horizontally scaled instances

Keep Stripe test and live credentials in separate deployment projects. Never expose secret keys through `NEXT_PUBLIC_*`.

## Stripe configuration

Create a Connect platform and enable Express accounts. Register `/api/stripe/webhook` for at least:

- `payment_intent.amount_capturable_updated`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `payment_intent.succeeded`

The buyer authorizes a manually captured payment. Ticket participants then record official issuer transfer initiation and acceptance. The final acceptance triggers capture; the signed success webhook creates the connected-account transfer, returns the refundable deposit, completes the transaction, and opens reviews.

Production launch still requires Stripe approval, platform fee/tax decisions, negative-balance and refund policies, and a webhook replay test with live-like test data.

## Storage configuration

The bucket must be private. Permit signed `PUT` and server `HEAD` requests, allow only the application origin in bucket CORS, enable encryption and lifecycle/retention rules, and prohibit public ACLs. Reviewers currently see object identifiers in the protected admin queue; use provider audit logs for every administrative access.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:migrate:deploy
```

Tests cover route protection, sensitive-message screening, optimistic offer concurrency/expiry policy, direct-sale and deposit calculations, transfer participant authorization, completed-transaction review eligibility, and Stripe webhook status mapping.

Run `npm run test:email` to check email verification through a real local TLS SMTP server, an isolated SQLite database, HTTP auth endpoints, and the confirmation button in Chromium. It checks signup delivery, blocked unverified sign-in, successful verification/sign-in, replay, expiry, email binding, browser password recovery, reset-token reuse, old-password rejection, session revocation, SMTP rejection, and resend limits without external delivery or an email API key. Requires Node 24, OpenSSL (Git for Windows includes it), and Playwright Chromium (`npx playwright install chromium`). Run with the development server stopped because it temporarily generates a SQLite Prisma client and restores the previous client afterward. Diagnostic artifacts are ignored under `artifacts/email-flow-*`. This local test does not establish public inbox delivery or PostgreSQL concurrency behavior.

The September 2026 browser and payment audit is recorded in [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md). `scripts/audit-user-flows.mjs` exercises separate guest, buyer, seller, and stranger browser sessions. `scripts/audit-payments.mjs` uses real Stripe test payments and locally signed webhook deliveries. Both require the isolated localhost audit database and running audit application; they reject remote application/database hosts. The payment runner requires test credentials and an active synthetic Stripe test payout fixture. Results and screenshots are saved under ignored `artifacts/prod-audit/`; those files include session cookies and must remain private. Failed cases produce a nonzero exit status.

## Deployment

1. Provision managed PostgreSQL, private object storage, Stripe Connect, an email transport, Twilio Verify, and an event source.
2. Set environment variables in the deployment platform.
3. Run `npm run db:migrate:deploy` as a release command.
4. Build with `npm run build` and start with `npm start`.
5. Configure the Stripe webhook and either a Resend sender domain or authenticated SMTP account.
6. Import events and verify the admin queue.
7. Run separate buyer and seller test accounts through sale, swap, failed payment, transfer, dispute, refund, and review scenarios.
8. Review `/terms`, `/privacy`, and `/marketplace-rules` with qualified counsel before public access.

### Vercel

Add the required variables in **Project settings → Environment Variables** before deploying. At minimum, the Production and Preview environments need:

- `DATABASE_URL`: a reachable PostgreSQL connection URL
- `DIRECT_URL`: the direct or session-pooled PostgreSQL URL used for migrations (recommended for serverless databases)
- `BETTER_AUTH_SECRET`: a high-entropy secret of at least 16 characters
- `BETTER_AUTH_URL`: the canonical deployment URL, such as `https://gameswap.example.com`
- `NEXT_PUBLIC_APP_URL`: the same canonical public URL

For serverless PostgreSQL, use the transaction-pooled URL as `DATABASE_URL` and the direct or session-pooled URL as `DIRECT_URL`. Prisma CLI commands prefer `DIRECT_URL` and fall back to `DATABASE_URL`. When both are absent, the Prisma config omits its datasource override so dependency installation can still generate the client without connecting to a database. Runtime validation still requires the real `DATABASE_URL`. After attaching PostgreSQL, run `npm run db:migrate:deploy` against that database before serving traffic.

## Launch gates

Completed in code:

- Persistent marketplace/event/profile/offer/message/transaction/moderation models
- Server ownership and participant checks on sensitive operations
- Conflict-safe offer acceptance and versioned counteroffers
- Signed Stripe webhooks and idempotent payment/capture/transfer operations
- Private evidence upload pipeline
- Real in-app/email notification preferences
- Loading, empty, missing, permission, and server-error states
- Security headers, request limits, rate limits, validation, logging, and audit events
- PostgreSQL migration, automated tests, type checking, linting, and production build

Requires operator credentials or approval:

- PostgreSQL production instance and a successful deployed migration
- Stripe Connect platform approval, keys, webhook, payout/refund policy, and end-to-end test-mode journey
- An authenticated SMTP account for the in-house verification and transactional email flow
- Twilio Verify account, SMS-capable Verify Service, geographic permissions, fraud controls, and production credentials
- Private bucket credentials, CORS, retention, and access audit policy
- Ticketmaster key or manually entered real event data
- Production domain, TLS, monitoring/log forwarding, backups, restore drill, and incident alerts
- Legal review, marketplace licensing analysis, tax handling, insurance/risk review, support staffing, and moderation procedures
- Desktop/mobile browser and assistive-technology review against the deployed environment

Do not call a deployment launch-ready until every operator gate above has been completed.

## Production fixes and verification

Circle membership requires owner/admin approval before shared listings become accessible. Completed exchanges include a review form. Dispute attachments use private uploads, checksum/type verification, immutable confirmed copies, and participant/admin download authorization. Paused listings can resume failed proof uploads from their edit page; activation enforces duplicate-seat protection. The unfinished private-link publication option is unavailable.

Set `APP_MODE=live` for production. Live mode requires PostgreSQL, matching HTTPS auth/site origins, authenticated SMTP with required email verification, live Stripe keys, a webhook secret, private storage, and a strong `CRON_SECRET`. Use `APP_MODE=test` with test Stripe keys for an explicit sandbox deployment. `npm run check:production` validates the ignored `.env` file and performs read-only service checks when the required values are present. It exits unsuccessfully when configuration is incomplete.

Deploy migrations with `npm run db:migrate:deploy` before serving the updated application. The new migration adds circle requests, confirmed dispute attachments, bank-dispute tracking and a reconciliation lease. Test migrations against an isolated database first.

`vercel.json` schedules `/api/cron/reconcile` every five minutes. Configure the same `CRON_SECRET` in the deployment; the endpoint requires its Bearer token. This schedule requires a Vercel plan supporting sub-daily cron jobs, or an external scheduler calling the endpoint. [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing). The job processes five exchanges per run, rotates its queue, recovers missed authorizations/captures/settlement, cancels expired uncaptured payments, resumes interrupted support refunds, and checks recent completed payments for external refunds/bank disputes. Monitor failures and queue age, and increase capacity before exceeding this batch size. Open support disputes remain frozen for review. Event refresh checks five listed Ticketmaster events per run, updates rescheduled listing expiry, and shortens transfer deadlines when an event moves earlier.

Subscribe the deployed Stripe endpoint to `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, and `charge.dispute.closed`. Bank disputes freeze the exchange; support must respond in Stripe before resuming it. A lost bank dispute reverses seller transfers without issuing a second refund. [Stripe dispute handling](https://docs.stripe.com/connect/disputes).

Use `node scripts/audit-production-fixes.mjs` alongside the existing local browser/payment runners to exercise approval, upload retry/tampering, reconciliation, external refunds and a real Stripe sandbox bank dispute. All runners require the isolated localhost audit database and synthetic fixtures. See `PRODUCTION_AUDIT.md` for the current results and deployment blockers.
