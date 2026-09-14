import { NextResponse } from "next/server";
import { requireApiAdmin, withApiErrors } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { syncTicketmasterEvents } from "@/lib/server/event-sync";
import { audit } from "@/lib/server/audit";

export const POST = withApiErrors(async (request: Request) => {
  const admin = await requireApiAdmin(request);
  await enforceRateLimit({ scope: "event-sync", userId: admin.id, limit: 4, windowSeconds: 3600 });
  const result = await syncTicketmasterEvents();
  await audit({ actorUserId: admin.id, action: "events.synced", entityType: "catalog", metadata: result });
  return NextResponse.json(result);
});
