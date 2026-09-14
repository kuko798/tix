import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, withApiErrors } from "@/lib/server/http";
import { getStripe } from "@/lib/server/stripe";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";

const inputSchema = z.object({ transactionId: z.string().cuid(), idempotencyKey: z.string().min(16).max(200) });

export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  await enforceRateLimit({ scope: "payment-intent", userId: user.id, limit: 10, windowSeconds: 3600 });
  const input = inputSchema.parse(await request.json());
  const transaction = await prisma.transaction.findFirst({
    where: { id: input.transactionId, buyerId: user.id },
    include: { seller: { select: { stripeAccountId: true } } },
  });
  if (!transaction) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  if (!transaction.seller.stripeAccountId) {
    return NextResponse.json({ error: "The seller must finish payout setup first." }, { status: 409 });
  }
  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.retrieve(transaction.seller.stripeAccountId, { include: ["configuration.recipient"] });
  if (account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status !== "active") {
    return NextResponse.json({ error: "The seller must finish payout setup first." }, { status: 409 });
  }
  if (["payment_pending", "payment_failed"].includes(transaction.status) && transaction.stripePaymentIntentId) {
    const existing = await getStripe().paymentIntents.retrieve(transaction.stripePaymentIntentId);
    return NextResponse.json({ clientSecret: existing.client_secret });
  }
  if (!["awaiting_payment", "payment_failed"].includes(transaction.status)) {
    return NextResponse.json({ error: "Payment cannot be created in the current state." }, { status: 409 });
  }

  const amount =
    transaction.ticketAmountCents +
    Math.max(0, transaction.cashAdjustmentCents) +
    transaction.platformFeeCents +
    transaction.depositAmountCents;
  if (amount < 50) return NextResponse.json({ error: "Payment amount is too small." }, { status: 422 });

  const intent = await stripe.paymentIntents.create(
    {
      amount,
      currency: transaction.currency,
      capture_method: "manual",
      payment_method_types: ["card"],
      transfer_group: `gameswap_${transaction.id}`,
      metadata: { transactionId: transaction.id, buyerId: user.id, sellerId: transaction.sellerId },
      description: "GameSwap protected ticket exchange",
    },
    { idempotencyKey: `gameswap_payment_${transaction.id}` }
  );
  const claimed = await prisma.transaction.updateMany({
    where: { id: transaction.id, status: { in: ["awaiting_payment", "payment_failed", "payment_pending"] } },
    data: { stripePaymentIntentId: intent.id, status: "payment_pending" },
  });
  if (!claimed.count) {
    await stripe.paymentIntents.cancel(intent.id);
    return NextResponse.json({ error: "This transaction changed. Refresh checkout." }, { status: 409 });
  }
  await audit({ actorUserId: user.id, action: "payment.intent_created", entityType: "transaction", entityId: transaction.id });
  return NextResponse.json({ clientSecret: intent.client_secret });
});
