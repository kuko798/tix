import { cn } from "@/lib/utils";
import type { Team } from "@/lib/types";

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
} as const;

export function TeamCrest({
  team,
  size = "md",
  className,
}: {
  team: Team;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-sm font-semibold leading-none tracking-tight text-white",
        SIZE_CLASSES[size],
        className
      )}
      style={{ backgroundColor: team.primaryColor }}
      role="img"
      aria-label={`${team.city} ${team.name} crest`}
    >
      <span
        className="absolute inset-x-0 bottom-0 h-1/3 rounded-b-lg"
        style={{ backgroundColor: team.secondaryColor, opacity: 0.85 }}
        aria-hidden
      />
      <span className="relative">{team.initials}</span>
    </div>
  );
}
