"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { messageLooksUnsafe } from "@/lib/initials";
import type { TradeAsset } from "@/lib/types";
import { createPendingOffer, respondToPendingOffer, cancelPendingOffer, createCounterOffer } from "@/lib/server/offers";
import { createListing, editOwnedListing, updateOwnedListingStatus } from "@/lib/server/listings";
import { assertNotBlocked, requireActiveUser } from "@/lib/server/policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { advanceTradeSafely } from "@/lib/server/transfers";
import { sendNotificationEmail } from "@/lib/server/notifications";
import { assertReviewEligible } from "@/lib/domain/marketplace";

function json(value: unknown) {
  return JSON.stringify(value);
}

const listingSchema = z.object({
  gameId: z.string().min(1),
  issuer: z.string().min(1),
  section: z.string().min(1),
  row: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
  seatLevel: z.string(),
  parkingIncluded: z.boolean(),
  benefits: z.array(z.string()),
  listingType: z.enum(["trade", "sale", "trade_or_sale"]),
  faceValuePerTicket: z.number().min(0),
  askingCashAdjustment: z.number().optional(),
  acceptsCash: z.boolean(),
  acceptsGamesDescription: z.string().optional(),
  flexibleOnDate: z.boolean(),
  flexibleOnSection: z.boolean(),
  evidenceFileName: z.string().nullable(),
  visibility: z.enum(["public", "circle", "private"]),
  circleId: z.string().optional(),
  accessible: z.boolean().optional(),
});

export async function createListingAction(input: z.infer<typeof listingSchema>) {
  return createListing(listingSchema.parse(input));
}

export async function pauseListingAction(listingId: string) {
  const result = await updateOwnedListingStatus(listingId, "paused");
  revalidatePath("/discover");
  revalidatePath(`/listing/${listingId}`);
  return result;
}

export async function resumeListingAction(listingId: string) {
  const result = await updateOwnedListingStatus(listingId, "active");
  revalidatePath("/discover");
  revalidatePath(`/listing/${listingId}`);
  return result;
}

export async function deleteListingAction(listingId: string) {
  const result = await updateOwnedListingStatus(listingId, "cancelled");
  revalidatePath("/discover");
  revalidatePath(`/listing/${listingId}`);
  return result;
}

export async function editListingAction(input: {
  listingId: string;
  expectedVersion: number;
  section: string;
  row: string;
  quantity: number;
  faceValuePerTicket: number;
  acceptsGamesDescription: string;
  accessible: boolean;
}) {
  const result = await editOwnedListing(input);
  revalidatePath("/discover");
  revalidatePath(`/listing/${input.listingId}`);
  return result;
}

const wantedSchema = z.object({
  desiredGameId: z.string().min(1),
  quantityMin: z.number().int().min(1).max(20),
  quantityMax: z.number().int().min(1).max(20),
  preferredSections: z.array(z.string()),
  maxBudget: z.number().min(0),
  offeringDescription: z.string().min(1),
  offeringGameIds: z.array(z.string().cuid()).max(20).default([]),
  flexibleOnDate: z.boolean(),
});

