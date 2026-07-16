import { NextResponse } from "next/server";

import { processRegisteredKeywordQueue } from "@/lib/place-registered-keyword-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const hasValidSecret =
    Boolean(cronSecret) &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (
    process.env.NODE_ENV === "production" &&
    !isVercelCron &&
    !hasValidSecret
  ) {
    return NextResponse.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await processRegisteredKeywordQueue({
    maxItems: 3,
    jitterMs: 1_000,
  });
  console.log("[place-analysis registered keyword queue] cron", result);
  return NextResponse.json({ ok: true, concurrency: 1, ...result });
}
