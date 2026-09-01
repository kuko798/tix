import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";
import { transactionStatusForPaymentEvent } from "@/lib/domain/marketplace";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const existing = await prisma.webhookEvent.findUnique({ where: { id: event.id } });
  if (existing?.processedAt) return NextResponse.json({ received: true });
  await prisma.webhookEvent.upsert({
    where: { id: event.id },
    create: { id: event.id, provider: "stripe", type: event.type },
    update: {},
  });

  try {
    if (event.type.startsWith("payment_intent.")) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const transactionId = intent.metadata.transactionId;
      if (transactionId) {
        const status = transactionStatusForPaymentEvent(event.type);
        if (status) {
          const updated = await prisma.transaction.updateMany({
            where: { id: transactionId, stripePaymentIntentId: intent.id, status: { not: status } },
            data: {
              status,
              paymentAuthorizedAt: status === "payment_authorized" ? new Date() : undefined,
              cancelledAt: status === "cancelled" ? new Date() : undefined,
            },
          });
          const transaction = updated.count ? await prisma.transaction.findUnique({ where: { id: transactionId }, select: { buyerId: true, sellerId: true, legacyTradeId: true } }) : null;
          if (transaction) {
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
            include: { seller: { select: { stripeAccountId: true } }, legacyTrade: true },
          });
          if (transaction && transaction.status !== "completed") {
            const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
            const sellerAmount = transaction.ticketAmountCents + Math.max(0, transaction.cashAdjustmentCents);
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
            if (transaction.depositAmountCents > 0) {
              await getStripe().refunds.create(
                { payment_intent: intent.id, amount: transaction.depositAmountCents, metadata: { transactionId: transaction.id, reason: "completed_exchange_deposit_return" } },
                { idempotencyKey: `deposit_return_${transaction.id}` }
              );
            }
            await prisma.$transaction(async (tx) => {
              await tx.transaction.update({
                where: { id: transaction.id },
                data: {
                  status: "completed",
                  completedAt: new Date(),
                  stripeChargeId: chargeId,
                  stripeTransferId,
                },
              });
              await tx.listing.update({
                where: { id: transaction.listingId },
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
              await tx.user.update({ where: { id: transaction.buyerId }, data: { completedSwaps: { increment: 1 } } });
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
