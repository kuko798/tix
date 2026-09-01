import { CheckCircle2, CircleDashed, FileCheck2, Send, ShieldCheck } from "lucide-react";
import { TRANSFER_READINESS_META } from "@/lib/constants";
import type { TransferReadiness } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ICONS: Record<TransferReadiness, React.ComponentType<{ className?: string }>> = {
  information_submitted: CircleDashed,
  evidence_reviewed: FileCheck2,
  transfer_initiated: Send,
  transfer_accepted: CheckCircle2,
  issuer_verified: ShieldCheck,
};

const TONE: Record<TransferReadiness, string> = {
  information_submitted: "bg-muted text-muted-foreground border-border",
  evidence_reviewed: "bg-info-tint text-info-tint-foreground border-transparent",
  transfer_initiated: "bg-warning-tint text-warning-tint-foreground border-transparent",
  transfer_accepted: "bg-success-tint text-success-tint-foreground border-transparent",
  issuer_verified: "bg-success text-success-foreground border-transparent",
};

export function TransferReadinessBadge({
  status,
  className,
  showTooltip = true,
}: {
  status: TransferReadiness;
  className?: string;
  showTooltip?: boolean;
}) {
  const meta = TRANSFER_READINESS_META[status];
  const Icon = ICONS[status];

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium",
        TONE[status],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {meta.label}
    </span>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p>{meta.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
