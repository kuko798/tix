import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftRight,
  CircleDollarSign,
  Info,
  ShieldQuestion,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MatchupHeader } from "@/components/marketplace/matchup-header";
import { SeatViewPlaceholder } from "@/components/marketplace/seat-view-placeholder";
import { TransferReadinessBadge } from "@/components/marketplace/transfer-readiness-badge";
import { TrustIndicator } from "@/components/marketplace/trust-indicator";
import { SaveButton, ShareButton, ReportDialog } from "@/components/marketplace/listing-actions";
import { ListingOwnerControls } from "@/components/marketplace/listing-owner-controls";
import { SwapLine } from "@/components/brand/swap-line";
import { TRANSFER_READINESS_META } from "@/lib/constants";
import { getGame } from "@/lib/catalog";
import { queryListingById } from "@/lib/queries";
import { getSessionUser } from "@/lib/session";
import { getProfileById } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import type { TransferReadiness } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getSessionUser();
  const listing = await queryListingById(id, viewer?.id);
  if (!listing) notFound();
  const game = listing.game ?? getGame(listing.gameId);
  const seller = (await getProfileById(listing.sellerId)) ?? {
    id: listing.seller.id,
    displayName: listing.seller.displayName,
    initials: listing.seller.initials,
    accountCreatedAt: listing.postedAt,
    verifiedEmail: false,
    verifiedPhone: false,
    identityCheck: "not_started" as const,
    completedSales: 0,
    completedSwaps: 0,
    responseRatePct: 100,
    cancellationRatePct: 0,
    favoriteTeamIds: [],
    circleIds: [],
    reviews: [],
  };
  const canTrade = listing.listingType !== "sale";
  const canBuy = listing.listingType !== "trade";
  const isOwner = viewer?.id === listing.sellerId;

  const readinessOrder: TransferReadiness[] = [
    "information_submitted",
    "evidence_reviewed",
    "transfer_initiated",
    "transfer_accepted",
    "issuer_verified",
  ];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-10 pb-28 sm:px-6 lg:px-8 lg:py-16 lg:pb-16">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          <div>
            <MatchupHeader game={game} size="lg" />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <TransferReadinessBadge status={listing.transferReadiness} />
              <span className="chip">
                <Ticket className="h-3.5 w-3.5" aria-hidden />
                {listing.quantity} tickets
              </span>
              <span className="chip tabular">
                Sec {listing.section}, Row {listing.row}, {listing.seatLevel}
              </span>
              {listing.parkingIncluded && (
                <span className="chip">Parking included</span>
              )}
              {listing.accessible && (
                <span className="chip bg-info-tint text-info-tint-foreground">Accessible seating</span>
              )}
            </div>
            <SwapLine
              className="mt-8 border-y border-border py-5"
              leftValue={`Section ${listing.section}, row ${listing.row}`}
              rightValue={listing.accept.acceptsGamesDescription ?? (listing.listingType === "sale" ? "Cash offer" : "Open offer")}
            />
          </div>

          <SeatViewPlaceholder section={listing.section} />

          <section aria-labelledby="wants-heading" className="space-y-3">
            <h2 id="wants-heading" className="font-display text-xl tracking-tight">
              What {seller.displayName.split(" ")[0]} will accept
            </h2>
            <div className="border-l-2 border-primary bg-card p-5">
              <div className="flex items-start gap-2.5">
                <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <p className="text-sm">
                  {listing.accept.acceptsGamesDescription ??
                    (listing.listingType === "sale" ? "Cash only, no trades." : "Open to offers.")}
                </p>
              </div>
              {listing.askingCashAdjustment ? (
                <div className="mt-3 flex items-start gap-2.5">
                  <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p className="text-sm">
                    Asking for <span className="font-medium">{formatCurrency(listing.askingCashAdjustment)}</span> added
                    on top for a straight trade.
                  </p>
                </div>
              ) : null}
              {listing.accept.notes && (
                <p className="mt-3 text-sm text-muted-foreground">{listing.accept.notes}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {listing.accept.flexibleOnDate && (
                  <span className="chip">Flexible on date</span>
                )}
                {listing.accept.flexibleOnSection && (
                  <span className="chip">Flexible on section</span>
                )}
                {listing.accept.acceptsCash && (
                  <span className="chip">Will consider cash offers</span>
                )}
              </div>
            </div>
          </section>

          {listing.benefits.length > 0 && (
            <section aria-labelledby="benefits-heading" className="space-y-3">
              <h2 id="benefits-heading" className="font-display text-xl tracking-tight">
                Included benefits
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {listing.benefits.map((benefit) => (
              <li key={benefit} className="border-l border-primary bg-muted/60 px-3 py-2 text-sm">
                    {benefit}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="pricing-heading" className="space-y-3">
            <h2 id="pricing-heading" className="font-display text-xl tracking-tight">
              Pricing
            </h2>
            <div className="grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3 [&>div]:bg-card [&>div]:p-4">
              <div>
                <p className="text-xs text-muted-foreground">Face value</p>
                <p className="font-mono text-lg font-semibold tabular-nums">
                  {formatCurrency(listing.faceValuePerTicket)}
                </p>
                <p className="text-xs text-muted-foreground">per ticket</p>
              </div>
              <div>
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Estimated value
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3" aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      Informational only, based on recent comparable listings. Not an appraisal
                      or a guaranteed resale price.
                    </TooltipContent>
                  </Tooltip>
                </p>
                <p className="font-mono text-lg font-semibold tabular-nums">
                  {formatCurrency(listing.estimatedValuePerTicket)}
                </p>
                <p className="text-xs text-muted-foreground">per ticket, informational</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Issuer</p>
                <p className="text-lg font-semibold">{listing.issuer}</p>
                <p className="text-xs text-muted-foreground">transfers through their tool</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="verification-heading" id="verification" className="scroll-mt-24 space-y-3">
            <h2 id="verification-heading" className="font-display text-xl tracking-tight">
              What &ldquo;{TRANSFER_READINESS_META[listing.transferReadiness].label}&rdquo; means
            </h2>
            <p className="text-sm text-muted-foreground">
              Every listing shows exactly how far along verification is. Here&rsquo;s what each level
              means, in order.
            </p>
            <ol className="space-y-3">
              {readinessOrder.map((status) => {
                const meta = TRANSFER_READINESS_META[status];
                const isCurrent = status === listing.transferReadiness;
                return (
                  <li
                    key={status}
                    className={`flex gap-3 border-l p-3 ${isCurrent ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-border text-[10px]">
                      {meta.order}
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        {meta.label}
                        {isCurrent && <span className="ml-2 text-xs font-normal text-primary">This listing</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section aria-labelledby="seller-heading" className="space-y-3">
            <h2 id="seller-heading" className="font-display text-xl tracking-tight">
              About the seller
            </h2>
            <div className="border-y border-border py-5">
              <TrustIndicator user={seller} />
              {seller.reviews.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-3">
                    {seller.reviews.map((review) => (
                      <div key={review.id} className="text-sm">
                        <p className="font-medium">
                          {review.authorName}
                          <span className="ml-2 font-normal text-muted-foreground">{review.context}</span>
                        </p>
                        <p className="mt-1 text-muted-foreground">{review.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-5 border-t-2 border-primary bg-card p-5">
            <div>
              <p className="text-xs text-muted-foreground">Estimated value</p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {formatCurrency(listing.estimatedValuePerTicket)}
                <span className="text-sm font-normal text-muted-foreground">/ticket</span>
              </p>
            </div>
            {isOwner ? <ListingOwnerControls listingId={listing.id} status={listing.status} /> : <div className="space-y-2">
              {canTrade && (
                <Button asChild size="lg" className="h-11 w-full">
                  <Link href={`/offer/${listing.id}`}>Propose trade</Link>
                </Button>
              )}
              {canBuy && (
                <Button asChild size="lg" variant={canTrade ? "outline" : "default"} className="h-11 w-full">
                  <Link href={`/offer/${listing.id}?mode=buy`}>Buy tickets</Link>
                </Button>
              )}
              {listing.accept.acceptsCash && canTrade && (
                <Button asChild size="lg" variant="outline" className="h-11 w-full">
                  <Link href={`/offer/${listing.id}?mode=cash`}>Make cash offer</Link>
                </Button>
              )}
            </div>}
            {!isOwner && <div className="flex flex-wrap items-center gap-2 pt-1">
              <SaveButton listingId={listing.id} savedCount={listing.savedCount} />
              <ShareButton />
              <ReportDialog listingId={listing.id} />
            </div>}
            <Separator />
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              A refundable deposit is authorized once a trade is accepted. Nothing is charged to
              browse or make an offer.
            </p>
          </div>
        </aside>
      </div>

      {/* Sticky mobile action bar */}
      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-border bg-background p-3 lg:hidden">
        <div className="flex items-center gap-2">
          {isOwner ? <Button asChild className="h-11 w-full"><Link href={`/listing/${listing.id}/edit`}>Manage listing</Link></Button> : <>
          {canTrade && (
            <Button asChild size="lg" className="h-11 flex-1">
              <Link href={`/offer/${listing.id}`}>Propose trade</Link>
            </Button>
          )}
          {canBuy && (
            <Button asChild size="lg" variant={canTrade ? "outline" : "default"} className="h-11 flex-1">
              <Link href={`/offer/${listing.id}?mode=buy`}>Buy</Link>
            </Button>
          )}
          </>}
        </div>
      </div>
    </div>
  );
}
