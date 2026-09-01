import "server-only";

import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
  }
}

export async function requireAdmin() {
  const user = await requireSessionUser();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, accountStatus: true } });
  if (!row || row.role !== "admin" || row.accountStatus !== "active") throw new ForbiddenError();
  return user;
}

export async function requireActiveUser() {
  const user = await requireSessionUser();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { accountStatus: true } });
  if (!row || row.accountStatus !== "active") throw new ForbiddenError("This account cannot perform marketplace actions.");
  return user;
}

export async function assertNotBlocked(userAId: string, userBId: string) {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new ForbiddenError("This interaction is unavailable.");
}
