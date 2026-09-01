import Link from "next/link";
import { Clock } from "lucide-react";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { TRADE_STAGE_META } from "@/lib/constants";
import { getGame, getTeam } from "@/lib/catalog";
import { formatCountdown } from "@/lib/format";
import type { Trade } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGE_TONE: Record<Trade["stage"], string> = {
  offer_accepted: "bg-muted text-muted-foreground",
  deposits_authorized: "bg-info-tint text-info-tint-foreground",
  transfer_initiated_a: "bg-warning-tint text-warning-tint-foreground",
  transfer_initiated_b: "bg-warning-tint text-warning-tint-foreground",
  tickets_accepted: "bg-success-tint text-success-tint-foreground",
  cash_released: "bg-success-tint text-success-tint-foreground",
  completed: "bg-success text-success-foreground",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  disputed: "bg-danger-tint text-danger-tint-foreground",
};

export function TradeSummaryCard({ trade, viewerId }: { trade: Trade; viewerId: string }) {
  const otherUser = trade.userAId === viewerId ? trade.participantB : trade.participantA;
  const primaryAsset = trade.assetsFromA.find((a) => a.gameId) ?? trade.assetsFromB.find((a) => a.gameId);
  const game = primaryAsset?.gameId ? getGame(primaryAsset.gameId) : null;
  const gameCount = new Set(
    [...trade.assetsFromA, ...trade.assetsFromB].map((a) => a.gameId).filter(Boolean)
  ).size;

  const waitingLabel = trade.waitingOnUserId
    ? trade.waitingOnUserId === viewerId
      ? "Waiting on you"
      : `Waiting on ${otherUser.displayName.split(" ")[0]}`
    : null;

  return (
    <Link
      href={`/trades/${trade.id}`}
      className="flex flex-col gap-3 border border-border bg-card p-4 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/30 sm:flex-row sm:items-center"
    >
      <div className="flex items-center gap-3 sm:w-72 sm:shrink-0">
        {game && <TeamCrest team={getTeam(game.homeTeamId)} size="sm" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {game ? `${getTeam(game.awayTeamId).name} at ${getTeam(game.homeTeamId).name}` : "Trade"}
            {gameCount > 1 ? ` + ${gameCount - 1} more` : ""}
          </p>
          <p className="text-xs text-muted-foreground">with {otherUser.displayName}</p>
        </div>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span className={cn("chip", STAGE_TONE[trade.stage])}>
          {TRADE_STAGE_META[trade.stage].label}
        </span>
        {waitingLabel && (
          <span className="chip bg-warning-tint text-warning-tint-foreground">{waitingLabel}</span>
        )}
      </div>
      {!["completed", "cancelled", "expired"].includes(trade.stage) && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {formatCountdown(trade.transferDeadline)}
        </span>
      )}
    </Link>
  );
}
