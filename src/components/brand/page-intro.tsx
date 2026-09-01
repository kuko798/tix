import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageIntro({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-intro mb-10 flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between lg:mb-14", className)}>
      <div className="min-w-0">
        <p className="tabular mb-3 text-[10px] uppercase tracking-[0.18em] text-primary">GameSwap / Marketplace</p>
        <h1 className="font-display text-5xl uppercase leading-[0.88] sm:text-6xl lg:text-7xl">{title}</h1>
        {children ? (
          <p className="mt-2 max-w-[55ch] text-sm leading-relaxed text-muted-foreground">{children}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AppFrame({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: "wide" | "medium" | "narrow";
}) {
  const max =
    width === "narrow" ? "max-w-2xl" : width === "medium" ? "max-w-5xl" : "max-w-[1400px]";
  return <div className={cn("app-frame mx-auto w-full px-4 py-10 sm:px-6 lg:px-8 lg:py-16", max)}>{children}</div>;
}
