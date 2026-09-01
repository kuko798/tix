"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelOfferAction, counterOfferAction, respondToOfferAction } from "@/lib/actions";
import { Input } from "@/components/ui/input";

export function OfferControls({
  offerId,
  version,
  direction,
  cashAmountCents,
}: {
  offerId: string;
  version: number;
  direction: "incoming" | "outgoing";
  cashAmountCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [countering, setCountering] = useState(false);
  const [cash, setCash] = useState((cashAmountCents / 100).toFixed(2));
  const [note, setNote] = useState("");

  function run(task: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        const result = await task();
        toast.success(success);
        if (result && typeof result === "object" && "tradeId" in result && typeof result.tradeId === "string") {
          router.push(`/trades/${result.tradeId}`);
        } else {
          router.refresh();
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The offer could not be updated.");
      }
    });
  }

  if (direction === "outgoing") {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => cancelOfferAction(offerId), "Offer cancelled") }>
        Cancel offer
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {countering && (
        <div className="mb-2 grid w-full grid-cols-[110px_1fr] gap-2">
          <Input aria-label="Counteroffer cash amount" type="number" min="0" step="0.01" value={cash} onChange={(event) => setCash(event.target.value)} />
          <Input aria-label="Counteroffer note" maxLength={2000} placeholder="Explain the revised terms" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => countering
          ? run(() => counterOfferAction({ offerId, expectedVersion: version, cashAdjustment: Number(cash) || 0, note }), "Counteroffer sent")
          : setCountering(true)}
      >
        {countering ? "Send counter" : "Counter"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => respondToOfferAction({ offerId, decision: "decline", expectedVersion: version }), "Offer declined")}
      >
        Decline
      </Button>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(() => respondToOfferAction({ offerId, decision: "accept", expectedVersion: version }), "Offer accepted")}
      >
        Accept terms
      </Button>
    </div>
  );
}
