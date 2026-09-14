"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideCircleJoinAction } from "@/lib/actions";

export function MembershipRequests({ requests }: { requests: Array<{ id: string; name: string }> }) {
  const [pending, startTransition] = useTransition();
  if (!requests.length) return null;
  return <section className="mt-8 border border-border bg-card p-5">
    <h2 className="font-display text-xl">Membership requests</h2>
    <p className="mt-2 text-sm text-muted-foreground">Approved members can see tickets shared with this circle.</p>
    {requests.map(request => <div key={request.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <span className="text-sm">{request.name}</span>
      <div className="flex gap-2">{(["approved", "declined"] as const).map(decision => <Button key={decision} size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
        try { await decideCircleJoinAction({ requestId: request.id, decision }); toast.success(decision === "approved" ? "Member approved" : "Request declined"); }
        catch (error) { toast.error(error instanceof Error ? error.message : "Membership could not be updated."); }
      })}>{decision === "approved" ? "Approve" : "Decline"}</Button>)}</div>
    </div>)}
  </section>;
}
