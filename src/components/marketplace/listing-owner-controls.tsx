"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteListingAction, pauseListingAction, resumeListingAction } from "@/lib/actions";

export function ListingOwnerControls({ listingId, status }: { listingId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<unknown>, message: string) => startTransition(async () => {
    try { await action(); toast.success(message); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "The listing could not be updated."); }
  });
  return <div className="space-y-2"><Button asChild variant="outline" className="w-full"><Link href={`/listing/${listingId}/edit`}>Edit listing</Link></Button>{status === "active" ? <Button variant="outline" disabled={pending} className="w-full" onClick={() => run(() => pauseListingAction(listingId), "Listing paused")}>Pause listing</Button> : <Button variant="outline" disabled={pending} className="w-full" onClick={() => run(() => resumeListingAction(listingId), "Listing resumed")}>Resume listing</Button>}<Button variant="destructive" disabled={pending} className="w-full" onClick={() => { if (window.confirm("Cancel this listing? It will no longer appear in the marketplace.")) run(() => deleteListingAction(listingId), "Listing cancelled"); }}>Cancel listing</Button></div>;
}
