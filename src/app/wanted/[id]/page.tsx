import { notFound } from "next/navigation";
import { Clock, Ticket } from "lucide-react";
import { MatchupHeader } from "@/components/marketplace/matchup-header";
import { TrustIndicator } from "@/components/marketplace/trust-indicator";
import { WantedFulfillDialog } from "@/components/marketplace/wanted-fulfill-dialog";
import { getGame } from "@/lib/catalog";
import { queryWantedById } from "@/lib/queries";
import { getProfileById } from "@/lib/session";
import { formatCurrency, formatCountdown, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WantedDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await queryWantedById(id);
  if (!request) notFound();
  const game = request.game ?? getGame(request.desiredGameId);
  const requester = await getProfileById(request.requesterId);
  const quantityLabel =
    request.quantityMin === request.quantityMax
      ? `${request.quantityMin} tickets`
      : `${request.quantityMin} to ${request.quantityMax} tickets`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <MatchupHeader game={game} size="lg" />

      <div className="mt-6 grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Looking for</p>
          <p className="mt-1 inline-flex items-center gap-1.5 font-medium">
            <Ticket className="h-4 w-4 text-muted-foreground" aria-hidden />
            {quantityLabel}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sections: {request.preferredSections.join(", ") || "Any"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Maximum budget</p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-warning-tint-foreground">
            {formatCurrency(request.maxBudget)}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            {formatCountdown(request.expiresAt)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-5">
        <p className="text-sm font-medium">What they&rsquo;re offering in return</p>
        <p className="mt-1 text-sm text-muted-foreground">{request.offeringDescription}</p>
        {request.flexibleOnDate && (
          <span className="mt-3 inline-block rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            Flexible on dates
          </span>
        )}
      </div>

      {requester && (
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <p className="mb-3 text-sm font-medium">About the requester</p>
          <TrustIndicator user={requester} />
          <p className="mt-3 text-xs text-muted-foreground">
            Posted {formatRelativeTime(request.postedAt)}
          </p>
        </div>
      )}

      <div className="mt-8">
        <WantedFulfillDialog request={request} />
      </div>
    </div>
  );
}
