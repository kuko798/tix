import { NextRequest, NextResponse } from "next/server";
import { queryListings } from "@/lib/queries";
import type { League, ListingType, SeatLevel } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const listings = await queryListings({
    query: searchParams.get("query") ?? undefined,
    teamId: searchParams.get("teamId") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    venueId: searchParams.get("venueId") ?? undefined,
    eventId: searchParams.get("eventId") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    leagues: searchParams.get("leagues")?.split(",").filter(Boolean) as League[] | undefined,
    seatLevels: searchParams.get("seatLevels")?.split(",").filter(Boolean) as SeatLevel[] | undefined,
    listingTypes: searchParams.get("listingTypes")?.split(",").filter(Boolean) as ListingType[] | undefined,
    minQuantity: searchParams.get("minQuantity") ? Number(searchParams.get("minQuantity")) : undefined,
    maxPrice: searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : undefined,
    minPrice: searchParams.get("minPrice") ? Number(searchParams.get("minPrice")) : undefined,
    parkingOnly: searchParams.get("parkingOnly") === "1",
    accessibleOnly: searchParams.get("accessibleOnly") === "1",
    transferReadyOnly: searchParams.get("transferReadyOnly") === "1",
    sort: (searchParams.get("sort") as "soonest" | "recent" | "price_low" | "price_high") ?? "recent",
  });
  return NextResponse.json(listings);
}
