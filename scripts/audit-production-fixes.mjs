import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { chromium } from "playwright";
import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const origin = "http://localhost:3111";
const { url } = JSON.parse(await readFile("artifacts/prod-audit/database.json", "utf8"));
assert.equal(new URL(url).hostname, "127.0.0.1");
const environment = parse(await readFile(".env", "utf8"));
assert.ok(environment.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
const { directory } = JSON.parse(await readFile("artifacts/prod-audit/latest.json", "utf8"));
const fixtures = JSON.parse(await readFile(resolve(directory, "fixtures.json"), "utf8"));
const users = JSON.parse(await readFile(resolve(directory, "users.json"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url } } });
const browser = await chromium.launch();
const buyer = await browser.newContext({ storageState: resolve(directory, "buyer-session.json") });
const seller = await browser.newContext({ storageState: resolve(directory, "seller-session.json") });
const guest = await browser.newContext();
const page = await seller.newPage();
page.setDefaultTimeout(20000);
const results = [];
const retryUploads = process.argv.includes("--retry-uploads") || process.argv.includes("--verify-publication-options");
const previousResults = retryUploads ? JSON.parse(await readFile(resolve(directory, "production-fixes-results.json"), "utf8")) : [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=", "base64");
async function waitFor(check) { for (let n = 0; n < 100; n++) { if (await check()) return; await new Promise(done => setTimeout(done, 200)); } throw new Error("Expected state not persisted."); }
async function record(name, fn) { const previous = previousResults.find(result => result.name === name); if (retryUploads && previous?.status === "PASS" && !(process.argv.includes("--verify-publication-options") && name === "The unfinished private invitation option is absent")) { results.push(previous); return; } try { await fn(); results.push({ name, status: "PASS", ...(previous?.error ? { initialError: previous.error, retried: true } : {}) }); console.log("PASS " + name); } catch (error) { results.push({ name, status: "FAIL", error: error.message }); console.log("FAIL " + name + ": " + error.message.slice(0, 200)); } await writeFile(resolve(directory, "production-fixes-results.json"), JSON.stringify(results, null, 2)); }
async function visit(path) { await page.goto(origin + path, { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => { const form = document.querySelector("form"); return !form || Object.keys(form).some(key => key.startsWith("__reactProps$") && typeof form[key]?.onSubmit === "function"); }); }
async function cronUntil(check) { for (let n = 0; n < 30; n++) { const response = await guest.request.get(origin + "/api/cron/reconcile", { headers: { Authorization: "Bearer isolated-audit-cron-secret-32-characters" }, timeout: 120000 }); assert.equal(response.status(), 200, await response.text()); if (await check()) return; } throw new Error("Recovery did not reach the expected state."); }
async function webhook(type, object) { const payload = JSON.stringify({ id: `evt_fixes_${randomUUID()}`, object: "event", type, livemode: false, data: { object } }); const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: environment.STRIPE_WEBHOOK_SECRET }); const response = await guest.request.post(origin + "/api/stripe/webhook", { headers: { "stripe-signature": signature }, data: payload }); assert.equal(response.status(), 200, await response.text()); }
function omitFields(object, keys) { return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key))); }
async function createListing(status) { const source = await db.listing.findUniqueOrThrow({ where: { id: fixtures.sale } }); const data = omitFields(source, ["id", "createdAt", "updatedAt"]); return db.listing.create({ data: { ...data, section: "Recovery-" + randomUUID().slice(0, 8), status, activeFingerprint: null, visibility: "public", circleId: null, expiresAt: new Date(Date.now() + 86400000) } }); }
async function createPayment(method = "pm_card_visa") {
  const source = await db.transaction.findUniqueOrThrow({ where: { id: fixtures.transaction.id }, include: { offer: true, legacyTrade: true, transfers: true } });
  const listing = await createListing("pending");
  const offerData = omitFields(source.offer, ["id", "createdAt", "updatedAt"]);
  const offer = await db.offer.create({ data: { ...offerData, listingId: listing.id, offeredListingIds: "[]", status: "accepted" } });
  const tradeData = omitFields(source.legacyTrade, ["id", "createdAt"]);
  const trade = await db.trade.create({ data: { ...tradeData, listingId: listing.id, stage: "offer_accepted", history: "[]", transferDeadline: new Date(Date.now() + 3600000) } });
  const { sellerId, buyerId } = source; const amounts = omitFields(source, ["id", "createdAt", "updatedAt", "sellerId", "buyerId"]);
  delete amounts.offer; delete amounts.legacyTrade; delete amounts.transfers;
  const payment = await db.transaction.create({ data: { ...amounts, sellerId, buyerId, offerId: offer.id, listingId: listing.id, legacyTradeId: trade.id, status: "payment_pending", stripePaymentIntentId: null, stripeChargeId: null, stripeTransferId: null, completedAt: null, refundedAt: null, cancelledAt: null, paymentAuthorizedAt: null } });
  for (const transfer of source.transfers) { const data = omitFields(transfer, ["id", "createdAt", "updatedAt"]); await db.ticketTransfer.create({ data: { ...data, transactionId: payment.id, status: "pending", initiatedAt: null, acceptedAt: null, confirmedAt: null, deadline: new Date(Date.now() + 3600000) } }); }
  const intent = await stripe.paymentIntents.create({ amount: payment.ticketAmountCents + payment.platformFeeCents + payment.depositAmountCents + Math.max(0, payment.cashAdjustmentCents), currency: payment.currency, capture_method: "manual", payment_method_types: ["card"], metadata: { transactionId: payment.id } });
  await db.transaction.update({ where: { id: payment.id }, data: { stripePaymentIntentId: intent.id } });
  await stripe.paymentIntents.confirm(intent.id, { payment_method: method });
  return { payment, intent, trade, listing };
}
let recovery;
let settlement;
try {
  await record("Owner approval is required before a fan can read circle listings", async () => {
    const listing = await db.listing.findUniqueOrThrow({ where: { id: fixtures.circleListing } });
    assert.ok(listing.circleId);
    await db.circleMember.deleteMany({ where: { circleId: listing.circleId, userId: users.buyer.id } });
    await db.circleJoinRequest.deleteMany({ where: { circleId: listing.circleId, userId: users.buyer.id } });
    const requestPage = await buyer.newPage();
    try {
      await requestPage.goto(origin + `/circles/${listing.circleId}`, { waitUntil: "networkidle" });
      await requestPage.getByRole("button", { name: "Request to join", exact: true }).click();
      await waitFor(async () => Boolean(await db.circleJoinRequest.findFirst({ where: { circleId: listing.circleId, userId: users.buyer.id, status: "pending" } })));
      assert.equal(await db.circleMember.count({ where: { circleId: listing.circleId, userId: users.buyer.id } }), 0);
      assert.equal((await buyer.request.get(origin + `/api/listings/${listing.id}`)).status(), 404);
      await visit(`/circles/${listing.circleId}`);
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await waitFor(async () => Boolean(await db.circleMember.findFirst({ where: { circleId: listing.circleId, userId: users.buyer.id } })));
      assert.equal((await buyer.request.get(origin + `/api/listings/${listing.id}`)).status(), 200);
    } finally { await requestPage.close(); await db.circleMember.deleteMany({ where: { circleId: listing.circleId, userId: users.buyer.id } }); await db.circleJoinRequest.deleteMany({ where: { circleId: listing.circleId, userId: users.buyer.id } }); }
  });
  await record("A failed upload can be retried on the same saved listing", async () => {
    const listing = await createListing("paused");
    await visit(`/listing/${listing.id}/edit`);
    await page.getByLabel("Private evidence file").filter({ visible: true }).setInputFiles({ name: "retry-proof.png", mimeType: "image/png", buffer: png });
    await page.route("**/audit-evidence/**", route => route.abort());
    await page.getByRole("button", { name: "Upload evidence", exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Upload evidence", exact: true }).filter({ visible: true }).waitFor();
    assert.equal((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status, "paused");
    await page.unroute("**/audit-evidence/**");
    await page.getByRole("button", { name: "Upload evidence", exact: true }).filter({ visible: true }).click();
    await waitFor(async () => (await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status === "active");
    assert.equal(await db.ownershipEvidence.count({ where: { listingId: listing.id, reviewStatus: "pending" } }), 1);
  });
  await record("Tampered evidence cannot publish a paused listing", async () => {
    const listing = await createListing("paused");
    const response = await seller.request.post(origin + "/api/evidence", { headers: { Origin: origin }, data: { listingId: listing.id, originalName: "tampered.png", mimeType: "image/png", byteSize: png.length, sha256: createHash("sha256").update(png).digest("hex") } });
    assert.equal(response.status(), 200);
    const upload = await response.json(); const modified = Buffer.from(png); modified[modified.length - 1] ^= 1;
    assert.ok((await seller.request.put(upload.uploadUrl, { headers: { "Content-Type": "image/png" }, data: modified })).ok());
    assert.ok((await seller.request.patch(origin + "/api/evidence", { headers: { Origin: origin }, data: { evidenceId: upload.evidenceId } })).status() >= 400);
    assert.equal((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status, "paused");
  });
  await record("Reusing a temporary upload URL cannot overwrite confirmed evidence", async () => {
    const listing = await createListing("paused");
    const response = await seller.request.post(origin + "/api/evidence", { headers: { Origin: origin }, data: { listingId: listing.id, originalName: "immutable.png", mimeType: "image/png", byteSize: png.length, sha256: createHash("sha256").update(png).digest("hex") } });
    assert.equal(response.status(), 200); const upload = await response.json();
    assert.ok((await seller.request.put(upload.uploadUrl, { headers: { "Content-Type": "image/png" }, data: png })).ok());
    assert.equal((await seller.request.patch(origin + "/api/evidence", { headers: { Origin: origin }, data: { evidenceId: upload.evidenceId } })).status(), 200);
    const confirmed = await db.ownershipEvidence.findUniqueOrThrow({ where: { id: upload.evidenceId } });
    assert.match(confirmed.objectKey, /\.confirmed\.png$/);
    const modified = Buffer.from(png); modified[modified.length - 1] ^= 1;
    assert.ok((await seller.request.put(upload.uploadUrl, { headers: { "Content-Type": "image/png" }, data: modified })).ok());
    const downloaded = await seller.request.get(origin + `/api/admin/evidence/${confirmed.id}`);
    assert.equal(downloaded.status(), 200); assert.ok((await downloaded.body()).equals(png));
  });
  await record("The unfinished private invitation option is absent", async () => {
    await visit("/list");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("#face-value").fill("120");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("#section").fill("Visibility test"); await page.locator("#row").fill("12"); await page.locator("#quantity").fill("2");
    for (let step = 2; step < 6; step++) await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "visibility-proof.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText("Trusted fan circle", { exact: true }).filter({ visible: true }).waitFor();
    assert.equal(await page.getByText("Private invitation", { exact: true }).count(), 0);
  });
  await record("Reconciliation rejects requests without its secret", async () => assert.equal((await guest.request.get(origin + "/api/cron/reconcile")).status(), 401));
  await record("Missed authorization webhooks recover without capturing before receipt", async () => {
    recovery = await createPayment();
    await cronUntil(async () => (await db.transaction.findUniqueOrThrow({ where: { id: recovery.payment.id } })).status === "payment_authorized");
    assert.equal((await stripe.paymentIntents.retrieve(recovery.intent.id)).status, "requires_capture");
  });
  await record("An expired exchange cancels the real uncaptured authorization", async () => {
    await db.trade.update({ where: { id: recovery.trade.id }, data: { transferDeadline: new Date(0) } });
    await cronUntil(async () => (await db.transaction.findUniqueOrThrow({ where: { id: recovery.payment.id } })).status === "cancelled");
    assert.equal((await stripe.paymentIntents.retrieve(recovery.intent.id)).status, "canceled");
    assert.equal((await db.listing.findUniqueOrThrow({ where: { id: recovery.listing.id } })).status, "cancelled");
  });
  await record("Missed capture and settlement webhooks recover after confirmed receipt", async () => {
    settlement = await createPayment();
    await db.ticketTransfer.updateMany({ where: { transactionId: settlement.payment.id }, data: { status: "transfer_accepted", acceptedAt: new Date(), confirmedAt: new Date() } });
    await db.transaction.update({ where: { id: settlement.payment.id }, data: { status: "capture_pending" } });
    await cronUntil(async () => (await db.transaction.findUniqueOrThrow({ where: { id: settlement.payment.id } })).status === "completed");
    const payment = await db.transaction.findUniqueOrThrow({ where: { id: settlement.payment.id } });
    assert.ok(payment.stripeTransferId); assert.ok(payment.completedAt);
    assert.equal((await stripe.paymentIntents.retrieve(settlement.intent.id)).status, "succeeded");
  });
  await record("An external full refund closes the exchange and reverses seller funds", async () => {
    await stripe.refunds.create({ payment_intent: settlement.intent.id });
    const intent = await stripe.paymentIntents.retrieve(settlement.intent.id);
    const charge = await stripe.charges.retrieve(intent.latest_charge);
    await webhook("charge.refunded", charge);
    const payment = await db.transaction.findUniqueOrThrow({ where: { id: settlement.payment.id } });
    assert.equal(payment.status, "refunded");
    const transfer = await stripe.transfers.retrieve(payment.stripeTransferId);
    assert.equal(transfer.amount_reversed, transfer.amount);
    await webhook("charge.refunded", charge);
    assert.equal((await stripe.transfers.retrieve(payment.stripeTransferId)).amount_reversed, transfer.amount);
  });
  await record("A real Stripe bank dispute freezes the exchange and closes without a second refund", async () => {
    const chargeback = await createPayment("pm_card_createDisputeProductNotReceived");
    await stripe.paymentIntents.capture(chargeback.intent.id);
    let providerDispute;
    await waitFor(async () => { providerDispute = (await stripe.disputes.list({ payment_intent: chargeback.intent.id, limit: 1 })).data[0]; return Boolean(providerDispute); });
    await webhook("charge.dispute.created", providerDispute);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: chargeback.payment.id } })).status, "disputed");
    const local = await db.dispute.findFirstOrThrow({ where: { transactionId: chargeback.payment.id } });
    assert.equal(local.providerDisputeId, providerDispute.id);
    const closed = await stripe.disputes.close(providerDispute.id);
    assert.equal(closed.status, "lost");
    await webhook("charge.dispute.closed", closed);
    assert.equal((await db.transaction.findUniqueOrThrow({ where: { id: chargeback.payment.id } })).status, "refunded");
    const actual = await stripe.paymentIntents.retrieve(chargeback.intent.id);
    assert.equal((await stripe.charges.retrieve(actual.latest_charge)).amount_refunded, 0, "Bank disputes must not create a separate refund.");
  });
  await record("A support refund interrupted before cancellation resumes from its persisted reason", async () => {
    const pending = await createPayment();
    await db.transaction.update({ where: { id: pending.payment.id }, data: { status: "refund_pending" } });
    await db.moderationAction.create({ data: { moderatorId: users.seller.id, targetType: "transaction", targetId: pending.payment.id, action: "refund_requested", reason: "Isolated audit interrupted support cancellation.", createdAt: new Date(Date.now() - 6 * 60_000) } });
    await cronUntil(async () => (await db.transaction.findUniqueOrThrow({ where: { id: pending.payment.id } })).status === "refunded");
    assert.equal((await stripe.paymentIntents.retrieve(pending.intent.id)).status, "canceled");
  });
  await record("Dispute confirmation stores an immutable private attachment through reload", async () => {
    const payment = await createPayment();
    const disputePage = await buyer.newPage();
    try {
      await disputePage.goto(origin + `/trades/${payment.trade.id}/dispute`, { waitUntil: "networkidle" });
      await disputePage.getByLabel("Your statement").fill("Isolated audit verifying immutable support attachments before any handoff.");
      await disputePage.getByRole("button", { name: "Submit dispute", exact: true }).click();
      await disputePage.getByLabel("Private evidence file").filter({ visible: true }).setInputFiles({ name: "confirmed-dispute.png", mimeType: "image/png", buffer: png });
      await disputePage.getByRole("button", { name: "Upload evidence", exact: true }).filter({ visible: true }).click();
      let evidence;
      await waitFor(async () => { evidence = await db.disputeEvidence.findFirst({ where: { dispute: { tradeId: payment.trade.id }, uploadStatus: "uploaded" } }); return Boolean(evidence); });
      assert.match(evidence.objectKey, /\.confirmed\.png$/);
      await disputePage.reload({ waitUntil: "networkidle" });
      await disputePage.getByRole("link", { name: "confirmed-dispute.png", exact: true }).waitFor();
      const download = await buyer.request.get(origin + `/api/disputes/evidence/${evidence.id}`);
      assert.equal(download.status(), 200); assert.ok((await download.body()).equals(png));
    } finally {
      await disputePage.close(); await stripe.paymentIntents.cancel(payment.intent.id);
      await db.transaction.update({ where: { id: payment.payment.id }, data: { status: "cancelled", cancelledAt: new Date() } });
      await db.trade.update({ where: { id: payment.trade.id }, data: { stage: "cancelled", waitingOnUserId: null } });
      await db.dispute.updateMany({ where: { tradeId: payment.trade.id }, data: { status: "resolved", resolvedAt: new Date(), resolution: "Isolated attachment test completed; uncaptured authorization cancelled." } });
    }
  });
  await record("A saved draft cannot activate duplicate seats after its fingerprint was cleared", async () => {
    const existing = await db.listing.findFirstOrThrow({ where: { sellerId: users.seller.id, status: "active", activeFingerprint: { not: null } } });
    const candidate = await createListing("paused");
    await db.listing.update({ where: { id: candidate.id }, data: { gameId: existing.gameId, eventId: existing.eventId, section: existing.section, row: existing.row, quantity: existing.quantity, activeFingerprint: null } });
    const objectKey = `evidence/${users.seller.id}/${candidate.id}/${randomUUID()}.png`;
    const storage = new S3Client({ endpoint: "http://127.0.0.1:4569", forcePathStyle: true, region: "us-east-1", credentials: { accessKeyId: "S3RVER", secretAccessKey: "S3RVER" } });
    try { await storage.send(new PutObjectCommand({ Bucket: "audit-evidence", Key: objectKey, Body: png, ContentType: "image/png" })); } finally { storage.destroy(); }
    const evidence = await db.ownershipEvidence.create({ data: { listingId: candidate.id, uploadedById: users.seller.id, objectKey, originalName: "duplicate-proof.png", mimeType: "image/png", byteSize: png.length, sha256: createHash("sha256").update(png).digest("hex"), reviewStatus: "uploading" } });
    const response = await seller.request.patch(origin + "/api/evidence", { headers: { Origin: origin }, data: { evidenceId: evidence.id } });
    assert.equal(response.status(), 409, await response.text());
    assert.equal((await db.listing.findUniqueOrThrow({ where: { id: candidate.id } })).status, "paused");
    assert.equal((await db.ownershipEvidence.findUniqueOrThrow({ where: { id: evidence.id } })).reviewStatus, "uploading");
  });
} finally {
  await browser.close(); await db.$disconnect();
  console.log(JSON.stringify({ passed: results.filter(result => result.status === "PASS").length, failed: results.filter(result => result.status === "FAIL").length }));
  process.exitCode = results.some(result => result.status === "FAIL") ? 1 : 0;
}
