import "server-only";
import { environmentSchema } from "@/lib/server/env-schema";

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
  throw new Error(`Invalid server environment: ${details}`);
}

export const env = parsed.data;

export const serviceReadiness = {
  email: env.EMAIL_DELIVERY_ENABLED === "true",
  phoneVerification: Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID
  ),
  payments: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
  privateUploads: Boolean(
    env.S3_REGION && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
  ),
  eventSync: env.EVENT_SOURCE === "ticketmaster" && Boolean(env.TICKETMASTER_API_KEY),
};

export class ServiceUnavailableError extends Error {}

export function assertServiceReady(service: keyof typeof serviceReadiness) {
  if (!serviceReadiness[service]) {
    throw new ServiceUnavailableError(`${service} is not configured for this environment.`);
  }
}
