import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/server/logger";

export async function audit(input: {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const requestHeaders = await headers();
  const rawIp = requestHeaders.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(rawIp).digest("hex");
  const requestId = requestHeaders.get("x-request-id") ?? randomUUID();
  try {
    await prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId,
        ipHash,
        userAgent: requestHeaders.get("user-agent")?.slice(0, 500),
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });
  } catch (error) {
    logger.error("audit.write_failed", {
      action: input.action,
      entityType: input.entityType,
      message: error instanceof Error ? error.message : "Unknown audit error",
    });
  }
}