export async function createWantedAction(input: z.infer<typeof wantedSchema>) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "wanted-create", userId: user.id, limit: 12, windowSeconds: 3600 });
  const data = wantedSchema.parse(input);
  const event = await prisma.event.findFirst({
    where: { id: data.desiredGameId, status: { in: ["scheduled", "rescheduled"] }, startsAt: { gt: new Date() } },
    include: { venue: { select: { city: true } } },
  });
  if (!event) throw new Error("This event is no longer available.");
  const expiresAt = event.startsAt;

  const request = await prisma.wantedRequest.create({
    data: {
      requesterId: user.id,
      desiredGameId: data.desiredGameId,
      eventId: event.id,
      city: event.venue.city,
      quantityMin: Math.min(data.quantityMin, data.quantityMax),
      quantityMax: Math.max(data.quantityMin, data.quantityMax),
      preferredSections: json(data.preferredSections),
      maxBudget: data.maxBudget,
      offeringDescription: data.offeringDescription.trim(),
      offeringGameIds: json([...new Set(data.offeringGameIds)]),
      flexibleOnDate: data.flexibleOnDate,
      expiresAt,
    },
  });

  const matchingListings = await prisma.listing.findMany({
    where: {
      eventId: event.id,
      status: "active",
      visibility: "public",
      quantity: { gte: Math.min(data.quantityMin, data.quantityMax) },
      estimatedValuePerTicket: { lte: data.maxBudget / Math.max(1, Math.min(data.quantityMin, data.quantityMax)) },
      sellerId: { not: user.id },
    },
    select: { id: true, sellerId: true },
    take: 10,
  });
  if (matchingListings.length) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "wanted_match",
        title: `${matchingListings.length} matching listing${matchingListings.length === 1 ? "" : "s"}`,
        body: "These tickets match your event, quantity, and per-ticket budget.",
        urgency: "medium",
        relatedListingId: matchingListings[0].id,
      },
    });
  }
  if (data.offeringGameIds.length) {
    const candidates = await prisma.wantedRequest.findMany({
      where: {
        id: { not: request.id },
        requesterId: { not: user.id },
        desiredGameId: { in: data.offeringGameIds },
        status: "active",
        expiresAt: { gt: new Date() },
      },
      select: { requesterId: true, offeringGameIds: true },
      take: 100,
    });
    const mutual = candidates.filter((candidate) => {
      try { return (JSON.parse(candidate.offeringGameIds) as string[]).includes(data.desiredGameId); }
      catch { return false; }
    });
    if (mutual.length) {
      await prisma.notification.createMany({
        data: [
          { userId: user.id, type: "direct_swap_match", title: "Two-way ticket match", body: "Another fan wants an event you can offer and can offer the event you want.", urgency: "high" },
          ...mutual.map((candidate) => ({ userId: candidate.requesterId, type: "direct_swap_match", title: "Two-way ticket match", body: "Another fan wants an event you can offer and can offer the event you want.", urgency: "high" })),
        ],
      });
    }
  }
  await audit({ actorUserId: user.id, action: "wanted.created", entityType: "wantedRequest", entityId: request.id });

  revalidatePath("/wanted");
  revalidatePath("/");
  return { id: request.id };
}

const offerSchema = z.object({
  listingId: z.string(),
  assetsFromBuyer: z.array(z.custom<TradeAsset>()),
  cashAdjustment: z.number(),
  message: z.string().max(2000),
});

export async function createOfferAction(input: z.infer<typeof offerSchema>) {
  return createPendingOffer(offerSchema.parse(input));
}

export async function respondToOfferAction(input: {
  offerId: string;
  decision: "accept" | "decline";
  expectedVersion: number;
}) {
  const result = await respondToPendingOffer(input);
  revalidatePath("/offers");
  revalidatePath("/trades");
  revalidatePath("/notifications");
  return result;
}

export async function cancelOfferAction(offerId: string) {
  await cancelPendingOffer(offerId);
  revalidatePath("/offers");
}

export async function counterOfferAction(input: {
  offerId: string;
  expectedVersion: number;
  cashAdjustment: number;
  note: string;
}) {
  const result = await createCounterOffer(input);
  revalidatePath("/offers");
  revalidatePath("/notifications");
  return result;
}

export async function advanceTradeAction(tradeId: string) {
  const result = await advanceTradeSafely(tradeId);
  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
  return result;
}

export async function createDisputeAction(tradeId: string, reason: string, statement: string) {
  const user = await requireSessionUser();
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error("Trade not found.");
  if (trade.userAId !== user.id && trade.userBId !== user.id) {
    throw new Error("You are not part of this trade.");
  }

  await prisma.dispute.create({
    data: {
      tradeId,
      reason,
      statement: statement.trim(),
      filedByUserId: user.id,
    },
  });
  await prisma.trade.update({
    where: { id: tradeId },
    data: { stage: "disputed", waitingOnUserId: null },
  });

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
}

