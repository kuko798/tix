import { chromium } from "playwright";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const baseURL = process.env.VISUAL_AUDIT_URL ?? "http://localhost:3000";
const email = "visual-audit@local.gameswap";
const password = "VisualAuditOnly!2026";
const publicRoutes = ["/", "/discover", "/wanted", "/login", "/signup"];
const accountRoutes = ["/list", "/wanted/new", "/offers", "/trades", "/messages", "/profile", "/settings", "/season", "/circles"];
const tailOnly = process.env.VISUAL_AUDIT_TAIL === "1";
const prisma = new PrismaClient();

async function cleanAuditUser() {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.account.deleteMany({ where: { userId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
}

function filename(route, device) {
  const slug = route === "/" ? "home" : route.slice(1).replaceAll("/", "-");
  return `artifacts/ui-audit/final-${slug}-${device}.png`;
}

async function revealPage(page) {
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const step = Math.max(500, window.innerHeight * 0.75);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
}

async function capture(page, routes, device) {
  for (const route of routes) {
    await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(900);
    await page.getByText("Loading the event catalog...").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    await page.getByText("Searching...").waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    if (routes === accountRoutes) {
      await page.getByText("Sign in", { exact: true }).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    }
    await revealPage(page);
    await page.screenshot({ path: filename(route, device), fullPage: true });
  }
}

const browser = await chromium.launch();
await cleanAuditUser();
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" });
const page = await desktop.newPage();
page.on("requestfailed", (request) => console.error("request failed", request.url(), request.failure()?.errorText));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("hydrated")) console.error("browser", message.text());
});
if (!tailOnly) await capture(page, publicRoutes, "desktop");

const signup = await desktop.request.post(`${baseURL}/api/auth/sign-up/email`, {
  data: { name: "Visual Audit", email, password },
});
if (!signup.ok()) throw new Error(`Audit account signup failed with ${signup.status()}`);
if (!tailOnly) await capture(page, accountRoutes, "desktop");

const storage = await desktop.storageState();
await desktop.close();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
  storageState: storage,
  isMobile: true,
  hasTouch: true,
});
const mobilePage = await mobile.newPage();
await capture(mobilePage, tailOnly ? ["/settings", "/season", "/circles"] : [...publicRoutes, ...accountRoutes], "mobile");
await mobile.close();
await browser.close();
await cleanAuditUser();
await prisma.$disconnect();

console.log(JSON.stringify({ email, screenshots: tailOnly ? 3 : (publicRoutes.length + accountRoutes.length) * 2 }));
