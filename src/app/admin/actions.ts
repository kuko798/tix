"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/policy";
import { audit } from "@/lib/server/audit";
import { getStripe } from "@/lib/server/stripe";

const moderationSchema = z.object({
  targetType: z.enum(["report", "evidence", "dispute", "listing", "user", "transaction"]),
  targetId: z.string().min(1).max(128),
  action: z.string().trim().min(2).max(100),
  reason: z.string().trim().min(5).max(1000),
});

export async function moderateAction(rawInput: unknown) {
  const admin = await requireAdmin();
  const input = moderationSchema.parse(rawInput);
  const allowed: Record<typeof input.targetType, string[]> = {
    report: ["under_review", "resolved", "dismissed"], evidence: ["approved", "rejected"],
    dispute: ["under_review", "resolved"], listing: ["paused", "cancelled"],
    user: ["active", "suspended", "banned"], transaction: ["refund"],
  };
  if (!allowed[input.targetType].includes(input.action)) throw new Error("Unsupported moderation action.");
  if (input.targetType === "transaction") {
    if (input.action !== "refund") throw new Error("Unsupported transaction action.");
    const transaction = await prisma.transaction.findUnique({ where: { id: input.targetId }, include: { offer: { select: { offeredListingIds: true } } } });
    if (!transaction?.stripePaymentIntentId) throw new Error("This transaction has no Stripe payment to refund.");
    const bankDispute = await prisma.dispute.findFirst({ where: { transactionId: transaction.id, providerDisputeId: { not: null }, providerStatus: { notIn: ["won", "lost", "warning_closed"] } } });
    if (bankDispute) throw new Error("Respond to the open bank dispute in Stripe. An additional refund could credit the buyer twice.");
    if (["refunded", "cancelled", "capture_pending"].includes(transaction.status)) throw new Error("This transaction is closed or already processing. Refresh before continuing.");
    const requested = await prisma.moderationAction.findFirst({ where: { targetType: "transaction", targetId: transaction.id, action: "refund_requested" }, orderBy: { createdAt: "desc" } });
    if (transaction.status === "refund_pending" && (requested?.createdAt ?? transaction.createdAt).getTime() > Date.now() - 5 * 60_000) throw new Error("This refund is still processing. Retry after five minutes if it remains pending.");
    const refundReason = requested?.reason ?? input.reason;
    await prisma.$transaction(async tx => {
      const claimed = await tx.transaction.updateMany({ where: { id: transaction.id, status: transaction.status, updatedAt: transaction.updatedAt }, data: { status: "refund_pending" } });
      if (!claimed.count) throw new Error("This transaction changed. Refresh before continuing.");
      if (!requested) await tx.moderationAction.create({ data: { moderatorId: admin.id, targetType: "transaction", targetId: transaction.id, action: "refund_requested", reason: refundReason } });
    });
    try {
    const intent = await getStripe().paymentIntents.retrieve(transaction.stripePaymentIntentId);
    if (transaction.stripeTransferId) {
      const transfer = await getStripe().transfers.retrieve(transaction.stripeTransferId);
      if (transfer.amount_reversed < transfer.amount) await getStripe().transfers.createReversal(transaction.stripeTransferId, { amount: transfer.amount - transfer.amount_reversed }, { idempotencyKey: `admin_reversal_${transaction.id}` });
    }
    if (intent.status !== "succeeded" && intent.status !== "canceled") {
      await getStripe().paymentIntents.cancel(transaction.stripePaymentIntentId, {}, { idempotencyKey: `admin_cancel_${transaction.id}` });
    } else if (intent.status === "succeeded") {
      const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      const charge = chargeId ? await getStripe().charges.retrieve(chargeId) : null;
      if (!charge?.refunded) await getStripe().refunds.create({ payment_intent: transaction.stripePaymentIntentId, metadata: { transactionId: transaction.id, moderationReason: refundReason } }, { idempotencyKey: `admin_refund_${transaction.id}` });
    }
    await prisma.$transaction([
      prisma.transaction.update({ where: { id: transaction.id }, data: { status: "refunded", refundedAt: new Date() } }),
      prisma.listing.updateMany({ where: { id: { in: [transaction.listingId, ...JSON.parse(transaction.offer.offeredListingIds) as string[]] } }, data: { status: "cancelled", activeFingerprint: null, cancelledAt: new Date() } }),
      prisma.trade.updateMany({ where: { id: transaction.legacyTradeId ?? "" }, data: { stage: "cancelled", waitingOnUserId: null } }),
      prisma.dispute.updateMany({ where: { transactionId: transaction.id, status: { not: "resolved" } }, data: { status: "resolved", resolvedAt: new Date(), resolution: input.reason, assignedAdminId: admin.id } }),
      prisma.notification.createMany({ data: [transaction.buyerId, transaction.sellerId].map((userId) => ({ userId, type: "payment_refunded", title: "Transaction refunded", body: "Support closed this exchange and initiated the Stripe refund.", urgency: "high", relatedTransactionId: transaction.id, relatedTradeId: transaction.legacyTradeId })) }),
      prisma.moderationAction.create({ data: { moderatorId: admin.id, targetType: input.targetType, targetId: input.targetId, action: input.action, reason: input.reason } }),
    ]);
    } catch (error) {
      await prisma.transaction.updateMany({ where: { id: transaction.id, status: "refund_pending" }, data: { status: transaction.status } });
      throw error;
    }
    await audit({ actorUserId: admin.id, action: "moderation.refund", entityType: "transaction", entityId: input.targetId });
    revalidatePath("/admin");
    return { success: true };
  }
  await prisma.$transaction(async (tx) => {
    if (input.targetType === "report") {
      await tx.report.update({ where: { id: input.targetId }, data: { status: input.action } });
    } else if (input.targetType === "evidence") {
      const evidence = await tx.ownershipEvidence.update({
        where: { id: input.targetId },
        data: { reviewStatus: input.action, reviewedById: admin.id, reviewedAt: new Date(), rejectionNote: input.action === "rejected" ? input.reason : null },
      });
      if (input.action === "approved") {
        await tx.listing.update({ where: { id: evidence.listingId }, data: { transferReadiness: "evidence_reviewed" } });
      }
      if (input.action === "rejected") await tx.listing.updateMany({ where: { id: evidence.listingId, status: "active" }, data: { status: "paused", activeFingerprint: null, version: { increment: 1 } } });
    } else if (input.targetType === "dispute") {
      const dispute = await tx.dispute.update({
        where: { id: input.targetId },
        data: { status: input.action, resolution: input.reason, resolvedAt: input.action === "resolved" ? new Date() : null, assignedAdminId: admin.id },
      });
      if (input.action === "resolved" && dispute.transactionId) {
        if (dispute.providerDisputeId && !["won", "lost", "warning_closed"].includes(dispute.providerStatus ?? "")) throw new Error("Close the bank dispute in Stripe before resolving this case.");
        const payment = await tx.transaction.findUniqueOrThrow({ where: { id: dispute.transactionId }, include: { transfers: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
        if (payment.status === "disputed") {
          const intent = payment.stripePaymentIntentId ? await getStripe().paymentIntents.retrieve(payment.stripePaymentIntentId) : null;
          const authorized = intent?.status === "requires_capture";
          if (intent?.status === "canceled") throw new Error("The payment authorization was cancelled. Close this exchange using the refund action.");
          if (intent?.status === "succeeded" && !payment.completedAt) throw new Error("The payment was captured unexpectedly. Refund or reconcile it before resolving this case.");
          const current = payment.transfers.find(transfer => transfer.status !== "transfer_accepted");
          await tx.transaction.update({ where: { id: payment.id }, data: { status: payment.completedAt ? "completed" : authorized ? "payment_authorized" : intent ? "payment_pending" : "awaiting_payment" } });
          await tx.trade.update({ where: { id: dispute.tradeId }, data: {
            stage: payment.completedAt ? "completed" : authorized ? current?.status === "transfer_initiated" ? "transfer_initiated_a" : "deposits_authorized" : "offer_accepted",
            waitingOnUserId: payment.completedAt ? null : authorized ? current?.status === "transfer_initiated" ? current.recipientId : current?.senderId ?? payment.buyerId : payment.buyerId,
          } });
        }
      }
    } else if (input.targetType === "listing") {
      await tx.listing.update({ where: { id: input.targetId }, data: { status: input.action, activeFingerprint: input.action === "active" ? undefined : null, version: { increment: 1 } } });
    } else {
      await tx.user.update({ where: { id: input.targetId }, data: { accountStatus: input.action } });
    }
    await tx.moderationAction.create({
      data: { moderatorId: admin.id, targetType: input.targetType, targetId: input.targetId, action: input.action, reason: input.reason },
    });
  });
  await audit({ actorUserId: admin.id, action: `moderation.${input.action}`, entityType: input.targetType, entityId: input.targetId });
  revalidatePath("/admin");
  return { success: true };
}
