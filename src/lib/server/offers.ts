import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { messageLooksUnsafe } from "@/lib/initials";
import { audit } from "@/lib/server/audit";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { assertNotBlocked, requireActiveUser } from "@/lib/server/policy";
import type { TradeAsset } from "@/lib/types";
import { sendNotificationEmail } from "@/lib/server/notifications";
import { assertPendingOffer, calculateProtectedAmounts } from "@/lib/domain/marketplace";

const createSchema = z.object({
  listingId: z.string().cuid(),
  assetsFromBuyer: z.array(z.object({ id: z.string(), type: z.string() })).max(20),
  cashAdjustment: z.number().finite().min(0).max(100_000),
  message: z.string().trim().max(2000),
  expiresInHours: z.number().int().min(1).max(336).optional().default(72),
});

const responseSchema = z.object({
  offerId: z.string().cuid(),
  decision: z.enum(["accept", "decline"]),
  expectedVersion: z.number().int().positive(),
});

const counterSchema = z.object({
  offerId: z.string().cuid(),
  expectedVersion: z.number().int().positive(),
  cashAdjustment: z.number().finite().min(0).max(100_000),
  note: z.string().trim().max(2000),
  expiresInHours: z.number().int().min(1).max(336).default(72),
});

function listingAsset(row: {
  id: string;
  gameId: string;
  quantity: number;
  section: string;
  row: string;
  estimatedValuePerTicket: number;
}): TradeAsset {
  return {
    id: row.id,
    type: "tickets",
    gameId: row.gameId,
    quantity: row.quantity,
    section: row.section,
    row: row.row,
    label: `Section ${row.section}, Row ${row.row}`,
    valueEstimate: row.estimatedValuePerTicket * row.quantity,
  };
}

