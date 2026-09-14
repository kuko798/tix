import { readFile, readdir } from "node:fs/promises";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import Stripe from "stripe";
import { S3Client, GetPublicAccessBlockCommand, GetBucketEncryptionCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

Object.assign(process.env, parse(await readFile(".env", "utf8")), { NODE_ENV: "production", APP_MODE: "live" });
let env;
try { const { environmentSchema } = await import("../src/lib/server/env-schema.ts"); const parsed = environmentSchema.safeParse(process.env); if (!parsed.success) throw new Error("Invalid live environment: " + parsed.error.issues.map(issue => issue.path.join(".") + ": " + issue.message).join(", ")); env = parsed.data; }
catch (error) { console.error(error instanceof Error ? error.message : "Live environment validation failed."); process.exit(1); }
const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ready: true }); console.log(`PASS ${name}`); }
  catch { results.push({ name, ready: false }); console.log(`FAIL ${name}: configuration or connectivity needs attention.`); }
}
await check("PostgreSQL connection and deployed migrations", async () => {
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set("connect_timeout", "5"); url.searchParams.set("connection_limit", "1"); url.searchParams.set("pool_timeout", "5");
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  try {
    const rows = await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const expected = (await readdir("prisma/migrations", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
    if (expected.some(name => !rows.some(row => row.migration_name === name))) throw new Error("Pending migrations");
  } finally { await db.$disconnect(); }
});
await check("Authenticated SMTP connection", async () => {
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE === "true", requireTLS: env.SMTP_SECURE !== "true", auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000 });
  try { await transport.verify(); } finally { transport.close(); }
});
await check("Private bucket, encryption and upload CORS", async () => {
  const client = new S3Client({ region: env.S3_REGION, endpoint: env.S3_ENDPOINT || undefined, forcePathStyle: Boolean(env.S3_ENDPOINT), credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } });
  try {
    const block = await client.send(new GetPublicAccessBlockCommand({ Bucket: env.S3_BUCKET }));
    if (!["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"].every(key => block.PublicAccessBlockConfiguration?.[key] === true)) throw new Error("Public access allowed");
    const encryption = await client.send(new GetBucketEncryptionCommand({ Bucket: env.S3_BUCKET }));
    if (!encryption.ServerSideEncryptionConfiguration?.Rules?.length) throw new Error("Missing encryption");
    const cors = await client.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }));
    const origin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
    if (!cors.CORSRules?.some(rule => rule.AllowedOrigins?.includes(origin) && rule.AllowedMethods?.includes("PUT") && rule.AllowedHeaders?.some(header => header === "*" || header.toLowerCase() === "content-type"))) throw new Error("Missing upload CORS");
  } finally { client.destroy(); }
});
await check("Live Stripe platform and webhook subscriptions", async () => {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { timeout: 15000, maxNetworkRetries: 0 });
  const account = await stripe.accounts.retrieve();
  if (!account.charges_enabled || !account.payouts_enabled) throw new Error("Platform not activated");
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const required = ["payment_intent.amount_capturable_updated", "payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled", "charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"];
  const url = `${new URL(env.NEXT_PUBLIC_APP_URL).origin}/api/stripe/webhook`;
  if (!endpoints.data.some(endpoint => endpoint.livemode && endpoint.status === "enabled" && endpoint.url === url && required.every(event => endpoint.enabled_events.includes("*") || endpoint.enabled_events.includes(event)))) throw new Error("Missing webhook subscriptions");
});
await check("Deployed HTTPS site", async () => {
  const response = await fetch(env.NEXT_PUBLIC_APP_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.url.startsWith("https://")) throw new Error("Site unavailable");
});
console.log("Read-only checks do not prove inbox delivery, matching deployed webhook secrets, seller onboarding or scheduler execution. Complete those deployment journeys before launch.");
process.exitCode = results.some(result => !result.ready) ? 1 : 0;
