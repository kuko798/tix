import type { Instrumentation } from "next";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.info(JSON.stringify({ level: "info", event: "gameswap.server_started", at: new Date().toISOString() }));
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  console.error(JSON.stringify({
    level: "error",
    event: "gameswap.request_error",
    message,
    digest,
    route: context.routePath,
    routeType: context.routeType,
    at: new Date().toISOString(),
  }));
};
