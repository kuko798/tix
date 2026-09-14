import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server/policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { getStripe } from "@/lib/server/stripe";
import { transferActionForUser } from "@/lib/domain/marketplace";
import { env } from "@/lib/server/env";

type HistoryEntry = { stage: string; completedAt?: string; actorUserId?: string };

export async function advanceTradeSafely(rawTradeId: unknown) {
  const user = await requireActiveUser();
  const tradeId = z.string().cuid().parse(rawTradeId);
  await enforceRateLimit({ scope: "transfer-status", userId: user.id, limit: 30, windowSeconds: 3600 });
  const result = await prisma.$transaction(async tx => {
    const payment = await tx.transaction.findFirst({ where: { legacyTradeId: tradeId, OR: [{ buyerId: user.id }, { sellerId: user.id }] }, select: { id: true } });
    if (!payment) throw new Error("Protected transaction not found.");
    // Serialize handoffs and the capture claim against disputes and other handoffs.
    if (env.DATABASE_URL.startsWith("file:")) {
      await tx.transaction.update({ where: { id: payment.id }, data: { updatedAt: new Date() } });
    } else {
      await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "id" = ${payment.id} FOR UPDATE`;
    }
    const trade = await tx.trade.findUniqueOrThrow({ where: { id: tradeId }, include: { transaction: { include: { transfers: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } } } });
    const transaction = trade.transaction!;
    if (transaction.status !== "payment_authorized" || trade.stage === "disputed") throw new Error("Payment must be authorized and any dispute resolved before tickets move.");
    if (trade.transferDeadline <= new Date()) throw new Error("The transfer deadline has passed. Contact support.");
    const history = JSON.parse(trade.history) as HistoryEntry[];
    const now = new Date();
    const entry = (stage: string): HistoryEntry => ({ stage, completedAt: now.toISOString(), actorUserId: user.id });
    const current = transaction.transfers.find(transfer => transfer.status !== "transfer_accepted");
    if (trade.stage === "offer_accepted") {
      if (!current) throw new Error("Ticket-transfer information is missing.");
      await tx.trade.update({ where: { id: trade.id }, data: { stage: "deposits_authorized", history: JSON.stringify([...history, entry("deposits_authorized")]), waitingOnUserId: current.senderId } });
      return { stage: "deposits_authorized" };
    }
    if (!current && user.id !== transaction.buyerId) throw new Error("Only the buyer can retry settlement.");
    const action = current ? transferActionForUser(current, user.id) : "accept";
    if (action === "initiate" && current) {
      const stage = trade.stage === "deposits_authorized" ? "transfer_initiated_a" : "transfer_initiated_b";
      await tx.ticketTransfer.update({ where: { id: current.id }, data: { status: "transfer_initiated", initiatedAt: now } });
      await tx.trade.update({ where: { id: trade.id }, data: { stage, history: JSON.stringify([...history, entry(stage)]), waitingOnUserId: current.recipientId } });
      return { stage };
    }
    if (current) await tx.ticketTransfer.update({ where: { id: current.id }, data: { status: "transfer_accepted", acceptedAt: now, confirmedAt: now } });
    const remaining = transaction.transfers.find(transfer => transfer.id !== current?.id && transfer.status !== "transfer_accepted");
    if (remaining) {
      await tx.trade.update({ where: { id: trade.id }, data: { stage: "transfer_initiated_a", history: JSON.stringify([...history, entry("tickets_accepted")]), waitingOnUserId: remaining.senderId } });
      return { stage: "transfer_initiated_a" };
    }
    if (!transaction.stripePaymentIntentId) throw new Error("Payment authorization is missing.");
    await tx.transaction.update({ where: { id: transaction.id }, data: { status: "capture_pending" } });
    await tx.trade.update({ where: { id: trade.id }, data: { stage: "tickets_accepted", history: JSON.stringify([...history, entry("tickets_accepted")]), waitingOnUserId: null } });
    return { stage: "tickets_accepted", captureIntentId: transaction.stripePaymentIntentId, transactionId: transaction.id };
  });
  if ("captureIntentId" in result && result.captureIntentId && result.transactionId) {
    try {
      await getStripe().paymentIntents.capture(result.captureIntentId, {}, { idempotencyKey: `capture_${result.transactionId}` });
    } catch (error) {
      // A timeout can follow a successful capture. Preserve that claim for
      // webhook settlement instead of allowing a second capture attempt.
      const intent = await getStripe().paymentIntents.retrieve(result.captureIntentId).catch(() => null);
      if (intent?.status === "requires_capture") {
        await prisma.$transaction([
          prisma.transaction.updateMany({ where: { id: result.transactionId, status: "capture_pending" }, data: { status: "payment_authorized" } }),
          prisma.trade.updateMany({ where: { id: tradeId, stage: "tickets_accepted" }, data: { waitingOnUserId: user.id } }),
        ]);
      }
      throw error;
    }
  }
  await audit({ actorUserId: user.id, action: `transfer.${result.stage}`, entityType: "trade", entityId: tradeId });
  return { stage: result.stage };
}
