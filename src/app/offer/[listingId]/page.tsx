"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { notFound } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRight,
  DollarSign,
  ParkingSquare,
  Plus,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { MatchupHeader } from "@/components/marketplace/matchup-header";
import { TradeAssetCard } from "@/components/marketplace/trade-asset-card";
import { PriceBreakdown } from "@/components/marketplace/price-breakdown";
import { AlertBanner } from "@/components/marketplace/alert-banner";
import { TrustIndicator } from "@/components/marketplace/trust-indicator";
import { getGame, getTeam } from "@/lib/catalog";
import { createOfferAction } from "@/lib/actions";
import type { Listing, TradeAsset, UserProfile } from "@/lib/types";

function listingToAsset(listing: Listing): TradeAsset {
  const game = listing.game ?? getGame(listing.gameId);
  return {
    id: listing.id,
    type: "tickets",
    gameId: listing.gameId,
    quantity: listing.quantity,
    section: listing.section,
    row: listing.row,
    label: `${getTeam(game.awayTeamId).name} at ${getTeam(game.homeTeamId).name}, Section ${listing.section}`,
    valueEstimate: listing.estimatedValuePerTicket * listing.quantity,
  };
}

function OfferBuilderContent({ listingId }: { listingId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const [listing, setListing] = useState<Listing | null>(null);
  const [missing, setMissing] = useState(false);
  const [myAssets, setMyAssets] = useState<TradeAsset[]>([]);
  const [phase, setPhase] = useState<"compose" | "review">("compose");
  const [offeredAssetIds, setOfferedAssetIds] = useState<string[]>([]);
  const [cashAdjustment, setCashAdjustment] = useState("0");
  const [expiration, setExpiration] = useState("3days");
  const [message, setMessage] = useState(
    mode === "buy"
      ? "Hi, I'd like to buy these tickets. Let me know next steps."
      : "Hey! Would love to work this trade out, let me know if the terms work for you."
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/listings/${listingId}`, { cache: "no-store" })
      .then((res) => {
        if (res.status === 404) {
          setMissing(true);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data: Listing | null) => {
        if (data) {
          setListing(data);
          setCashAdjustment(String(data.askingCashAdjustment ?? 0));
        }
      })
      .catch(() => setMissing(true));
    fetch("/api/me/listings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Listing[]) => {
        const assets = data.filter((item) => item.id !== listingId).map(listingToAsset);
        setMyAssets(assets);
        if (mode !== "buy" && mode !== "cash" && assets[0]) {
          setOfferedAssetIds([assets[0].id]);
        }
      })
      .catch(() => {});
  }, [listingId, mode]);

  if (missing) notFound();
  if (!listing) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading offer builder…</div>;
  }

  const game = listing.game ?? getGame(listing.gameId);
  const seller: UserProfile = {
    id: listing.seller.id,
    displayName: listing.seller.displayName,
    initials: listing.seller.initials,
    accountCreatedAt: listing.postedAt,
    verifiedEmail: false,
    verifiedPhone: false,
    identityCheck: "not_started",
    completedSales: 0,
    completedSwaps: 0,
    responseRatePct: 100,
    cancellationRatePct: 0,
    favoriteTeamIds: [],
    circleIds: [],
    reviews: [],
  };

  const offeredAssets = myAssets.filter((a) => offeredAssetIds.includes(a.id));
  const availableToAdd = myAssets.filter((a) => !offeredAssetIds.includes(a.id));

  const receivedAsset: TradeAsset = {
    id: "listing-asset",
    type: "tickets",
    gameId: listing.gameId,
    quantity: listing.quantity,
    section: listing.section,
    row: listing.row,
    label: `${getTeam(game.awayTeamId).name} at ${getTeam(game.homeTeamId).name}, Section ${listing.section}`,
    valueEstimate: listing.estimatedValuePerTicket * listing.quantity,
  };

  const offeredValue = offeredAssets.reduce((sum, a) => sum + a.valueEstimate, 0);
  const receivedValue = receivedAsset.valueEstimate;
  const cashValue = Number(cashAdjustment || 0);
  const totalValueForFee = offeredValue + receivedValue + Math.abs(cashValue);
  const platformFee = Math.max(5, Math.round(totalValueForFee * 0.045));
  const refundableDeposit = totalValueForFee > 500 ? 100 : 50;

  function addAsset(id: string) {
    setOfferedAssetIds((prev) => [...prev, id]);
  }
  function removeAsset(id: string) {
    setOfferedAssetIds((prev) => prev.filter((a) => a !== id));
  }

  function handleSendOffer() {
    if (offeredAssets.length === 0 && cashValue <= 0) {
      toast.error("Add at least one ticket, parking pass, or cash amount to offer.");
      return;
    }
    setPhase("review");
  }

  async function handleFinalAccept() {
    if (!listing) return;
    setSubmitting(true);
    try {
      const result = await createOfferAction({
        listingId: listing.id,
        assetsFromBuyer: offeredAssets,
        cashAdjustment: cashValue,
        message,
      });
      toast.success("Offer sent. Waiting on " + seller.displayName.split(" ")[0] + " to respond.");
      router.push(`/messages/${result.threadId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send that offer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "review") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Review the trade</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Both fans need to explicitly accept this exact version. Changing anything after this
          point invalidates any previous acceptance.
        </p>

        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <MatchupHeader game={game} size="sm" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium">You contribute</p>
            <div className="space-y-2">
              {offeredAssets.length === 0 && <p className="text-sm text-muted-foreground">No tickets, cash only.</p>}
              {offeredAssets.map((asset) => (
                <TradeAssetCard key={asset.id} asset={asset} />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium">{seller.displayName} contributes</p>
            <TradeAssetCard asset={receivedAsset} />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <PriceBreakdown
            offeredValue={offeredValue}
            receivedValue={receivedValue}
            cashAdjustment={cashValue}
            platformFee={platformFee}
            refundableDeposit={refundableDeposit}
          />
        </div>

        <div className="mt-6 space-y-3 rounded-lg border border-border bg-card p-5 text-sm">
          <p className="font-medium">Before you accept</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li>Transfers must be completed within 5 days of both deposits being authorized.</li>
            <li>Refundable deposits return automatically once both transfers are confirmed.</li>
            <li>{listing.issuer} tickets can only transfer through {listing.issuer}&apos;s own tool.</li>
            <li>Cancelling after the other fan accepts may affect your cancellation rate.</li>
          </ul>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <TrustIndicator user={seller} compact />
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" className="h-11" onClick={() => setPhase("compose")}>
            Back to edit
          </Button>
          <Button size="lg" className="h-11 gap-1.5" onClick={handleFinalAccept} disabled={submitting}>
            {submitting ? "Sending…" : "Send this offer"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-32 sm:px-6 lg:px-8 lg:pb-8">
      <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Build your offer</h1>
      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <MatchupHeader game={game} size="sm" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">What you&apos;re offering</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1" disabled={availableToAdd.length === 0}>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableToAdd.map((asset) => (
                  <DropdownMenuItem key={asset.id} onClick={() => addAsset(asset.id)} className="gap-2">
                    {asset.type === "parking" ? <ParkingSquare className="h-3.5 w-3.5" aria-hidden /> : <Ticket className="h-3.5 w-3.5" aria-hidden />}
                    {asset.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="min-h-32 space-y-2 rounded-lg border border-dashed border-border p-3">
            {offeredAssets.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Add tickets or a parking pass, or offer cash only below.
              </p>
            ) : (
              offeredAssets.map((asset) => (
                <TradeAssetCard key={asset.id} asset={asset} onRemove={() => removeAsset(asset.id)} />
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {offeredAssets.reduce((s, a) => s + (a.quantity ?? 0), 0)} tickets total &middot; Est. value{" "}
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(offeredValue)}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">What you&apos;ll receive</p>
          </div>
          <div className="min-h-32 rounded-lg border border-border bg-muted/30 p-3">
            <TradeAssetCard asset={receivedAsset} />
          </div>
          <p className="text-xs text-muted-foreground">
            {listing.quantity} tickets total &middot; Est. value{" "}
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(receivedValue)}
          </p>
        </div>
      </div>

      <div className="my-2 flex justify-center lg:hidden">
        <ArrowDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cash-adjustment">Cash adjustment</Label>
              <div className="relative">
                <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="cash-adjustment"
                  type="number"
                  min={0}
                  className="h-11 pl-9"
                  value={cashAdjustment}
                  onChange={(e) => setCashAdjustment(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This is the additional cash you are offering alongside your tickets.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiration">Offer expires in</Label>
              <Select value={expiration} onValueChange={setExpiration}>
                <SelectTrigger id="expiration" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24hours">24 hours</SelectItem>
                  <SelectItem value="3days">3 days</SelectItem>
                  <SelectItem value="7days">7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">Message to {seller.displayName.split(" ")[0]}</Label>
            <Textarea id="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {mode === "buy" && (
            <AlertBanner variant="info" title="Buying outright">
              You&rsquo;re offering cash only. Add an amount above to make a cash offer, or head back
              to the listing to trade instead.
            </AlertBanner>
          )}
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <PriceBreakdown
            offeredValue={offeredValue}
            receivedValue={receivedValue}
            cashAdjustment={cashValue}
            platformFee={platformFee}
            refundableDeposit={refundableDeposit}
          />
          <Separator />
          <TrustIndicator user={seller} compact />
          <Button size="lg" className="hidden h-11 w-full lg:flex" onClick={handleSendOffer}>
            Review offer
          </Button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <Button size="lg" className="h-11 w-full" onClick={handleSendOffer}>
          Review offer
        </Button>
      </div>
    </div>
  );
}

export default function OfferBuilderPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = use(params);
  return (
    <Suspense fallback={<div className="px-6 py-8 text-sm text-muted-foreground">Loading offer builder…</div>}>
      <OfferBuilderContent listingId={listingId} />
    </Suspense>
  );
}
