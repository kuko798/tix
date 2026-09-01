import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/marketplace/empty-state";
import { AppFrame, PageIntro } from "@/components/brand/page-intro";
import { WantedRow } from "@/components/landing/wanted-row";
import { queryWantedRequests } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WantedPage() {
  const wantedRequests = await queryWantedRequests();

  return (
    <AppFrame>
      <PageIntro
        title="Tickets Wanted"
        action={
          <Button asChild size="lg" className="h-11 gap-1.5">
            <Link href="/wanted/new">
              <Plus className="h-4 w-4" aria-hidden />
              Post what you want
            </Link>
          </Button>
        }
      >
        Fans post the game, the budget, and what they will offer back. If you are holding that ticket, this is the short path.
      </PageIntro>

      {wantedRequests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No open requests right now"
          description="Be the first to post what you're looking for and get matched when a fan lists it."
          action={
            <Button asChild>
              <Link href="/wanted/new">Post what you want</Link>
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {wantedRequests.map((request) => (
            <WantedRow key={request.id} request={request} />
          ))}
        </div>
      )}
    </AppFrame>
  );
}
