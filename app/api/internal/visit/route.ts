import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { seoulCalendarDateString } from "@/lib/seoul-calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function uaNormalized(h: Headers): string {
  const ua = (h.get("user-agent") ?? "").trim().slice(0, 512);
  return ua || "unknown";
}

function resolvedIp(h: Headers): string {
  const synthetic = h.get("x-visit-client-ip")?.trim();
  if (synthetic) return synthetic;

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "0.0.0.0"
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.VISIT_LOG_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (
    !secret ||
    req.headers.get("x-internal-visit-secret") !== secret
  ) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const ip = resolvedIp(req.headers);
  const ua = uaNormalized(req.headers);
  const visitDate = seoulCalendarDateString();
  const ipHash = sha256Hex(`ip:${ip}`);
  const uaHash = sha256Hex(`ua:${ua}`);

  try {
    await prisma.visitorLog.upsert({
      where: {
        visitDate_ipHash_uaHash: { visitDate, ipHash, uaHash },
      },
      create: { visitDate, ipHash, uaHash },
      update: { seenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[internal/visit]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
