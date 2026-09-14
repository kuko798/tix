import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import { resolve } from "node:path";
import tls from "node:tls";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";

// An isolated real HTTP/SMTP/database check; no external emails or API keys.
const root = process.cwd();
const directory = resolve(root, "artifacts", `email-flow-${Date.now()}`);
await mkdir(directory, { recursive: true });
const prismaCli = resolve(root, "node_modules/prisma/build/index.js");
const schemaPath = resolve(directory, "schema.prisma");
const clientPath = resolve(root, "node_modules/.prisma/client");
const clientBackupPath = resolve(directory, "client-backup");
await cp(clientPath, clientBackupPath, { recursive: true });
await writeFile(schemaPath, (await readFile(resolve(root, "prisma/schema.prisma"), "utf8")).replace('provider = "postgresql"', 'provider = "sqlite"'));
const databasePath = resolve(directory, "check.db");
const env = {
  ...process.env,
  NODE_ENV: "development", DATABASE_URL: "file:./check.db",
  DIRECT_URL: "", BETTER_AUTH_SECRET: "isolated-email-test-secret-32-characters",
  EMAIL_DELIVERY_ENABLED: "true", NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION: "true",
  EMAIL_PROVIDER: "smtp", RESEND_API_KEY: "", EMAIL_FROM: "GameSwap <verify@gameswap.test>",
  SMTP_HOST: "localhost", SMTP_SECURE: "true", SMTP_USER: "smtp-check", SMTP_PASSWORD: "smtp-test-only",
};

