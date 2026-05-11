import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { seoulCalendarDateString } from "@/lib/seoul-calendar";
import { categorizeReferrer } from "@/lib/referrer-category";
import { snippetFromUserAgent } from "@/lib/user-agent-hint";
import { getVisitInternalSecret } from "@/lib/visit-internal-secret";
import {
  shouldPersistVisitorEvent,
  visitPathnameFromFullPath,
} from "@/lib/visit-path-eligibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEDUP_WINDOW_MS = 30_000;

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

type VisitBody = { path?: string; referrer?: string | null };

/** 내부용 시크릿 헤더 또는 동일 출처 브라우저 POST */
function isAuthorized(req: NextRequest, selfOrigin: string, internalSecret: string) {
  if (internalSecret && req.headers.get("x-internal-visit-secret") === internalSecret)
    return "internal";

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer") ?? "";
  if (origin === selfOrigin) return "client";
  if (referer.startsWith(selfOrigin)) return "client";

  return null;
}

export async function POST(req: NextRequest) {
  const selfOrigin = new URL(req.url).origin;
  const internalSecret = getVisitInternalSecret();

  let body: VisitBody = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw) as VisitBody;
  } catch {
    body = {};
  }

  if (!isAuthorized(req, selfOrigin, internalSecret)) {
    console.warn("[visit-log] forbidden", {
      origin: req.headers.get("origin"),
      hasReferer: Boolean(req.headers.get("referer")),
    });
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const ip = resolvedIp(req.headers);
  const ua = uaNormalized(req.headers);
  const visitDate = seoulCalendarDateString();
  const ipHash = sha256Hex(`ip:${ip}`);
  const uaHash = sha256Hex(`ua:${ua}`);

  try {
    const rawRef =
      typeof body.referrer === "string" ? body.referrer.trim().slice(0, 480) : "";
    const pathStrRaw =
      typeof body.path === "string" ? body.path.trim().slice(0, 500) : "";
    const uaPlain = (req.headers.get("user-agent") ?? "").trim().slice(0, 512);

    const pathnameOnly = visitPathnameFromFullPath(
      pathStrRaw.length > 0 ? pathStrRaw : "/"
    );
    const recordVisitorEvent = shouldPersistVisitorEvent(pathnameOnly);

    const pathStored: string | null =
      pathStrRaw.length > 0 ? pathStrRaw.slice(0, 512) : null;

    const referrerStored = rawRef.length > 0 ? rawRef : null;
    const referrerCategory = referrerStored
      ? categorizeReferrer(referrerStored)
      : "direct";

    await prisma.$transaction(async (tx) => {
      await tx.visitorLog.upsert({
        where: {
          visitDate_ipHash_uaHash: { visitDate, ipHash, uaHash },
        },
        create: { visitDate, ipHash, uaHash },
        update: { seenAt: new Date() },
      });

      if (!recordVisitorEvent) return;

      const recentDup = await tx.visitorEvent.findFirst({
        where: {
          ipHash,
          path: pathStored,
          createdAt: {
            gt: new Date(Date.now() - DEDUP_WINDOW_MS),
          },
        },
        select: { id: true },
      });
      if (recentDup) return;

      await tx.visitorEvent.create({
        data: {
          visitDate,
          path: pathStored,
          referrer: referrerStored,
          referrerCategory,
          ipHash,
          uaSnippet: snippetFromUserAgent(uaPlain, 256),
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[visit-log] upsert_failed", {
      visitDate,
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
