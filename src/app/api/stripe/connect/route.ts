import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server/policy";
import { getStripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";

export async function POST() {
  const user = await requireActiveUser();
  await enforceRateLimit({ scope: "stripe-connect", userId: user.id, limit: 5, windowSeconds: 3600 });
  const stripe = getStripe();
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeAccountId: true, email: true } });
  let accountId = row.stripeAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: env.STRIPE_CONNECT_COUNTRY,
      email: row.email,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { gameswapUserId: user.id },
    });
    accountId = account.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeAccountId: accountId } });
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${env.NEXT_PUBLIC_APP_URL}/settings/payments?refresh=1`,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/settings/payments?connected=1`,
    type: "account_onboarding",
  });
  await audit({ actorUserId: user.id, action: "stripe.onboarding_started", entityType: "user", entityId: user.id });
  return NextResponse.json({ url: link.url });
}
