import { NextRequest } from "next/server";
import { runPlaceTrackingCron } from "@/lib/place-tracking-cron-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return runPlaceTrackingCron(req, "primary");
}
