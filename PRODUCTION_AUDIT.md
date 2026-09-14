# Production readiness — September 14, 2026

Application fixes are implemented and tested. **The site is not cleared for live launch:** HTTPS deployment settings, authenticated SMTP, real private storage, live Stripe configuration, deployed webhook delivery and human-completed seller onboarding are still missing or unverified.

## Completed fixes

- Circle membership now requires a pending request and owner/admin approval. Requesting membership does not unlock private listings. Approval and access were exercised in the browser.
- Imported favorite teams render from persisted catalog data on circle detail pages.
- Completed trades include a review form. A submitted review persists, appears on the public profile and cannot be submitted again from that transaction page; server eligibility and database uniqueness remain enforced.
- Disputes accept actual private screenshots/documents after filing. Files persist through reload, and only participants/admins can download them. Filing notifies participants and active administrators. Support can inspect attachments in its queue.
- Ownership and dispute uploads verify length, declared MIME type, checksum and file signature before confirmation. Tampered files cannot activate a listing.
- Confirmation copies verified bytes to a separate private object with the declared MIME type. Temporary upload URLs cannot overwrite the confirmed evidence. Activation restores the seat fingerprint, so an edited draft cannot bypass duplicate-seat protection.
- Failed proof uploads can resume from the same saved listing's edit page. Wizard retries retain the draft ID, and back navigation is disabled once the draft exists. Duplicate draft protection gives a recovery message.
- The unfinished private-link publication option is removed and rejected by the server. Public and approved-circle publication remain supported.
- Wanted-match notifications are created only after a public listing activates.
- Checkout rechecks the seller's real Stripe transfer capability even when reusing an existing payment intent. Payment methods are restricted to cards compatible with manual capture.
- Signed Stripe payment processing is shared with scheduled recovery. External full refunds close exchanges and reverse seller transfers. Unexpected partial refunds freeze the exchange for support review. Bank disputes are retrieved from Stripe, tracked and frozen; a lost dispute closes the exchange without creating a second refund. Support cannot issue an additional refund or resolve an open bank dispute through the app.
- Authenticated reconciliation uses a persisted lease and a rotating five-exchange batch. It recovers missed authorization/capture/settlement events, cancels expired uncaptured exchanges, resumes interrupted support refunds from their persisted reason, and checks recent completed payments for external changes. Capture still requires every recipient's confirmed receipt. Open support disputes remain frozen.
- Listed Ticketmaster events refresh in batches. Rescheduled listing expiry updates; an earlier event shortens transfer deadlines. Uncaptured exchanges for cancelled/postponed events close on reconciliation. Refresh failures are reported.
- Live environment validation rejects test payment keys, disabled verification/delivery, HTTP or mismatched origins, missing private storage and weak/missing reconciliation secrets. Live delivery uses authenticated SMTP for the in-house verification implementation.
- Header hydration uses a stable initial session snapshot. The final core browser run recorded no uncaught application errors.

## Verification

All browser/payment fixtures used the isolated localhost PostgreSQL database, private-storage emulator, synthetic accounts and Stripe test mode. No test accounts or transactions were inserted into the supplied production database.

