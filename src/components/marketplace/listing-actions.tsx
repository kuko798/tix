"use client";

import { useState } from "react";
import { Bookmark, Flag, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reportListingAction, toggleSaveListingAction } from "@/lib/actions";

const REPORT_REASONS = [
  "Listing looks fraudulent",
  "Seat details don't match",
  "Suspected duplicate listing",
  "Inappropriate content",
  "Something else",
];

export function SaveButton({ listingId, savedCount }: { listingId: string; savedCount: number }) {
  const [saved, setSaved] = useState(false);
  const [count, setCount] = useState(savedCount);
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const result = await toggleSaveListingAction(listingId);
          setSaved(result.saved);
          setCount((c) => c + (result.saved ? 1 : -1));
          toast(result.saved ? "Saved for later" : "Removed from saved listings");
        } catch {
          toast.error("Sign in to save listings.");
        } finally {
          setPending(false);
        }
      }}
      aria-pressed={saved}
      className="gap-1.5"
    >
      <Bookmark className={saved ? "h-4 w-4 fill-current" : "h-4 w-4"} aria-hidden />
      {saved ? "Saved" : "Save"}
      <span className="text-muted-foreground">({Math.max(0, count)})</span>
    </Button>
  );
}

export function ShareButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(window.location.href).catch(() => {});
        }
        toast("Link copied");
      }}
    >
      <Share2 className="h-4 w-4" aria-hidden />
      Share
    </Button>
  );
}

export function ReportDialog({ listingId }: { listingId: string }) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
          <Flag className="h-4 w-4" aria-hidden />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this listing</DialogTitle>
          <DialogDescription>
            Let us know what&rsquo;s wrong. Reports are stored for review before any action is taken.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={setReason}>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <RadioGroupItem value={r} />
                {r}
              </label>
            ))}
          </RadioGroup>
          <div className="space-y-1.5">
            <Label htmlFor="report-details">Additional details (optional)</Label>
            <Textarea
              id="report-details"
              placeholder="Anything else we should know?"
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await reportListingAction(listingId, reason, details);
                setOpen(false);
                toast("Report submitted. Thanks for flagging it.");
              } catch {
                toast.error("Sign in to report a listing.");
              } finally {
                setPending(false);
              }
            }}
          >
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
