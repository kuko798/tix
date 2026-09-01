import "server-only";

import { prisma } from "@/lib/prisma";
import { env, serviceReadiness } from "@/lib/server/env";
import { queueTransactionalEmail } from "@/lib/server/email";

type Category = "messages" | "offers" | "transfers" | "payments" | "disputes";

const preferenceField = {
  messages: "emailMessages",
  offers: "emailOffers",
  transfers: "emailTransfers",
  payments: "emailPayments",
  disputes: "emailDisputes",
} as const;

export async function sendNotificationEmail(input: { userId: string; category: Category; subject: string; body: string; path: string }) {
  if (!serviceReadiness.email) return;
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, notificationPreference: true, accountStatus: true },
  });
  if (!user || user.accountStatus !== "active") return;
  const preference = user.notificationPreference?.[preferenceField[input.category]] ?? true;
  if (!preference) return;
  queueTransactionalEmail({
    to: user.email,
    subject: input.subject,
    text: `${input.body}\n\nOpen GameSwap: ${env.NEXT_PUBLIC_APP_URL}${input.path}`,
  });
}
