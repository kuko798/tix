import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { SettingsForm } from "./settings-form";
import { AppFrame, PageIntro } from "@/components/brand/page-intro";
import { serviceReadiness } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSessionUser();
  const [user, leagues, teams] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.id },
      select: { name: true, email: true, emailVerified: true, phoneNumber: true, verifiedPhone: true, homeCity: true, image: true, favoriteTeamIds: true, favoriteLeagueIds: true, stripeAccountId: true, notificationPreference: true },
    }),
    prisma.league.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { league: { active: true } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 }),
  ]);
  const preferences = user.notificationPreference ?? {
    emailMessages: true,
    emailOffers: true,
    emailTransfers: true,
    emailPayments: true,
    emailDisputes: true,
    emailMarketing: false,
  };
  return (
    <AppFrame width="narrow">
      <PageIntro title="Account settings">Profile, payouts, notification preferences, and account controls.</PageIntro>
      <SettingsForm
        profile={{ name: user.name, email: user.email, homeCity: user.homeCity ?? "", image: user.image ?? "", favoriteTeamIds: user.favoriteTeamIds, favoriteLeagueIds: user.favoriteLeagueIds }}
        verification={{
          emailVerified: user.emailVerified,
          phoneNumber: user.phoneNumber ?? "",
          phoneVerified: user.verifiedPhone,
          emailConfigured: serviceReadiness.email,
          phoneConfigured: serviceReadiness.phoneVerification,
        }}
        preferences={preferences}
        payoutConfigured={Boolean(user.stripeAccountId)}
        leagues={leagues}
        teams={teams}
      />
    </AppFrame>
  );
}