export async function createPendingOffer(rawInput: unknown) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "offer-create", userId: user.id, limit: 20, windowSeconds: 3600 });
  const input = createSchema.parse(rawInput);
  if (messageLooksUnsafe(input.message)) {
    throw new Error("Remove payment credentials, card numbers, barcodes, or QR references before sending.");
  }
  const listing = await prisma.listing.findFirst({
    where: {
      id: input.listingId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (!listing) throw new Error("This listing is no longer available.");
  if (listing.sellerId === user.id) throw new Error("You cannot offer on your own listing.");
  await assertNotBlocked(user.id, listing.sellerId);

  const offeredListingIds = [...new Set(input.assetsFromBuyer.filter((asset) => asset.type === "tickets").map((asset) => asset.id))];
  const offeredListings = offeredListingIds.length
    ? await prisma.listing.findMany({
        where: {
          id: { in: offeredListingIds },
          sellerId: user.id,
          status: "active",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      })
    : [];
  if (offeredListings.length !== offeredListingIds.length) {
    throw new Error("One or more tickets in this offer are unavailable or do not belong to you.");
  }
  if (offeredListingIds.includes(listing.id)) throw new Error("A listing cannot be offered for itself.");
  if (offeredListings.length === 0 && input.cashAdjustment <= 0 && listing.listingType === "trade") {
    throw new Error("Add tickets or a cash amount to the offer.");
  }

  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.create({
      data: {
        listingId: listing.id,
        senderId: user.id,
        recipientId: listing.sellerId,
        createdById: user.id,
        actionRequiredById: listing.sellerId,
        cashAmountCents: Math.round(input.cashAdjustment * 100),
        note: input.message || null,
        offeredListingIds: JSON.stringify(offeredListingIds),
        expiresAt,
      },
    });
    const thread = await tx.messageThread.create({
      data: {
        listingId: listing.id,
        offerId: offer.id,
        participants: {
          create: [
            { userId: user.id, unread: false, lastReadAt: new Date() },
            { userId: listing.sellerId, unread: true },
          ],
        },
        messages: {
          create: [
            {
              senderId: user.id,
              kind: "system",
              body: "Offer submitted. The ticket holder must accept these exact terms before payment or transfer begins.",
            },
            ...(input.message ? [{ senderId: user.id, kind: "user", body: input.message }] : []),
          ],
        },
      },
    });
    await tx.notification.create({
      data: {
        userId: listing.sellerId,
        type: "new_offer",
        title: "New offer on your listing",
        body: `${user.name.split(" ")[0]} sent an offer.`,
        urgency: "high",
        relatedOfferId: offer.id,
        relatedListingId: listing.id,
      },
    });
    return { offerId: offer.id, threadId: thread.id };
  });
  await audit({ actorUserId: user.id, action: "offer.created", entityType: "offer", entityId: result.offerId });
  await sendNotificationEmail({ userId: listing.sellerId, category: "offers", subject: "New GameSwap offer", body: `${user.name.split(" ")[0]} sent an offer on your listing.`, path: "/offers" });
  return result;
}

export async function respondToPendingOffer(rawInput: unknown) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "offer-response", userId: user.id, limit: 30, windowSeconds: 3600 });
  const input = responseSchema.parse(rawInput);
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findFirst({
      where: { id: input.offerId, actionRequiredById: user.id },
      include: { listing: true },
    });
    if (!offer) throw new Error("Offer not found.");
    assertPendingOffer({ ...offer, expectedVersion: input.expectedVersion });
    if (input.decision === "decline") {
      const changed = await tx.offer.updateMany({
        where: { id: offer.id, status: "pending", version: input.expectedVersion },
        data: { status: "declined", respondedAt: new Date(), version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("This offer was already handled.");
      await tx.notification.create({
        data: {
          userId: offer.createdById,
          type: "offer_declined",
          title: "Offer declined",
          body: "The ticket holder declined your offer.",
          relatedOfferId: offer.id,
          relatedListingId: offer.listingId,
        },
      });
      return { status: "declined" as const };
    }

    const claimed = await tx.listing.updateMany({
      where: { id: offer.listingId, status: "active", version: offer.listing.version },
      data: { status: "pending", activeFingerprint: null, version: { increment: 1 } },
    });
    if (claimed.count !== 1) throw new Error("These tickets were reserved by another accepted offer.");
    const accepted = await tx.offer.updateMany({
      where: { id: offer.id, status: "pending", version: input.expectedVersion },
      data: { status: "accepted", respondedAt: new Date(), version: { increment: 1 } },
    });
    if (accepted.count !== 1) throw new Error("This offer was already handled.");

    const offeredListingIds = JSON.parse(offer.offeredListingIds) as string[];
    const offeredRows = offeredListingIds.length
      ? await tx.listing.findMany({ where: { id: { in: offeredListingIds }, sellerId: offer.senderId, status: "active" } })
      : [];
    if (offeredRows.length !== offeredListingIds.length) throw new Error("Tickets in this offer are no longer available.");
    if (offeredListingIds.length) {
      const reserved = await tx.listing.updateMany({
        where: { id: { in: offeredListingIds }, sellerId: offer.senderId, status: "active" },
        data: { status: "pending", activeFingerprint: null, version: { increment: 1 } },
      });
      if (reserved.count !== offeredListingIds.length) throw new Error("Tickets in this offer were reserved elsewhere.");
    }
    await tx.offer.updateMany({
      where: { listingId: offer.listingId, status: "pending", id: { not: offer.id } },
      data: { status: "superseded", respondedAt: new Date(), version: { increment: 1 } },
    });

    const listingValueCents = Math.round(offer.listing.estimatedValuePerTicket * offer.listing.quantity * 100);
    const isDirectSale = offeredRows.length === 0 && offer.listing.listingType !== "trade";
    const { ticketAmountCents, platformFeeCents, depositAmountCents } = calculateProtectedAmounts({
      listingValueCents,
      cashAmountCents: offer.cashAmountCents,
      isDirectSale,
    });
    const transferDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const offeredAssets = offeredRows.map(listingAsset);
    const receivedAsset = listingAsset(offer.listing);
    const legacyTrade = await tx.trade.create({
      data: {
        listingId: offer.listingId,
        userAId: offer.senderId,
        userBId: offer.recipientId,
        assetsFromA: JSON.stringify(offeredAssets),
        assetsFromB: JSON.stringify([receivedAsset]),
        cashAdjustment: offer.cashAmountCents / 100,
        platformFee: platformFeeCents / 100,
        refundableDeposit: depositAmountCents / 100,
        stage: "offer_accepted",
        history: JSON.stringify([{ stage: "offer_accepted", completedAt: new Date().toISOString(), actorUserId: user.id }]),
        transferDeadline,
        waitingOnUserId: offer.senderId,
      },
    });
    const transaction = await tx.transaction.create({
      data: {
        offerId: offer.id,
        listingId: offer.listingId,
        buyerId: offer.senderId,
        sellerId: offer.recipientId,
        legacyTradeId: legacyTrade.id,
        type: isDirectSale ? "sale" : offeredRows.length ? "swap" : "ticket_plus_cash",
        ticketAmountCents,
        cashAdjustmentCents: offer.cashAmountCents,
        platformFeeCents,
        depositAmountCents,
      },
    });
    const transferRows = offeredRows.length
      ? [
          { transactionId: transaction.id, senderId: offer.senderId, recipientId: offer.recipientId, issuer: offeredRows[0]?.issuer ?? "Other", deadline: transferDeadline },
          { transactionId: transaction.id, senderId: offer.recipientId, recipientId: offer.senderId, issuer: offer.listing.issuer, deadline: transferDeadline },
        ]
      : [
          { transactionId: transaction.id, senderId: offer.recipientId, recipientId: offer.senderId, issuer: offer.listing.issuer, deadline: transferDeadline },
        ];
    await tx.ticketTransfer.createMany({ data: transferRows });
    await tx.notification.create({
      data: {
        userId: offer.createdById,
        type: "offer_accepted",
        title: "Offer accepted",
        body: "Authorize payment next. Do not transfer tickets until payment is authorized.",
        urgency: "high",
        relatedOfferId: offer.id,
        relatedTransactionId: transaction.id,
        relatedTradeId: legacyTrade.id,
      },
    });
    return { status: "accepted" as const, transactionId: transaction.id, tradeId: legacyTrade.id };
  });
  await audit({ actorUserId: user.id, action: `offer.${result.status}`, entityType: "offer", entityId: input.offerId });
  const offer = await prisma.offer.findUnique({ where: { id: input.offerId }, select: { senderId: true } });
  if (offer) await sendNotificationEmail({ userId: offer.senderId, category: "offers", subject: `GameSwap offer ${result.status}`, body: `Your offer was ${result.status}.`, path: result.status === "accepted" && "tradeId" in result ? `/trades/${result.tradeId}` : "/offers" });
  return result;
}

