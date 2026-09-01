import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server/policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";

const schema = z.object({
  gameId: z.string().min(1).max(200),
  issuer: z.string().min(1).max(100),
  section: z.string().trim().min(1).max(50),
  row: z.string().trim().min(1).max(50),
  quantity: z.number().int().min(1).max(20),
  seatLevel: z.string().min(1).max(100),
  parkingIncluded: z.boolean(),
  benefits: z.array(z.string().trim().min(1).max(100)).max(20),
  listingType: z.enum(["trade", "sale", "trade_or_sale"]),
  faceValuePerTicket: z.number().finite().min(0).max(1_000_000),
  askingCashAdjustment: z.number().finite().min(0).max(1_000_000).optional(),
  acceptsCash: z.boolean(),
  acceptsGamesDescription: z.string().trim().max(1000).optional(),
  flexibleOnDate: z.boolean(),
  flexibleOnSection: z.boolean(),
  evidenceFileName: z.string().nullable().optional(),
  visibility: z.enum(["public", "circle", "private"]),
  circleId: z.string().cuid().optional(),
  accessible: z.boolean().optional(),
});

const editSchema = z.object({
  listingId: z.string().cuid(),
  expectedVersion: z.number().int().positive(),
  section: z.string().trim().min(1).max(50),
  row: z.string().trim().min(1).max(50),
  quantity: z.number().int().min(1).max(20),
  faceValuePerTicket: z.number().finite().min(0).max(1_000_000),
  acceptsGamesDescription: z.string().trim().max(1000),
  accessible: z.boolean(),
});

function fingerprint(input: { sellerId: string; gameId: string; section: string; row: string; quantity: number }) {
  return createHash("sha256")
    .update(`${input.sellerId}|${input.gameId}|${input.section.toLowerCase()}|${input.row.toLowerCase()}|${input.quantity}`)
    .digest("hex");
}

export async function createListing(rawInput: unknown) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "listing-create", userId: user.id, limit: 12, windowSeconds: 3600 });
  const input = schema.parse(rawInput);
  if (input.visibility === "circle") {
    if (!input.circleId) throw new Error("Choose a fan circle for this listing.");
    const membership = await prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId: input.circleId, userId: user.id } },
      select: { id: true },
    });
    if (!membership) throw new Error("You cannot publish to a circle you have not joined.");
  }
  const event = await prisma.event.findUnique({ where: { id: input.gameId }, select: { startsAt: true, status: true } });
  if (!event) throw new Error("Choose an event from the current catalog.");
  const expiresAt = event?.startsAt;
  if (event && (event.startsAt <= new Date() || !["scheduled", "rescheduled"].includes(event.status))) {
    throw new Error("This event is not open for new listings.");
  }
  const activeFingerprint = fingerprint({ sellerId: user.id, ...input });
  const duplicate = await prisma.listing.findFirst({ where: { activeFingerprint, status: { in: ["active", "pending"] } } });
  if (duplicate) throw new Error("You already have an active listing for these seats.");

  const listing = await prisma.listing.create({
    data: {
      gameId: input.gameId,
      eventId: event ? input.gameId : null,
      sellerId: user.id,
      quantity: input.quantity,
      section: input.section,
      row: input.row,
      seatLevel: input.seatLevel,
      issuer: input.issuer,
      listingType: input.listingType,
      faceValuePerTicket: input.faceValuePerTicket,
      estimatedValuePerTicket: input.faceValuePerTicket,
      askingCashAdjustment: input.askingCashAdjustment,
      askingPriceCents: input.listingType === "trade" ? null : Math.round(input.faceValuePerTicket * 100),
      parkingIncluded: input.parkingIncluded,
      benefits: JSON.stringify(input.benefits),
      acceptsCash: input.acceptsCash,
      acceptsGamesDescription: input.acceptsGamesDescription || null,
      flexibleOnDate: input.flexibleOnDate,
      flexibleOnSection: input.flexibleOnSection,
      visibility: input.visibility,
      circleId: input.visibility === "circle" ? input.circleId : null,
      accessible: input.accessible ?? false,
      transferReadiness: "information_submitted",
      evidenceFileName: null,
      expiresAt,
      activeFingerprint,
    },
  });
  const matchingRequests = event ? await prisma.wantedRequest.findMany({
    where: {
      eventId: input.gameId,
      status: "active",
      expiresAt: { gt: new Date() },
      quantityMin: { lte: input.quantity },
      maxBudget: { gte: input.faceValuePerTicket * input.quantity },
      requesterId: { not: user.id },
    },
    select: { id: true, requesterId: true },
    take: 25,
  }) : [];
  if (matchingRequests.length) {
    await prisma.notification.createMany({
      data: matchingRequests.map((request) => ({
        userId: request.requesterId,
        type: "wanted_match",
        title: "New listing matches your wanted post",
        body: "The event, quantity, and budget align with your request.",
        urgency: "medium",
        relatedListingId: listing.id,
      })),
    });
  }
  await audit({ actorUserId: user.id, action: "listing.created", entityType: "listing", entityId: listing.id });
  return { id: listing.id };
}

