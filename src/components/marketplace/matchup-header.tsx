import { MapPin } from "lucide-react";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { getTeam, getVenue } from "@/lib/catalog";
import { formatGameDate, formatGameTime } from "@/lib/format";
import type { Game } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MatchupHeader({
  game,
  size = "md",
  className,
}: {
  game: Game;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const home = game.homeTeam ?? getTeam(game.homeTeamId);
  const away = game.awayTeam ?? getTeam(game.awayTeamId);
  const venue = game.venue ?? getVenue(game.venueId);
  const crestSize = size === "lg" ? "lg" : size === "sm" ? "sm" : "md";
  const headlineClass =
    size === "lg" ? "text-2xl sm:text-3xl" : size === "sm" ? "text-base" : "text-xl";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <TeamCrest team={away} size={crestSize} />
        <div className="min-w-0">
          <p className={cn("font-display leading-tight tracking-tight text-balance", headlineClass)}>
            {away.city} {away.name}
            <span className="mx-2 text-muted-foreground">at</span>
            {home.city} {home.name}
          </p>
          {game.seriesLabel ? (
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{game.seriesLabel}</p>
          ) : null}
        </div>
        <TeamCrest team={home} size={crestSize} className="ml-auto sm:hidden" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {formatGameDate(game.startTime)}, {formatGameTime(game.startTime)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {venue.name}, {venue.city}
        </span>
      </div>
    </div>
  );
}
