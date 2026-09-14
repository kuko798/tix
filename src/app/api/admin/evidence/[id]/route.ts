import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, withApiErrors } from "@/lib/server/http";
import { createEvidenceDownloadUrl } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";

export const GET = withApiErrors(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const admin = await requireApiAdmin(request);
  const { id } = await params;
  const evidence = await prisma.ownershipEvidence.findUnique({ where: { id }, select: { objectKey: true } });
  if (!evidence) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  await audit({ actorUserId: admin.id, action: "evidence.viewed", entityType: "ownershipEvidence", entityId: id });
  return NextResponse.redirect(await createEvidenceDownloadUrl(evidence.objectKey));
});
