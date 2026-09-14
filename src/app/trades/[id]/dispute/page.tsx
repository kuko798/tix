"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { toast } from "sonner";
import { EvidenceUpload } from "@/components/marketplace/evidence-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertBanner } from "@/components/marketplace/alert-banner";
import { TransactionTimeline } from "@/components/marketplace/transaction-timeline";
import { DISPUTE_REASON_META } from "@/lib/constants";
import { createDisputeAction } from "@/lib/actions";
import { useSession } from "@/lib/auth-client";
import type { Dispute, DisputeReason, Trade } from "@/lib/types";

const REASONS = Object.keys(DISPUTE_REASON_META) as DisputeReason[];

function DisputeContent({ tradeId }: { tradeId: string }) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const [trade, setTrade] = useState<Trade | null>(null);
  const [existingDispute, setExistingDispute] = useState<Dispute | null>(null);
  const [missing, setMissing] = useState(false);
  const [reason, setReason] = useState<DisputeReason>("ticket_not_transferred");
  const [statement, setStatement] = useState("");
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
      .then((data: { trade: Trade; dispute: Dispute | null } | null) => {
        if (data) {
          setTrade(data.trade);
          setExistingDispute(data.dispute);
          if (data.dispute) {
            setReason(data.dispute.reason);
            setStatement(data.dispute.statement);
          }
        }
      })
      .catch(() => setMissing(true));
  }, [tradeId]);

  if (missing) notFound();
  if (!trade || !currentUserId) {
    return <div className="px-6 py-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const otherUser = trade.userAId === currentUserId ? trade.participantB : trade.participantA;

  if (existingDispute) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Dispute status</h1>
        <AlertBanner variant="warning" title={existingDispute.status === "resolved" ? "Resolved" : "Under review"} className="mt-6">
          {existingDispute.status === "resolved" ? existingDispute.resolution ?? "Support has resolved this case." : `Support is reviewing your case with ${otherUser.displayName}. You'll get a notification when there is an update.`}
        </AlertBanner>
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-medium">{DISPUTE_REASON_META[existingDispute.reason].label}</p>
          <p className="mt-2 text-sm text-muted-foreground">&ldquo;{existingDispute.statement}&rdquo;</p>
        </div>
        <div className="mt-4 space-y-2">{existingDispute.evidence?.map(file => <a key={file.id} className="block text-sm underline" href={`/api/disputes/evidence/${file.id}`} target="_blank" rel="noreferrer">{file.originalName}</a>)}</div>
        {existingDispute.status !== "resolved" && <EvidenceUpload target={{ disputeId: existingDispute.id }} onUploaded={() => { fetch(`/api/trades/${tradeId}`, { cache: "no-store" }).then(response => response.json()).then(data => setExistingDispute(data.dispute)).catch(() => toast.error("Reload the page to see your uploaded evidence.")); }} />}
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <p className="mb-4 text-sm font-medium">Transaction timeline</p>
          <TransactionTimeline trade={trade} viewerId={currentUserId} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl leading-[1.08] sm:text-4xl">Report a problem</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us what went wrong with your trade with {otherUser.displayName}. Support reviews
        every case using the timeline and evidence below.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <p className="mb-4 text-sm font-medium">Transaction timeline so far</p>
        <TransactionTimeline trade={trade} viewerId={currentUserId} />
      </div>

      <form
        className="mt-8 space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!statement.trim()) {
            toast.error("Add a short statement so support knows what happened.");
            return;
          }
          setPending(true);
          try {
            const created = await createDisputeAction(trade.id, reason, statement);
            setExistingDispute({ id: created.id, tradeId: trade.id, reason, statement, status: "submitted", filedByUserId: currentUserId, filedAt: new Date().toISOString(), evidence: [] });
            toast.success("Dispute submitted. Support has been notified.");

          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not submit that dispute.");
          } finally {
            setPending(false);
          }
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What happened?</legend>
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as DisputeReason)} className="space-y-2">
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <RadioGroupItem value={r} />
                {DISPUTE_REASON_META[r].label}
              </label>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="statement">Your statement</Label>
          <Textarea
            id="statement"
            rows={5}
            required
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Walk us through what happened and when."
          />
        </div>

        <p className="text-sm text-muted-foreground">After submitting, you can attach private screenshots or documents to your saved case.</p>

        <AlertBanner variant="info" title="What happens next">
          A specialist reviews the timeline, your statement, and any evidence from both sides.
        </AlertBanner>

        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Submitting…" : "Submit dispute"}
        </Button>
      </form>
    </div>
  );
}

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DisputeContent tradeId={id} />;
}
