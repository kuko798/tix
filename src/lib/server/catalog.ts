import "server-only";

import { prisma } from "@/lib/prisma";
import type { Game, League, Sport, Team, Venue } from "@/lib/types";

function mapTeam(team: { id: string; name: string; city: string; abbreviation: string; primaryColor: string | null; secondaryColor: string | null; league: { slug: string } }): Team {
  return {
    id: team.id,
    name: team.name,
    city: team.city,
    initials: team.abbreviation,
    league: team.league.slug.toUpperCase() as League,
    primaryColor: team.primaryColor ?? "#243428",
    secondaryColor: team.secondaryColor ?? "#eef0e6",
  };
}

export async function listUpcomingEvents(): Promise<Game[]> {
  const events = await prisma.event.findMany({
    where: { startsAt: { gt: new Date() }, status: { in: ["scheduled", "rescheduled"] } },
    include: { league: true, venue: true, homeTeam: { include: { league: true } }, awayTeam: { include: { league: true } } },
    orderBy: { startsAt: "asc" },
    take: 500,
  });
  return events.flatMap((event) => {
    if (!event.homeTeam || !event.awayTeam) return [];
    const venue: Venue = { id: event.venue.id, name: event.venue.name, city: event.venue.city, state: event.venue.region };
    return [{
      id: event.id,
      sport: event.league.sport as Sport,
      league: event.league.slug.toUpperCase() as League,
      homeTeamId: event.homeTeam.id,
      awayTeamId: event.awayTeam.id,
      venueId: event.venue.id,
      startTime: event.startsAt.toISOString(),
      seriesLabel: event.name,
      homeTeam: mapTeam(event.homeTeam),
      awayTeam: mapTeam(event.awayTeam),
      venue,
    } satisfies Game];
  });
}
