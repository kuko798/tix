import Link from "next/link";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { getTeam, getVenue } from "@/lib/catalog";
import { formatGameDate } from "@/lib/format";
import type { Game } from "@/lib/types";

export function GameRail({ games }: { games: Game[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory overflow-x-auto border-y border-border px-4 lg:mx-0 lg:px-0">
      {games.map((game) => {
        const home = game.homeTeam ?? getTeam(game.homeTeamId);
        const away = game.awayTeam ?? getTeam(game.awayTeamId);
        const venue = game.venue ?? getVenue(game.venueId);
        return (
          <Link
            key={game.id}
            href={`/discover?query=${encodeURIComponent(home.name)}`}
            className="group flex w-60 shrink-0 snap-start flex-col border-r border-border px-5 py-7 transition-colors duration-300 hover:bg-card sm:w-72 sm:py-9"
          >
            <div className="flex items-center gap-2">
              <TeamCrest team={away} size="sm" />
              <TeamCrest team={home} size="sm" />
            </div>
            <p className="font-display mt-8 text-2xl uppercase leading-[0.95] text-balance sm:text-3xl">
              {away.name} at {home.name}
            </p>
            <p className="tabular mt-6 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {formatGameDate(game.startTime)}
              <span className="mt-0.5 block font-sans">{venue.name}</span>
            </p>
          </Link>
        );
      })}
    </div>
  );
}