async function command(binary, args, commandEnv = env) {
  await new Promise((done, fail) => {
    const child = spawn(binary, args, { cwd: root, env: commandEnv, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", fail);
    child.on("exit", (code) => code === 0 ? done() : fail(new Error(`Command failed (${code}): ${output}`)));
  });
}

const certPath = resolve(directory, "smtp-cert.pem");
const keyPath = resolve(directory, "smtp-key.pem");
const openssl = process.env.EMAIL_CHECK_OPENSSL || (process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
await command(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"]);
env.NODE_EXTRA_CA_CERTS = certPath;
const messages = [];
const sockets = new Set();
let rejectRecipients = false;
const smtp = tls.createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => {});
  socket.write("220 localhost isolated SMTP check\r\n");
  let buffered = "";
  let data = null;
  let authenticated = false;
  socket.on("data", (chunk) => {
    buffered += chunk.toString();
    while (buffered.includes("\r\n")) {
      const index = buffered.indexOf("\r\n");
      const line = buffered.slice(0, index);
      buffered = buffered.slice(index + 2);
      if (data !== null) {
        if (line !== ".") data.push(line.replace(/^\.\./, "."));
        else {
          messages.push(data.join("\r\n").replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
          data = null;
          socket.write("250 Message accepted\r\n");
        }
      } else if (/^EHLO /i.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
      else if (/^AUTH PLAIN /i.test(line)) {
        authenticated = Buffer.from(line.slice(11), "base64").toString() === "\0smtp-check\0smtp-test-only";
        socket.write(authenticated ? "235 Authentication successful\r\n" : "535 Authentication failed\r\n");
      } else if (!authenticated) socket.write("530 Authenticate first\r\n");
      else if (/^MAIL FROM:/i.test(line)) socket.write("250 Sender accepted\r\n");
      else if (/^RCPT TO:/i.test(line)) socket.write(rejectRecipients ? "550 Recipient rejected for test\r\n" : "250 Recipient accepted\r\n");
      else if (line === "DATA") { data = []; socket.write("354 End with a dot\r\n"); }
      else if (line === "QUIT") socket.end("221 Goodbye\r\n");
      else if (line === "RSET") socket.write("250 Reset\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
await new Promise((done) => smtp.listen(0, "localhost", done));
env.SMTP_PORT = String(smtp.address().port);
const reservation = net.createServer();
await new Promise((done) => reservation.listen(0, "localhost", done));
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const origin = `http://localhost:${port}`;
env.BETTER_AUTH_URL = origin;
env.NEXT_PUBLIC_APP_URL = origin;
let next;
let browser;
let db;
let logs = "";
let clientChanged = false;

try {
  console.log("Preparing isolated SQLite database and trusted local TLS SMTP server...");
  const emptyDatabase = new DatabaseSync(databasePath);
  emptyDatabase.exec("PRAGMA user_version = 1");
  emptyDatabase.close();
  clientChanged = true;
  await command(process.execPath, [prismaCli, "generate", "--schema", schemaPath]);
  await command(process.execPath, [prismaCli, "db", "push", "--schema", schemaPath, "--skip-generate"]);
  db = new DatabaseSync(databasePath);
  next = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--port", String(port), "--hostname", "localhost"], { cwd: root, env, windowsHide: true });
  next.stdout.on("data", (chunk) => { logs += chunk; });
  next.stderr.on("data", (chunk) => { logs += chunk; });
  await new Promise((done, fail) => {
    const timer = setTimeout(() => { clearInterval(interval); fail(new Error("Next startup timed out")); }, 120_000);
    const interval = setInterval(() => {
      if (logs.includes("Ready in")) { clearInterval(interval); clearTimeout(timer); done(); }
      else if (next.exitCode !== null) { clearInterval(interval); clearTimeout(timer); fail(new Error("Next exited during startup")); }
    }, 200);
  });

  async function post(path, body, requestOrigin = origin) {
    const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: requestOrigin }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {}, cookie: response.headers.get("set-cookie") };
  }
  const email = "fan@gameswap.test";
  const password = "Email-check-password-2026";
  const signup = await post("/api/auth/sign-up/email", { name: "SMTP Test Fan", email, password });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  assert.equal(messages.length, 1, "Signup must deliver an actual SMTP message");
  const issuedToken = () => messages.at(-1).match(/token=([a-f0-9]{64})/)?.[1];
  const first = issuedToken();
  assert.ok(first, "Delivered message must contain our verification link");
  const user = () => db.prepare('SELECT * FROM "User" WHERE email = ?').get(email);
  const record = () => db.prepare('SELECT * FROM "Verification" WHERE id = ?').get(`gameswap-email-verification:${user().id}`);
  assert.equal(user().emailVerified, 0);
  assert.equal(record().value, createHash("sha256").update(first).digest("hex"));
  console.log("PASS signup delivers through authenticated TLS SMTP; database stores only a token hash");

  const blocked = await post("/api/auth/sign-in/email", { email, password });
  assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");
  assert.equal(blocked.body.token, undefined);
  const second = issuedToken();
  assert.notEqual(second, first);
  console.log("PASS unverified sign-in is blocked and sends a replacement verification link");

  assert.equal((await post("/api/email-verification/confirm", { token: first })).status, 400);
  assert.equal((await post("/api/email-verification/confirm", { token: second }, "https://foreign.test")).status, 403);
  assert.equal(user().emailVerified, 0);
  assert.equal((await fetch(`${origin}/api/auth/verify-email?token=${second}`)).status, 404);
  console.log("PASS superseded links, foreign origins, and the library verification endpoint are rejected");

  // Opening a link must leave the token intact; mail scanners cannot verify accounts.
  assert.equal((await fetch(`${origin}/verify-email?token=${second}`, { signal: AbortSignal.timeout(180_000) })).status, 200);
  assert.equal(user().emailVerified, 0);
  assert.ok(record());
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${origin}/verify-email?token=${second}`, { waitUntil: "networkidle", timeout: 120_000 });
  assert.equal(user().emailVerified, 0);
  const confirmationResponse = page.waitForResponse((response) => response.url().endsWith("/api/email-verification/confirm") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm email", exact: true }).click();
  const confirm = await confirmationResponse;
  assert.equal(confirm.status(), 200, JSON.stringify(await confirm.json()));
  await page.getByText("Your email is verified. You can now sign in.", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("token"), false);
  await page.screenshot({ path: resolve(directory, "confirmation.png") });
  await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
  await page.waitForURL(`${origin}/login`, { timeout: 120_000 });
  assert.equal(user().emailVerified, 1);
  assert.equal(record(), undefined);
  assert.equal((await post("/api/email-verification/confirm", { token: second })).status, 400);
  const signedIn = await post("/api/auth/sign-in/email", { email, password });
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
  assert.ok(signedIn.body.token);
  assert.ok(signedIn.cookie?.includes("session_token"));
  console.log("PASS opening a link does not consume it; confirmation verifies once; subsequent sign-in creates a session");

  await page.goto(`${origin}/forgot-password`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.locator("#reset-email").fill(email);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await page.getByText("Check your inbox and spam folder.", { exact: false }).waitFor();
  const resetLink = messages.at(-1).match(/https?:\/\/[^\s<>]+/)?.[0];
  assert.ok(resetLink?.includes("reset-password"), "Password recovery must deliver a real SMTP link");
  await page.goto(resetLink, { waitUntil: "networkidle", timeout: 120_000 });
  const resetToken = new URL(page.url()).searchParams.get("token");
  const newPassword = "Changed-email-check-password-2026";
  await page.locator("#new-password").fill(newPassword);
  await page.locator("#confirm-password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await page.waitForURL(`${origin}/login`, { timeout: 120_000 });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM "Session" WHERE "userId" = ?').get(user().id).count, 0, "Recovery must revoke existing sessions");
  assert.equal((await post("/api/auth/reset-password", { token: resetToken, newPassword })).status, 400);
  assert.equal((await post("/api/auth/sign-in/email", { email, password })).status, 401);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(url => url.pathname !== "/login", { timeout: 120_000 });
  console.log("PASS password recovery delivers SMTP mail, resets through the browser, rejects token reuse and old password, revokes sessions and permits the new password");

  // Exercise expiration and exact-email binding through real database writes and HTTP.
  db.prepare('UPDATE "User" SET "emailVerified" = 0 WHERE email = ?').run(email);
  assert.equal((await post("/api/auth/send-verification-email", { email })).status, 200);
  const expired = issuedToken();
  db.prepare('UPDATE "Verification" SET "expiresAt" = ? WHERE id = ?').run(Date.now() - 1000, record().id);
  assert.equal((await post("/api/email-verification/confirm", { token: expired })).status, 400);
  assert.equal(user().emailVerified, 0);
  assert.equal((await post("/api/auth/send-verification-email", { email })).status, 200);
  const changed = issuedToken();
  const userId = user().id;
  db.prepare('UPDATE "User" SET email = ? WHERE id = ?').run("changed@gameswap.test", userId);
  assert.equal((await post("/api/email-verification/confirm", { token: changed })).status, 400);
  assert.equal(db.prepare('SELECT "emailVerified" FROM "User" WHERE id = ?').get(userId).emailVerified, 0);
  db.prepare('UPDATE "User" SET email = ? WHERE id = ?').run(email, userId);
  console.log("PASS expired links and links issued for an old email cannot verify the account");

  rejectRecipients = true;
  const count = messages.length;
  const failedDelivery = await post("/api/auth/send-verification-email", { email });
  assert.equal(failedDelivery.status, 503, JSON.stringify(failedDelivery.body));
  assert.ok(failedDelivery.body.message);
  assert.equal(messages.length, count);
  assert.equal(record(), undefined);
  console.log("PASS SMTP rejection is reported and the failed token is removed");
  rejectRecipients = false;
  const limited = await post("/api/auth/send-verification-email", { email });
  assert.equal(limited.status, 429, JSON.stringify(limited.body));
  assert.ok(limited.body.message);
  assert.equal(messages.length, count);
  console.log("PASS resend limit prevents additional mail");
  console.log("Email verification flow confirmed locally without an email-provider API key.");
} catch (error) {
  await writeFile(resolve(directory, "next.log"), logs);
  console.error(`Diagnostic log: ${resolve(directory, "next.log")}`);
  throw error;
} finally {
  await browser?.close();
  db?.close();
  if (next && next.exitCode === null) {
    const exited = new Promise((done) => next.once("exit", done));
    if (process.platform === "win32") await command("taskkill", ["/PID", String(next.pid), "/T", "/F"]).catch(() => {});
    else next.kill("SIGTERM");
    await exited;
  }
  for (const socket of sockets) socket.destroy();
  await new Promise((done) => smtp.close(done));
  if (clientChanged) await cp(clientBackupPath, clientPath, {
    recursive: true, force: true,
    // Windows can keep the unchanged native engine loaded briefly after exit.
    // Preserve identical files rather than unlinking a locked engine DLL.
    filter: async (source, destination) => {
      if (!(await stat(source)).isFile()) return true;
      try { return !(await readFile(source)).equals(await readFile(destination)); }
      catch (error) { if (error.code === "ENOENT") return true; throw error; }
    },
  });
}
