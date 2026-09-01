import { Mail, Phone, ShieldCheck, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { getTeam } from "@/lib/catalog";
import { formatGameDateLong } from "@/lib/format";
import type { UserProfile } from "@/lib/types";
import Link from "next/link";

export function ProfileView({
  user,
  circles = [],
}: {
  user: UserProfile;
  isOwn?: boolean;
  circles?: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{user.initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-2xl tracking-tight">{user.displayName}</h1>
            <p className="text-sm text-muted-foreground">
              Member since {formatGameDateLong(user.accountCreatedAt)}
            </p>
          </div>
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
              Identity check pending
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Completed swaps" value={user.completedSwaps} />
        <Stat label="Completed sales" value={user.completedSales} />
        <Stat label="Response rate" value={`${user.responseRatePct}%`} />
        <Stat label="Cancellation rate" value={`${user.cancellationRatePct}%`} />
      </div>

      {user.favoriteTeamIds.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium">Favorite teams</h2>
          <div className="flex flex-wrap gap-3">
            {user.favoriteTeamIds.map((teamId) => {
              const team = getTeam(teamId);
              return (
                <div key={teamId} className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3">
                  <TeamCrest team={team} size="sm" />
                  <span className="text-sm">{team.city} {team.name}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {circles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium">Fan circles</h2>
          <div className="flex flex-wrap gap-2">
            {circles.map((circle) => (
              <Link
                key={circle.id}
                href={`/circles/${circle.id}`}
                className="rounded-full bg-muted px-3 py-1.5 text-sm hover:bg-muted/70"
              >
                {circle.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium">Reviews</h2>
        {user.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completed-transaction reviews yet.
          </p>
        ) : (
          <div className="space-y-3">
            {user.reviews.map((review) => (
              <div key={review.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <div className="flex" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-3.5 w-3.5 ${i < review.rating ? "fill-warning text-warning" : "text-muted"}`} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{review.context}</span>
                </div>
                <p className="mt-2 text-sm">{review.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">{review.authorName}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        GameSwap never shows identity documents, full addresses, or other private ticket details
        on a profile.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
