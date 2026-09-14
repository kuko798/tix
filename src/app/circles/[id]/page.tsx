import { notFound } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamCrest } from "@/components/marketplace/team-crest";
import { TicketListingCard } from "@/components/marketplace/ticket-listing-card";
import { EmptyState } from "@/components/marketplace/empty-state";
import { prisma } from "@/lib/prisma";
import { toTeam } from "@/lib/mappers";
import { queryCircleById, queryListingsByCircle } from "@/lib/queries";
import { getSessionUser } from "@/lib/session";
import { JoinCircleButton } from "./join-button";
import { MembershipRequests } from "./membership-requests";

const TYPE_LABEL: Record<string, string> = {
  friends_family: "Friends & family",
  season_ticket_holders: "Season-ticket holders",
  alumni: "Alumni",
  supporters: "Supporters group",
  corporate: "Corporate group",
};

export const dynamic = "force-dynamic";

export default async function CircleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  const circle = await queryCircleById(id, user?.id);
  if (!circle) notFound();
  const listings = await queryListingsByCircle(id, user?.id);
  const [favoriteTeam, membership, request, requests] = await Promise.all([
    circle.favoriteTeamId ? prisma.team.findUnique({ where: { id: circle.favoriteTeamId }, include: { league: true } }) : null,
    user ? prisma.circleMember.findUnique({ where: { circleId_userId: { circleId: id, userId: user.id } } }) : null,
    user ? prisma.circleJoinRequest.findUnique({ where: { circleId_userId: { circleId: id, userId: user.id } } }) : null,
    circle.isAdmin ? prisma.circleJoinRequest.findMany({ where: { circleId: id, status: "pending" }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 100 }) : [],
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {favoriteTeam && (
            <div className="hidden sm:block">
              <TeamCrest team={toTeam(favoriteTeam)} size="lg" />
            </div>
          )}
          <div>
            <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">{circle.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {TYPE_LABEL[circle.type] ?? circle.type} &middot; {circle.memberCount} members
            </p>
          </div>
        </div>
        {membership ? <span className="text-sm text-muted-foreground">Circle member</span> : user ? <JoinCircleButton circleId={circle.id} requested={request?.status === "pending"} /> : (
          <Button asChild>
            <Link href="/login">Sign in to request membership</Link>
          </Button>
        )}
      </div>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{circle.description}</p>
      <MembershipRequests requests={requests.map(request => ({ id: request.id, name: request.user.name }))} />

      <h2 className="mt-10 font-display text-xl tracking-tight">Circle listings</h2>
      {listings.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={Users}
          title="No listings in this circle yet"
          description="Members can publish a listing and set visibility to this circle."
        />
      ) : (
        <div className="mt-4 space-y-3">
          {listings.map((listing) => (
            <TicketListingCard key={listing.id} listing={listing} compact />
          ))}
        </div>
      )}
    </div>
  );
}
