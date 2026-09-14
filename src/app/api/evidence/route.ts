import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, withApiErrors } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { assertEvidenceUploaded, createEvidenceUploadUrl, validateEvidenceFile, MAX_EVIDENCE_BYTES } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";
import { serviceReadiness } from "@/lib/server/env";
import { fingerprint } from "@/lib/server/listings";

const requestSchema = z.object({
  listingId: z.string().cuid(),
  originalName: z.string().min(1).max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  byteSize: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
const confirmSchema = z.object({ evidenceId: z.string().cuid() });

export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!serviceReadiness.privateUploads) return NextResponse.json({ error: "Private uploads are not configured." }, { status: 503 });
  await enforceRateLimit({ scope: "evidence-upload", userId: user.id, limit: 12, windowSeconds: 3600 });
  const input = requestSchema.parse(await request.json());
  validateEvidenceFile(input);
  const listing = await prisma.listing.findFirst({ where: { id: input.listingId, sellerId: user.id } });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const extension = input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "image/png" ? "png" : "jpg";
  const objectKey = `evidence/${user.id}/${listing.id}/${randomUUID()}.${extension}`;
  const uploadUrl = await createEvidenceUploadUrl(objectKey, input.mimeType, input.byteSize);
  const evidence = await prisma.ownershipEvidence.create({
    data: {
      listingId: listing.id,
      uploadedById: user.id,
      objectKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      sha256: input.sha256.toLowerCase(),
      reviewStatus: "uploading",
    },
  });
  return NextResponse.json({ evidenceId: evidence.id, uploadUrl, expiresInSeconds: 300 });
});

export const PATCH = withApiErrors(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const input = confirmSchema.parse(await request.json());
  const evidence = await prisma.ownershipEvidence.findFirst({ where: { id: input.evidenceId, uploadedById: user.id } });
  if (!evidence) return NextResponse.json({ error: "Evidence upload not found." }, { status: 404 });
  if (evidence.reviewStatus !== "uploading") return NextResponse.json({ error: "This upload was already submitted for review." }, { status: 409 });
  const confirmedKey = await assertEvidenceUploaded(evidence.objectKey, evidence.byteSize, evidence.mimeType, evidence.sha256);
  try { await prisma.$transaction(async tx => {
    const claimed = await tx.ownershipEvidence.updateMany({ where: { id: evidence.id, reviewStatus: "uploading" }, data: { reviewStatus: "pending", objectKey: confirmedKey } });
    if (!claimed.count) return;
    const savedListing = await tx.listing.findUniqueOrThrow({ where: { id: evidence.listingId } });
    const activated = await tx.listing.updateMany({ where: { id: evidence.listingId, sellerId: user.id, status: "paused", version: savedListing.version, expiresAt: { gt: new Date() } }, data: { status: "active", activeFingerprint: fingerprint(savedListing) } });
    if (activated.count) {
      const listing = await tx.listing.findUniqueOrThrow({ where: { id: evidence.listingId } });
      if (listing.visibility === "public") {
        const matches = await tx.wantedRequest.findMany({ where: { eventId: listing.eventId!, status: "active", expiresAt: { gt: new Date() }, quantityMin: { lte: listing.quantity }, maxBudget: { gte: listing.faceValuePerTicket * listing.quantity }, requesterId: { not: user.id } }, select: { requesterId: true }, take: 25 });
        if (matches.length) await tx.notification.createMany({ data: matches.map(match => ({ userId: match.requesterId, type: "wanted_match", title: "New listing matches your wanted post", body: "The event, quantity, and budget align with your request.", urgency: "medium", relatedListingId: listing.id })) });
      }
    }
  }); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "You already have an active listing for these seats. Use that listing instead." }, { status: 409 });
    throw error;
  }
  await audit({ actorUserId: user.id, action: "evidence.uploaded", entityType: "listing", entityId: evidence.listingId });
  return NextResponse.json({ success: true });
});
