import type { League, Listing, ListingType, SeatLevel } from "@/lib/types";

export interface ListingFilters {
  query?: string;
  teamId?: string;
  city?: string;
  venueId?: string;
  eventId?: string;
  dateFrom?: string;
  dateTo?: string;
  leagues?: League[];
  seatLevels?: SeatLevel[];
  listingTypes?: ListingType[];
  minQuantity?: number;
  maxPrice?: number;
  minPrice?: number;
  parkingOnly?: boolean;
  accessibleOnly?: boolean;
  transferReadyOnly?: boolean;
  sort?: "soonest" | "recent" | "price_low" | "price_high";
}

export async function fetchListings(filters: ListingFilters): Promise<Listing[]> {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.teamId) params.set("teamId", filters.teamId);
  if (filters.city) params.set("city", filters.city);
  if (filters.venueId) params.set("venueId", filters.venueId);
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.leagues?.length) params.set("leagues", filters.leagues.join(","));
  if (filters.seatLevels?.length) params.set("seatLevels", filters.seatLevels.join(","));
  if (filters.listingTypes?.length) params.set("listingTypes", filters.listingTypes.join(","));
  if (filters.minQuantity) params.set("minQuantity", String(filters.minQuantity));
  if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minPrice) params.set("minPrice", String(filters.minPrice));
  if (filters.parkingOnly) params.set("parkingOnly", "1");
  if (filters.accessibleOnly) params.set("accessibleOnly", "1");
  if (filters.transferReadyOnly) params.set("transferReadyOnly", "1");
  if (filters.sort) params.set("sort", filters.sort);

  const response = await fetch(`/api/listings?${params.toString()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Connection to GameSwap failed. Check your network and try again.");
  }
  return response.json() as Promise<Listing[]>;
}
