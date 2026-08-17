import { NextRequest, NextResponse } from "next/server";
import { runPlaceTrackingCron } from "@/lib/place-tracking-cron-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slot: string }> }
) {
  const { slot } = await context.params;

  if (!/^[1-7]$/.test(slot)) {
    return NextResponse.json({ error: "Unknown cron slot" }, { status: 404 });
  }

  return runPlaceTrackingCron(req, `slot-${slot}`);
}
