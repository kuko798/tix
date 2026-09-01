import { TeamCrest } from "@/components/marketplace/team-crest";
import { getGame, getTeam } from "@/lib/catalog";
import { formatGameDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function Half({
  label,
  gameId,
  meta,
}: {
  label: string;
  gameId: string;
  meta: string;
}) {
  const game = getGame(gameId);
  const home = getTeam(game.homeTeamId);
  const away = getTeam(game.awayTeamId);

  return (
    <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
      <p className="tabular text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-3 flex items-center gap-2.5">
        <div className="flex shrink-0 -space-x-1">
          <TeamCrest team={away} size="sm" />
          <TeamCrest team={home} size="sm" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">
            {away.name} at {home.name}
          </p>
          <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
            {formatGameDate(game.startTime)}
          </p>
        </div>
      </div>
      <p className="tabular mt-3 text-xs text-foreground">{meta}</p>
    </div>
  );
}

export function ExchangePair({
  giveGameId,
  getGameId,
  giveMeta,
  getMeta,
  className,
}: {
  giveGameId: string;
  getGameId: string;
  giveMeta: string;
  getMeta: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 border border-border bg-card md:grid-cols-[1fr_1px_1fr]",
        className
      )}
    >
      <Half label="You give" gameId={giveGameId} meta={giveMeta} />
      <div className="perf-h md:hidden" aria-hidden />
      <div className="perf-v hidden md:block" aria-hidden />
      <Half label="You get" gameId={getGameId} meta={getMeta} />
    </div>
  );
}
