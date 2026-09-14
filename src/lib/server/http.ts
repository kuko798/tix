import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "@/lib/session";
import { ForbiddenError, requireActiveUser, requireAdmin } from "@/lib/server/policy";
import { RateLimitError } from "@/lib/server/rate-limit";
import { env, ServiceUnavailableError } from "@/lib/server/env";

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function requireApiUser(request: Request) {
  if (!await getSessionUser()) throw new HttpError(401, "Sign in required.");
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const allowed = [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL].map(url => new URL(url).origin);
    if (!origin || !allowed.includes(origin)) throw new HttpError(403, "Invalid request origin.");
  }
  return requireActiveUser();
}

export async function requireApiAdmin(request: Request) {
  await requireApiUser(request);
  return requireAdmin();
}

export function withApiErrors<Args extends unknown[]>(handler: (...args: Args) => Promise<NextResponse>) {
  return async (...args: Args): Promise<NextResponse> => {
    try { return await handler(...args); }
    catch (error) {
      if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
      if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
      if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Check the request fields and try again." }, { status: 400 });
      if (error instanceof ServiceUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
      return NextResponse.json({ error: "The request could not be completed. Please try again." }, { status: 500 });
    }
  };
}