export async function updateOwnedListingStatus(rawListingId: unknown, status: "active" | "paused" | "cancelled") {
  const user = await requireActiveUser();
  const listingId = z.string().cuid().parse(rawListingId);
  const listing = await prisma.listing.findFirst({ where: { id: listingId, sellerId: user.id } });
  if (!listing) throw new Error("Listing not found.");
  if (["completed", "expired", "cancelled"].includes(listing.status)) throw new Error("This listing can no longer be changed.");
  const hasAcceptedOffer = await prisma.offer.count({ where: { listingId, status: "accepted" } });
  if (hasAcceptedOffer && status !== "cancelled") throw new Error("A listing with an accepted offer cannot be changed.");
  if (hasAcceptedOffer && status === "cancelled") throw new Error("Cancel the transaction or open a dispute instead.");

  const activeFingerprint = status === "active"
    ? fingerprint({ sellerId: user.id, gameId: listing.gameId, section: listing.section, row: listing.row, quantity: listing.quantity })
    : null;
  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status,
      activeFingerprint,
      pausedAt: status === "paused" ? new Date() : null,
      cancelledAt: status === "cancelled" ? new Date() : null,
      version: { increment: 1 },
    },
  });
  await audit({ actorUserId: user.id, action: `listing.${status}`, entityType: "listing", entityId: listing.id });
  return { status };
}

export async function editOwnedListing(rawInput: unknown) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "listing-edit", userId: user.id, limit: 30, windowSeconds: 3600 });
  const input = editSchema.parse(rawInput);
  const listing = await prisma.listing.findFirst({ where: { id: input.listingId, sellerId: user.id } });
  if (!listing || !["active", "paused"].includes(listing.status)) throw new Error("This listing cannot be edited.");
  const acceptedOffers = await prisma.offer.count({ where: { listingId: listing.id, status: "accepted" } });
  if (acceptedOffers) throw new Error("A listing with an accepted offer cannot be edited.");
  const nextFingerprint = listing.status === "active"
    ? fingerprint({ sellerId: user.id, gameId: listing.gameId, section: input.section, row: input.row, quantity: input.quantity })
    : null;
  if (nextFingerprint) {
    const duplicate = await prisma.listing.findFirst({ where: { activeFingerprint: nextFingerprint, id: { not: listing.id } } });
    if (duplicate) throw new Error("You already have an active listing for these seats.");
  }
  const changed = await prisma.listing.updateMany({
    where: { id: listing.id, sellerId: user.id, version: input.expectedVersion },
    data: {
      section: input.section,
      row: input.row,
      quantity: input.quantity,
      faceValuePerTicket: input.faceValuePerTicket,
      estimatedValuePerTicket: input.faceValuePerTicket,
      askingPriceCents: listing.listingType === "trade" ? null : Math.round(input.faceValuePerTicket * 100),
      acceptsGamesDescription: input.acceptsGamesDescription || null,
      accessible: input.accessible,
      activeFingerprint: nextFingerprint,
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new Error("This listing changed. Refresh and try again.");
  await audit({ actorUserId: user.id, action: "listing.edited", entityType: "listing", entityId: listing.id });
  return { id: listing.id };
}
