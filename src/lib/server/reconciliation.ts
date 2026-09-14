import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/server/stripe";
import { processStripeEvent } from "@/lib/server/stripe-events";
import { processExternalStripeEvent } from "@/lib/server/stripe-external-events";
import { refreshListedTicketmasterEvents } from "@/lib/server/event-sync";

export async function reconcileExchanges() {
  const now = new Date();
  const token = randomUUID();
  await prisma.reconciliationLease.upsert({ where: { id: "stripe" }, create: { id: "stripe", token: "", expiresAt: new Date(0) }, update: {} });
  const lease = await prisma.reconciliationLease.updateMany({ where: { id: "stripe", expiresAt: { lt: now } }, data: { token, expiresAt: new Date(now.getTime() + 5 * 60_000) } });
  if (!lease.count) return { skipped: true, checked: 0, errors: [] as string[] };
  let checked = 0;
  const errors: string[] = [];
  try {
    const eventRefresh = await refreshListedTicketmasterEvents();
    if (eventRefresh.errors) errors.push("event-status-refresh");
    const payments = await prisma.transaction.findMany({ where: { OR: [{ status: { in: ["awaiting_payment", "payment_pending", "payment_failed", "payment_authorized", "capture_pending", "refund_pending", "disputed"] } }, { status: "completed", completedAt: { gte: new Date(now.getTime() - 180 * 86400000) } }] }, orderBy: { updatedAt: "asc" }, take: 5, include: { legacyTrade: true, listing: { include: { event: { select: { status: true } } } }, offer: { select: { offeredListingIds: true } }, transfers: true } });
    const stripe = getStripe();
    for (const payment of payments) {
      try {
        let intent = payment.stripePaymentIntentId ? await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId) : null;
        const expectedAmount = payment.ticketAmountCents + Math.max(0, payment.cashAdjustmentCents) + payment.platformFeeCents + payment.depositAmountCents;
        if (intent && (intent.metadata.transactionId !== payment.id || intent.amount !== expectedAmount || intent.currency !== payment.currency)) throw new Error("Stripe payment does not match the exchange.");
        if (intent?.status === "succeeded" && ["completed", "disputed", "capture_pending"].includes(payment.status)) {
          const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
          if (chargeId) {
            const charge = await stripe.charges.retrieve(chargeId);
            const providerDisputes = charge.disputed || payment.status === "disputed" ? await stripe.disputes.list({ payment_intent: intent.id, limit: 10 }) : null;
            const type = providerDisputes?.data.length ? "charge.dispute.updated" : "charge.refunded";
            const object = providerDisputes?.data[0] ?? charge;
            if (providerDisputes?.data.length || charge.amount_refunded) await processExternalStripeEvent({ id: `reconcile_external_${chargeId}`, object: "event", api_version: null, created: Math.floor(Date.now() / 1000), pending_webhooks: 0, request: null, type, data: { object }, livemode: intent.livemode } as Stripe.Event);
            const fresh = await prisma.transaction.findUniqueOrThrow({ where: { id: payment.id } });
            if (["disputed", "refunded", "cancelled", "completed"].includes(fresh.status)) { checked++; continue; }
          }
        }
        const expired = payment.legacyTrade ? payment.legacyTrade.transferDeadline <= now : payment.createdAt.getTime() + 24 * 60 * 60_000 < now.getTime();
        const eventCancelled = ["cancelled", "postponed"].includes(payment.listing.event?.status ?? "");
        if ((expired || eventCancelled || (payment.status === "refund_pending" && intent?.status === "canceled")) && !["capture_pending", "disputed"].includes(payment.status) && intent?.status !== "succeeded") {
          const claim = await prisma.transaction.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: "refund_pending" } });
          if (!claim.count) continue;
          if (intent && intent.status !== "canceled") intent = await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `expiry_cancel_${payment.id}` });
          await prisma.$transaction([
            prisma.transaction.updateMany({ where: { id: payment.id, status: "refund_pending" }, data: { status: "cancelled", cancelledAt: now } }),
            prisma.trade.updateMany({ where: { id: payment.legacyTradeId ?? "" }, data: { stage: "cancelled", waitingOnUserId: null } }),
            prisma.listing.updateMany({ where: { id: { in: [payment.listingId, ...JSON.parse(payment.offer.offeredListingIds) as string[]] }, status: "pending" }, data: { status: "cancelled", activeFingerprint: null, cancelledAt: now } }),
            prisma.notification.createMany({ data: [payment.buyerId, payment.sellerId].map(userId => ({ userId, type: "payment_failed", title: "Exchange expired", body: "The exchange deadline passed or the event was cancelled. Any uncaptured payment authorization was cancelled.", urgency: "high", relatedTradeId: payment.legacyTradeId, relatedTransactionId: payment.id })) }),
          ]);
        } else if (intent) {
          if (payment.status === "refund_pending") {
            const request = await prisma.moderationAction.findFirst({ where: { targetType: "transaction", targetId: payment.id, action: "refund_requested" }, orderBy: { createdAt: "desc" } });
            if (!request || request.createdAt.getTime() > Date.now() - 5 * 60_000) continue;
            if (payment.stripeTransferId) {
              const transfer = await stripe.transfers.retrieve(payment.stripeTransferId);
              if (transfer.amount_reversed < transfer.amount) await stripe.transfers.createReversal(transfer.id, { amount: transfer.amount - transfer.amount_reversed }, { idempotencyKey: `admin_reversal_${payment.id}` });
            }
            if (intent.status === "succeeded") {
              const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
              const charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
              if (charge?.disputed) throw new Error("A bank dispute must be reviewed before refund recovery.");
              if (!charge?.refunded) await stripe.refunds.create({ payment_intent: intent.id, metadata: { transactionId: payment.id, moderationReason: request.reason } }, { idempotencyKey: `admin_refund_${payment.id}` });
            } else if (intent.status !== "canceled") await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `admin_cancel_${payment.id}` });
            await prisma.$transaction(async tx => {
              const claim = await tx.transaction.updateMany({ where: { id: payment.id, status: "refund_pending" }, data: { status: "refunded", refundedAt: new Date() } });
              if (!claim.count) return;
              await tx.listing.updateMany({ where: { id: { in: [payment.listingId, ...JSON.parse(payment.offer.offeredListingIds) as string[]] } }, data: { status: "cancelled", activeFingerprint: null, cancelledAt: new Date() } });
              await tx.trade.updateMany({ where: { id: payment.legacyTradeId ?? "" }, data: { stage: "cancelled", waitingOnUserId: null } });
              await tx.dispute.updateMany({ where: { transactionId: payment.id }, data: { status: "resolved", resolvedAt: new Date(), resolution: request.reason, assignedAdminId: request.moderatorId } });
              await tx.notification.createMany({ data: [payment.buyerId, payment.sellerId].map(userId => ({ userId, type: "payment_refunded", title: "Transaction refunded", body: "Support's pending refund completed.", urgency: "high", relatedTransactionId: payment.id, relatedTradeId: payment.legacyTradeId })) });
            });
            checked++; continue;
          }
          if (payment.status === "capture_pending" && intent.status === "requires_capture" && payment.transfers.length && payment.transfers.every(transfer => transfer.status === "transfer_accepted")) intent = await stripe.paymentIntents.capture(intent.id, {}, { idempotencyKey: `capture_${payment.id}` });
          const type = intent.status === "succeeded" ? "payment_intent.succeeded" : intent.status === "requires_capture" ? "payment_intent.amount_capturable_updated" : intent.status === "canceled" ? "payment_intent.canceled" : null;
          if (type) {
            const event = { id: `reconcile_${intent.id}_${intent.status}`, object: "event", api_version: null, created: Math.floor(Date.now() / 1000), pending_webhooks: 0, request: null, type, data: { object: intent }, livemode: intent.livemode } as Stripe.Event;
            const response = await processStripeEvent(event);
            if (response.status >= 400) throw new Error("Stripe event recovery failed.");
          }
        }
        checked++;
      } catch { errors.push(payment.id); }
      finally { await prisma.transaction.updateMany({ where: { id: payment.id }, data: { updatedAt: new Date() } }); }
    }
    await prisma.$transaction([
      prisma.offer.updateMany({ where: { status: "pending", expiresAt: { lte: now } }, data: { status: "expired" } }),
      prisma.wantedRequest.updateMany({ where: { status: "active", expiresAt: { lte: now } }, data: { status: "expired" } }),
      prisma.listing.updateMany({ where: { status: { in: ["active", "paused"] }, OR: [{ expiresAt: { lte: now } }, { event: { status: "cancelled" } }] }, data: { status: "expired", activeFingerprint: null } }),
    ]);
    return { skipped: false, checked, errors };
  } finally {
    await prisma.reconciliationLease.updateMany({ where: { id: "stripe", token }, data: { expiresAt: new Date(0) } });
  }
}
