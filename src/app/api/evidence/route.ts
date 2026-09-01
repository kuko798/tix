import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server/policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { assertEvidenceUploaded, createEvidenceUploadUrl, validateEvidenceFile } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";

const requestSchema = z.object({
  listingId: z.string().cuid(),
  originalName: z.string().min(1).max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
const confirmSchema = z.object({ evidenceId: z.string().cuid() });

export async function POST(request: NextRequest) {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "evidence-upload", userId: user.id, limit: 12, windowSeconds: 3600 });
  const input = requestSchema.parse(await request.json());
  validateEvidenceFile(input);
  const listing = await prisma.listing.findFirst({ where: { id: input.listingId, sellerId: user.id } });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  const extension = input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "image/png" ? "png" : "jpg";
  const objectKey = `evidence/${user.id}/${listing.id}/${randomUUID()}.${extension}`;
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
  const uploadUrl = await createEvidenceUploadUrl(objectKey, input.mimeType, input.byteSize);
  return NextResponse.json({ evidenceId: evidence.id, uploadUrl, expiresInSeconds: 300 });
}

export async function PATCH(request: NextRequest) {
  const user = await requireActiveUser();
  const input = confirmSchema.parse(await request.json());
  const evidence = await prisma.ownershipEvidence.findFirst({ where: { id: input.evidenceId, uploadedById: user.id } });
  if (!evidence) return NextResponse.json({ error: "Evidence upload not found." }, { status: 404 });
  await assertEvidenceUploaded(evidence.objectKey, evidence.byteSize);
  await prisma.ownershipEvidence.update({ where: { id: evidence.id }, data: { reviewStatus: "pending" } });
  await audit({ actorUserId: user.id, action: "evidence.uploaded", entityType: "listing", entityId: evidence.listingId });
  return NextResponse.json({ success: true });
}
