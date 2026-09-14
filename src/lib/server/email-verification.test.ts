import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn(),
  send: vi.fn(), limit: vi.fn(), transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://gameswap.test" } }));
vi.mock("@/lib/server/email", () => ({ sendTransactionalEmail: mocks.send }));
vi.mock("@/lib/server/rate-limit", () => ({ enforceRateLimit: mocks.limit }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  verification: { upsert: mocks.upsert, deleteMany: mocks.deleteMany },
  $transaction: mocks.transaction,
} }));

import { confirmEmailVerification, sendEmailVerification } from "./email-verification";

const token = "a".repeat(64);
const tokenHash = createHash("sha256").update(token).digest("hex");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback) => callback({
    verification: { findFirst: mocks.findFirst, deleteMany: mocks.deleteMany },
    user: { updateMany: mocks.updateMany },
  }));
  mocks.findFirst.mockResolvedValue({
    id: "gameswap-email-verification:user-1",
    identifier: JSON.stringify({ userId: "user-1", email: "fan@example.com" }),
  });
  mocks.deleteMany.mockResolvedValue({ count: 1 });
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("in-house email verification", () => {
  it("emails a random token while storing only its hash, and replaces the user's prior link", async () => {
    await sendEmailVerification({ id: "user-1", email: "fan@example.com" });
    const text = mocks.send.mock.calls[0][0].text as string;
    const url = new URL(text.split("\n")[0].replace("Verify your GameSwap email address: ", ""));
    const issuedToken = url.searchParams.get("token")!;
    expect(url.origin + url.pathname).toBe("https://gameswap.test/verify-email");
    expect(issuedToken).toMatch(/^[a-f0-9]{64}$/);
    const stored = mocks.upsert.mock.calls[0][0];
    expect(stored.where.id).toBe("gameswap-email-verification:user-1");
    expect(stored.create.value).toBe(createHash("sha256").update(issuedToken).digest("hex"));
    expect(JSON.stringify(stored)).not.toContain(issuedToken);
    expect(stored.create.expiresAt.getTime() - Date.now()).toBeGreaterThan(3590_000);
    expect(stored.update.value).toBe(stored.create.value);
  });

  it("enforces resend limits before issuing or sending a token", async () => {
    mocks.limit.mockRejectedValueOnce(new Error("Too many requests"));
    await expect(sendEmailVerification({ id: "user-1", email: "fan@example.com" })).rejects.toThrow("Too many requests");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("removes only the failed send's token without deleting a newer resend", async () => {
    mocks.send.mockRejectedValueOnce(new Error("SMTP unavailable"));
    await expect(sendEmailVerification({ id: "user-1", email: "fan@example.com" })).rejects.toThrow("SMTP unavailable");
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: {
      id: "gameswap-email-verification:user-1", value: mocks.upsert.mock.calls[0][0].create.value,
    } });
  });

  it("rejects malformed tokens before accessing the database", async () => {
    expect(await confirmEmailVerification("invalid")).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires an unexpired token and verifies only the bound user and email", async () => {
    expect(await confirmEmailVerification(token)).toBe(true);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: {
      id: { startsWith: "gameswap-email-verification:" }, value: tokenHash, expiresAt: { gt: expect.any(Date) },
    } });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1", email: "fan@example.com", emailVerified: false }, data: { emailVerified: true },
    });
  });

  it("rejects expired, replaced, and previously consumed links", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    expect(await confirmEmailVerification(token)).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not verify when another request already consumed the link", async () => {
    mocks.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await confirmEmailVerification(token)).toBe(false);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a link when the account email changed or the account was deleted", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await confirmEmailVerification(token)).toBe(false);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
