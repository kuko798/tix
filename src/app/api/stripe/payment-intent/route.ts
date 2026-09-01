import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server/policy";
import { getStripe } from "@/lib/server/stripe";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";

const inputSchema = z.object({ transactionId: z.string().cuid(), idempotencyKey: z.string().min(16).max(200) });

export async function POST(request: NextRequest) {
  const user = await requireActiveUser();
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
  if (transaction.status === "payment_pending" && transaction.stripePaymentIntentId) {
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

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create(
    {
      amount,
      currency: transaction.currency,
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      transfer_group: `gameswap_${transaction.id}`,
      metadata: { transactionId: transaction.id, buyerId: user.id, sellerId: transaction.sellerId },
      description: "GameSwap protected ticket exchange",
    },
    { idempotencyKey: input.idempotencyKey }
  );
  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { stripePaymentIntentId: intent.id, status: "payment_pending" },
  });
  await audit({ actorUserId: user.id, action: "payment.intent_created", entityType: "transaction", entityId: transaction.id });
  return NextResponse.json({ clientSecret: intent.client_secret });
}
