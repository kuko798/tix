import { teams as referenceTeams, getTeam as getReferenceTeam } from "@/lib/mock/teams";
import { venues as referenceVenues, getVenue as getReferenceVenue } from "@/lib/mock/venues";
import { games as prototypeGames, getGame as getPrototypeGame } from "@/lib/mock/games";

// Prototype events are opt-in for local visual development only. Production
// marketplace flows load the persistent event catalog from /api/events.
const prototypeCatalogEnabled =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true";

export const teams = referenceTeams;
export const venues = referenceVenues;
export const games = prototypeCatalogEnabled ? prototypeGames : [];

export function getTeam(id: string) {
  return getReferenceTeam(id);
}

export function getVenue(id: string) {
  return getReferenceVenue(id);
}

export function getGame(id: string) {
  if (!prototypeCatalogEnabled) {
    throw new Error("This event is not available in the persistent catalog.");
  }
  return getPrototypeGame(id);
}
