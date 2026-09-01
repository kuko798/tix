"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusSquare, Search, ArrowLeftRight, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/discover", label: "Search", icon: Search },
  { href: "/list", label: "List", icon: PlusSquare },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background lg:hidden"
    >
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:scale-x-0 before:bg-primary before:transition-transform",
                active && "text-primary before:scale-x-100"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
