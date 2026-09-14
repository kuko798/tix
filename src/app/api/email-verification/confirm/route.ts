import { env } from "@/lib/server/env";
import { confirmEmailVerification } from "@/lib/server/email-verification";
import { enforceRateLimit, RateLimitError } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    await enforceRateLimit({ scope: "email-verification-confirm", limit: 20, windowSeconds: 600 });
    const body: unknown = await request.json();
    const token = body && typeof body === "object" && "token" in body ? body.token : null;
    if (typeof token !== "string" || !await confirmEmailVerification(token)) {
      return Response.json({ error: "This verification link is invalid, expired, or already used. Request a new email." }, { status: 400 });
    }
    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    }
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid request." }, { status: 400 });
    return Response.json({ error: "Verification is temporarily unavailable. Try again." }, { status: 503 });
  }
}
