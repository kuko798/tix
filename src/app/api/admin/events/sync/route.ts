import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { syncTicketmasterEvents } from "@/lib/server/event-sync";
import { audit } from "@/lib/server/audit";

export async function POST() {
  const admin = await requireAdmin();
  await enforceRateLimit({ scope: "event-sync", userId: admin.id, limit: 4, windowSeconds: 3600 });
  const result = await syncTicketmasterEvents();
  await audit({ actorUserId: admin.id, action: "events.synced", entityType: "catalog", metadata: result });
  return NextResponse.json(result);
}
