"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { EmptyState } from "@/components/marketplace/empty-state";
import { getTeam } from "@/lib/catalog";
import type { Circle } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  friends_family: "Friends & family",
  season_ticket_holders: "Season-ticket holders",
  alumni: "Alumni",
  supporters: "Supporters group",
  corporate: "Corporate group",
};

export default function CirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/circles", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Circle[]) => {
        setCircles(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Fan Circles</h1>
          <p className="mt-2 max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            Private groups for trading with people you already trust: neighbors in your section,
            fellow season-ticket holders, alumni chapters, and more.
          </p>
        </div>
        <Button asChild className="h-11">
          <Link href="/circles/new">Create a circle</Link>
        </Button>
      </div>

      {!loaded ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : circles.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No circles yet"
          description="Start a private group for your section, alumni chapter, or season-ticket friends."
          action={
            <Button asChild>
              <Link href="/circles/new">Create a circle</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-8 space-y-3">
          {circles.map((circle) => (
            <Link
              key={circle.id}
              href={`/circles/${circle.id}`}
              className="flex flex-col gap-3 border border-border bg-card p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center"
            >
              {circle.favoriteTeamId && <TeamCrest team={getTeam(circle.favoriteTeamId)} size="md" />}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{circle.name}</p>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{circle.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
                <span className="chip">{TYPE_LABEL[circle.type] ?? circle.type}</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {circle.memberCount}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
