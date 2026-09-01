import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  OctagonAlert,
  TimerOff,
} from "lucide-react";
import { TRADE_STAGE_META, TRADE_STAGE_ORDER } from "@/lib/constants";
import { formatGameDateLong, formatGameTime } from "@/lib/format";
import type { Trade, TradeStage } from "@/lib/types";
import { cn } from "@/lib/utils";

const TERMINAL_META: Record<
  "cancelled" | "expired" | "disputed",
  { label: string; icon: typeof Ban; classes: string; description: string }
> = {
  cancelled: {
    label: "Trade cancelled",
    icon: Ban,
    classes: "border-border bg-muted text-muted-foreground",
    description: "This trade was cancelled before it completed. Any deposits were returned.",
  },
  expired: {
    label: "Trade expired",
    icon: TimerOff,
    classes: "border-border bg-muted text-muted-foreground",
    description: "The offer window closed before both fans authorized their deposits.",
  },
  disputed: {
    label: "Under dispute",
    icon: OctagonAlert,
    classes: "border-danger-tint bg-danger-tint text-danger-tint-foreground",
    description: "A dispute is open on this trade. Support is reviewing.",
  },
};

export function TransactionTimeline({ trade, viewerId }: { trade: Trade; viewerId: string }) {
  const completedMap = new Map(
    trade.history.map((event) => [event.stage, event])
  );
  const isTerminal = trade.stage === "cancelled" || trade.stage === "expired" || trade.stage === "disputed";
  const currentIndex = isTerminal
    ? TRADE_STAGE_ORDER.length
    : TRADE_STAGE_ORDER.indexOf(trade.stage as TradeStage);

  const waitingOnLabel = (() => {
    if (!trade.waitingOnUserId) return null;
    if (trade.waitingOnUserId === viewerId) return "Waiting on you";
    const waitingOn =
      trade.waitingOnUserId === trade.userAId ? trade.participantA : trade.participantB;
    return `Waiting on ${waitingOn.displayName}`;
  })();

  return (
    <ol className="relative space-y-0">
      {TRADE_STAGE_ORDER.map((stage, index) => {
        const event = completedMap.get(stage);
        const isDone = Boolean(event);
        const isCurrent = !isTerminal && index === currentIndex;
        const isLast = index === TRADE_STAGE_ORDER.length - 1;
        const meta = TRADE_STAGE_META[stage];

        return (
          <li key={stage} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-1.75rem)] w-px",
                  isDone ? "bg-success" : "bg-border"
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                isDone
                  ? "border-success bg-success text-success-foreground"
                  : isCurrent
                    ? "border-primary bg-background text-primary"
                    : "border-border bg-background text-muted-foreground"
              )}
            >
              {isDone ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              ) : (
                <CircleDashed className="h-4 w-4" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className={cn("font-medium", !isDone && !isCurrent && "text-muted-foreground")}>
                  {meta.label}
                </p>
                {isCurrent && waitingOnLabel && (
                  <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning-tint-foreground">
                    {waitingOnLabel}
                  </span>
                )}
              </div>
              {event?.completedAt && (
                <p className="text-xs text-muted-foreground">
                  {formatGameDateLong(event.completedAt)} at {formatGameTime(event.completedAt)}
                  {event.actorUserId
                    ? ` · ${
                        event.actorUserId === trade.userAId
                          ? trade.participantA.displayName
                          : event.actorUserId === trade.userBId
                            ? trade.participantB.displayName
                            : "Member"
                      }`
                    : ""}
                </p>
              )}
              {isCurrent && !event && (
                <p className="text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" aria-hidden />
                  In progress
                </p>
              )}
            </div>
          </li>
        );
      })}

      {isTerminal && (
        <li className="relative flex gap-4">
          {(() => {
            const meta = TERMINAL_META[trade.stage as "cancelled" | "expired" | "disputed"];
            const Icon = meta.icon;
            return (
              <>
                <span
                  className={cn(
                    "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                    meta.classes
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="font-medium">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
              </>
            );
          })()}
        </li>
      )}
    </ol>
  );
}
