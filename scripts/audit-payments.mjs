import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";
import Stripe from "stripe";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const origin = process.env.AUDIT_URL ?? "http://localhost:3111";
if (!/^(localhost|127\.0\.0\.1)$/.test(new URL(origin).hostname)) throw new Error("Payment audit requires a local application.");
const configuration = JSON.parse(await readFile("artifacts/prod-audit/database.json", "utf8"));
if (!/^(localhost|127\.0\.0\.1)$/.test(new URL(configuration.url).hostname)) throw new Error("Payment audit requires an isolated local database.");
const environment = parse(await readFile(".env", "utf8"));
if (!environment.STRIPE_SECRET_KEY?.startsWith("sk_test_") || !environment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")) throw new Error("Only Stripe test keys are allowed.");
const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
const latest = JSON.parse(await readFile("artifacts/prod-audit/latest.json", "utf8"));
const directory = latest.directory;
const retryOnly = process.argv.includes("--retry-failed");
const previousResults = retryOnly ? JSON.parse(await readFile(resolve(directory, "payment-results.json"), "utf8")) : [];
const fixture = JSON.parse(await readFile(resolve(directory, "fixtures.json"), "utf8"));
const users = JSON.parse(await readFile(resolve(directory, "users.json"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: configuration.url } } });
const results = [];
const browser = await chromium.launch();
const contexts = {};
const pages = {};
async function record(name, task) {
  const previous = previousResults.find(result => result.name === name);
  if (retryOnly && previous && (previous.status === "PASS" || name.startsWith("Hosted Stripe"))) { results.push(previous); return; }
  try { await task(); results.push({ name, status: "PASS", ...(previous?.error ? { initialError: previous.error, retried: true } : {}) }); console.log("PASS " + name); }
  catch (error) { results.push({ name, status: "FAIL", error: error.message }); console.log("FAIL " + name + ": " + error.message.slice(0, 200)); }
  await writeFile(resolve(directory, "payment-results.json"), JSON.stringify(results, null, 2));
}
async function webhook(type, intent, eventId = `evt_audit_${Date.now()}_${Math.random().toString(36).slice(2)}`) {
  const payload = JSON.stringify({ id: eventId, object: "event", type, created: Math.floor(Date.now() / 1000), livemode: false, data: { object: intent } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: environment.STRIPE_WEBHOOK_SECRET });
  const response = await contexts.buyer.request.post(origin + "/api/stripe/webhook", { headers: { "Content-Type": "application/json", "stripe-signature": signature }, data: payload });
  assert.equal(response.status(), 200, await response.text());
  return eventId;
}
async function visit(actor, path) {
  const page = pages[actor];
  await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return !form || Object.keys(form).some(key => key.startsWith("__reactProps$") && typeof form[key]?.onSubmit === "function");
  }, null, { timeout: 60_000 });
  return page;
}
async function waitFor(check) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(done => setTimeout(done, 200)); }
  throw new Error("Expected state was not persisted.");
}
try {
  assert.ok(fixture.transaction, "Run the browser account and offer audit first.");
  for (const actor of ["seller", "buyer", "stranger"]) {
    contexts[actor] = await browser.newContext({ storageState: resolve(directory, `${actor}-session.json`) });
    pages[actor] = await contexts[actor].newPage();
    pages[actor].setDefaultTimeout(30_000);
  }
  await record("Accepted sale price is charged once in cents", async () => {
    const transaction = await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } });
    assert.equal(transaction.ticketAmountCents, fixture.counter.cashAmountCents);
    assert.equal(transaction.cashAdjustmentCents, 0);
    assert.equal(transaction.ticketAmountCents + transaction.platformFeeCents + transaction.depositAmountCents, 10_500);
  });
  await record("Seller opens Stripe Express onboarding through settings", async () => {
    const page = await visit("seller", "/settings");
    await page.getByRole("button", { name: /Set up seller payouts|Manage payout setup/ }).click();
    await page.waitForURL(url => url.hostname.endsWith("stripe.com"), { timeout: 60_000, waitUntil: "domcontentloaded" });
    const seller = await db.user.findUniqueOrThrow({ where: { id: users.seller.id } });
    fixture.stripeAccountId = seller.stripeAccountId;
    assert.ok(fixture.stripeAccountId);
    await page.screenshot({ path: resolve(directory, "stripe-onboarding.png"), fullPage: true });
    await writeFile(resolve(directory, "onboarding-page.txt"), await page.locator("body").innerText());
    await writeFile(resolve(directory, "onboarding-inputs.json"), JSON.stringify(await page.locator("input").evaluateAll(elements => elements.map(input => ({ type: input.type, name: input.name, placeholder: input.placeholder, label: input.getAttribute("aria-label") }))), null, 2));
  });
  await record("Incomplete connected account cannot authorize checkout", async () => {
    assert.ok(fixture.stripeAccountId, "Onboarding prerequisite");
    const account = await stripe.v2.core.accounts.retrieve(fixture.stripeAccountId, { include: ["configuration.recipient"] });
    assert.notEqual(account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status, "active");
    const response = await contexts.buyer.request.post(origin + "/api/stripe/payment-intent", { headers: { Origin: origin }, data: { transactionId: fixture.transaction.id, idempotencyKey: `audit_incomplete_${latest.runId}` } });
    assert.equal(response.status(), 409);
  });
  await record("Expired onboarding link returns seller to a fresh Stripe form", async () => {
    const page = await visit("seller", "/settings/payments?refresh=1");
    await page.waitForURL(url => url.hostname.endsWith("stripe.com"), { timeout: 60_000 });
  });
  await record("Hosted Stripe test onboarding accepts test phone number", async () => {
    const page = pages.seller;
    const failures = [];
    page.on("response", async response => { if (response.status() < 400 || !new URL(response.url()).hostname.endsWith("stripe.com")) return; try { const data = await response.json(); failures.push({ status: response.status(), error: { code: data.error?.code ?? data.code, message: data.error?.message ?? data.message } }); } catch { failures.push({ status: response.status() }); } });
    await page.getByText("Use test phone number", { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('input[type="tel"]')?.value.length > 3);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: resolve(directory, "stripe-onboarding-submit.png"), fullPage: true });
    await writeFile(resolve(directory, "onboarding-provider-errors.json"), JSON.stringify(failures, null, 2));
    assert.doesNotMatch(await page.locator("body").innerText(), /Something went wrong/);
  });
  // An independent, synthetic API-onboarded test account allows settlement testing.
  // This fixture does not prove that Express hosted onboarding completed.
  const payoutFixture = JSON.parse(await readFile("artifacts/prod-audit/payment-account.json", "utf8"));
  const payoutAccount = await stripe.v2.core.accounts.retrieve(payoutFixture.id, { include: ["configuration.recipient"] });
  assert.equal(payoutAccount.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status, "active", "Synthetic test payout fixture must be active.");
  const priorFixtureOwner = await db.user.findUnique({ where: { stripeAccountId: payoutAccount.id } });
  if (priorFixtureOwner && priorFixtureOwner.id !== users.seller.id) {
    assert.ok(priorFixtureOwner.email.endsWith("@gameswap.test"), "Only synthetic audit users may release the shared test fixture.");
    await db.user.update({ where: { id: priorFixtureOwner.id }, data: { stripeAccountId: null } });
  }
  await db.user.update({ where: { id: users.seller.id }, data: { stripeAccountId: payoutAccount.id } });
  let intent = retryOnly ? await stripe.paymentIntents.retrieve((await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).stripePaymentIntentId) : undefined;
  await record("Concurrent checkout requests reuse one real Stripe authorization", async () => {
    const replies = await Promise.all([1, 2].map(index => contexts.buyer.request.post(origin + "/api/stripe/payment-intent", { headers: { Origin: origin }, data: { transactionId: fixture.transaction.id, idempotencyKey: `audit_checkout_${latest.runId}_${index}` } })));
    const payloads = await Promise.all(replies.map(async reply => { assert.equal(reply.status(), 200, await reply.text()); return reply.json(); }));
    assert.equal(payloads[0].clientSecret, payloads[1].clientSecret);
    const transaction = await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } });
    intent = await stripe.paymentIntents.retrieve(transaction.stripePaymentIntentId);
    assert.equal(intent.amount, 10_500); assert.equal(intent.capture_method, "manual"); assert.equal(intent.livemode, false);
  });
  await record("Real Stripe declined card fails without releasing tickets", async () => {
    assert.ok(intent);
    await assert.rejects(stripe.paymentIntents.confirm(intent.id, { payment_method: "pm_card_visa_chargeDeclined", return_url: origin + `/trades/${fixture.transaction.legacyTradeId}` }), error => error.type === "StripeCardError");
    intent = await stripe.paymentIntents.retrieve(intent.id);
    assert.equal(intent.status, "requires_payment_method");
    await webhook("payment_intent.payment_failed", intent);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).status, "payment_failed");
    await visit("buyer", `/trades/${fixture.transaction.legacyTradeId}`);
    assert.equal(await pages.buyer.getByRole("button", { name: "Continue after authorization", exact: true }).count(), 0);
  });
  await record("Buyer completes the real Stripe Payment Element with a test card", async () => {
    const page = await visit("buyer", `/transactions/${fixture.transaction.id}/pay`);
    const frame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    await frame.getByRole("textbox", { name: /Card number/i }).fill("4242424242424242");
    await frame.getByRole("textbox", { name: /Expiration|Expiry/i }).fill("1230");
    await frame.getByRole("textbox", { name: /Security code|CVC/i }).fill("123");
    const postal = frame.getByRole("textbox", { name: /ZIP|Postal/i });
    if (await postal.count()) await postal.fill("60601");
    await page.screenshot({ path: resolve(directory, "stripe-payment-element.png"), fullPage: true });
    await page.getByRole("button", { name: "Authorize payment", exact: true }).click();
    await page.waitForURL(url => url.pathname === `/trades/${fixture.transaction.legacyTradeId}`, { timeout: 60_000 });
    intent = await stripe.paymentIntents.retrieve(intent.id);
    assert.equal(intent.status, "requires_capture");
    await webhook("payment_intent.amount_capturable_updated", intent);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).status, "payment_authorized");
  });
  await record("Signed webhook with mismatched amount fails without changing authorization", async () => {
    const payload = JSON.stringify({ id: `evt_audit_wrong_amount_${latest.runId}`, object: "event", type: "payment_intent.succeeded", livemode: false, data: { object: { ...intent, amount: intent.amount + 1 } } });
    const response = await contexts.buyer.request.post(origin + "/api/stripe/webhook", { headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: environment.STRIPE_WEBHOOK_SECRET }) }, data: payload });
    assert.equal(response.status(), 500);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).status, "payment_authorized");
  });
  await record("Buyer cannot delete an account with an authorized exchange", async () => {
    const response = await contexts.buyer.request.get(origin + "/api/me/deletion-readiness");
    assert.equal((await response.json()).ready, false);
  });
  await record("Buyer continues only after payment authorization", async () => {
    const page = await visit("buyer", `/trades/${fixture.transaction.legacyTradeId}`);
    await page.getByRole("button", { name: "Continue after authorization", exact: true }).click();
    await waitFor(async () => (await db.trade.findUniqueOrThrow({ where: { id: fixture.transaction.legacyTradeId } })).stage === "deposits_authorized");
  });
  await record("Seller initiates official handoff and buyer confirms receipt", async () => {
    const seller = await visit("seller", `/trades/${fixture.transaction.legacyTradeId}`);
    await seller.getByRole("button", { name: "I started my ticket transfer", exact: true }).click();
    await waitFor(async () => (await db.ticketTransfer.findFirstOrThrow({ where: { transactionId: fixture.transaction.id } })).status === "transfer_initiated");
    assert.equal(await seller.getByRole("button", { name: "I received the tickets", exact: true }).count(), 0);
    const buyer = await visit("buyer", `/trades/${fixture.transaction.legacyTradeId}`);
    await buyer.getByRole("button", { name: "I received the tickets", exact: true }).click();
    await waitFor(async () => (await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).status === "capture_pending");
    await waitFor(async () => (await stripe.paymentIntents.retrieve(intent.id)).status === "succeeded");
    intent = await stripe.paymentIntents.retrieve(intent.id);
    assert.equal(intent.amount_received, 10_500);
  });
  let completionEvent;
  await record("Captured payment settles seller funds and returns the deposit", async () => {
    assert.equal(intent.status, "succeeded");
    completionEvent = await webhook("payment_intent.succeeded", intent);
    const transaction = await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } });
    assert.equal(transaction.status, "completed");
    const transfer = await stripe.transfers.retrieve(transaction.stripeTransferId);
    assert.equal(transfer.amount, 5000); assert.equal(transfer.destination, payoutFixture.id);
    const refunds = await stripe.refunds.list({ payment_intent: intent.id });
    assert.equal(refunds.data.filter(refund => refund.metadata.reason === "completed_exchange_deposit_return").reduce((sum, refund) => sum + refund.amount, 0), 5000);
    assert.equal((await db.listing.findUniqueOrThrow({ where: { id: transaction.listingId } })).status, "completed");
    assert.equal((await db.trade.findUniqueOrThrow({ where: { id: transaction.legacyTradeId } })).stage, "completed");
  });
  await record("Repeated and late webhook deliveries do not duplicate settlement or statistics", async () => {
    assert.ok(completionEvent);
    const before = await db.user.findUniqueOrThrow({ where: { id: users.seller.id } });
    await webhook("payment_intent.succeeded", intent, completionEvent);
    await Promise.all([webhook("payment_intent.succeeded", intent), webhook("payment_intent.payment_failed", intent)]);
    const after = await db.user.findUniqueOrThrow({ where: { id: users.seller.id } });
    assert.equal(after.completedSales, before.completedSales);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).status, "completed");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: users.buyer.id } })).completedSwaps, 0);
  });
  await record("Support reverses a completed transfer and refunds the remaining charge", async () => {
    const page = await visit("seller", "/admin");
    const row = page.locator("article").filter({ hasText: fixture.transaction.id }).filter({ visible: true });
    await row.getByPlaceholder("Required moderation reason").fill("Isolated test: refund completed exchange");
    await row.getByRole("button", { name: "refund", exact: true }).click();
    await waitFor(async () => (await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).status === "refunded");
    const transaction = await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } });
    const transfer = await stripe.transfers.retrieve(transaction.stripeTransferId);
    assert.equal(transfer.amount_reversed, 5000);
    const refunds = await stripe.refunds.list({ payment_intent: intent.id });
    assert.equal(refunds.data.reduce((sum, refund) => sum + refund.amount, 0), 10_500);
    await webhook("payment_intent.succeeded", intent);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: fixture.transaction.id } })).status, "refunded");
  });
  let swapIntent;
  await record("Ticket-for-ticket swap authorizes fees and deposit without charging face value", async () => {
    assert.ok(fixture.swapTransaction);
    const response = await contexts.buyer.request.post(origin + "/api/stripe/payment-intent", { headers: { Origin: origin }, data: { transactionId: fixture.swapTransaction.id, idempotencyKey: `audit_swap_${latest.runId}` } });
    assert.equal(response.status(), 200, await response.text());
    const transaction = await db.transaction.findUniqueOrThrow({ where: { id: fixture.swapTransaction.id } });
    swapIntent = await stripe.paymentIntents.confirm(transaction.stripePaymentIntentId, { payment_method: "pm_card_visa", return_url: origin + `/trades/${transaction.legacyTradeId}` });
    assert.equal(swapIntent.amount, transaction.platformFeeCents + transaction.depositAmountCents);
    assert.equal(swapIntent.status, "requires_capture");
    await webhook("payment_intent.amount_capturable_updated", swapIntent);
  });
  let swapDispute;
  await record("Buyer files a dispute and the exchange stops before tickets move", async () => {
    const page = await visit("buyer", `/trades/${fixture.swapTransaction.legacyTradeId}/dispute`);
    await page.locator("#statement").fill("Isolated audit: recipient requests support before transferring any tickets.");
    await page.getByRole("button", { name: /Submit dispute/i }).click();
    await waitFor(async () => (await db.transaction.findUniqueOrThrow({ where: { id: fixture.swapTransaction.id } })).status === "disputed");
    swapDispute = await db.dispute.findFirstOrThrow({ where: { transactionId: fixture.swapTransaction.id } });
    await visit("buyer", `/trades/${fixture.swapTransaction.legacyTradeId}`);
    assert.equal(await pages.buyer.getByRole("button", { name: "Continue after authorization", exact: true }).count(), 0);
    assert.equal((await contexts.buyer.request.get(origin + "/api/me/deletion-readiness").then(reply => reply.json())).ready, false);
  });

  await record("Dispute attachment persists through private upload and reload", async () => {
    const page = await visit("buyer", `/trades/${fixture.swapTransaction.legacyTradeId}/dispute`);
    await page.getByLabel("Private evidence file").setInputFiles({ name: "dispute-proof.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=", "base64") });
    await page.getByRole("button", { name: "Upload evidence", exact: true }).click();
    await waitFor(async () => Boolean(await db.disputeEvidence.findFirst({ where: { disputeId: swapDispute.id, uploadStatus: "uploaded" } })));
    await visit("buyer", `/trades/${fixture.swapTransaction.legacyTradeId}/dispute`);
    await page.getByRole("link", { name: "dispute-proof.png", exact: true }).waitFor();
  });
  await record("Only participants and administrators can download dispute files", async () => {
    const evidence = await db.disputeEvidence.findFirstOrThrow({ where: { disputeId: swapDispute.id, uploadStatus: "uploaded" } });
    const path = origin + `/api/disputes/evidence/${evidence.id}`;
    assert.equal((await contexts.buyer.request.get(path, { maxRedirects: 0 })).status(), 307);
    assert.equal((await contexts.seller.request.get(path, { maxRedirects: 0 })).status(), 307);
    assert.equal((await contexts.stranger.request.get(path, { maxRedirects: 0 })).status(), 404);
    const guest = await browser.newContext();
    try { assert.equal((await guest.request.get(path, { maxRedirects: 0 })).status(), 401); } finally { await guest.close(); }
  });
  await record("Support resolves the dispute and restores the authorized handoff", async () => {
    assert.ok(swapDispute);
    const page = await visit("seller", "/admin");
    const row = page.locator("article").filter({ hasText: swapDispute.statement }).filter({ visible: true });
    await row.getByPlaceholder("Required moderation reason").fill("Isolated audit: both participants agree to continue");
    await row.getByRole("button", { name: "resolved", exact: true }).click();
    await waitFor(async () => (await db.transaction.findUniqueOrThrow({ where: { id: fixture.swapTransaction.id } })).status === "payment_authorized");
    assert.equal((await db.dispute.findUniqueOrThrow({ where: { id: swapDispute.id } })).status, "resolved");
  });
  await record("Swap completes both official handoffs before capture and completes both listings", async () => {
    const transactionId = fixture.swapTransaction.id;
    const tradeId = fixture.swapTransaction.legacyTradeId;
    let payment = await db.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { transfers: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
    const trade = await db.trade.findUniqueOrThrow({ where: { id: tradeId } });
    if (trade.stage === "offer_accepted") {
      const page = await visit("buyer", `/trades/${tradeId}`);
      await page.getByRole("button", { name: "Continue after authorization", exact: true }).click();
      await waitFor(async () => (await db.trade.findUniqueOrThrow({ where: { id: tradeId } })).stage !== "offer_accepted");
    }
    for (const transfer of payment.transfers) {
      const senderActor = transfer.senderId === users.buyer.id ? "buyer" : "seller";
      const recipientActor = transfer.recipientId === users.buyer.id ? "buyer" : "seller";
      const sender = await visit(senderActor, `/trades/${tradeId}`);
      await sender.getByRole("button", { name: "I started my ticket transfer", exact: true }).click();
      await waitFor(async () => (await db.ticketTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).status === "transfer_initiated");
      const recipient = await visit(recipientActor, `/trades/${tradeId}`);
      await recipient.getByRole("button", { name: "I received the tickets", exact: true }).click();
      await waitFor(async () => (await db.ticketTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).status === "transfer_accepted");
    }
    await waitFor(async () => (await stripe.paymentIntents.retrieve(swapIntent.id)).status === "succeeded");
    swapIntent = await stripe.paymentIntents.retrieve(swapIntent.id);
    await webhook("payment_intent.succeeded", swapIntent);
    payment = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    assert.equal(payment.status, "completed"); assert.equal(payment.stripeTransferId, null);
    for (const id of [fixture.swapBuyerListing, fixture.swapSellerListing]) assert.equal((await db.listing.findUniqueOrThrow({ where: { id } })).status, "completed");
    const refunds = await stripe.refunds.list({ payment_intent: swapIntent.id });
    assert.equal(refunds.data.reduce((sum, refund) => sum + refund.amount, 0), payment.depositAmountCents);
  });

  await record("Completed exchange accepts one review and displays it on the seller profile", async () => {
    const page = await visit("buyer", `/trades/${fixture.swapTransaction.legacyTradeId}`);
    if (!await db.review.findUnique({ where: { transactionId_authorId: { transactionId: fixture.swapTransaction.id, authorId: users.buyer.id } } })) {
    await page.getByLabel("Your review").fill("Tickets arrived as promised and the protected exchange completed smoothly.");
    await page.getByRole("button", { name: "Submit review", exact: true }).click();
    }
    await waitFor(async () => Boolean(await db.review.findUnique({ where: { transactionId_authorId: { transactionId: fixture.swapTransaction.id, authorId: users.buyer.id } } })));
    await visit("buyer", `/trades/${fixture.swapTransaction.legacyTradeId}`);
    await page.getByText("Your review has been submitted.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Submit review", exact: true }).count(), 0);
    await visit("buyer", `/profile/${users.seller.id}`);
    await page.getByText("Tickets arrived as promised and the protected exchange completed smoothly.", { exact: true }).filter({ visible: true }).waitFor();
  });
  await record("Stranger deletes an idle account through settings and loses the session", async () => {
    const page = await visit("stranger", "/settings");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    await waitFor(async () => (await db.user.findUniqueOrThrow({ where: { id: users.stranger.id } })).accountStatus === "deleted");
    assert.equal((await contexts.stranger.request.get(origin + "/api/me/listings")).status(), 401);
    assert.equal(await db.session.count({ where: { userId: users.stranger.id } }), 0);
  });
  await record("Provider cancellation closes an authorized exchange and releases its listing reservation", async () => {
    const originalListing = await db.listing.findUniqueOrThrow({ where: { id: fixture.sale } });
    const listingData = Object.fromEntries(Object.entries(originalListing).filter(([key]) => !["id", "createdAt", "updatedAt"].includes(key)));
    const listing = await db.listing.create({ data: { ...listingData, section: `Cancel ${latest.runId}`, status: "pending", activeFingerprint: null } });
    const offer = await db.offer.create({ data: { listingId: listing.id, senderId: users.buyer.id, recipientId: users.seller.id, createdById: users.buyer.id, actionRequiredById: users.seller.id, cashAmountCents: 5000, offeredListingIds: "[]", status: "accepted", expiresAt: new Date(Date.now() + 86_400_000) } });
    const transaction = await db.transaction.create({ data: { offerId: offer.id, listingId: listing.id, buyerId: users.buyer.id, sellerId: users.seller.id, type: "sale", ticketAmountCents: 5000, platformFeeCents: 500, depositAmountCents: 5000 } });
    const response = await contexts.buyer.request.post(origin + "/api/stripe/payment-intent", { headers: { Origin: origin }, data: { transactionId: transaction.id, idempotencyKey: `audit_cancel_${latest.runId}` } });
    assert.equal(response.status(), 200, await response.text());
    const payment = await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    const authorization = await stripe.paymentIntents.confirm(payment.stripePaymentIntentId, { payment_method: "pm_card_visa", return_url: origin + "/trades" });
    await webhook("payment_intent.amount_capturable_updated", authorization);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } })).status, "payment_authorized");
    const cancelled = await stripe.paymentIntents.cancel(authorization.id);
    await webhook("payment_intent.canceled", cancelled);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } })).status, "cancelled");
    assert.equal((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status, "cancelled");
  });
} finally {
  await writeFile(resolve(directory, "fixtures.json"), JSON.stringify(fixture, null, 2));
  await browser.close(); await db.$disconnect();
  console.log(JSON.stringify({ passed: results.filter(result => result.status === "PASS").length, failed: results.filter(result => result.status === "FAIL").length }));
  process.exitCode = results.some(result => result.status === "FAIL") ? 1 : 0;
}
