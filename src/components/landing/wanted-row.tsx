import Link from "next/link";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { getGame, getTeam } from "@/lib/catalog";
import { formatCurrency, formatGameDate } from "@/lib/format";
import type { WantedRequest } from "@/lib/types";

export function WantedRow({ request }: { request: WantedRequest }) {
  const game = request.game ?? getGame(request.desiredGameId);
  const home = getTeam(game.homeTeamId);
  const away = getTeam(game.awayTeamId);
  const quantityLabel =
    request.quantityMin === request.quantityMax
      ? `${request.quantityMin} tix`
      : `${request.quantityMin}-${request.quantityMax} tix`;

  return (
    <Link
      href={`/wanted/${request.id}`}
      className="grid grid-cols-1 gap-2 py-5 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/40 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex shrink-0 -space-x-1">
          <TeamCrest team={away} size="sm" />
          <TeamCrest team={home} size="sm" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {away.name} at {home.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatGameDate(game.startTime)}, {quantityLabel}
            {request.preferredSections.length > 0
              ? `, ${request.preferredSections.slice(0, 2).join(", ")}`
              : ""}
          </p>
        </div>
      </div>
      <p className="tabular text-sm sm:text-right">Max {formatCurrency(request.maxBudget)}</p>
    </Link>
  );
}
