import "server-only";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/server/stripe";
import { logger } from "@/lib/server/logger";
import { transactionStatusForPaymentEvent } from "@/lib/domain/marketplace";
import { processExternalStripeEvent } from "@/lib/server/stripe-external-events";

export async function processStripeEvent(event: Stripe.Event) {
  const existing = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  if (existing?.processedAt) return NextResponse.json({ received: true });
  await prisma.webhookEvent.upsert({
    where: { id: event.id },
    create: { id: event.id, provider: "stripe", type: event.type },
    update: {},
  });

  try {
    await processExternalStripeEvent(event);
    if (event.type.startsWith("payment_intent.")) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const transactionId = intent.metadata.transactionId;
      if (transactionId) {
        const bound = await prisma.transaction.findFirst({ where: { id: transactionId, stripePaymentIntentId: intent.id } });
        if (!bound) {
          await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
          return NextResponse.json({ received: true });
        }
        const expectedAmount = bound.ticketAmountCents + Math.max(0, bound.cashAdjustmentCents) + bound.platformFeeCents + bound.depositAmountCents;
        if (intent.amount !== expectedAmount || intent.currency !== bound.currency) throw new Error("Payment amount or currency does not match the exchange.");
        const status = transactionStatusForPaymentEvent(event.type);
        if (status) {
          const updated = await prisma.transaction.updateMany({
            where: { id: transactionId, stripePaymentIntentId: intent.id, status: { in: status === "payment_authorized" ? ["payment_pending", "payment_failed"] : status === "cancelled" ? ["awaiting_payment", "payment_pending", "payment_failed", "payment_authorized"] : ["awaiting_payment", "payment_pending", "payment_failed"] } },
            data: {
              status,
              paymentAuthorizedAt: status === "payment_authorized" ? new Date() : undefined,
              cancelledAt: status === "cancelled" ? new Date() : undefined,
            },
          });
          const transaction = updated.count ? await prisma.transaction.findUnique({ where: { id: transactionId }, select: { buyerId: true, sellerId: true, legacyTradeId: true } }) : null;
          if (transaction) {
            if (status === "cancelled") {
              await prisma.trade.updateMany({ where: { id: transaction.legacyTradeId ?? "" }, data: { stage: "cancelled", waitingOnUserId: null } });
              const offer = await prisma.offer.findUniqueOrThrow({ where: { id: bound.offerId }, select: { offeredListingIds: true } });
              await prisma.listing.updateMany({ where: { id: { in: [bound.listingId, ...JSON.parse(offer.offeredListingIds) as string[]] }, status: "pending" }, data: { status: "cancelled", activeFingerprint: null, cancelledAt: new Date() } });
            }
            const title = status === "payment_authorized" ? "Payment authorized" : status === "payment_failed" ? "Payment failed" : "Payment cancelled";
            await prisma.notification.createMany({
              data: [transaction.buyerId, transaction.sellerId].map((userId) => ({
                userId,
                type: status === "payment_authorized" ? "payment_authorized" : "payment_failed",
                title,
                body: status === "payment_authorized" ? "The official ticket-transfer steps are now unlocked." : "The exchange is paused until payment is authorized again.",
                urgency: status === "payment_authorized" ? "high" : "medium",
                relatedTransactionId: transactionId,
                relatedTradeId: transaction.legacyTradeId,
              })),
            });
          }
        }
        if (event.type === "payment_intent.succeeded") {
          const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: { seller: { select: { stripeAccountId: true } }, legacyTrade: true, transfers: true, offer: { select: { offeredListingIds: true } } },
          });
          if (transaction?.stripePaymentIntentId === intent.id && transaction.status === "capture_pending" && transaction.transfers.length > 0 && transaction.transfers.every(transfer => transfer.status === "transfer_accepted")) {
            const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
            const sellerAmount = transaction.ticketAmountCents + Math.max(0, transaction.cashAdjustmentCents);
            if (chargeId) {
              const charge = await getStripe().charges.retrieve(chargeId);
              if (charge.disputed || charge.refunded || charge.amount_refunded > transaction.depositAmountCents) throw new Error("The charge requires support review before seller settlement.");
            }
            let stripeTransferId = transaction.stripeTransferId;
            if (sellerAmount > 0) {
              if (!transaction.seller.stripeAccountId || !chargeId) throw new Error("Seller payout details are incomplete.");
              const transfer = await getStripe().transfers.create(
                {
                  amount: sellerAmount,
                  currency: transaction.currency,
                  destination: transaction.seller.stripeAccountId,
                  source_transaction: chargeId,
                  transfer_group: `gameswap_${transaction.id}`,
                  metadata: { transactionId: transaction.id },
                },
                { idempotencyKey: `transfer_${transaction.id}` }
              );
              stripeTransferId = transfer.id;
            }
            await prisma.transaction.update({ where: { id: transaction.id }, data: { stripeChargeId: chargeId, stripeTransferId } });
            if (transaction.depositAmountCents > 0) {
              await getStripe().refunds.create(
                { payment_intent: intent.id, amount: transaction.depositAmountCents, metadata: { transactionId: transaction.id, reason: "completed_exchange_deposit_return" } },
                { idempotencyKey: `deposit_return_${transaction.id}` }
              );
            }
            await prisma.$transaction(async (tx) => {
              const claimed = await tx.transaction.updateMany({
                where: { id: transaction.id, status: "capture_pending" },
                data: {
                  status: "completed",
                  completedAt: new Date(),
                  stripeChargeId: chargeId,
                  stripeTransferId,
                },
              });
              if (!claimed.count) return;
              await tx.listing.updateMany({
                where: { id: { in: [transaction.listingId, ...JSON.parse(transaction.offer.offeredListingIds) as string[]] }, status: "pending" },
                data: { status: "completed", activeFingerprint: null },
              });
              if (transaction.legacyTrade) {
                const history = JSON.parse(transaction.legacyTrade.history) as Array<Record<string, unknown>>;
                const completedAt = new Date().toISOString();
                await tx.trade.update({
                  where: { id: transaction.legacyTrade.id },
                  data: {
                    stage: "completed",
                    waitingOnUserId: null,
                    history: JSON.stringify([...history, { stage: "cash_released", completedAt }, { stage: "completed", completedAt }]),
                  },
                });
              }
              if (transaction.type !== "sale") await tx.user.update({ where: { id: transaction.buyerId }, data: { completedSwaps: { increment: 1 } } });
              await tx.user.update({
                where: { id: transaction.sellerId },
                data: transaction.type === "sale" ? { completedSales: { increment: 1 } } : { completedSwaps: { increment: 1 } },
              });
              await tx.notification.createMany({
                data: [transaction.buyerId, transaction.sellerId].map((userId) => ({
                  userId,
                  type: "trade_completed",
                  title: "Exchange completed",
                  body: "The protected exchange is complete. You can now leave a transaction review.",
                  relatedTransactionId: transaction.id,
                  relatedTradeId: transaction.legacyTradeId,
                })),
              });
            });
          }
        }
      }
    }
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    await prisma.webhookEvent.update({ where: { id: event.id }, data: { error: message.slice(0, 1000) } });
    logger.error("stripe.webhook_failed", { eventId: event.id, type: event.type, message });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
