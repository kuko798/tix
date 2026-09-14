import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));
const optionalSecret = z.string().optional().or(z.literal(""));
const blankAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalPort = z.preprocess(
  blankAsUndefined,
  z.coerce.number().int().min(1).max(65_535).optional()
);

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.preprocess(blankAsUndefined, z.enum(["development", "test", "live"]).default(process.env.NODE_ENV === "production" ? "live" : "development")),
  CRON_SECRET: optionalSecret,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalSecret,
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION: z.preprocess(
    blankAsUndefined,
    z.enum(["true", "false"]).default("false")
  ),
  EMAIL_DELIVERY_ENABLED: z.preprocess(
    blankAsUndefined,
    z.enum(["true", "false"]).default("false")
  ),
  EMAIL_PROVIDER: z.preprocess(
    blankAsUndefined,
    z.enum(["resend", "smtp"]).default("smtp")
  ),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3).optional().or(z.literal("")),
  SMTP_HOST: z.string().optional().or(z.literal("")),
  SMTP_PORT: optionalPort,
  SMTP_SECURE: z.preprocess(
    blankAsUndefined,
    z.enum(["true", "false"]).default("false")
  ),
  SMTP_USER: z.string().optional().or(z.literal("")),
  SMTP_PASSWORD: optionalSecret,
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC").optional().or(z.literal("")),
  TWILIO_AUTH_TOKEN: optionalSecret,
  TWILIO_VERIFY_SERVICE_SID: z.string().startsWith("VA").optional().or(z.literal("")),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional().or(z.literal("")),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional().or(z.literal("")),
  STRIPE_CONNECT_COUNTRY: z.preprocess(blankAsUndefined, z.string().length(2).default("US")),
  STRIPE_CURRENCY: z.preprocess(blankAsUndefined, z.string().length(3).default("usd")),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: optionalSecret,
  S3_SECRET_ACCESS_KEY: optionalSecret,
  EVENT_SOURCE: z.preprocess(
    blankAsUndefined,
    z.enum(["ticketmaster", "manual"]).default("manual")
  ),
  TICKETMASTER_API_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().default(""),
  LOG_LEVEL: z.preprocess(
    blankAsUndefined,
    z.enum(["debug", "info", "warn", "error"]).default("info")
  ),
}).superRefine((value, context) => {
  if (value.APP_MODE === "live") {
    const requirements = {
      BETTER_AUTH_SECRET: value.BETTER_AUTH_SECRET.length >= 32 && !/replace|example/i.test(value.BETTER_AUTH_SECRET),
      BETTER_AUTH_URL: value.BETTER_AUTH_URL.startsWith("https://"),
      NEXT_PUBLIC_APP_URL: value.NEXT_PUBLIC_APP_URL.startsWith("https://") && new URL(value.NEXT_PUBLIC_APP_URL).origin === new URL(value.BETTER_AUTH_URL).origin,
      EMAIL_DELIVERY_ENABLED: value.EMAIL_DELIVERY_ENABLED === "true",
      NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION: value.NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION === "true",
      EMAIL_PROVIDER: value.EMAIL_PROVIDER === "smtp",
      STRIPE_SECRET_KEY: Boolean(value.STRIPE_SECRET_KEY?.startsWith("sk_live_")),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Boolean(value.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")),
      STRIPE_WEBHOOK_SECRET: Boolean(value.STRIPE_WEBHOOK_SECRET),
      S3_BUCKET: Boolean(value.S3_BUCKET && value.S3_REGION && value.S3_ACCESS_KEY_ID && value.S3_SECRET_ACCESS_KEY),
      CRON_SECRET: Boolean(value.CRON_SECRET && value.CRON_SECRET.length >= 32),
    };
    for (const [key, ready] of Object.entries(requirements)) if (!ready) context.addIssue({ code: "custom", path: [key], message: "must be configured for live deployment" });
  }
  if (value.NODE_ENV === "production" && value.APP_MODE === "development") context.addIssue({ code: "custom", path: ["APP_MODE"], message: "use test for a sandbox deployment or live for production" });
  if (value.APP_MODE === "test" && value.STRIPE_SECRET_KEY && !value.STRIPE_SECRET_KEY.startsWith("sk_test_")) context.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "must use a test key in test mode" });
  const isPostgres = /^postgres(?:ql)?:\/\//i.test(value.DATABASE_URL);
  const isLocalSqlite = value.NODE_ENV !== "production" && value.DATABASE_URL.startsWith("file:");

  if (!isPostgres && !isLocalSqlite) {
    context.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message: "must be a postgresql:// URL (or file: URL outside production)",
    });
  }

  if (value.EMAIL_DELIVERY_ENABLED !== "true") return;

  if (value.NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION !== "true") {
    context.addIssue({
      code: "custom",
      path: ["NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION"],
      message: "must be true when email delivery is enabled",
    });
  }

  if (!value.EMAIL_FROM) {
    context.addIssue({
      code: "custom",
      path: ["EMAIL_FROM"],
      message: "is required when email delivery is enabled",
    });
  }

  if (value.EMAIL_PROVIDER === "resend" && !value.RESEND_API_KEY) {
    context.addIssue({
      code: "custom",
      path: ["RESEND_API_KEY"],
      message: "is required when EMAIL_PROVIDER is resend",
    });
  }

  if (value.EMAIL_PROVIDER === "smtp") {
    for (const [key, configured] of [
      ["SMTP_HOST", value.SMTP_HOST],
      ["SMTP_PORT", value.SMTP_PORT],
      ["SMTP_USER", value.SMTP_USER],
      ["SMTP_PASSWORD", value.SMTP_PASSWORD],
    ] as const) {
      if (!configured) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `is required when EMAIL_PROVIDER is smtp`,
        });
      }
    }

    if (value.SMTP_PORT === 25) {
      context.addIssue({
        code: "custom",
        path: ["SMTP_PORT"],
        message: "cannot be 25 on Vercel; use 465 or 587",
      });
    }

    if (value.SMTP_PORT === 465 && value.SMTP_SECURE !== "true") {
      context.addIssue({
        code: "custom",
        path: ["SMTP_SECURE"],
        message: "must be true when SMTP_PORT is 465",
      });
    }

    if (value.SMTP_PORT === 587 && value.SMTP_SECURE !== "false") {
      context.addIssue({
        code: "custom",
        path: ["SMTP_SECURE"],
        message: "must be false when SMTP_PORT is 587 so STARTTLS can be used",
      });
    }
  }
});
