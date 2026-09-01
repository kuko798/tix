import { Info } from "lucide-react";

// Abstract, generated stand-in for a seat-view photo. Deliberately not a
// real photograph: nothing here claims to be the actual view from the seat.
export function SeatViewPlaceholder({ section }: { section: string }) {
  const rows = Array.from({ length: 7 });

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-secondary">
      <svg viewBox="0 0 400 225" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <rect width="400" height="225" fill="var(--secondary)" />
        {rows.map((_, i) => {
          const t = i / (rows.length - 1);
          const y = 40 + t * 130;
          const inset = t * 150;
          const opacity = 0.14 + t * 0.05;
          return (
            <rect
              key={i}
              x={inset}
              y={y}
              width={400 - inset * 2}
              height={10}
              rx={2}
              fill="var(--secondary-foreground)"
              opacity={opacity}
            />
          );
        })}
        <rect x="60" y="185" width="280" height="40" rx="3" fill="var(--primary)" opacity="0.22" />
        <rect x="60" y="185" width="280" height="3" fill="var(--primary)" opacity="0.5" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-secondary via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/55 to-transparent p-4 text-white">
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        <p className="text-xs">
          Generated approximation of the view from Section {section}. Not an actual seat
          photo.
        </p>
      </div>
    </div>
  );
}
