"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createReviewAction } from "@/lib/actions";

export function ReviewForm({ tradeId, revieweeId, reviewed }: { tradeId: string; revieweeId: string; reviewed: boolean }) {
  const [rating, setRating] = useState("5");
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(reviewed);
  const [pending, startTransition] = useTransition();
  if (saved) return <p className="mt-6 border border-border p-5 text-sm">Your review has been submitted.</p>;
  return <form className="mt-6 space-y-4 border border-border bg-card p-5" onSubmit={event => {
    event.preventDefault();
    startTransition(async () => {
      try { await createReviewAction(revieweeId, tradeId, Number(rating), text); setSaved(true); toast.success("Review submitted"); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Your review could not be submitted."); }
    });
  }}>
    <h2 className="font-display text-xl">Review your exchange</h2>
    <div className="space-y-2"><Label htmlFor="review-rating">Rating</Label><select id="review-rating" value={rating} onChange={event => setRating(event.target.value)} className="block h-10 rounded-md border border-input bg-background px-3">{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="review-text">Your review</Label><Textarea id="review-text" required minLength={10} maxLength={2000} value={text} onChange={event => setText(event.target.value)} /></div>
    <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit review"}</Button>
  </form>;
}
