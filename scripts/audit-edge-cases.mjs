import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const origin = process.env.AUDIT_URL ?? "http://localhost:3111";
const configuration = JSON.parse(await readFile("artifacts/prod-audit/database.json", "utf8"));
for (const url of [origin, configuration.url]) assert.match(new URL(url).hostname, /^(localhost|127\.0\.0\.1)$/, "Local audit services required");
const { directory } = JSON.parse(await readFile("artifacts/prod-audit/latest.json", "utf8"));
const fixture = JSON.parse(await readFile(resolve(directory, "fixtures.json"), "utf8"));
const users = JSON.parse(await readFile(resolve(directory, "users.json"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: configuration.url } } });
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: resolve(directory, "buyer-session.json") });
const page = await context.newPage();
const privateListing = await db.listing.findUniqueOrThrow({ where: { id: fixture.circleListing } });
assert.ok(privateListing.circleId, "Use the actual persisted circle behind the private listing.");
fixture.circleId = privateListing.circleId;
await writeFile(resolve(directory, "fixtures.json"), JSON.stringify(fixture, null, 2));
const results = [];
async function record(name, check) {
  try { await check(); results.push({ name, status: "PASS" }); console.log("PASS " + name); }
  catch (error) { results.push({ name, status: "FAIL", error: error.message }); console.log("FAIL " + name + ": " + error.message.slice(0, 160)); await page.screenshot({ path: resolve(directory, `edge-${results.length}.png`), fullPage: true }); }
  await writeFile(resolve(directory, "edge-results.json"), JSON.stringify(results, null, 2));
}
try {
  await record("An unrelated fan cannot self-join an advertised private circle", async () => {
    try {
      await db.circleMember.deleteMany({ where: { circleId: fixture.circleId, userId: users.buyer.id } });
      await db.circleJoinRequest.deleteMany({ where: { circleId: fixture.circleId, userId: users.buyer.id } });
      await page.goto(origin + `/circles/${fixture.circleId}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Request to join", exact: true }).click();
      await page.waitForTimeout(1000);
      const membership = await db.circleMember.findUnique({ where: { circleId_userId: { circleId: fixture.circleId, userId: users.buyer.id } } });
      assert.equal((await db.circleJoinRequest.findUniqueOrThrow({ where: { circleId_userId: { circleId: fixture.circleId, userId: users.buyer.id } } })).status, "pending");
      if (membership) await page.goto(origin + `/listing/${fixture.circleListing}`, { waitUntil: "networkidle" });
      assert.equal(membership, null, "Private circle accepted an uninvited fan and unlocked its shared listings.");
    } finally { await db.circleMember.deleteMany({ where: { circleId: fixture.circleId, userId: users.buyer.id } }); await db.circleJoinRequest.deleteMany({ where: { circleId: fixture.circleId, userId: users.buyer.id } }); }
  });
  await record("Circle detail supports a favorite team from the persisted catalog", async () => {
    const circle = await db.circle.findUniqueOrThrow({ where: { id: fixture.circleId } });
    try {
      await db.circle.update({ where: { id: circle.id }, data: { favoriteTeamId: fixture.event.homeTeamId } });
      const response = await page.goto(origin + `/circles/${circle.id}`, { waitUntil: "networkidle" });
      assert.ok(response.status() < 500, `Circle returned HTTP ${response.status()} for a persisted favorite team.`);
      assert.doesNotMatch(await page.locator("body").innerText(), /Something went wrong|Application error|Try again/i);
      assert.ok(await page.getByRole("img", { name: /Audit Home/ }).count(), "Persisted team crest is available.");
    } finally { await db.circle.update({ where: { id: circle.id }, data: { favoriteTeamId: circle.favoriteTeamId } }); }
  });
  await record("Suspended account cannot mutate payment or evidence APIs", async () => {
    try {
      await db.user.update({ where: { id: users.buyer.id }, data: { accountStatus: "suspended" } });
      for (const path of ["/api/stripe/payment-intent", "/api/evidence"]) assert.equal((await context.request.post(origin + path, { headers: { Origin: origin }, data: {} })).status(), 403);
    } finally { await db.user.update({ where: { id: users.buyer.id }, data: { accountStatus: "active" } }); }
  });
} finally {
  await browser.close(); await db.$disconnect();
  console.log(JSON.stringify({ passed: results.filter(result => result.status === "PASS").length, failed: results.filter(result => result.status === "FAIL").length }));
  process.exitCode = results.some(result => result.status === "FAIL") ? 1 : 0;
}
