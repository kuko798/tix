import type { Venue } from "@/lib/types";

export const venues: Venue[] = [
  { id: "soldier-field", name: "Soldier Field", city: "Chicago", state: "IL" },
  { id: "ford-field", name: "Ford Field", city: "Detroit", state: "MI" },
  { id: "lambeau-field", name: "Lambeau Field", city: "Green Bay", state: "WI" },
  { id: "united-center", name: "United Center", city: "Chicago", state: "IL" },
  { id: "wrigley-field", name: "Wrigley Field", city: "Chicago", state: "IL" },
  { id: "wintrust-arena", name: "Wintrust Arena", city: "Chicago", state: "IL" },
  { id: "seatgeek-stadium", name: "SeatGeek Stadium", city: "Bridgeview", state: "IL" },
  { id: "memorial-stadium", name: "Memorial Stadium", city: "Champaign", state: "IL" },
  { id: "state-farm-center", name: "State Farm Center", city: "Champaign", state: "IL" },
];

export function getVenue(id: string): Venue {
  const venue = venues.find((v) => v.id === id);
  if (!venue) throw new Error(`Unknown venue id: ${id}`);
  return venue;
}
