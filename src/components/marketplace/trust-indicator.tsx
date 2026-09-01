import { BadgeCheck, Mail, Phone, ShieldCheck } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TrustIndicator({
  user,
  compact = false,
  className,
}: {
  user: UserProfile;
  compact?: boolean;
  className?: string;
}) {
  const accountAge = formatRelativeTime(user.accountCreatedAt).replace(" ago", "");

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <span className="font-medium text-foreground">{user.displayName}</span>
        <span aria-hidden>&middot;</span>
        <span>Member for {accountAge}</span>
        {user.identityCheck === "verified" ? (
          <span className="inline-flex items-center gap-1 text-success">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            ID checked
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="font-medium">{user.displayName}</span>
        <span className="text-xs text-muted-foreground">Member for {accountAge}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {user.verifiedEmail && (
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" aria-hidden /> Email verified
          </span>
        )}
        {user.verifiedPhone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" aria-hidden /> Phone verified
          </span>
        )}
        {user.identityCheck === "verified" && (
          <span className="inline-flex items-center gap-1 text-success">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Identity checked
          </span>
        )}
        {user.identityCheck === "pending" && (
          <span className="inline-flex items-center gap-1 text-warning-tint-foreground">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Identity check pending
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{user.completedSwaps} swaps completed</span>
        <span>{user.completedSales} sales completed</span>
        <span>{user.responseRatePct}% response rate</span>
      </div>
    </div>
  );
}
