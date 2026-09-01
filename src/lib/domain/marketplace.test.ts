import { describe, expect, it } from "vitest";
import { assertPendingOffer, assertReviewEligible, calculateProtectedAmounts, transactionStatusForPaymentEvent, transferActionForUser } from "./marketplace";

describe("offer transitions", () => {
  it("accepts the current pending version before expiry", () => {
    expect(() => assertPendingOffer({ status: "pending", version: 2, expectedVersion: 2, expiresAt: new Date("2030-01-02"), now: new Date("2030-01-01") })).not.toThrow();
  });
  it.each(["accepted", "declined", "cancelled", "superseded"])("rejects %s offers", (status) => {
    expect(() => assertPendingOffer({ status, version: 1, expectedVersion: 1, expiresAt: new Date("2030-01-02"), now: new Date("2030-01-01") })).toThrow();
  });
  it("rejects stale versions and expired offers", () => {
    expect(() => assertPendingOffer({ status: "pending", version: 2, expectedVersion: 1, expiresAt: new Date("2030-01-02"), now: new Date("2030-01-01") })).toThrow();
    expect(() => assertPendingOffer({ status: "pending", version: 1, expectedVersion: 1, expiresAt: new Date("2030-01-01"), now: new Date("2030-01-01") })).toThrow();
  });
});

describe("protected exchange amounts", () => {
  it("charges ticket value only for a direct sale", () => {
    expect(calculateProtectedAmounts({ listingValueCents: 20_000, cashAmountCents: 0, isDirectSale: true })).toEqual({ ticketAmountCents: 20_000, platformFeeCents: 900, depositAmountCents: 5_000 });
  });
  it("uses a larger deposit above the protected-value threshold", () => {
    expect(calculateProtectedAmounts({ listingValueCents: 60_000, cashAmountCents: 2_000, isDirectSale: false }).depositAmountCents).toBe(10_000);
  });
});

describe("review eligibility", () => {
  const transaction = { status: "completed", buyerId: "buyer", sellerId: "seller" };
  it("allows only the completed transaction counterparty", () => {
    expect(() => assertReviewEligible({ ...transaction, authorId: "buyer", revieweeId: "seller" })).not.toThrow();
    expect(() => assertReviewEligible({ ...transaction, authorId: "buyer", revieweeId: "stranger" })).toThrow();
  });
  it("rejects self-reviews and unfinished transactions", () => {
    expect(() => assertReviewEligible({ ...transaction, authorId: "buyer", revieweeId: "buyer" })).toThrow();
    expect(() => assertReviewEligible({ ...transaction, status: "cancelled", authorId: "buyer", revieweeId: "seller" })).toThrow();
  });
});

describe("ticket transfer authorization", () => {
  it("assigns initiation to the sender and acceptance to the recipient", () => {
    expect(transferActionForUser({ status: "information_submitted", senderId: "a", recipientId: "b" }, "a")).toBe("initiate");
    expect(transferActionForUser({ status: "transfer_initiated", senderId: "a", recipientId: "b" }, "b")).toBe("accept");
  });
  it("rejects the wrong participant", () => {
    expect(() => transferActionForUser({ status: "information_submitted", senderId: "a", recipientId: "b" }, "b")).toThrow();
    expect(() => transferActionForUser({ status: "transfer_initiated", senderId: "a", recipientId: "b" }, "a")).toThrow();
  });
});

describe("Stripe webhook mapping", () => {
  it("maps authorization, failure, and cancellation without treating unrelated events as payments", () => {
    expect(transactionStatusForPaymentEvent("payment_intent.amount_capturable_updated")).toBe("payment_authorized");
    expect(transactionStatusForPaymentEvent("payment_intent.payment_failed")).toBe("payment_failed");
    expect(transactionStatusForPaymentEvent("payment_intent.canceled")).toBe("cancelled");
    expect(transactionStatusForPaymentEvent("payment_intent.created")).toBeUndefined();
  });
});