export async function sendMessageAction(threadId: string, body: string) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "message-send", userId: user.id, limit: 60, windowSeconds: 60 });
  const text = body.trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > 2000) throw new Error("Messages must be 2,000 characters or fewer.");
  if (messageLooksUnsafe(text)) {
    throw new Error("That message looks like it contains payment info, a card number, or a barcode/QR reference.");
  }

  const thread = await prisma.messageThread.findFirst({
    where: { id: threadId, participants: { some: { userId: user.id } } },
    include: { participants: true },
  });
  if (!thread) throw new Error("Conversation not found.");
  const otherUserId = thread.participants.find((participant) => participant.userId !== user.id)?.userId;
  if (otherUserId) await assertNotBlocked(user.id, otherUserId);

  const message = await prisma.message.create({
    data: { threadId, senderId: user.id, kind: "user", body: text },
  });
  await prisma.messageThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });
  await prisma.threadParticipant.updateMany({
    where: { threadId, userId: { not: user.id } },
    data: { unread: true },
  });
  await prisma.threadParticipant.updateMany({
    where: { threadId, userId: user.id },
    data: { unread: false, lastReadAt: new Date() },
  });

  const others = thread.participants.filter((p) => p.userId !== user.id);
  if (others.length) {
    await prisma.notification.createMany({
      data: others.map((participant) => ({
        userId: participant.userId,
        type: "new_message",
        title: "New message",
        body: `${user.name.split(" ")[0]} sent you a message.`,
        urgency: "medium",
        relatedTradeId: thread.tradeId,
        relatedListingId: thread.listingId,
      })),
    });
    await Promise.all(others.map((participant) => sendNotificationEmail({
      userId: participant.userId,
      category: "messages",
      subject: "New GameSwap message",
      body: `${user.name.split(" ")[0]} sent you a message.`,
      path: `/messages/${threadId}`,
    })));
  }

  revalidatePath(`/messages/${threadId}`);
  revalidatePath("/messages");
  await audit({ actorUserId: user.id, action: "message.sent", entityType: "conversation", entityId: threadId });
  return {
    id: message.id,
    senderId: message.senderId,
    kind: "user" as const,
    body: message.body,
    sentAt: message.sentAt.toISOString(),
  };
}

export async function startConversationAction(listingId: string, body: string) {
  const user = await requireSessionUser();
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new Error("Listing not found.");
  if (listing.sellerId === user.id) throw new Error("This is your listing.");
  if (messageLooksUnsafe(body)) {
    throw new Error("That message looks like it contains payment info, a card number, or a barcode/QR reference.");
  }

  const existing = await prisma.messageThread.findFirst({
    where: {
      listingId,
      tradeId: null,
      AND: [{ participants: { some: { userId: user.id } } }, { participants: { some: { userId: listing.sellerId } } }],
    },
  });
  if (existing) {
    if (body.trim()) await sendMessageAction(existing.id, body);
    return { threadId: existing.id };
  }

  const thread = await prisma.messageThread.create({
    data: {
      listingId,
      participants: {
        create: [
          { userId: user.id, unread: false },
          { userId: listing.sellerId, unread: true },
        ],
      },
      messages: body.trim()
        ? { create: [{ senderId: user.id, kind: "user", body: body.trim() }] }
        : undefined,
    },
  });

  revalidatePath("/messages");
  return { threadId: thread.id };
}

export async function startWantedConversationAction(wantedId: string, body: string) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "conversation-start", userId: user.id, limit: 20, windowSeconds: 3600 });
  const request = await prisma.wantedRequest.findFirst({
    where: { id: wantedId, status: "active", expiresAt: { gt: new Date() } },
  });
  if (!request) throw new Error("This request is no longer active.");
  if (request.requesterId === user.id) throw new Error("This is your request.");
  if (messageLooksUnsafe(body)) {
    throw new Error("That message looks like it contains payment info, a card number, or a barcode/QR reference.");
  }
  await assertNotBlocked(user.id, request.requesterId);

  const existing = await prisma.messageThread.findFirst({
    where: {
      wantedRequestId: request.id,
      AND: [
        { participants: { some: { userId: user.id } } },
        { participants: { some: { userId: request.requesterId } } },
      ],
    },
  });
  if (existing) {
    if (body.trim()) await sendMessageAction(existing.id, body);
    return { threadId: existing.id };
  }

  const thread = await prisma.messageThread.create({
    data: {
      wantedRequestId: request.id,
      participants: {
        create: [
          { userId: user.id, unread: false },
          { userId: request.requesterId, unread: true },
        ],
      },
      messages: {
        create: [
          {
            senderId: user.id,
            kind: "system",
            body: "Started from a tickets-wanted request.",
          },
          ...(body.trim() ? [{ senderId: user.id, kind: "user" as const, body: body.trim() }] : []),
        ],
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: request.requesterId,
      type: "wanted_match",
      title: "Someone has tickets you want",
      body: `${user.name.split(" ")[0]} responded to your request.`,
      urgency: "high",
    },
  });

  revalidatePath("/messages");
  return { threadId: thread.id };
}