- Production webpack build: **PASS**.
- Type checking and lint: **PASS**.
- Unit tests: **53 PASS** across six files.
- Production dependency audit: **0 vulnerabilities**.
- Fresh isolated PostgreSQL migration deployment: **all three migrations PASS**. The new migration also passed against the existing audit database.
- Supplied PostgreSQL: connection and existing migration checksums verified. The additive `20260914000000_circle_approval_dispute_uploads` migration was applied successfully. All three applied migrations then matched repository checksums.
- Final core browser run `mu1d4vdu`: **53 PASS, 0 FAIL**.
- Final payment run: **23 PASS, 1 FAIL**. The failed case is Stripe-hosted onboarding, whose provider response is HTTP 400 with `expected_hcaptcha_error`. Account/link creation and refresh pass; the hosted journey has not completed. Settlement tests use a separate synthetic API-onboarded Stripe sandbox seller and do not establish hosted onboarding.
- Production-fix browser/integration cases: **14 PASS, 0 FAIL**, including approval, upload retry, tampering, immutable listing/dispute files, duplicate-seat activation rejection, missed events, deadline cancellation, external refund/reversal, an actual Stripe test-card bank dispute, and interrupted support cancellation recovery. The final focused upload retry retains the earlier hidden-element locator failure and corrected S3 copy-path encoding failure in result metadata; the two failed cases and two new cases then passed against the final build.
- Focused edge cases: **3 PASS, 0 FAIL**.
- In-house SMTP/browser verification: **eight checks PASS; command exits successfully**, including signup delivery, hashed tokens, verification/replay/origin protection, browser password recovery and session revocation, expiry/email binding, SMTP rejection cleanup and resend limits. The generated PostgreSQL client restores cleanly after the isolated SQLite test.

An earlier run observed React hydration error 418 and two locators matching hidden streamed HTML. The header snapshot and visible-element selectors were corrected; the entire final core run passed. Historical evidence remains under the earlier run directory.

## Required before live launch

1. Configure the production HTTPS application and auth origins. Both must use the intended deployment origin.
2. Configure authenticated SMTP, sender/domain delivery, `EMAIL_DELIVERY_ENABLED=true`, and `NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=true`. The implementation is in-house; SMTP credentials are still needed to deliver messages. Verify signup/recovery messages in a real inbox.
3. Configure the real private S3 bucket, credentials, encryption and upload CORS. The emulator proves application behavior only.
4. Configure live Stripe secret/publishable keys and the deployed endpoint's matching webhook secret. Enable the eight events listed in README. Verify actual Stripe-to-deployment delivery, seller capability and bank payout operation. [Stripe webhooks](https://docs.stripe.com/webhooks).
5. Complete seller onboarding in a normal human browser, including Stripe's challenge. The automated hCaptcha failure is retained as an external journey blocker, not counted as a passing onboarding test. [Stripe onboarding](https://docs.stripe.com/connect/marketplace/tasks/onboard).
6. Set `APP_MODE=live` and copy the generated ignored `CRON_SECRET` into deployment settings. Activate the five-minute schedule and monitor failures/queue age. Vercel Hobby supports only daily cron schedules; use a compatible plan or external scheduler. No plan purchase or external scheduler registration was performed. [Vercel limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
7. Run `npm run check:production` after configuration, then repeat the user journeys against the deployed sandbox and intended production setup. The current command correctly fails because live configuration is incomplete. Its read-only checks cannot prove inbox placement, matching webhook secrets or scheduler execution.

Phone/SMS delivery remains unconfigured and untested against a real provider. Cross-browser/accessibility, production load/capacity, monitoring, and backup/restore checks from README remain deployment work. The reconciliation batch checks five exchanges and five listed events per invocation; monitor queue age and expand capacity before traffic exceeds it.

Provider event cancellation/rescheduling refresh is implemented, but changing real provider event data was not exercised. Fresh event import and catalog rendering were tested separately.

## Evidence

Final files are retained privately under ignored `artifacts/prod-audit/mu1d4vdu/`: `results.json`, `payment-results.json`, `production-fixes-results.json`, `edge-results.json`, provider error metadata, fixtures and screenshots. Build/migration/service reports are also retained under the audit directory. Session artifacts contain authentication cookies and must stay private.

Tracked local runners: `scripts/audit-user-flows.mjs`, `scripts/audit-payments.mjs`, `scripts/audit-production-fixes.mjs`, `scripts/audit-edge-cases.mjs`, and `scripts/verify-email-flow.mjs`. They require isolated localhost fixtures and must not target production data.

Audit application, PostgreSQL and storage services were stopped after verification. Local evidence and synthetic Stripe sandbox objects are retained.
