import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/server/env";
import { sendTransactionalEmail } from "@/lib/server/email";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const prefix = "gameswap-email-verification:";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function sendEmailVerification(user: { id: string; email: string }) {
  await enforceRateLimit({ scope: "email-verification-target", userId: user.id, limit: 5, windowSeconds: 3600 });
  const token = randomBytes(32).toString("hex");
  const id = `${prefix}${user.id}`;
  const value = hash(token);
  const data = {
    identifier: JSON.stringify({ userId: user.id, email: user.email }),
    value,
    expiresAt: new Date(Date.now() + 3600_000),
    updatedAt: new Date(),
  };
  // One record per user: resending replaces the previous link.
  await prisma.verification.upsert({
    where: { id },
    create: { id, ...data, createdAt: new Date() },
    update: data,
  });
  const url = new URL("/verify-email", env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("token", token);
  try {
    await sendTransactionalEmail({
      to: user.email,
      subject: "Verify your GameSwap email",
      text: `Verify your GameSwap email address: ${url}\n\nThis link can be used once and expires in one hour. If you did not request it, ignore this email.`,
    });
  } catch (error) {
    await prisma.verification.deleteMany({ where: { id, value } });
    throw error;
  }
}

class InvalidVerification extends Error {}

export async function confirmEmailVerification(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const value = hash(token);
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const record = await tx.verification.findFirst({
        where: { id: { startsWith: prefix }, value, expiresAt: { gt: now } },
      });
      if (!record) return false;
      const { userId, email } = JSON.parse(record.identifier) as { userId: string; email: string };
      // Claim atomically so concurrent confirmations cannot reuse a link.
      const consumed = await tx.verification.deleteMany({ where: { id: record.id, value, expiresAt: { gt: now } } });
      if (consumed.count !== 1) throw new InvalidVerification();
      const updated = await tx.user.updateMany({
        where: { id: userId, email, emailVerified: false },
        data: { emailVerified: true },
      });
      if (updated.count !== 1) throw new InvalidVerification();
      return true;
    });
  } catch (error) {
    if (error instanceof InvalidVerification) return false;
    throw error;
  }
}
