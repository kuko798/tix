import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, withApiErrors } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { assertEvidenceUploaded, createEvidenceUploadUrl, MAX_EVIDENCE_BYTES } from "@/lib/server/storage";
import { serviceReadiness } from "@/lib/server/env";

const schema = z.object({ disputeId: z.string().cuid(), originalName: z.string().min(1).max(200), mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]), byteSize: z.number().int().positive().max(MAX_EVIDENCE_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/i) });
export const POST = withApiErrors(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  if (!serviceReadiness.privateUploads) return NextResponse.json({ error: "Private uploads are not configured." }, { status: 503 });
  await enforceRateLimit({ scope: "dispute-evidence", userId: user.id, limit: 12, windowSeconds: 3600 });
  const input = schema.parse(await request.json());
  const dispute = await prisma.dispute.findFirst({ where: { id: input.disputeId, status: { not: "resolved" }, trade: { OR: [{ userAId: user.id }, { userBId: user.id }] } } });
  if (!dispute) return NextResponse.json({ error: "Open dispute not found." }, { status: 404 });
  const extension = input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "image/png" ? "png" : "jpg";
  const objectKey = `disputes/${dispute.id}/${user.id}/${randomUUID()}.${extension}`;
  const uploadUrl = await createEvidenceUploadUrl(objectKey, input.mimeType, input.byteSize);
  const evidence = await prisma.disputeEvidence.create({ data: { disputeId: dispute.id, uploadedById: user.id, objectKey, originalName: input.originalName, mimeType: input.mimeType, byteSize: input.byteSize, sha256: input.sha256.toLowerCase() } });
  return NextResponse.json({ evidenceId: evidence.id, uploadUrl });
});
export const PATCH = withApiErrors(async (request: NextRequest) => {
  const user = await requireApiUser(request);
  const { evidenceId } = z.object({ evidenceId: z.string().cuid() }).parse(await request.json());
  const evidence = await prisma.disputeEvidence.findFirst({ where: { id: evidenceId, uploadedById: user.id, dispute: { status: { not: "resolved" } } } });
  if (!evidence) return NextResponse.json({ error: "Evidence upload not found." }, { status: 404 });
  if (evidence.uploadStatus === "uploaded") return NextResponse.json({ success: true });
  const confirmedKey = await assertEvidenceUploaded(evidence.objectKey, evidence.byteSize, evidence.mimeType, evidence.sha256);
  await prisma.disputeEvidence.updateMany({ where: { id: evidence.id, uploadStatus: "uploading" }, data: { uploadStatus: "uploaded", objectKey: confirmedKey } });
  return NextResponse.json({ success: true });
});
