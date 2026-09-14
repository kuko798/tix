import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env, serviceReadiness } from "@/lib/server/env";
import { reconcileExchanges } from "@/lib/server/reconciliation";
import { logger } from "@/lib/server/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!env.CRON_SECRET || !serviceReadiness.payments) return NextResponse.json({ error: "Reconciliation is not configured." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await reconcileExchanges();
    if (result.errors.length) logger.error("stripe.reconciliation_failed", { transactionIds: result.errors });
    return NextResponse.json(result, { status: result.errors.length ? 500 : 200 });
  } catch { logger.error("stripe.reconciliation_failed", { message: "Job failed; retry required." }); return NextResponse.json({ error: "Reconciliation failed." }, { status: 500 }); }
}
