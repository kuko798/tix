import { cn } from "@/lib/utils";

export function SwapLine({
  leftLabel = "HAVE",
  leftValue,
  rightLabel = "WANT",
  rightValue,
  className,
  inverse = false,
}: {
  leftLabel?: string;
  leftValue: string;
  rightLabel?: string;
  rightValue: string;
  className?: string;
  inverse?: boolean;
}) {
  return (
    <div className={cn("swap-line", inverse && "swap-line-inverse", className)}>
      <div className="swap-end">
        <span>{leftLabel}</span>
        <strong>{leftValue}</strong>
      </div>
      <div className="swap-track" aria-hidden>
        <span>SWAP</span>
      </div>
      <div className="swap-end swap-end-right">
        <span>{rightLabel}</span>
        <strong>{rightValue}</strong>
      </div>
    </div>
  );
}
