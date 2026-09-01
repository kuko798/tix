import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { PaymentForm } from "./payment-form";

export const dynamic = "force-dynamic";

export default async function TransactionPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  const { id } = await params;
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      seller: { select: { name: true, stripeAccountId: true } },
      legacyTrade: { select: { id: true } },
    },
  });

  if (!transaction || transaction.buyerId !== user.id) notFound();
  if (["payment_authorized", "transfer_in_progress", "completed"].includes(transaction.status)) {
    redirect(transaction.legacyTradeId ? `/trades/${transaction.legacyTradeId}` : "/trades");
  }

  const amountCents =
    transaction.ticketAmountCents +
    Math.max(0, transaction.cashAdjustmentCents) +
    transaction.platformFeeCents +
    transaction.depositAmountCents;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Protected checkout</p>
      <h1 className="mt-2 font-display text-4xl leading-tight">Authorize your exchange</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Stripe securely authorizes the payment. GameSwap captures it only after both ticket transfers are accepted.
      </p>
      <div className="mt-7 border-y border-border py-4 text-sm">
        <div className="flex justify-between"><span>Seller</span><span className="font-medium">{transaction.seller.name}</span></div>
        <div className="mt-2 flex justify-between"><span>Total authorization</span><span className="font-mono font-semibold">{new Intl.NumberFormat("en-US", { style: "currency", currency: transaction.currency }).format(amountCents / 100)}</span></div>
      </div>
      {!transaction.seller.stripeAccountId ? (
        <div className="mt-6 border border-warning/40 bg-warning-tint p-4 text-sm text-warning-tint-foreground">
          The seller still needs to complete payout setup. No payment can be authorized until then.
        </div>
      ) : (
        <PaymentForm transactionId={transaction.id} returnPath={transaction.legacyTradeId ? `/trades/${transaction.legacyTradeId}` : "/trades"} />
      )}
    </main>
  );
}
