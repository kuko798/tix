import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/empty-state";
import { Inbox } from "lucide-react";
import { OfferControls } from "./offer-controls";
import { AppFrame, PageIntro } from "@/components/brand/page-intro";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const user = await requireSessionUser();
  const offers = await prisma.offer.findMany({
    where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      createdById: true,
      actionRequiredById: true,
      status: true,
      version: true,
      cashAmountCents: true,
      note: true,
      expiresAt: true,
      createdAt: true,
      listing: { select: { id: true, section: true, row: true, quantity: true } },
      sender: { select: { name: true } },
      recipient: { select: { name: true } },
      createdBy: { select: { name: true } },
      actionRequiredBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppFrame width="medium">
      <PageIntro title="Offers">
        An offer only reserves tickets after the ticket holder accepts the exact terms. Payment authorization comes next.
      </PageIntro>
      {offers.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Inbox}
            title="No offers yet"
            description="Browse live listings to send an offer, or publish tickets and wait for another fan to respond."
            action={<Button asChild size="sm"><Link href="/discover">Browse listings</Link></Button>}
          />
        </div>
      ) : (
        <div className="mt-8 border-t border-border">
          {offers.map((offer) => {
            const incoming = offer.actionRequiredById === user.id;
            const pending = offer.status === "pending" && offer.expiresAt > new Date();
            const otherName = incoming ? offer.createdBy.name : offer.actionRequiredBy.name;
            return (
              <article key={offer.id} className="border-b border-border py-6 transition-colors hover:border-primary">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-sm font-medium">{incoming ? `Offer from ${otherName}` : `Offer to ${otherName}`}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {offer.listing.quantity} ticket{offer.listing.quantity === 1 ? "" : "s"}, Section {offer.listing.section}, Row {offer.listing.row}
                    </p>
                    {offer.cashAmountCents > 0 && <p className="tabular mt-1 text-xs text-muted-foreground">Cash included: ${(offer.cashAmountCents / 100).toFixed(2)}</p>}
                    {offer.note && <p className="mt-3 max-w-[65ch] text-sm">{offer.note}</p>}
                  </div>
                  <span className="text-xs font-medium capitalize text-muted-foreground">{pending ? "pending" : offer.status === "pending" ? "expired" : offer.status.replaceAll("_", " ")}</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link href={`/listing/${offer.listing.id}`} className="text-sm font-medium text-primary hover:opacity-70">View listing</Link>
                  {pending && <OfferControls offerId={offer.id} version={offer.version} direction={incoming ? "incoming" : "outgoing"} cashAmountCents={offer.cashAmountCents} />}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppFrame>
  );
}
