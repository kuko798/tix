import "server-only";

import { getStripe } from "@/lib/server/stripe";
import { env } from "@/lib/server/env";

export async function createSellerOnboardingLink(accountId: string) {
  return getStripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: { type: "account_onboarding", account_onboarding: {
      configurations: ["recipient"],
      refresh_url: `${env.NEXT_PUBLIC_APP_URL}/settings/payments?refresh=1`,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/settings/payments?connected=1`,
    } },
  });
}
