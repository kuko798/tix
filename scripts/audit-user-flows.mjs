import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const origin = process.env.AUDIT_URL ?? "http://localhost:3111";
if (!/^(localhost|127\.0\.0\.1)$/.test(new URL(origin).hostname)) throw new Error("Browser audit requires a local application.");
const configuration = JSON.parse(await readFile(process.env.AUDIT_DATABASE_FILE ?? "artifacts/prod-audit/database.json", "utf8"));
if (!new URL(configuration.url).hostname.match(/^(127\.0\.0\.1|localhost)$/)) throw new Error("Use an isolated local audit database.");
const db = new PrismaClient({ datasources: { db: { url: configuration.url } } });
const runId = Date.now().toString(36);
const directory = resolve("artifacts/prod-audit", runId);
await mkdir(directory, { recursive: true });
const results = [];
const browser = await chromium.launch();
const contexts = {};
const pages = {};
const users = {};
const password = "Audit-Only-Password-2026!";
const pageErrors = [];
const fixture = {};

async function record(name, task) {
  const started = Date.now();
  try { await task(); results.push({ name, status: "PASS", durationMs: Date.now() - started }); console.log("PASS " + name); }
  catch (error) {
    results.push({ name, status: "FAIL", error: error.message, durationMs: Date.now() - started });
    console.log("FAIL " + name + ": " + error.message.slice(0, 220));
    for (const [actor, page] of Object.entries(pages)) {
      await page.screenshot({ path: resolve(directory, `failure-${results.length}-${actor}.png`), fullPage: true }).catch(() => {});
      await writeFile(resolve(directory, `failure-${results.length}-${actor}.txt`), await page.locator("body").innerText().catch(() => "")).catch(() => {});
    }
  }
  await writeFile(resolve(directory, "results.json"), JSON.stringify(results, null, 2));
}
async function visit(page, path) {
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: 120_000 });
  assert.ok(response && response.status() < 500, `${path} returned ${response?.status()}`);
  // Wait for React event handlers before interacting with server-rendered forms.
  await page.waitForFunction(() => {
    const form = document.querySelector("form");
    return !form || Object.keys(form).some(key => key.startsWith("__reactProps$") && typeof form[key]?.onSubmit === "function");
  }, null, { timeout: 60_000 });
  return response;
}
async function select(page, selector, text) {
  await page.locator(selector).click();
  await page.getByRole("option", { name: text, exact: true }).click();
}
async function waitFor(check, description) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await new Promise(done => setTimeout(done, 150)); }
  throw new Error("Timed out: " + description);
}
async function createListing(actor, section, options = {}) {
  const page = pages[actor];
  const catalog = page.waitForResponse(response => response.url() === origin + "/api/events", { timeout: 120_000 });
  await visit(page, "/list");
  await catalog;
  await page.locator("#game-select").waitFor({ timeout: 30_000 });
  await page.getByText("Football", { exact: true }).click();
  await select(page, "#game-select", "Audit Away at Audit Home");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#face-value").fill(options.value ?? "120");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#section").fill(section);
  await page.locator("#row").fill("12");
  await page.locator("#quantity").fill("2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText(options.type === "trade" ? "Trade only" : "For sale", { exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "audit-redacted-proof.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKGkAAAAASUVORK5CYII=", "base64") });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (options.visibility === "circle") {
    await page.getByText("Trusted fan circle", { exact: true }).click();
    await select(page, "#circle-select", fixture.circleName);
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Publish listing", exact: true }).click();
  await page.waitForURL(/\/listing\/[a-z0-9]+$/, { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split("/").at(-1);
  assert.equal((await db.listing.findUniqueOrThrow({ where: { id } })).sellerId, users[actor].id);
  return id;
}
async function offer(actor, listingId, cash = "40") {
  const page = pages[actor];
  await visit(page, `/offer/${listingId}?mode=buy`);
  await page.locator("#cash-adjustment").waitFor({ timeout: 30_000 });
  await page.locator("#cash-adjustment").fill(cash);
  await page.getByRole("button", { name: "Review offer", exact: true }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Send this offer", exact: true }).click();
  await page.waitForURL(/\/messages\//, { timeout: 30_000 });
  const threadId = new URL(page.url()).pathname.split("/").at(-1);
  return db.messageThread.findUniqueOrThrow({ where: { id: threadId }, include: { offer: true } });
}

try {
  for (const [index, actor] of ["guest", "seller", "buyer", "stranger"].entries()) {
    contexts[actor] = await browser.newContext({ viewport: { width: 1366, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `127.0.0.${10 + index}` } });
    pages[actor] = await contexts[actor].newPage();
    pages[actor].on("pageerror", error => pageErrors.push({ actor, url: pages[actor].url(), message: error.message, stack: error.stack }));
    pages[actor].setDefaultTimeout(60_000);
  }
  for (const path of ["/", "/discover", "/wanted", "/circles", "/terms", "/privacy", "/marketplace-rules", "/forgot-password"]) {
    await record(`Guest opens ${path}`, async () => { const response = await visit(pages.guest, path); assert.equal(response.status(), 200); });
  }
  for (const path of ["/list", "/offers", "/messages", "/settings", "/admin", "/season"]) {
    await record(`Guest is redirected from ${path}`, async () => { await visit(pages.guest, path); assert.equal(new URL(pages.guest.url()).pathname, "/login"); });
  }
  for (const path of ["/api/me/listings", "/api/messages/unknown", "/api/trades", "/api/notifications"]) {
    await record(`Guest cannot read ${path}`, async () => { const response = await contexts.guest.request.get(origin + path); assert.ok([401, 404].includes(response.status()), String(response.status())); });
  }
  await record("Signup rejects a short password", async () => {
    const response = await contexts.guest.request.post(origin + "/api/auth/sign-up/email", { data: { name: "Short Password", email: `${runId}-short@gameswap.test`, password: "short" } });
    assert.ok([400, 422].includes(response.status()));
  });
  for (const actor of ["seller", "buyer", "stranger"]) {
    await record(`${actor} creates an account through the signup form`, async () => {
      const page = pages[actor];
      const email = `${runId}-${actor}@gameswap.test`;
      await visit(page, "/signup");
      await page.locator("#name").fill(`Audit ${actor}`);
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.waitForURL(origin + "/discover", { timeout: 60_000, waitUntil: "domcontentloaded" });
      users[actor] = await db.user.findUniqueOrThrow({ where: { email } });
      assert.equal((await contexts[actor].request.get(origin + "/api/auth/get-session")).status(), 200);
    });
  }
  if (!users.seller || !users.buyer || !users.stranger) throw new Error("Account creation is required for dependent user journeys.");
  await record("Buyer cannot access the admin dashboard", async () => {
    const response = await visit(pages.buyer, "/admin");
    // Next can stream the shell with HTTP 200 before rendering notFound().
    await pages.buyer.getByRole("heading", { name: "That page is not on the board", exact: true }).waitFor();
    assert.equal(await pages.buyer.getByRole("heading", { name: "Marketplace review", exact: true }).count(), 0);
    assert.ok([200, 404].includes(response.status()));
  });
  await db.user.update({ where: { id: users.seller.id }, data: { role: "admin" } });
  await record("Admin imports actual Ticketmaster events", async () => {
    const response = await contexts.seller.request.post(origin + "/api/admin/events/sync", { headers: { Origin: origin }, timeout: 120_000 });
    assert.equal(response.status(), 200, await response.text());
    const body = await response.json();
    assert.ok(body.imported > 0, JSON.stringify(body));
    fixture.import = body;
  });
  await record("Imported Ticketmaster events appear in the upcoming catalog", async () => {
    const response = await contexts.guest.request.get(origin + "/api/events");
    const events = await response.json();
    assert.ok(events.length > 0, "Imported events are absent from /api/events");
    assert.ok(events.every(event => ["Football", "Basketball", "Baseball", "Hockey", "Soccer", "College Sports"].includes(event.sport)), "Sport taxonomy is incompatible with the listing form");
  });

  // Synthetic fixtures are confined to this disposable database and labelled Audit.
  const league = await db.league.upsert({ where: { slug: "audit-nfl" }, create: { slug: "audit-nfl", name: "Audit NFL", sport: "Football" }, update: {} });
  const venue = await db.venue.upsert({ where: { slug: "audit-stadium" }, create: { slug: "audit-stadium", name: "Audit Stadium", city: "Chicago", region: "IL", timezone: "America/Chicago" }, update: {} });
  const home = await db.team.upsert({ where: { slug: "audit-home" }, create: { slug: "audit-home", name: "Audit Home", city: "Chicago", abbreviation: "AH", leagueId: league.id }, update: {} });
  const away = await db.team.upsert({ where: { slug: "audit-away" }, create: { slug: "audit-away", name: "Audit Away", city: "Detroit", abbreviation: "AA", leagueId: league.id }, update: {} });
  fixture.event = await db.event.upsert({ where: { slug: "audit-matchup" }, create: { slug: "audit-matchup", name: "Audit Away at Audit Home", leagueId: league.id, venueId: venue.id, homeTeamId: home.id, awayTeamId: away.id, startsAt: new Date(Date.now() + 86400_000 * 2), source: "audit-fixture" }, update: { startsAt: new Date(Date.now() + 86400_000 * 2) } });
  await record("Seller publishes a sale listing through every wizard step", async () => { fixture.sale = await createListing("seller", "101"); });
  if (fixture.sale) {
    await record("Guest sees the listing and filters by event", async () => {
      await visit(pages.guest, `/listing/${fixture.sale}`);
      const matches = await (await contexts.guest.request.get(origin + `/api/listings?eventId=${fixture.event.id}&city=Chicago`)).json();
      assert.ok(matches.some(listing => listing.id === fixture.sale));
    });
    await record("Buyer saves and unsaves a listing", async () => {
      await visit(pages.buyer, `/listing/${fixture.sale}`);
      await pages.buyer.getByRole("button", { name: /^Save \(/ }).click();
      await waitFor(() => db.savedListing.findUnique({ where: { userId_listingId: { userId: users.buyer.id, listingId: fixture.sale } } }), "saved listing");
      await pages.buyer.getByRole("button", { name: /^Saved \(/ }).click();
      await waitFor(async () => !await db.savedListing.findUnique({ where: { userId_listingId: { userId: users.buyer.id, listingId: fixture.sale } } }), "unsaved listing");
    });
    await record("Stranger cannot edit somebody else's listing", async () => {
      await visit(pages.stranger, `/listing/${fixture.sale}/edit`);
      await pages.stranger.getByRole("heading", { name: "That page is not on the board", exact: true }).waitFor();
      assert.equal(await pages.stranger.locator("#edit-row").count(), 0);
    });
    await record("Seller edits seat details", async () => {
      await visit(pages.seller, `/listing/${fixture.sale}/edit`); await pages.seller.locator("#edit-row").fill("14");
      await pages.seller.getByRole("button", { name: "Save changes", exact: true }).click();
      await pages.seller.waitForURL(origin + `/listing/${fixture.sale}`);
      assert.equal((await db.listing.findUniqueOrThrow({ where: { id: fixture.sale } })).row, "14");
    });
    await record("Seller pauses and resumes a listing", async () => {
      await visit(pages.seller, `/listing/${fixture.sale}`); await pages.seller.getByRole("button", { name: "Pause listing", exact: true }).click();
      await waitFor(async () => (await db.listing.findUniqueOrThrow({ where: { id: fixture.sale } })).status === "paused", "paused listing");
      assert.ok(!(await (await contexts.guest.request.get(origin + "/api/listings")).json()).some(row => row.id === fixture.sale));
      await pages.seller.reload(); await pages.seller.getByRole("button", { name: "Resume listing", exact: true }).click();
      await waitFor(async () => (await db.listing.findUniqueOrThrow({ where: { id: fixture.sale } })).status === "active", "resumed listing");
    });
    await record("Buyer composes, reviews, and submits a cash offer", async () => { fixture.thread = await offer("buyer", fixture.sale); fixture.offer = fixture.thread.offer; });
  }
  if (fixture.thread) {
    await record("Stranger cannot read a private conversation", async () => { assert.equal((await contexts.stranger.request.get(origin + `/api/messages/${fixture.thread.id}`)).status(), 404); });
    await record("Both participants exchange messages", async () => {
      await visit(pages.buyer, `/messages/${fixture.thread.id}`);
      await pages.buyer.getByPlaceholder(/message/i).fill("Audit buyer asks whether the seats are together.");
      await pages.buyer.getByRole("button", { name: /send/i }).click();
      await visit(pages.seller, `/messages/${fixture.thread.id}`);
      await pages.seller.getByText("Audit buyer asks whether the seats are together.", { exact: true }).waitFor();
      await pages.seller.getByPlaceholder(/message/i).fill("Audit seller confirms the seats are together.");
      await pages.seller.getByRole("button", { name: /send/i }).click();
      await pages.buyer.getByText("Audit seller confirms the seats are together.", { exact: true }).waitFor({ timeout: 20_000 });
    });
    await record("Buyer cannot send payment-card details in chat", async () => {
      await pages.buyer.getByPlaceholder(/message/i).fill("Use my card 4242 4242 4242 4242 to pay.");
      await pages.buyer.getByRole("button", { name: /send/i }).click();
      await pages.buyer.getByText(/looks like it contains payment info/i).waitFor();
      assert.equal(await db.message.count({ where: { threadId: fixture.thread.id, body: { contains: "4242" } } }), 0);
    });
    await record("Buyer can block the seller using the conversation menu", async () => {
      await pages.buyer.getByRole("button", { name: "Conversation options", exact: true }).click();
      await pages.buyer.getByRole("menuitem", { name: "Block", exact: true }).click();
      await waitFor(() => db.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: users.buyer.id, blockedId: users.seller.id } } }), "blocked user");
      await db.userBlock.deleteMany({ where: { blockerId: users.buyer.id, blockedId: users.seller.id } });
    });
    await record("Seller counters an offer, and buyer sees the revised terms", async () => {
      await visit(pages.seller, "/offers"); const card = pages.seller.locator("article").filter({ hasText: "Audit" }).first();
      const scope = await card.count() ? card : pages.seller;
      await scope.getByRole("button", { name: "Counter", exact: true }).click();
      await scope.getByLabel("Counteroffer cash amount").fill("50"); await scope.getByLabel("Counteroffer note").fill("Audit counteroffer with revised cash terms.");
      await scope.getByRole("button", { name: "Send counter", exact: true }).click();
      fixture.counter = await waitFor(() => db.offer.findFirst({ where: { parentOfferId: fixture.offer.id } }), "counteroffer");
      await visit(pages.buyer, "/offers"); await pages.buyer.getByText("Audit counteroffer with revised cash terms.", { exact: true }).filter({ visible: true }).waitFor();
    });
    await record("Buyer accepts counteroffer and creates a protected transaction", async () => {
      assert.ok(fixture.counter, "Counteroffer prerequisite");
      await pages.buyer.getByRole("button", { name: "Accept terms", exact: true }).first().click();
      await pages.buyer.waitForURL(/\/trades\//, { timeout: 30_000 });
      fixture.transaction = await db.transaction.findUniqueOrThrow({ where: { offerId: fixture.counter.id } });
      assert.equal(fixture.transaction.status, "awaiting_payment");
      assert.equal((await db.listing.findUniqueOrThrow({ where: { id: fixture.sale } })).status, "pending");
    });
  }
  if (fixture.transaction) {
    await record("Stranger cannot read a trade or open another buyer's checkout", async () => {
      assert.equal((await contexts.stranger.request.get(origin + `/api/trades/${fixture.transaction.legacyTradeId}`)).status(), 404);
      await visit(pages.stranger, `/transactions/${fixture.transaction.id}/pay`);
      await pages.stranger.getByRole("heading", { name: "That page is not on the board", exact: true }).waitFor();
    });
    await record("Checkout blocks payment until seller payout setup exists", async () => {
      await visit(pages.buyer, `/transactions/${fixture.transaction.id}/pay`);
      await pages.buyer.getByText(/seller still needs to complete payout setup/i).filter({ visible: true }).waitFor();
      const response = await contexts.buyer.request.post(origin + "/api/stripe/payment-intent", { headers: { Origin: origin }, data: { transactionId: fixture.transaction.id, idempotencyKey: `audit_${runId}_payment` } });
      assert.equal(response.status(), 409);
    });
  }
  await record("Buyer posts a wanted request through the form", async () => {
    await visit(pages.buyer, "/wanted/new");
    await select(pages.buyer, "#game", "Audit Away at Audit Home");
    await pages.buyer.locator("#quantity-min").fill("2"); await pages.buyer.locator("#quantity-max").fill("2");
    await pages.buyer.locator("#max-budget").fill("400"); await pages.buyer.locator("#offering").fill("Audit wanted request: two adjacent seats.");
    await pages.buyer.getByRole("button", { name: "Post request", exact: true }).click();
    await pages.buyer.waitForURL(origin + "/wanted");
    fixture.wanted = await db.wantedRequest.findFirstOrThrow({ where: { requesterId: users.buyer.id, offeringDescription: "Audit wanted request: two adjacent seats." } });
  });
  if (fixture.wanted) await record("Seller responds to a wanted request", async () => {
    await visit(pages.seller, `/wanted/${fixture.wanted.id}`);
    await pages.seller.getByRole("button", { name: "I have these tickets", exact: true }).click();
    await pages.seller.locator("#fulfill-message").fill("Audit seller can supply the requested adjacent seats.");
    await pages.seller.getByRole("button", { name: "Send message", exact: true }).click();
    await pages.seller.waitForURL(/\/messages\//); fixture.wantedThread = new URL(pages.seller.url()).pathname.split("/").at(-1);
  });
  await record("Seller creates a private fan circle", async () => {
    await visit(pages.seller, "/circles/new"); fixture.circleName = `Audit Circle ${runId}`;
    await pages.seller.locator("#circle-name").fill(fixture.circleName); await pages.seller.locator("#circle-desc").fill("Audit members share tickets inside a private fan group.");
    await pages.seller.getByRole("button", { name: "Create circle", exact: true }).click();
    await pages.seller.waitForURL(url => /^\/circles\/c[a-z0-9]{20,}$/.test(url.pathname)); fixture.circleId = new URL(pages.seller.url()).pathname.split("/").at(-1);
  });
  await record("Buyer updates profile and notification preferences", async () => {
    await visit(pages.buyer, "/settings"); await pages.buyer.locator("#settings-name").fill("Audit Buyer Updated");
    await pages.buyer.locator("#settings-city").fill("Chicago"); await pages.buyer.getByRole("button", { name: "Save profile", exact: true }).click();
    await waitFor(async () => (await db.user.findUniqueOrThrow({ where: { id: users.buyer.id } })).name === "Audit Buyer Updated", "profile update");
    await pages.buyer.getByRole("button", { name: "Save preferences", exact: true }).click();
    await waitFor(() => db.notificationPreference.findUnique({ where: { userId: users.buyer.id } }), "notification preferences");
  });
  await record("Favorite imported teams render on the public profile", async () => {
    await visit(pages.buyer, "/settings");
    await pages.buyer.locator("label").filter({ hasText: "Audit Home" }).getByRole("switch").click();
    await pages.buyer.getByRole("button", { name: "Save profile", exact: true }).click();
    await waitFor(async () => JSON.parse((await db.user.findUniqueOrThrow({ where: { id: users.buyer.id } })).favoriteTeamIds).includes(fixture.event.homeTeamId), "favorite team saved");
    await visit(pages.guest, `/profile/${users.buyer.id}`);
    await pages.guest.getByText("Chicago Audit Home", { exact: true }).filter({ visible: true }).waitFor();
  });
  await record("Circle-only listing remains private to nonmembers", async () => {
    fixture.circleListing = await createListing("seller", `Private ${runId}`, { visibility: "circle" });
    await visit(pages.seller, `/listing/${fixture.circleListing}`);
    await pages.seller.getByText(`Private ${runId}`, { exact: false }).first().waitFor();
    await visit(pages.buyer, `/listing/${fixture.circleListing}`);
    await pages.buyer.getByRole("heading", { name: "That page is not on the board", exact: true }).waitFor();
  });
  await record("Private proof downloads require an administrator", async () => {
    const evidence = await db.ownershipEvidence.findFirstOrThrow({ where: { listingId: fixture.sale } });
    assert.equal((await contexts.guest.request.get(origin + `/api/admin/evidence/${evidence.id}`)).status(), 401);
    assert.equal((await contexts.buyer.request.get(origin + `/api/admin/evidence/${evidence.id}`)).status(), 403);
    const response = await contexts.seller.request.get(origin + `/api/admin/evidence/${evidence.id}`, { maxRedirects: 0 });
    assert.equal(response.status(), 307);
    assert.equal((await contexts.seller.request.get(response.headers().location)).status(), 200);
  });
  await record("Proof confirmation cannot replay and republish an upload", async () => {
    const evidence = await db.ownershipEvidence.findFirstOrThrow({ where: { listingId: fixture.sale } });
    const response = await contexts.seller.request.patch(origin + "/api/evidence", { headers: { Origin: origin }, data: { evidenceId: evidence.id } });
    assert.equal(response.status(), 409);
    assert.equal((await contexts.buyer.request.patch(origin + "/api/evidence", { headers: { Origin: origin }, data: { evidenceId: evidence.id } })).status(), 404);
  });
  await record("Payment and proof APIs reject guests, foreign origins and malformed fields", async () => {
    for (const path of ["/api/stripe/connect", "/api/stripe/payment-intent", "/api/evidence", "/api/admin/events/sync"]) {
      assert.equal((await contexts.guest.request.post(origin + path, { data: {} })).status(), 401);
    }
    assert.equal((await contexts.buyer.request.post(origin + "/api/stripe/payment-intent", { headers: { Origin: "https://untrusted.invalid" }, data: {} })).status(), 403);
    assert.equal((await contexts.buyer.request.post(origin + "/api/stripe/payment-intent", { headers: { Origin: origin }, data: {} })).status(), 400);
    assert.equal((await contexts.buyer.request.post(origin + "/api/admin/events/sync", { headers: { Origin: origin }, data: {} })).status(), 403);
  });
  await record("Two fans publish tickets and agree to a ticket-for-ticket swap", async () => {
    fixture.swapSellerListing = await createListing("seller", `Swap Seller ${runId}`, { type: "trade" });
    fixture.swapBuyerListing = await createListing("buyer", `Swap Buyer ${runId}`, { type: "trade" });
    await visit(pages.buyer, `/offer/${fixture.swapSellerListing}`);
    await pages.buyer.locator("#cash-adjustment").waitFor();
    await pages.buyer.getByRole("button", { name: "Review offer", exact: true }).filter({ visible: true }).click();
    await pages.buyer.getByRole("button", { name: "Send this offer", exact: true }).click();
    await pages.buyer.waitForURL(/\/messages\//);
    const swapOffer = await db.offer.findFirstOrThrow({ where: { listingId: fixture.swapSellerListing, status: "pending" } });
    assert.deepEqual(JSON.parse(swapOffer.offeredListingIds), [fixture.swapBuyerListing]);
    await visit(pages.seller, "/offers");
    await pages.seller.getByRole("button", { name: "Accept terms", exact: true }).first().click();
    await pages.seller.waitForURL(/\/trades\//);
    fixture.swapTransaction = await db.transaction.findUniqueOrThrow({ where: { offerId: swapOffer.id }, include: { transfers: true } });
    assert.equal(fixture.swapTransaction.transfers.length, 2);
    for (const id of [fixture.swapSellerListing, fixture.swapBuyerListing]) assert.equal((await db.listing.findUniqueOrThrow({ where: { id } })).status, "pending");
  });
  await record("Stripe webhook rejects missing and forged signatures", async () => {
    assert.equal((await contexts.guest.request.post(origin + "/api/stripe/webhook", { data: {} })).status(), 400);
    assert.equal((await contexts.guest.request.post(origin + "/api/stripe/webhook", { headers: { "stripe-signature": "forged" }, data: {} })).status(), 400);
  });
  await record("Mobile guest can browse and open account navigation without overflow", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); await visit(page, "/discover");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await page.screenshot({ path: resolve(directory, "mobile-discover.png"), fullPage: true }); await context.close();
  });
  await record("Browser journeys have no uncaught application errors", async () => { assert.deepEqual(pageErrors, []); });
} finally {
  await writeFile(resolve(directory, "fixtures.json"), JSON.stringify(fixture, null, 2));
  await writeFile(resolve(directory, "users.json"), JSON.stringify(users, null, 2));
  for (const [actor, context] of Object.entries(contexts)) await context.storageState({ path: resolve(directory, `${actor}-session.json`) }).catch(() => {});
  await browser.close(); await db.$disconnect();
  const summary = { runId, directory, passed: results.filter(result => result.status === "PASS").length, failed: results.filter(result => result.status === "FAIL").length, cases: results.length };
  await writeFile("artifacts/prod-audit/latest.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  process.exitCode = summary.failed ? 1 : 0;
}
