"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { WantedRequest } from "@/lib/types";
import { startWantedConversationAction } from "@/lib/actions";

export function WantedFulfillDialog({ request }: { request: WantedRequest }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(request.maxBudget));
  const [message, setMessage] = useState(
    "Hey, I've got seats for this game. Happy to work out a trade or sale."
  );
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const requester = request.requester;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="h-11 w-full sm:w-auto">
          I have these tickets
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message {requester.displayName}</DialogTitle>
          <DialogDescription>
            Start a conversation about this request. You can send a formal offer once you agree on seats.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fulfill-price">Your asking price per ticket</Label>
            <Input
              id="fulfill-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fulfill-message">Message</Label>
            <Textarea id="fulfill-message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
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
                const note = `${message.trim()}${price ? ` Asking about $${price}/ticket.` : ""}`;
                const { threadId } = await startWantedConversationAction(request.id, note);
                setOpen(false);
                toast(`Message sent to ${requester.displayName}`);
                router.push(`/messages/${threadId}`);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not send that message.");
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Sending…" : "Send message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
