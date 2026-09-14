import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, withApiErrors } from "@/lib/server/http";
import { createEvidenceDownloadUrl } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";

export const GET = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(request);
  const { id } = await params;
  const evidence = await prisma.disputeEvidence.findFirst({ where: { id, uploadStatus: "uploaded", ...(user.role === "admin" ? {} : { dispute: { trade: { OR: [{ userAId: user.id }, { userBId: user.id }] } } }) } });
  if (!evidence) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  await audit({ actorUserId: user.id, action: "dispute.evidence_viewed", entityType: "disputeEvidence", entityId: id });
  return NextResponse.redirect(await createEvidenceDownloadUrl(evidence.objectKey));
});
