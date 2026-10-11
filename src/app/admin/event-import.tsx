"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EventImport() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imported, setImported] = useState(false);

  async function importEvents() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage("");
    setError("");
    setImported(false);
    try {
      const response = await fetch("/api/admin/events/sync", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        let detail = typeof data?.error === "string" ? data.error : "Event import failed. Please try again.";
        if (response.status === 401) detail = "Your session has expired. Sign in again to import events.";
        if (response.status === 429) {
          const seconds = Number(response.headers.get("Retry-After"));
          detail = Number.isFinite(seconds) && seconds > 0
            ? `Import limit reached. Try again in ${Math.ceil(seconds / 60)} minute(s).`
            : "Import limit reached. Only four imports are allowed per hour. Please try again later.";
        }
        setError(detail);
        return;
      }
      if (!Number.isInteger(data?.imported) || data.imported < 0 || !Number.isInteger(data?.received) || data.received < data.imported) {
        setError("The server returned an unexpected result. Check the event catalog before retrying.");
        return;
      }
      setMessage(`Imported or updated ${data.imported} of ${data.received} received events.${data.imported === 0 ? " No eligible upcoming events were imported." : ""}`);
      setImported(data.imported > 0);
    } catch {
      setError("Could not reach the server. The import may still have run. Check your connection and the event catalog before retrying.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="event-import-heading" className="mt-8 border border-border bg-card p-6">
      <h2 id="event-import-heading" className="font-display text-2xl">Event catalog</h2>
      <p className="mt-2 text-sm text-muted-foreground">Import upcoming games so fans can list tickets and post wanted requests. Existing events are updated.</p>
      <Button type="button" className="mt-4" disabled={pending} onClick={importEvents}>
        {pending ? "Importing…" : "Import Ticketmaster events"}
      </Button>
      <p role="status" aria-live="polite" className="mt-3 text-sm">{pending ? "Fetching and saving Ticketmaster events…" : message}</p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {imported && <Link href="/wanted/new" className="mt-3 inline-block text-sm font-medium text-primary underline">Post a wanted request</Link>}
    </section>
  );
}
