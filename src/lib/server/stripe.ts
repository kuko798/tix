import "server-only";

import Stripe from "stripe";
import { env, assertServiceReady } from "@/lib/server/env";

let client: Stripe | undefined;

export function getStripe() {
  assertServiceReady("payments");
  client ??= new Stripe(env.STRIPE_SECRET_KEY!);
  return client;
}