export async function markNotificationsReadAction(ids?: string[]) {
  const user = await requireSessionUser();
  await prisma.notification.updateMany({
    where: ids?.length ? { userId: user.id, id: { in: ids } } : { userId: user.id },
    data: { read: true },
  });
  revalidatePath("/notifications");
}

export async function markThreadReadAction(threadId: string) {
  const user = await requireSessionUser();
  await prisma.threadParticipant.updateMany({
    where: { threadId, userId: user.id },
    data: { unread: false, lastReadAt: new Date() },
  });
}

export async function blockUserAction(blockedUserId: string) {
  const user = await requireActiveUser();
  const parsed = z.string().cuid().parse(blockedUserId);
  if (parsed === user.id) throw new Error("You cannot block your own account.");
  await prisma.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: parsed } },
    update: {},
    create: { blockerId: user.id, blockedId: parsed },
  });
  await audit({ actorUserId: user.id, action: "user.blocked", entityType: "user", entityId: parsed });
  revalidatePath("/messages");
}

export async function reportMessageAction(messageId: string, reason: string) {
  const user = await requireActiveUser();
  const input = z.object({ messageId: z.string().cuid(), reason: z.string().trim().min(3).max(500) }).parse({ messageId, reason });
  const message = await prisma.message.findFirst({
    where: { id: input.messageId, thread: { participants: { some: { userId: user.id } } } },
    select: { id: true },
  });
  if (!message) throw new Error("Message not found.");
  await prisma.report.create({ data: { userId: user.id, messageId: message.id, reason: input.reason } });
  await audit({ actorUserId: user.id, action: "message.reported", entityType: "message", entityId: message.id });
}

export async function createCircleAction(input: { name: string; type: string; description: string; favoriteTeamId?: string }) {
  const user = await requireSessionUser();
  const name = input.name.trim();
  if (!name) throw new Error("Circle name is required.");

  const circle = await prisma.circle.create({
    data: {
      name,
      type: input.type,
      description: input.description.trim(),
      favoriteTeamId: input.favoriteTeamId || null,
      ownerId: user.id,
      members: { create: { userId: user.id, isAdmin: true } },
    },
  });

  revalidatePath("/circles");
  return { id: circle.id };
}

export async function joinCircleAction(circleId: string) {
  const user = await requireSessionUser();
  await prisma.circleMember.upsert({
    where: { circleId_userId: { circleId, userId: user.id } },
    update: {},
    create: { circleId, userId: user.id },
  });
  revalidatePath(`/circles/${circleId}`);
}

export async function toggleSaveListingAction(listingId: string) {
  const user = await requireActiveUser();
  const id = z.string().cuid().parse(listingId);
  const listing = await prisma.listing.findFirst({ where: { id, status: "active", visibility: "public" }, select: { id: true } });
  if (!listing) throw new Error("This listing is not available.");
  const existing = await prisma.savedListing.findUnique({
    where: { userId_listingId: { userId: user.id, listingId } },
  });
  if (existing) {
    await prisma.savedListing.delete({ where: { id: existing.id } });
    await prisma.listing.update({
      where: { id: listingId },
      data: { savedCount: { decrement: 1 } },
    });
    return { saved: false };
  }
  await prisma.savedListing.create({ data: { userId: user.id, listingId } });
  await prisma.listing.update({
    where: { id: listingId },
    data: { savedCount: { increment: 1 } },
  });
  return { saved: true };
}

