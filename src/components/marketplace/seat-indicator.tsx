import { Armchair } from "lucide-react";
import type { SeatGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

const RELATIONSHIP_LABEL: Record<SeatGroup["relationship"], string> = {
  confirmed_adjacent: "Confirmed adjacent",
  same_row_gap: "Same row, small gap",
  nearby_rows: "Nearby rows",
  same_section: "Same section",
  proximity_unknown: "Proximity unknown",
};

const RELATIONSHIP_TONE: Record<SeatGroup["relationship"], string> = {
  confirmed_adjacent: "bg-success-tint text-success-tint-foreground",
  same_row_gap: "bg-info-tint text-info-tint-foreground",
  nearby_rows: "bg-warning-tint text-warning-tint-foreground",
  same_section: "bg-muted text-muted-foreground",
  proximity_unknown: "bg-muted text-muted-foreground",
};

export function SeatIndicator({ group, className }: { group: SeatGroup; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border border-border bg-card p-3", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Armchair className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {group.quantity} seats &middot; Section {group.section}
        </p>
        <p className="text-xs text-muted-foreground">{group.rowLabel}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
          RELATIONSHIP_TONE[group.relationship]
        )}
      >
        {RELATIONSHIP_LABEL[group.relationship]}
      </span>
    </div>
  );
}
