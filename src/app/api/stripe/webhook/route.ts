import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { processStripeEvent } from "@/lib/server/stripe-events";
import { getStripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  if (event.livemode !== !env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Unexpected Stripe mode." }, { status: 400 });
  }

  return processStripeEvent(event);
}
