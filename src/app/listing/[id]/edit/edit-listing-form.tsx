"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { editListingAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type Listing = { id: string; version: number; section: string; row: string; quantity: number; faceValuePerTicket: number; acceptsGamesDescription: string; accessible: boolean };

export function EditListingForm({ listing }: { listing: Listing }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(listing);
  return (
    <form className="mt-8 space-y-5 border-t border-border pt-6" onSubmit={(event) => { event.preventDefault(); startTransition(async () => {
      try { await editListingAction({ listingId: form.id, expectedVersion: form.version, section: form.section, row: form.row, quantity: form.quantity, faceValuePerTicket: form.faceValuePerTicket, acceptsGamesDescription: form.acceptsGamesDescription, accessible: form.accessible }); toast.success("Listing updated"); router.push(`/listing/${form.id}`); router.refresh(); }
      catch (error) { toast.error(error instanceof Error ? error.message : "The listing could not be updated."); }
    }); }}>
      <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><Label htmlFor="edit-section">Section</Label><Input id="edit-section" value={form.section} onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))} /></div><div className="space-y-1.5"><Label htmlFor="edit-row">Row</Label><Input id="edit-row" value={form.row} onChange={(event) => setForm((current) => ({ ...current, row: event.target.value }))} /></div></div>
      <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><Label htmlFor="edit-quantity">Tickets</Label><Input id="edit-quantity" type="number" min={1} max={20} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: Number(event.target.value) }))} /></div><div className="space-y-1.5"><Label htmlFor="edit-value">Value per ticket</Label><Input id="edit-value" type="number" min={0} step="0.01" value={form.faceValuePerTicket} onChange={(event) => setForm((current) => ({ ...current, faceValuePerTicket: Number(event.target.value) }))} /></div></div>
      <div className="space-y-1.5"><Label htmlFor="edit-accepts">Desired games or offer notes</Label><Textarea id="edit-accepts" maxLength={1000} value={form.acceptsGamesDescription} onChange={(event) => setForm((current) => ({ ...current, acceptsGamesDescription: event.target.value }))} /></div>
      <label className="flex items-center justify-between border border-border px-3 py-3 text-sm">Accessible seating<Switch checked={form.accessible} onCheckedChange={(accessible) => setForm((current) => ({ ...current, accessible }))} /></label>
      <div className="flex gap-3"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button></div>
    </form>
  );
}
