import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { initialsFromName } from "@/lib/initials";
import { env, serviceReadiness } from "@/lib/server/env";
import { sendTransactionalEmail } from "@/lib/server/email";
import { sendEmailVerification } from "@/lib/server/email-verification";
import { RateLimitError } from "@/lib/server/rate-limit";

export const auth = betterAuth({
  appName: "GameSwap",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  // GameSwap consumes its own hashed, single-use verification links.
  disabledPaths: ["/verify-email", "/delete-user", "/delete-user/callback"],
  database: prismaAdapter(prisma, {
    provider: env.DATABASE_URL.startsWith("file:") ? "sqlite" : "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: serviceReadiness.email,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendTransactionalEmail({
        to: user.email,
        subject: "Reset your GameSwap password",
        text: `Reset your GameSwap password: ${url}\n\nThis link expires in one hour. If you did not request it, you can ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: serviceReadiness.email,
    sendOnSignIn: serviceReadiness.email,
    sendVerificationEmail: async ({ user }) => {
      try {
        await sendEmailVerification(user);
      } catch (error) {
        if (error instanceof RateLimitError) {
          throw new APIError("TOO_MANY_REQUESTS", { message: error.message });
        }
        throw new APIError("SERVICE_UNAVAILABLE", { message: "The verification email could not be sent. Please try again." });
      }
    },
  },
  user: {
    additionalFields: {
      initials: {
        type: "string",
        required: false,
        defaultValue: "",
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
    deleteUser: {
      enabled: false,
      sendDeleteAccountVerification: async ({ user, url }) => {
        await sendTransactionalEmail({
          to: user.email,
          subject: "Confirm GameSwap account deletion",
          text: `Confirm permanent account deletion: ${url}\n\nIf you did not request this, change your password immediately.`,
        });
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            initials: initialsFromName(user.name ?? ""),
            role: env.ADMIN_EMAILS.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase())
              ? "admin"
              : "user",
          },
        }),
      },
    },
  },
  trustedOrigins: [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
  },
  plugins: [nextCookies()],
});
