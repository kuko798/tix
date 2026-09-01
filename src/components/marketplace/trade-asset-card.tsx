"use client";

import { DollarSign, GripVertical, ParkingSquare, Ticket, X } from "lucide-react";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { Button } from "@/components/ui/button";
import { getGame, getTeam } from "@/lib/catalog";
import { formatCurrency, formatGameDate } from "@/lib/format";
import type { TradeAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TradeAssetCard({
  asset,
  onRemove,
  draggable = false,
  className,
}: {
  asset: TradeAsset;
  onRemove?: () => void;
  draggable?: boolean;
  className?: string;
}) {
  const game = asset.gameId ? getGame(asset.gameId) : undefined;
  const homeTeam = game ? getTeam(game.homeTeamId) : undefined;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-card p-3",
        className
      )}
    >
      {draggable && (
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
      )}
      {game && homeTeam ? (
        <TeamCrest team={homeTeam} size="sm" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          {asset.type === "parking" ? (
            <ParkingSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-balance">{asset.label}</p>
        <p className="text-xs text-muted-foreground">
          {game && `${formatGameDate(game.startTime)} · `}
          {asset.quantity ? `${asset.quantity} tickets` : asset.type === "parking" ? "Parking pass" : "Cash"}
          {asset.section ? ` · Sec ${asset.section}` : ""}
        </p>
      </div>
      <span className="shrink-0 self-start font-mono text-sm tabular-nums text-muted-foreground">
        {formatCurrency(asset.valueEstimate)}
      </span>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={onRemove}
          aria-label={`Remove ${asset.label}`}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function TradeAssetGroupIcon({ type }: { type: TradeAsset["type"] }) {
  if (type === "parking") return <ParkingSquare className="h-4 w-4" aria-hidden />;
  if (type === "cash") return <DollarSign className="h-4 w-4" aria-hidden />;
  return <Ticket className="h-4 w-4" aria-hidden />;
}
