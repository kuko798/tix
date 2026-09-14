import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, withApiErrors } from "@/lib/server/http";
import { getStripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { createSellerOnboardingLink } from "@/lib/server/stripe-onboarding";

export const POST = withApiErrors(async (request: Request) => {
  const user = await requireApiUser(request);
  await enforceRateLimit({ scope: "stripe-connect", userId: user.id, limit: 5, windowSeconds: 3600 });
  const stripe = getStripe();
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeAccountId: true, email: true } });
  let accountId = row.stripeAccountId;
  if (!accountId) {
    const account = await stripe.v2.core.accounts.create({
      dashboard: "express",
      identity: { country: env.STRIPE_CONNECT_COUNTRY.toLowerCase() },
      contact_email: row.email,
      display_name: user.name,
      defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
      configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
      metadata: { gameswapUserId: user.id },
    }, { idempotencyKey: `gameswap_seller_${user.id}` });
    accountId = account.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeAccountId: accountId } });
  }
  const link = await createSellerOnboardingLink(accountId);
  await audit({ actorUserId: user.id, action: "stripe.onboarding_started", entityType: "user", entityId: user.id });
  return NextResponse.json({ url: link.url });
});
