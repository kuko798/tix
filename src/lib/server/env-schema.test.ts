import { describe, expect, it } from "vitest";
import { environmentSchema } from "./env-schema";

const configured = { NODE_ENV: "production", APP_MODE: "live", DATABASE_URL: "postgresql://user:password@db.example.com/app", BETTER_AUTH_SECRET: "a".repeat(40), BETTER_AUTH_URL: "https://gameswap.example.com", NEXT_PUBLIC_APP_URL: "https://gameswap.example.com", EMAIL_DELIVERY_ENABLED: "true", NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION: "true", EMAIL_PROVIDER: "smtp", EMAIL_FROM: "support@example.com", SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "mailer", SMTP_PASSWORD: "smtp-test-value", STRIPE_SECRET_KEY: "sk_live_configuration_fixture", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_configuration_fixture", STRIPE_WEBHOOK_SECRET: "whsec_configuration_fixture", S3_REGION: "us-east-1", S3_BUCKET: "private-evidence", S3_ACCESS_KEY_ID: "fixture", S3_SECRET_ACCESS_KEY: "fixture", CRON_SECRET: "c".repeat(40) };
describe("live deployment validation", () => {
  it("accepts a fully configured live deployment", () => expect(environmentSchema.safeParse(configured).success).toBe(true));
  it("rejects test keys in a live deployment", () => expect(environmentSchema.safeParse({ ...configured, STRIPE_SECRET_KEY: "sk_test_fixture" }).success).toBe(false));
  it("rejects disabled verification and mail delivery", () => expect(environmentSchema.safeParse({ ...configured, EMAIL_DELIVERY_ENABLED: "false", NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION: "false" }).success).toBe(false));
  it("rejects different auth and application origins", () => expect(environmentSchema.safeParse({ ...configured, BETTER_AUTH_URL: "https://another.example.com" }).success).toBe(false));
  it("requires private storage and an authenticated scheduler", () => expect(environmentSchema.safeParse({ ...configured, S3_BUCKET: "", CRON_SECRET: "" }).success).toBe(false));
  it("rejects insecure SMTP and a development production build", () => {
    expect(environmentSchema.safeParse({ ...configured, SMTP_SECURE: "false" }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...configured, APP_MODE: "development" }).success).toBe(false);
  });
  it("keeps an explicit sandbox from using live payment keys", () => expect(environmentSchema.safeParse({ ...configured, APP_MODE: "test" }).success).toBe(false));
});
