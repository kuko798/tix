import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { env, assertServiceReady } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";

type Mail = { to: string; subject: string; text: string; html?: string };
let smtpTransporter: Transporter | undefined;

function getSmtpTransporter() {
  smtpTransporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    requireTLS: env.SMTP_SECURE !== "true",
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2" },
  });
  return smtpTransporter;
}

async function sendWithResend(mail: Mail) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...mail }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}.`);
}

async function sendWithSmtp(mail: Mail) {
  const result = await getSmtpTransporter().sendMail({
    from: env.EMAIL_FROM,
    ...mail,
  });

  if ((result.rejected?.length ?? 0) > 0 || (result.accepted?.length ?? 0) === 0) {
    throw new Error("The SMTP server rejected the recipient.");
  }
}

export async function sendTransactionalEmail(mail: Mail) {
  assertServiceReady("email");
  try {
    if (env.EMAIL_PROVIDER === "smtp") {
      await sendWithSmtp(mail);
    } else {
      await sendWithResend(mail);
    }
  } catch (error) {
    logger.error("email.delivery_failed", {
      provider: env.EMAIL_PROVIDER,
      recipientDomain: mail.to.split("@")[1],
      message: error instanceof Error ? error.message : "Unknown email error",
    });
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
