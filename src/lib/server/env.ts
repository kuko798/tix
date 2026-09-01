import "server-only";

import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));
const optionalSecret = z.string().optional().or(z.literal(""));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  EMAIL_DELIVERY_ENABLED: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3).optional().or(z.literal("")),
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC").optional().or(z.literal("")),
  TWILIO_AUTH_TOKEN: optionalSecret,
  TWILIO_VERIFY_SERVICE_SID: z.string().startsWith("VA").optional().or(z.literal("")),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional().or(z.literal("")),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional().or(z.literal("")),
  STRIPE_CONNECT_COUNTRY: z.string().length(2).default("US"),
  STRIPE_CURRENCY: z.string().length(3).default("usd"),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: optionalSecret,
  S3_SECRET_ACCESS_KEY: optionalSecret,
  EVENT_SOURCE: z.enum(["ticketmaster", "manual"]).default("manual"),
  TICKETMASTER_API_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
}).superRefine((value, context) => {
  const isPostgres = /^postgres(?:ql)?:\/\//i.test(value.DATABASE_URL);
  const isLocalSqlite = value.NODE_ENV !== "production" && value.DATABASE_URL.startsWith("file:");

  if (!isPostgres && !isLocalSqlite) {
    context.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message: "must be a postgresql:// URL (or file: URL outside production)",
    });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
  throw new Error(`Invalid server environment: ${details}`);
}

export const env = parsed.data;

export const serviceReadiness = {
  email: env.EMAIL_DELIVERY_ENABLED === "true" && Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
  phoneVerification: Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID
  ),
  payments: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
  privateUploads: Boolean(
    env.S3_REGION && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
  ),
  eventSync: env.EVENT_SOURCE === "ticketmaster" && Boolean(env.TICKETMASTER_API_KEY),
};

export function assertServiceReady(service: keyof typeof serviceReadiness) {
  if (!serviceReadiness[service]) {
    throw new Error(`${service} is not configured for this environment.`);
  }
}
