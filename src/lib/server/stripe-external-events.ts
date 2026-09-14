import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/server/stripe";

export async function processExternalStripeEvent(event: Stripe.Event) {
  if (event.type !== "charge.refunded" && !event.type.startsWith("charge.dispute.")) return;
  const stripe = getStripe();
  let dispute: Stripe.Dispute | null = event.type.startsWith("charge.dispute.") ? await stripe.disputes.retrieve((event.data.object as Stripe.Dispute).id) : null;
  const chargeId = dispute ? typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id : (event.data.object as Stripe.Charge).id;
  const charge = await stripe.charges.retrieve(chargeId, { expand: ["refunds"] });
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intentId) return;
  const payment = await prisma.transaction.findUnique({ where: { stripePaymentIntentId: intentId }, include: { offer: { select: { offeredListingIds: true } }, transfers: true, disputes: { select: { providerDisputeId: true, providerStatus: true } } } });
  if (!payment?.legacyTradeId) return;
  if (dispute && ["won", "warning_closed"].includes(dispute.status)) {
    const related = await stripe.disputes.list({ payment_intent: intentId, limit: 100 });
    dispute = related.data.find(row => row.status === "lost") ?? related.data.find(row => !["won", "lost", "warning_closed"].includes(row.status)) ?? dispute;
  }
  const expected = payment.ticketAmountCents + Math.max(0, payment.cashAdjustmentCents) + payment.platformFeeCents + payment.depositAmountCents;
  if (charge.amount !== expected || charge.currency !== payment.currency) throw new Error("External payment does not match the exchange.");
  const fullRefund = charge.refunded && charge.amount_refunded === charge.amount;
  const unexpectedPartialRefund = !dispute && !fullRefund && charge.amount_refunded > 0 && (!charge.refunds?.data.length || charge.refunds.has_more || charge.refunds.data.some(refund => refund.metadata?.reason !== "completed_exchange_deposit_return"));
  if (!dispute && !fullRefund && !unexpectedPartialRefund) return;
  if (!fullRefund && payment.status === "disputed" && (dispute ? payment.disputes.some(row => row.providerDisputeId === dispute.id && row.providerStatus === dispute.status) : unexpectedPartialRefund)) return;
  const lost = dispute?.status === "lost";
  const won = dispute?.status === "won" || dispute?.status === "warning_closed";
  if (won && payment.status === "completed" && payment.disputes.some(row => row.providerDisputeId === dispute!.id && row.providerStatus === dispute!.status)) return;
  if ((fullRefund || lost) && payment.stripeTransferId) {
    const transfer = await stripe.transfers.retrieve(payment.stripeTransferId);
    const remaining = transfer.amount - transfer.amount_reversed;
    if (remaining > 0) await stripe.transfers.createReversal(transfer.id, { amount: remaining }, { idempotencyKey: `external_reversal_${payment.id}_${dispute?.id ?? "refund"}` });
  }
  const now = new Date();
  await prisma.$transaction(async tx => {
    const fresh = await tx.transaction.findUniqueOrThrow({ where: { id: payment.id } });
    if (fullRefund || lost) {
      if (["refunded", "cancelled"].includes(fresh.status)) return;
      await tx.transaction.update({ where: { id: payment.id }, data: { status: "refunded", refundedAt: now } });
      await tx.trade.update({ where: { id: payment.legacyTradeId! }, data: { stage: "cancelled", waitingOnUserId: null } });
      await tx.listing.updateMany({ where: { id: { in: [payment.listingId, ...JSON.parse(payment.offer.offeredListingIds) as string[]] } }, data: { status: "cancelled", activeFingerprint: null, cancelledAt: now } });
      await tx.dispute.updateMany({ where: { transactionId: payment.id }, data: { status: "resolved", resolvedAt: now, providerStatus: dispute?.status, resolution: lost ? "Stripe reports the bank dispute was lost; seller funds were reversed." : "Stripe reports this charge was fully refunded." } });
    } else if (won) {
      await tx.dispute.updateMany({ where: { transactionId: payment.id, providerDisputeId: dispute!.id }, data: { providerStatus: dispute!.status } });
      // Support reviews the ticket handoff before resuming an unfinished exchange.
      if (fresh.completedAt && fresh.status === "disputed") {
        await tx.transaction.update({ where: { id: payment.id }, data: { status: "completed" } });
        await tx.trade.update({ where: { id: payment.legacyTradeId! }, data: { stage: "completed", waitingOnUserId: null } });
        await tx.dispute.updateMany({ where: { transactionId: payment.id, providerDisputeId: dispute!.id }, data: { status: "resolved", resolvedAt: now, resolution: "Stripe reports the bank dispute was closed in the platform's favor." } });
      }
    } else {
      if (["refunded", "cancelled", "refund_pending"].includes(fresh.status)) return;
      await tx.transaction.update({ where: { id: payment.id }, data: { status: "disputed" } });
      await tx.trade.update({ where: { id: payment.legacyTradeId! }, data: { stage: "disputed", waitingOnUserId: null } });
      await tx.dispute.upsert({ where: { tradeId: payment.legacyTradeId! }, create: { tradeId: payment.legacyTradeId!, transactionId: payment.id, filedByUserId: payment.buyerId, reason: "payment_problem", statement: dispute ? "Stripe received a bank dispute. Respond in Stripe before resolving this case." : "An external partial refund needs support review before this exchange continues.", providerDisputeId: dispute?.id, providerStatus: dispute?.status }, update: { status: "under_review", resolvedAt: null, providerDisputeId: dispute?.id, providerStatus: dispute?.status } });
    }
    const admins = await tx.user.findMany({ where: { role: "admin", accountStatus: "active" }, select: { id: true }, take: 50 });
    await tx.notification.createMany({ data: [...new Set([payment.buyerId, payment.sellerId, ...admins.map(admin => admin.id)])].map(userId => ({ userId, type: "dispute_update", title: "Stripe payment status changed", body: fullRefund || lost ? "The payment was reversed and this exchange is closed." : "Support must review the updated Stripe payment status.", urgency: "high", relatedTransactionId: payment.id, relatedTradeId: payment.legacyTradeId })) });
  });
}
