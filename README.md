# GameSwap

GameSwap is a sports-only ticket marketplace for direct sales, ticket swaps, multi-game exchanges, and ticket-plus-cash offers. It uses cautious trust language: uploaded ownership evidence is not issuer verification, official issuer tools perform ticket transfers, and Stripe Connect provides protected payments rather than regulated escrow.

## Architecture

- Next.js 16 App Router and React 19
- Better Auth with Prisma-backed sessions, email verification, password reset, rate limiting, and server-side route authorization
- Signed-in phone verification through Twilio Verify, with normalized private numbers, destination/user rate limits, and audit events
- PostgreSQL through Prisma, with one production foundation migration
- Stripe Connect Express, manual-capture PaymentIntents, separate transfers, deposit returns, signed webhooks, and idempotency
- Private S3-compatible storage with signed uploads, MIME/size validation, SHA-256 recording, and server-side encryption
- Resend transactional email through its HTTPS API
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
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=true`

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

## Deployment

1. Provision managed PostgreSQL, private object storage, Stripe Connect, Resend, Twilio Verify, and an event source.
2. Set environment variables in the deployment platform.
3. Run `npm run db:migrate:deploy` as a release command.
4. Build with `npm run build` and start with `npm start`.
5. Configure the Stripe webhook and Resend sender domain.
6. Import events and verify the admin queue.
7. Run separate buyer and seller test accounts through sale, swap, failed payment, transfer, dispute, refund, and review scenarios.
8. Review `/terms`, `/privacy`, and `/marketplace-rules` with qualified counsel before public access.

### Vercel

Add the required variables in **Project settings → Environment Variables** before deploying. At minimum, the Production and Preview environments need:

- `DATABASE_URL`: a reachable PostgreSQL connection URL
- `BETTER_AUTH_SECRET`: a high-entropy secret of at least 16 characters
- `BETTER_AUTH_URL`: the canonical deployment URL, such as `https://gameswap.example.com`
- `NEXT_PUBLIC_APP_URL`: the same canonical public URL

When `DATABASE_URL` is absent, the Prisma config omits its datasource override so dependency installation can still generate the client without connecting to a database. Runtime validation and all Prisma migration/database commands still require the real variable from the schema. After attaching PostgreSQL, run `npm run db:migrate:deploy` against that database before serving traffic.

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
- Resend verified sender/domain
- Twilio Verify account, SMS-capable Verify Service, geographic permissions, fraud controls, and production credentials
- Private bucket credentials, CORS, retention, and access audit policy
- Ticketmaster key or manually entered real event data
- Production domain, TLS, monitoring/log forwarding, backups, restore drill, and incident alerts
- Legal review, marketplace licensing analysis, tax handling, insurance/risk review, support staffing, and moderation procedures
- Desktop/mobile browser and assistive-technology review against the deployed environment

Do not call a deployment launch-ready until every operator gate above has been completed.
