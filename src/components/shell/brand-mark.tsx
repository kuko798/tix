import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-[1.35rem] font-bold uppercase leading-none tracking-[-0.02em]", className)}>
      <span className="brand-glyph" aria-hidden><i /><i /></span>
      GameSwap
    </span>
  );
}
