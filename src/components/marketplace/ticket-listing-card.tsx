import Link from "next/link";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { TransferReadinessBadge } from "@/components/marketplace/transfer-readiness-badge";
import { Button } from "@/components/ui/button";
import { getGame, getTeam, getVenue } from "@/lib/catalog";
import { formatCurrency, formatGameDate, formatGameTime, formatRelativeTime } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

const LISTING_TYPE_LABEL: Record<Listing["listingType"], string> = {
  trade: "Trade only",
  sale: "For sale",
  trade_or_sale: "Trade or sale",
};

export function TicketListingCard({
  listing,
  compact = false,
}: {
  listing: Listing;
  compact?: boolean;
}) {
  const game = listing.game ?? getGame(listing.gameId);
  const home = getTeam(game.homeTeamId);
  const away = getTeam(game.awayTeamId);
  const venue = getVenue(game.venueId);
  const seller = listing.seller;
  const wants = listing.accept.acceptsGamesDescription
    ? listing.accept.acceptsGamesDescription
    : listing.listingType === "sale"
      ? "Cash only"
      : "Open to offers";

  if (compact) {
    return (
      <div className="group flex flex-col gap-4 border-b border-border py-5 transition-colors hover:border-primary sm:grid sm:grid-cols-[minmax(14rem,.85fr)_1fr_auto] sm:items-center sm:gap-6">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-1">
            <TeamCrest team={away} size="sm" />
            <TeamCrest team={home} size="sm" />
          </div>
          <div className="min-w-0">
            <p className="font-display truncate text-xl uppercase leading-none">
              {away.name} at {home.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatGameDate(game.startTime)}, {venue.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular">
            Sec {listing.section}, Row {listing.row}, {listing.quantity} tix
          </span>
          <span className="truncate"><span className="font-mono text-[9px] uppercase tracking-widest text-primary">Wants</span> {wants}</span>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <TransferReadinessBadge status={listing.transferReadiness} showTooltip={false} />
          <Button asChild size="sm">
            <Link href={`/listing/${listing.id}`}>View</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-5 bg-card p-5 transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:bg-muted">
      <div className="flex items-start gap-3">
        <div className="flex -space-x-1">
          <TeamCrest team={away} size="md" />
          <TeamCrest team={home} size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/listing/${listing.id}`} className="focus-visible:outline-none">
            <p className="font-display truncate text-2xl uppercase leading-none after:absolute after:inset-0">
              {away.name} at {home.name}
            </p>
          </Link>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatGameDate(game.startTime)}, {formatGameTime(game.startTime)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {venue.name}, {venue.city}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="chip">{LISTING_TYPE_LABEL[listing.listingType]}</span>
        <span className="chip tabular">
          {listing.quantity} tix, Sec {listing.section}
        </span>
        {listing.parkingIncluded ? <span className="chip">Parking</span> : null}
        <TransferReadinessBadge status={listing.transferReadiness} />
      </div>

      <p className="border-l border-primary pl-3 text-xs leading-5 text-muted-foreground">
        <span className="font-mono text-[9px] uppercase tracking-widest text-primary">Wants </span>
        {wants}
        {listing.askingCashAdjustment ? (
          <span className="tabular font-medium text-foreground">
            {" "}
            + {formatCurrency(listing.askingCashAdjustment)}
          </span>
        ) : null}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">
            {seller.displayName}, {formatRelativeTime(listing.postedAt)}
          </p>
          <p
            className={cn(
              "tabular text-xs",
              listing.estimatedValuePerTicket <= listing.faceValuePerTicket ? "text-success" : "text-muted-foreground"
            )}
          >
            Est. {formatCurrency(listing.estimatedValuePerTicket)}/ticket
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`/listing/${listing.id}`}>View listing</Link>
        </Button>
      </div>
    </div>
  );
}
