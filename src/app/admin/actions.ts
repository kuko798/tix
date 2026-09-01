"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/policy";
import { audit } from "@/lib/server/audit";
import { getStripe } from "@/lib/server/stripe";

const moderationSchema = z.object({
  targetType: z.enum(["report", "evidence", "dispute", "listing", "user", "transaction"]),
  targetId: z.string().cuid(),
  action: z.string().trim().min(2).max(100),
  reason: z.string().trim().min(5).max(1000),
});

export async function moderateAction(rawInput: unknown) {
  const admin = await requireAdmin();
  const input = moderationSchema.parse(rawInput);
  if (input.targetType === "transaction") {
    if (input.action !== "refund") throw new Error("Unsupported transaction action.");
    const transaction = await prisma.transaction.findUnique({ where: { id: input.targetId } });
    if (!transaction?.stripePaymentIntentId) throw new Error("This transaction has no Stripe payment to refund.");
    if (["refunded", "cancelled"].includes(transaction.status)) throw new Error("This transaction is already closed.");
    if (transaction.stripeTransferId) {
      await getStripe().transfers.createReversal(transaction.stripeTransferId, {}, { idempotencyKey: `admin_reversal_${transaction.id}` });
    }
    if (["awaiting_payment", "payment_pending", "payment_authorized"].includes(transaction.status)) {
      await getStripe().paymentIntents.cancel(transaction.stripePaymentIntentId, {}, { idempotencyKey: `admin_cancel_${transaction.id}` });
    } else {
      await getStripe().refunds.create({ payment_intent: transaction.stripePaymentIntentId, metadata: { transactionId: transaction.id, moderationReason: input.reason } }, { idempotencyKey: `admin_refund_${transaction.id}` });
    }
    await prisma.$transaction([
      prisma.transaction.update({ where: { id: transaction.id }, data: { status: "refunded", refundedAt: new Date() } }),
      prisma.listing.update({ where: { id: transaction.listingId }, data: { status: "cancelled", activeFingerprint: null, cancelledAt: new Date() } }),
      prisma.notification.createMany({ data: [transaction.buyerId, transaction.sellerId].map((userId) => ({ userId, type: "payment_refunded", title: "Transaction refunded", body: "Support closed this exchange and initiated the Stripe refund.", urgency: "high", relatedTransactionId: transaction.id, relatedTradeId: transaction.legacyTradeId })) }),
      prisma.moderationAction.create({ data: { moderatorId: admin.id, targetType: input.targetType, targetId: input.targetId, action: input.action, reason: input.reason } }),
    ]);
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
    } else if (input.targetType === "dispute") {
      await tx.dispute.update({
        where: { id: input.targetId },
        data: { status: input.action, resolution: input.reason, resolvedAt: input.action === "resolved" ? new Date() : null, assignedAdminId: admin.id },
      });
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
