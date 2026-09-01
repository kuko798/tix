import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  info: {
    icon: Info,
    classes: "border-info-tint bg-info-tint text-info-tint-foreground",
  },
  success: {
    icon: CheckCircle2,
    classes: "border-success-tint bg-success-tint text-success-tint-foreground",
  },
  warning: {
    icon: AlertTriangle,
    classes: "border-warning-tint bg-warning-tint text-warning-tint-foreground",
  },
  danger: {
    icon: OctagonAlert,
    classes: "border-danger-tint bg-danger-tint text-danger-tint-foreground",
  },
} as const;

export function AlertBanner({
  variant = "info",
  title,
  children,
  action,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, classes } = VARIANTS[variant];
  return (
    <div
      role={variant === "danger" || variant === "warning" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", classes, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        {children ? <div className="text-sm opacity-90">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}
