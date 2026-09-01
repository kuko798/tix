import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please wait and try again.");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(input: {
  scope: string;
  userId?: string;
  limit: number;
  windowSeconds: number;
}) {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const identity = input.userId ?? createHash("sha256").update(ip).digest("hex");
  const key = `${input.scope}:${identity}`;
  const now = new Date();
  const current = await prisma.rateLimitBucket.findUnique({ where: { key } });

  if (!current || current.expiresAt <= now) {
    await prisma.rateLimitBucket.upsert({
      where: { key },
      create: {
        key,
        count: 1,
        windowStart: now,
        expiresAt: new Date(now.getTime() + input.windowSeconds * 1000),
      },
      update: {
        count: 1,
        windowStart: now,
        expiresAt: new Date(now.getTime() + input.windowSeconds * 1000),
      },
    });
    return;
  }

  if (current.count >= input.limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000)));
  }

  await prisma.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
}
