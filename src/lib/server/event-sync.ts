import "server-only";

import { prisma } from "@/lib/prisma";
import { env, assertServiceReady } from "@/lib/server/env";

type TicketmasterEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: { start?: { dateTime?: string }; status?: { code?: string } };
  classifications?: Array<{ segment?: { name?: string }; league?: { name?: string } }>;
  _embedded?: {
    venues?: Array<{ id: string; name: string; city?: { name?: string }; state?: { stateCode?: string }; country?: { countryCode?: string }; timezone?: string }>;
    attractions?: Array<{ id: string; name: string; locale?: string; externalLinks?: unknown; classifications?: Array<{ segment?: { name?: string } }> }>;
  };
};

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100);
}

export async function syncTicketmasterEvents() {
  assertServiceReady("eventSync");
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", env.TICKETMASTER_API_KEY!);
  url.searchParams.set("countryCode", "US");
  url.searchParams.set("classificationName", "sports");
  url.searchParams.set("size", "200");
  url.searchParams.set("sort", "date,asc");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Event provider returned ${response.status}.`);
  const payload = await response.json() as { _embedded?: { events?: TicketmasterEvent[] } };
  const events = payload._embedded?.events ?? [];
  let imported = 0;
  for (const event of events) {
    const startsAt = event.dates?.start?.dateTime ? new Date(event.dates.start.dateTime) : null;
    const venue = event._embedded?.venues?.[0];
    const attractions = event._embedded?.attractions ?? [];
    if (!startsAt || Number.isNaN(startsAt.getTime()) || !venue || attractions.length < 2) continue;
    const leagueName = event.classifications?.[0]?.league?.name ?? "Sports";
    const sport = event.classifications?.[0]?.segment?.name ?? "Sports";
    const league = await prisma.league.upsert({
      where: { slug: slug(leagueName) },
      create: { slug: slug(leagueName), name: leagueName, sport },
      update: { name: leagueName, sport, active: true },
    });
    const venueRow = await prisma.venue.upsert({
      where: { externalId: venue.id },
      create: {
        externalId: venue.id,
        slug: `${slug(venue.name)}-${venue.id.toLowerCase()}`,
        name: venue.name,
        city: venue.city?.name ?? "Unknown",
        region: venue.state?.stateCode ?? "",
        countryCode: venue.country?.countryCode ?? "US",
        timezone: venue.timezone ?? "UTC",
      },
      update: { name: venue.name, city: venue.city?.name ?? "Unknown", region: venue.state?.stateCode ?? "", timezone: venue.timezone ?? "UTC" },
    });
    const teams = [];
    for (const attraction of attractions.slice(0, 2)) {
      const nameParts = attraction.name.trim().split(/\s+/);
      const team = await prisma.team.upsert({
        where: { externalId: attraction.id },
        create: {
          externalId: attraction.id,
          slug: `${slug(attraction.name)}-${attraction.id.toLowerCase()}`,
          name: attraction.name,
          city: nameParts.slice(0, -1).join(" ") || attraction.name,
          abbreviation: nameParts.map((part) => part[0]).join("").slice(0, 4).toUpperCase(),
          leagueId: league.id,
        },
        update: { name: attraction.name, leagueId: league.id },
      });
      teams.push(team);
    }
    await prisma.event.upsert({
      where: { externalId: event.id },
      create: {
        externalId: event.id,
        slug: `${slug(event.name)}-${event.id.toLowerCase()}`,
        name: event.name,
        leagueId: league.id,
        venueId: venueRow.id,
        awayTeamId: teams[0].id,
        homeTeamId: teams[1].id,
        startsAt,
        status: event.dates?.status?.code ?? "scheduled",
        source: "ticketmaster-discovery",
        sourceUrl: event.url,
      },
      update: {
        name: event.name,
        leagueId: league.id,
        venueId: venueRow.id,
        awayTeamId: teams[0].id,
        homeTeamId: teams[1].id,
        startsAt,
        status: event.dates?.status?.code ?? "scheduled",
        sourceUrl: event.url,
      },
    });
    imported += 1;
  }
  return { imported, received: events.length };
}
