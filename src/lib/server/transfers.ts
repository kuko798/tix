import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server/policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { getStripe } from "@/lib/server/stripe";
import { transferActionForUser } from "@/lib/domain/marketplace";

type HistoryEntry = { stage: string; completedAt?: string; actorUserId?: string };

export async function advanceTradeSafely(rawTradeId: unknown) {
  const user = await requireActiveUser();
  const tradeId = z.string().cuid().parse(rawTradeId);
  await enforceRateLimit({ scope: "transfer-status", userId: user.id, limit: 30, windowSeconds: 3600 });
  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, OR: [{ userAId: user.id }, { userBId: user.id }] },
    include: { transaction: { include: { transfers: { orderBy: { createdAt: "asc" } } } } },
  });
  if (!trade?.transaction) throw new Error("This trade predates protected payments and cannot advance automatically.");
  const transaction = trade.transaction;
  if (["cancelled", "refunded", "disputed", "completed"].includes(transaction.status)) {
    throw new Error("This transaction cannot be advanced.");
  }
  const history = JSON.parse(trade.history) as HistoryEntry[];
  const now = new Date();
  const entry = (stage: string): HistoryEntry => ({ stage, completedAt: now.toISOString(), actorUserId: user.id });

  if (trade.stage === "offer_accepted") {
    if (transaction.status !== "payment_authorized") {
      throw new Error("Payment or the refundable deposit must be authorized before tickets move.");
    }
    const first = transaction.transfers[0];
    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        stage: "deposits_authorized",
        history: JSON.stringify([...history, entry("deposits_authorized")]),
        waitingOnUserId: first.senderId,
      },
    });
    return { stage: "deposits_authorized" };
  }

  const currentTransfer = transaction.transfers.find((transfer) => transfer.status !== "transfer_accepted");
  if (!currentTransfer) throw new Error("All ticket transfers are already accepted.");
  const action = transferActionForUser(currentTransfer, user.id);

  if (action === "initiate") {
    await prisma.$transaction([
      prisma.ticketTransfer.update({
        where: { id: currentTransfer.id },
        data: { status: "transfer_initiated", initiatedAt: now },
      }),
      prisma.trade.update({
        where: { id: trade.id },
        data: {
          stage: trade.stage === "deposits_authorized" ? "transfer_initiated_a" : "transfer_initiated_b",
          history: JSON.stringify([...history, entry(trade.stage === "deposits_authorized" ? "transfer_initiated_a" : "transfer_initiated_b")]),
          waitingOnUserId: currentTransfer.recipientId,
        },
      }),
    ]);
    await audit({ actorUserId: user.id, action: "transfer.initiated", entityType: "ticketTransfer", entityId: currentTransfer.id });
    return { stage: trade.stage === "deposits_authorized" ? "transfer_initiated_a" : "transfer_initiated_b" };
  }

  await prisma.ticketTransfer.update({
    where: { id: currentTransfer.id },
    data: { status: "transfer_accepted", acceptedAt: now, confirmedAt: now },
  });
  const remaining = transaction.transfers.filter((transfer) => transfer.id !== currentTransfer.id && transfer.status !== "transfer_accepted");
  if (remaining.length) {
    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        stage: "transfer_initiated_a",
        history: JSON.stringify([...history, entry("tickets_accepted")]),
        waitingOnUserId: remaining[0].senderId,
      },
    });
    return { stage: "transfer_initiated_a" };
  }

  if (!transaction.stripePaymentIntentId) throw new Error("Payment authorization is missing.");
  await prisma.transaction.update({ where: { id: transaction.id }, data: { status: "capture_pending" } });
  try {
    await getStripe().paymentIntents.capture(transaction.stripePaymentIntentId, {}, { idempotencyKey: `capture_${transaction.id}` });
  } catch (error) {
    await prisma.transaction.update({ where: { id: transaction.id }, data: { status: "payment_authorized" } });
    throw error;
  }
  await prisma.trade.update({
    where: { id: trade.id },
    data: {
      stage: "tickets_accepted",
      history: JSON.stringify([...history, entry("tickets_accepted")]),
      waitingOnUserId: null,
    },
  });
  await audit({ actorUserId: user.id, action: "transfer.accepted", entityType: "transaction", entityId: transaction.id });
  return { stage: "tickets_accepted" };
}
