export function assertPendingOffer(input: {
  status: string;
  version: number;
  expectedVersion: number;
  expiresAt: Date;
  now?: Date;
}) {
  if (input.status !== "pending" || input.version !== input.expectedVersion || input.expiresAt <= (input.now ?? new Date())) {
    throw new Error("This offer changed or expired. Refresh and try again.");
  }
}

export function calculateProtectedAmounts(input: {
  listingValueCents: number;
  cashAmountCents: number;
  isDirectSale: boolean;
}) {
  const protectedValueCents = Math.max(input.listingValueCents, Math.abs(input.cashAmountCents));
  return {
    ticketAmountCents: input.isDirectSale ? input.listingValueCents : 0,
    platformFeeCents: Math.max(500, Math.round(protectedValueCents * 0.045)),
    depositAmountCents: protectedValueCents > 50_000 ? 10_000 : 5_000,
  };
}

export function assertReviewEligible(input: {
  status: string;
  authorId: string;
  revieweeId: string;
  buyerId: string;
  sellerId: string;
}) {
  if (input.status !== "completed") throw new Error("Reviews are only available after a completed transaction.");
  if (input.authorId === input.revieweeId) throw new Error("You cannot review yourself.");
  const counterpartyId = input.buyerId === input.authorId ? input.sellerId : input.sellerId === input.authorId ? input.buyerId : null;
  if (!counterpartyId || input.revieweeId !== counterpartyId) throw new Error("You can only review your counterparty.");
}

export function transferActionForUser(
  transfer: { status: string; senderId: string; recipientId: string },
  userId: string
) {
  if (transfer.status === "information_submitted") {
    if (transfer.senderId !== userId) throw new Error("Only the ticket sender can mark a transfer initiated.");
    return "initiate" as const;
  }
  if (transfer.status === "transfer_initiated") {
    if (transfer.recipientId !== userId) throw new Error("Only the recipient can confirm receipt of this transfer.");
    return "accept" as const;
  }
  throw new Error("This transfer has no available action.");
}

export function transactionStatusForPaymentEvent(eventType: string) {
  if (eventType === "payment_intent.amount_capturable_updated") return "payment_authorized";
  if (eventType === "payment_intent.payment_failed") return "payment_failed";
  if (eventType === "payment_intent.canceled") return "cancelled";
  return undefined;
}
