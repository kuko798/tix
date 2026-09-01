"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Calendar,
  CheckCheck,
  Handshake,
  MessageCircleWarning,
  RefreshCcw,
  Send,
  Ticket,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/empty-state";
import { NOTIFICATION_META } from "@/lib/constants";
import { markNotificationsReadAction } from "@/lib/actions";
import { formatRelativeTime } from "@/lib/format";
import type { AppNotification, NotificationType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationType, typeof Bell> = {
  direct_swap_match: Handshake,
  wanted_match: Ticket,
  new_offer: Handshake,
  new_message: Bell,
  counteroffer: RefreshCcw,
  offer_accepted: CheckCheck,
  offer_declined: Bell,
  payment_authorized: CheckCheck,
  payment_failed: MessageCircleWarning,
  payment_refunded: RefreshCcw,
  transfer_required: Send,
  ticket_accepted: CheckCheck,
  deadline_approaching: Calendar,
  event_rescheduled: Calendar,
  trade_completed: Trophy,
  dispute_update: MessageCircleWarning,
};

function linkFor(notification: AppNotification): string {
  if (notification.relatedTradeId) return `/trades/${notification.relatedTradeId}`;
  if (notification.relatedListingId) return `/listing/${notification.relatedListingId}`;
  return "/notifications";
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AppNotification[]) => {
        setItems(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function markAllRead() {
    await markNotificationsReadAction();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function markRead(id: string) {
    await markNotificationsReadAction([id]);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  const highUrgency = items.filter((n) => n.urgency === "high" && !n.read);
  const rest = items.filter((n) => !(n.urgency === "high" && !n.read));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Notifications</h1>
        <Button variant="ghost" size="sm" onClick={markAllRead} className="gap-1.5" disabled={!items.length}>
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          Mark all read
        </Button>
      </div>

      {!loaded ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState className="mt-8" icon={Bell} title="You're all caught up" description="New matches, offers, and reminders will show up here." />
      ) : (
        <div className="mt-6 space-y-8">
          {highUrgency.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-danger-tint-foreground">
                Needs attention
              </p>
              <div className="space-y-2">
                {highUrgency.map((n) => (
                  <NotificationRow key={n.id} notification={n} onRead={markRead} />
                ))}
              </div>
            </section>
          )}
          <section>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Everything else
            </p>
            <div className="space-y-2">
              {rest.map((n) => (
                <NotificationRow key={n.id} notification={n} onRead={markRead} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
}) {
  const Icon = ICONS[notification.type];
  return (
    <Link
      href={linkFor(notification)}
      onClick={() => onRead(notification.id)}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:border-foreground/20",
        notification.read ? "bg-card" : "bg-primary/5"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          notification.urgency === "high" ? "bg-danger-tint text-danger-tint-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm", !notification.read && "font-semibold")}>{notification.title}</p>
          {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {NOTIFICATION_META[notification.type].label} &middot; {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </Link>
  );
}
