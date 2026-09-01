import "server-only";

import { env, assertServiceReady } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";

type Mail = { to: string; subject: string; text: string; html?: string };

export async function sendTransactionalEmail(mail: Mail) {
  assertServiceReady("email");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...mail }),
  });

  if (!response.ok) {
    logger.error("email.delivery_failed", { status: response.status, recipientDomain: mail.to.split("@")[1] });
    throw new Error("Transactional email delivery failed.");
  }
}

export function queueTransactionalEmail(mail: Mail) {
  void sendTransactionalEmail(mail).catch((error) => {
    logger.error("email.background_delivery_failed", {
      message: error instanceof Error ? error.message : "Unknown email error",
    });
  });
}