export async function reportListingAction(listingId: string, reason: string, details?: string) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "report-create", userId: user.id, limit: 15, windowSeconds: 3600 });
  const input = z.object({ listingId: z.string().cuid(), reason: z.string().trim().min(3).max(100), details: z.string().trim().max(2000).optional() }).parse({ listingId, reason, details });
  await prisma.report.create({
    data: { userId: user.id, listingId: input.listingId, reason: input.reason, details: input.details || null },
  });
  await audit({ actorUserId: user.id, action: "listing.reported", entityType: "listing", entityId: input.listingId });
}

export async function createReviewAction(revieweeId: string, tradeId: string, rating: number, text: string) {
  const user = await requireActiveUser();
  const input = z.object({
    revieweeId: z.string().cuid(),
    tradeId: z.string().cuid(),
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().min(10).max(2000),
  }).parse({ revieweeId, tradeId, rating, text });
  const transaction = await prisma.transaction.findUnique({ where: { legacyTradeId: input.tradeId } });
  if (!transaction) throw new Error("Transaction not found.");
  assertReviewEligible({ ...transaction, authorId: user.id, revieweeId: input.revieweeId });

  await prisma.review.create({
    data: {
      revieweeId: input.revieweeId,
      authorId: user.id,
      transactionId: transaction.id,
      rating: input.rating,
      text: input.text,
      context: "Completed GameSwap trade",
      moderationStatus: "published",
    },
  });
  await audit({ actorUserId: user.id, action: "review.created", entityType: "transaction", entityId: transaction.id });
  revalidatePath(`/profile/${input.revieweeId}`);
}

export async function updateProfileAction(input: {
  displayName: string;
  homeCity?: string;
  image?: string;
  favoriteTeamIds: string[];
  favoriteLeagueIds: string[];
}) {
  const user = await requireActiveUser();
  const data = z.object({
    displayName: z.string().trim().min(2).max(80),
    homeCity: z.string().trim().max(100).optional(),
    image: z.string().url().max(2000).optional().or(z.literal("")),
    favoriteTeamIds: z.array(z.string().max(100)).max(20),
    favoriteLeagueIds: z.array(z.string().max(100)).max(20),
  }).parse(input);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: data.displayName,
      initials: data.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      homeCity: data.homeCity || null,
      image: data.image || null,
      favoriteTeamIds: json(data.favoriteTeamIds),
      favoriteLeagueIds: json(data.favoriteLeagueIds),
    },
  });
  await audit({ actorUserId: user.id, action: "profile.updated", entityType: "user", entityId: user.id });
  revalidatePath("/profile");
  return { success: true };
}

export async function updateNotificationPreferencesAction(input: {
  emailMessages: boolean;
  emailOffers: boolean;
  emailTransfers: boolean;
  emailPayments: boolean;
  emailDisputes: boolean;
  emailMarketing: boolean;
}) {
  const user = await requireActiveUser();
  const data = z.object({
    emailMessages: z.boolean(),
    emailOffers: z.boolean(),
    emailTransfers: z.boolean(),
    emailPayments: z.boolean(),
    emailDisputes: z.boolean(),
    emailMarketing: z.boolean(),
  }).parse(input);
  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  await audit({ actorUserId: user.id, action: "notifications.updated", entityType: "user", entityId: user.id });
  return { success: true };
}

export async function deleteAccountAction() {
  const user = await requireActiveUser();
  const [openTransactions, openDisputes] = await Promise.all([
    prisma.transaction.count({
      where: {
        OR: [{ buyerId: user.id }, { sellerId: user.id }],
        status: { notIn: ["completed", "cancelled", "refunded"] },
      },
    }),
    prisma.dispute.count({
      where: {
        status: { not: "resolved" },
        transaction: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      },
    }),
  ]);
  if (openTransactions || openDisputes) {
    throw new Error("Resolve open transactions and disputes before deleting your account.");
  }
  const anonymizedEmail = `deleted+${randomUUID()}@users.invalid`;
  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.account.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: "Deleted user",
        email: anonymizedEmail,
        emailVerified: false,
        image: null,
        initials: "DU",
        homeCity: null,
        favoriteTeamIds: "[]",
        favoriteLeagueIds: "[]",
        verifiedPhone: false,
        identityCheck: "not_started",
        stripeAccountId: null,
        accountStatus: "deleted",
        deleteRequestedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: { actorUserId: user.id, action: "account.deleted", entityType: "user", entityId: user.id },
    });
  });
  return { success: true };
}
