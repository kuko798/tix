import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface PriceBreakdownLine {
  label: string;
  value: number;
  helpText?: string;
  emphasis?: boolean;
}

export function PriceBreakdown({
  offeredValue,
  receivedValue,
  cashAdjustment,
  platformFee,
  refundableDeposit,
  className,
}: {
  offeredValue: number;
  receivedValue: number;
  cashAdjustment: number;
  platformFee: number;
  refundableDeposit: number;
  className?: string;
}) {
  const totalDueToday = Math.max(cashAdjustment, 0) + platformFee + refundableDeposit;
  const releasedAfterCompletion = Math.max(-cashAdjustment, 0);

  const lines: PriceBreakdownLine[] = [
    { label: "What you're offering (est.)", value: offeredValue },
    { label: "What you'll receive (est.)", value: receivedValue },
    {
      label: cashAdjustment >= 0 ? "Cash you add" : "Cash you receive",
      value: Math.abs(cashAdjustment),
      helpText: cashAdjustment >= 0 ? undefined : "Released after the trade completes",
    },
    { label: "Platform fee", value: platformFee, helpText: "Covers protected transfers and support" },
    { label: "Refundable deposit", value: refundableDeposit, helpText: "Returned once both transfers are confirmed" },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      <dl className="space-y-2 text-sm">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">
              {line.label}
              {line.helpText ? (
                <span className="block text-xs text-muted-foreground/80">{line.helpText}</span>
              ) : null}
            </dt>
            <dd className="shrink-0 font-mono tabular-nums">{formatCurrency(line.value)}</dd>
          </div>
        ))}
      </dl>
      <Separator />
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">Total due today</span>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {formatCurrency(totalDueToday)}
        </span>
      </div>
      {releasedAfterCompletion > 0 ? (
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Released to you after completion</span>
          <span className="font-mono tabular-nums text-success">
            {formatSignedCurrency(releasedAfterCompletion)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
