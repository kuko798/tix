"use client";

import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

function Checkout({ returnPath }: { returnPath: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(undefined);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${returnPath}` },
    });
    if (result.error) setError(result.error.message ?? "Payment authorization could not be completed.");
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" disabled={!stripe || submitting} className="w-full">
        {submitting ? "Authorizing…" : "Authorize payment"}
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">Your payment details are entered in Stripe&apos;s secure payment element and never pass through GameSwap servers.</p>
    </form>
  );
}

export function PaymentForm({ transactionId, returnPath }: { transactionId: string; returnPath: string }) {
  const [clientSecret, setClientSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stripe/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, idempotencyKey }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Checkout is unavailable.");
        setClientSecret(payload.clientSecret);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Checkout is unavailable.");
      });
    return () => controller.abort();
  }, [idempotencyKey, transactionId]);

  if (!publishableKey || !stripePromise) {
    return <p className="mt-6 border border-danger/40 bg-danger-tint p-4 text-sm text-danger-tint-foreground">Stripe checkout is not configured for this environment.</p>;
  }
  if (error) return <p role="alert" className="mt-6 border border-danger/40 bg-danger-tint p-4 text-sm text-danger-tint-foreground">{error}</p>;
  if (!clientSecret) return <p className="mt-6 text-sm text-muted-foreground">Preparing secure checkout…</p>;

  return <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}><Checkout returnPath={returnPath} /></Elements>;
}
