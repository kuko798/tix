import { NextResponse } from "next/server";
import { listUpcomingEvents } from "@/lib/server/catalog";

export async function GET() {
  return NextResponse.json(await listUpcomingEvents(), {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
