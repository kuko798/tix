import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { EditListingForm } from "./edit-listing-form";

export const dynamic = "force-dynamic";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, sellerId: user.id, status: { in: ["active", "paused"] } },
    select: { id: true, version: true, section: true, row: true, quantity: true, faceValuePerTicket: true, acceptsGamesDescription: true, accessible: true },
  });
  if (!listing) notFound();
  return <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Listing controls</p><h1 className="mt-2 font-display text-4xl">Edit ticket details</h1><EditListingForm listing={{ ...listing, acceptsGamesDescription: listing.acceptsGamesDescription ?? "" }} /></main>;
}
