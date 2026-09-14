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
  await prisma.rateLimitBucket.upsert({
      where: { key },
      create: {
        key,
        count: 0,
        windowStart: now,
        expiresAt: new Date(now.getTime() + input.windowSeconds * 1000),
      },
      update: { key },
    });
  await prisma.rateLimitBucket.updateMany({
    where: { key, expiresAt: { lte: now } },
    data: { count: 0, windowStart: now, expiresAt: new Date(now.getTime() + input.windowSeconds * 1000) },
  });
  const consumed = await prisma.rateLimitBucket.updateMany({
    where: { key, expiresAt: { gt: now }, count: { lt: input.limit } },
    data: { count: { increment: 1 } },
  });
  if (!consumed.count) {
    const current = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { key }, select: { expiresAt: true } });
    throw new RateLimitError(Math.max(1, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000)));
  }
}
