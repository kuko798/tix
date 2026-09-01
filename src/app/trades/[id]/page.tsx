"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { toast } from "sonner";
import { HelpCircle, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TradeAssetCard } from "@/components/marketplace/trade-asset-card";
import { TransactionTimeline } from "@/components/marketplace/transaction-timeline";
import { PriceBreakdown } from "@/components/marketplace/price-breakdown";
import { AlertBanner } from "@/components/marketplace/alert-banner";
import { TrustIndicator } from "@/components/marketplace/trust-indicator";
import { advanceTradeAction } from "@/lib/actions";
import { useSession } from "@/lib/auth-client";
import { formatGameDateLong } from "@/lib/format";
import type { Dispute, Trade, TradeStage, UserProfile } from "@/lib/types";
import { AppFrame, PageIntro } from "@/components/brand/page-intro";

const ACTION_LABEL: Partial<Record<TradeStage, string>> = {
  offer_accepted: "Continue after authorization",
  deposits_authorized: "I started my ticket transfer",
  transfer_initiated_a: "I started my ticket transfer",
  transfer_initiated_b: "I received the tickets",
};

function toTrustUser(user: Trade["participantA"]): UserProfile {
  return {
    id: user.id,
    displayName: user.displayName,
    initials: user.initials,
    accountCreatedAt: new Date().toISOString(),
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
}

function TradeDetailContent({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [trade, setTrade] = useState<Trade | null>(null);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [transaction, setTransaction] = useState<{ id: string; buyerId: string; sellerId: string; status: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch(`/api/trades/${tradeId}`, { cache: "no-store" })
      .then((res) => {
        if (res.status === 404) {
          setMissing(true);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data: { trade: Trade; dispute: Dispute | null; transaction: { id: string; buyerId: string; sellerId: string; status: string } | null } | null) => {
        if (data) {
          setTrade(data.trade);
          setDispute(data.dispute);
          setTransaction(data.transaction);
        }
      })
      .catch(() => setMissing(true));
  }, [tradeId]);

  if (missing) notFound();
  if (!trade || !currentUserId) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading trade…</div>;
  }

  const otherUser = trade.userAId === currentUserId ? trade.participantB : trade.participantA;
  const isTerminal = ["completed", "cancelled", "expired", "disputed"].includes(trade.stage);
  const isMyTurn = trade.waitingOnUserId === currentUserId || (!trade.waitingOnUserId && !isTerminal);
  const actionLabel = ACTION_LABEL[trade.stage] ?? "Confirm";
  const needsPayment = transaction?.buyerId === currentUserId && ["awaiting_payment", "payment_failed", "payment_pending"].includes(transaction.status);
  const paymentAuthorized = transaction && ["payment_authorized", "transfer_in_progress", "capture_pending", "completed"].includes(transaction.status);

  async function handleAdvance() {
    if (!trade) return;
    setPending(true);
    try {
      await advanceTradeAction(trade.id);
      const res = await fetch(`/api/trades/${trade.id}`, { cache: "no-store" });
      const data = (await res.json()) as { trade: Trade };
      setTrade(data.trade);
      toast.success(
        data.trade.stage === "completed"
          ? "Trade marked complete."
          : data.trade.waitingOnUserId === currentUserId
            ? "Updated. It's your turn again."
            : `Updated. Now waiting on ${otherUser.displayName.split(" ")[0]}.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this trade.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppFrame width="medium">
      <PageIntro title={`Trade with ${otherUser.displayName}`} action={!isTerminal ? (
          <Link href={`/trades/${trade.id}/dispute`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <OctagonAlert className="h-4 w-4" aria-hidden />
            Report a problem
          </Link>
        ) : undefined}>Follow each handoff in order. GameSwap shows whose action is next and when the transfer is due.</PageIntro>

      <AlertBanner variant="info" title="Protected payment, official ticket transfer" className="mt-6">
        Payment is authorized through Stripe before tickets move. Tickets must still be sent through the official issuer; funds are captured only after receipt is confirmed.
      </AlertBanner>

      {needsPayment && transaction && (
        <div className="mt-4 flex items-center justify-between gap-4 border border-warning/40 bg-warning-tint p-4 text-warning-tint-foreground">
          <p className="text-sm">Authorize payment to unlock the transfer steps.</p>
          <Button asChild size="sm"><Link href={`/transactions/${transaction.id}/pay`}>Authorize payment</Link></Button>
        </div>
      )}

      {trade.stage === "disputed" && dispute && (
        <AlertBanner variant="danger" title="This trade is under dispute" className="mt-6">
          Filed {formatGameDateLong(dispute.filedAt)}. Support is reviewing:
          <p className="mt-1 italic">&ldquo;{dispute.statement}&rdquo;</p>
        </AlertBanner>
      )}

      {!isTerminal && (
        <AlertBanner
          variant={isMyTurn ? "warning" : "info"}
          title={isMyTurn ? `Your turn: ${actionLabel}` : `Waiting on ${otherUser.displayName}`}
          action={needsPayment ? undefined : isMyTurn && (trade.stage !== "offer_accepted" || paymentAuthorized) ? (
              <Button size="sm" onClick={handleAdvance} disabled={pending} className="shrink-0">
                {actionLabel}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => toast("Reminder noted. Message them from the thread.")} className="shrink-0">
                Send reminder
              </Button>
            )}
          className="mt-6"
        >
          Transfer deadline: {formatGameDateLong(trade.transferDeadline)}
        </AlertBanner>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          <section>
            <h2 className="font-display text-xl tracking-tight">Timeline</h2>
            <div className="mt-4 border-y border-border py-5">
              <TransactionTimeline trade={trade} viewerId={currentUserId} />
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl tracking-tight">What each side is trading</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {trade.userAId === currentUserId ? "You" : trade.participantA.displayName}
                </p>
                {trade.assetsFromA.map((asset) => (
                  <TradeAssetCard key={asset.id} asset={asset} />
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {trade.userBId === currentUserId ? "You" : trade.participantB.displayName}
                </p>
                {trade.assetsFromB.map((asset) => (
                  <TradeAssetCard key={asset.id} asset={asset} />
                ))}
                {trade.assetsFromB.length === 0 && (
                  <p className="border border-dashed border-border p-3 text-sm text-muted-foreground">
                    Cash only, no tickets
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="border-t-2 border-primary bg-card p-5">
            <PriceBreakdown
              offeredValue={trade.assetsFromA.reduce((s, a) => s + a.valueEstimate, 0)}
              receivedValue={trade.assetsFromB.reduce((s, a) => s + a.valueEstimate, 0)}
              cashAdjustment={trade.cashAdjustment}
              platformFee={trade.platformFee}
              refundableDeposit={trade.refundableDeposit}
            />
          </div>
          <div className="border-t border-border bg-card p-5">
            <TrustIndicator user={toTrustUser(otherUser)} compact />
          </div>
          <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => router.push("/messages")}>
            <HelpCircle className="h-4 w-4" aria-hidden />
            Message {otherUser.displayName.split(" ")[0]}
          </Button>
        </aside>
      </div>
    </AppFrame>
  );
}

export default function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TradeDetailContent tradeId={id} />;
}
