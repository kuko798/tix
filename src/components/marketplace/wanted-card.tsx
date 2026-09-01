import Link from "next/link";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { Button } from "@/components/ui/button";
import { getGame, getTeam, getVenue } from "@/lib/catalog";
import { formatCurrency, formatCountdown, formatGameDate } from "@/lib/format";
import type { WantedRequest } from "@/lib/types";

export function WantedCard({ request }: { request: WantedRequest }) {
  const game = request.game ?? getGame(request.desiredGameId);
  const home = getTeam(game.homeTeamId);
  const away = getTeam(game.awayTeamId);
  const venue = getVenue(game.venueId);
  const quantityLabel =
    request.quantityMin === request.quantityMax
      ? `${request.quantityMin} tickets`
      : `${request.quantityMin}-${request.quantityMax} tickets`;

  return (
    <div className="flex flex-col gap-4 border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex -space-x-1">
          <TeamCrest team={away} size="md" />
          <TeamCrest team={home} size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium leading-tight">
            Wants: {away.name} at {home.name}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatGameDate(game.startTime)}, {venue.name}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip">{quantityLabel}</span>
        <span className="chip">{request.preferredSections.join(", ")}</span>
        <span className="chip tabular bg-warning-tint text-warning-tint-foreground">
          Max {formatCurrency(request.maxBudget)}
        </span>
        {request.flexibleOnDate ? <span className="chip">Flexible on dates</span> : null}
      </div>

      <div className="bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Offering: </span>
        {request.offeringDescription}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{request.requester.displayName}</p>
          <p className="tabular mt-1 text-xs text-muted-foreground">{formatCountdown(request.expiresAt)}</p>
        </div>
        <Button asChild size="sm">
          <Link href={`/wanted/${request.id}`}>I have these</Link>
        </Button>
      </div>
    </div>
  );
}
