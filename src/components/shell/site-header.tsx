"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MessageSquare, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandMark } from "@/components/shell/brand-mark";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { PRIMARY_NAV } from "@/lib/constants";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    fetch("/api/me/badges", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { messages: 0, notifications: 0 }))
      .then((data: { messages: number; notifications: number }) => {
        if (!cancelled) {
          setUnreadMessages(data.messages);
          setUnreadNotifications(data.notifications);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user, pathname]);

  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto hidden h-[72px] max-w-[1500px] items-stretch px-6 lg:flex lg:px-8">
        <Link href="/" className="shrink-0">
          <span className="flex h-full items-center border-r border-border pr-8"><BrandMark /></span>
        </Link>

        <nav aria-label="Primary" className="flex flex-1 items-stretch pl-4">
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center px-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-300 hover:text-foreground after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform",
                  active && "text-foreground after:scale-x-100"
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1 border-l border-border pl-4">
          {session?.user ? (
            <>
              <IconLink href="/messages" label="Messages" icon={MessageSquare} count={session.user ? unreadMessages : 0} />
              <IconLink href="/notifications" label="Notifications" icon={Bell} count={session.user ? unreadNotifications : 0} />
            </>
          ) : null}
          <ThemeToggle />
          {session?.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <User className="h-[1.1rem] w-[1.1rem]" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/profile">My profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/offers">Offers</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/season">My season</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/circles">Fan circles</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">Account settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild className="ml-2 h-10 px-4 font-semibold">
            <Link href="/list">
              <Plus className="h-4 w-4" aria-hidden />
              List tickets
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex h-16 items-center justify-between px-4 lg:hidden">
        <Link href="/">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-1">
          {session?.user ? (
            <>
              <IconLink href="/notifications" label="Notifications" icon={Bell} count={unreadNotifications} />
              <IconLink href="/messages" label="Messages" icon={MessageSquare} count={unreadMessages} />
            </>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function IconLink({
  href,
  label,
  icon: Icon,
  count,
}: {
  href: string;
  label: string;
  icon: typeof Bell;
  count: number;
}) {
  return (
    <Button asChild variant="ghost" size="icon" className="relative h-11 w-11 lg:h-9 lg:w-9">
      <Link href={href} aria-label={count > 0 ? `${label}, ${count} unread` : label}>
        <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden />
        {count > 0 && (
          <span
            className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-warning-foreground"
            aria-hidden
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
