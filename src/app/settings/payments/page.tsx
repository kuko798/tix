import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/server/policy";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createSellerOnboardingLink } from "@/lib/server/stripe-onboarding";

export default async function PaymentSettingsReturn({ searchParams }: { searchParams: Promise<{ refresh?: string }> }) {
  const user = await requireActiveUser();
  if ((await searchParams).refresh === "1") {
    await enforceRateLimit({ scope: "stripe-connect-refresh", userId: user.id, limit: 10, windowSeconds: 3600 });
    const seller = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { stripeAccountId: true } });
    if (seller.stripeAccountId) {
      const link = await createSellerOnboardingLink(seller.stripeAccountId);
      redirect(link.url);
    }
  }
  redirect("/settings");
}