export async function cancelPendingOffer(rawOfferId: unknown) {
  const user = await requireActiveUser();
  const offerId = z.string().cuid().parse(rawOfferId);
  const result = await prisma.offer.updateMany({
    where: { id: offerId, createdById: user.id, status: "pending" },
    data: { status: "cancelled", cancelledAt: new Date(), version: { increment: 1 } },
  });
  if (result.count !== 1) throw new Error("This offer cannot be cancelled.");
  await audit({ actorUserId: user.id, action: "offer.cancelled", entityType: "offer", entityId: offerId });
}

export async function createCounterOffer(rawInput: unknown) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "offer-counter", userId: user.id, limit: 20, windowSeconds: 3600 });
  const input = counterSchema.parse(rawInput);
  if (messageLooksUnsafe(input.note)) {
    throw new Error("Remove payment credentials, card numbers, barcodes, or QR references before sending.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const original = await tx.offer.findFirst({
      where: { id: input.offerId, actionRequiredById: user.id },
    });
    if (!original) throw new Error("Offer not found.");
    assertPendingOffer({ ...original, expectedVersion: input.expectedVersion });
    const otherUserId = original.senderId === user.id ? original.recipientId : original.senderId;
    await assertNotBlocked(user.id, otherUserId);
    const changed = await tx.offer.updateMany({
      where: { id: original.id, status: "pending", version: input.expectedVersion },
      data: { status: "countered", respondedAt: new Date(), version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new Error("This offer was already handled.");
    const counter = await tx.offer.create({
      data: {
        listingId: original.listingId,
        senderId: original.senderId,
        recipientId: original.recipientId,
        createdById: user.id,
        actionRequiredById: otherUserId,
        parentOfferId: original.id,
        cashAmountCents: Math.round(input.cashAdjustment * 100),
        currency: original.currency,
        note: input.note || null,
        offeredListingIds: original.offeredListingIds,
        expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
      },
    });
    await tx.messageThread.updateMany({ where: { offerId: original.id }, data: { offerId: counter.id } });
    await tx.notification.create({
      data: {
        userId: otherUserId,
        type: "counteroffer",
        title: "Counteroffer received",
        body: `${user.name.split(" ")[0]} proposed revised terms.`,
        urgency: "high",
        relatedOfferId: counter.id,
        relatedListingId: counter.listingId,
      },
    });
    return { offerId: counter.id };
  });
  await audit({ actorUserId: user.id, action: "offer.countered", entityType: "offer", entityId: result.offerId });
  return result;
}
