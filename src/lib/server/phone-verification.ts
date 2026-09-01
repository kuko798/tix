import "server-only";

import { Buffer } from "node:buffer";
import { env, assertServiceReady } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";

const verifyBaseUrl = "https://verify.twilio.com/v2/Services";

function getTwilioVerifyConfig() {
  assertServiceReady("phoneVerification");
  return {
    accountSid: env.TWILIO_ACCOUNT_SID as string,
    authToken: env.TWILIO_AUTH_TOKEN as string,
    serviceSid: env.TWILIO_VERIFY_SERVICE_SID as string,
  };
}

function authorizationHeader(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

export async function sendPhoneVerificationCode(phoneNumber: string) {
  const config = getTwilioVerifyConfig();
  const response = await fetch(
    `${verifyBaseUrl}/${encodeURIComponent(config.serviceSid)}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: authorizationHeader(config.accountSid, config.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneNumber, Channel: "sms" }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    logger.error("phone_verification.delivery_failed", { status: response.status });
    throw new Error("Phone verification delivery failed.");
  }
}

export async function checkPhoneVerificationCode(phoneNumber: string, code: string) {
  const config = getTwilioVerifyConfig();
  const response = await fetch(
    `${verifyBaseUrl}/${encodeURIComponent(config.serviceSid)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: authorizationHeader(config.accountSid, config.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phoneNumber, Code: code }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    }
  );

  if (response.status === 400 || response.status === 404) return false;
  if (!response.ok) {
    logger.error("phone_verification.check_failed", { status: response.status });
    throw new Error("Phone verification check failed.");
  }

  const result = (await response.json()) as { status?: string };
  return result.status === "approved";
}
