import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { loadRegisteredKeywordCacheState } from "@/lib/place-registered-keyword-cache";
import { requireAdminApi } from "@/lib/require-admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export async function GET() {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const now = new Date();
  const [grouped, rows, globalState] = await Promise.all([
    prisma.placeRegisteredKeywordCache.groupBy({
      by: ["queueStatus"],
      where: {
        publicPlaceId: {
          not: "__PLACE_ANALYSIS_KEYWORD_QUEUE_LOCK__",
        },
      },
      _count: { _all: true },
    }),
    prisma.placeRegisteredKeywordCache.findMany({
      where: {
        publicPlaceId: {
          not: "__PLACE_ANALYSIS_KEYWORD_QUEUE_LOCK__",
        },
      },
      orderBy: [{ queuedAt: "asc" }, { updatedAt: "desc" }],
      take: 100,
      select: {
        publicPlaceId: true,
        placeName: true,
        queueStatus: true,
        queuedAt: true,
        processingStartedAt: true,
        collectedAt: true,
        lastAttemptAt: true,
        lastFailureCode: true,
        cooldownUntil: true,
        hasSuccessfulValue: true,
        source: true,
      },
    }),
    loadRegisteredKeywordCacheState([], now),
  ]);

  const counts = Object.fromEntries(
    grouped.map((row) => [row.queueStatus, row._count._all])
  );
  return NextResponse.json({
    ok: true,
    generatedAt: now.toISOString(),
    concurrency: 1,
    policy: {
      successTtlHours: 24,
      failureCooldownHours: 1,
      globalBlockCooldownHours: 6,
    },
    queue: {
      counts,
      globalBlockReason: globalState.globalBlockReason,
      globalBlockUntil: iso(globalState.globalBlockUntil),
      rows: rows.map((row) => ({
        publicPlaceId: row.publicPlaceId,
        placeName: row.placeName,
        queueStatus: row.queueStatus,
        queuedAt: iso(row.queuedAt),
        processingStartedAt: iso(row.processingStartedAt),
        lastSuccessAt: iso(row.collectedAt),
        lastAttemptAt: iso(row.lastAttemptAt),
        failureCode: row.lastFailureCode,
        cooldownUntil: iso(row.cooldownUntil),
        hasSuccessfulValue: row.hasSuccessfulValue,
        source: row.source,
      })),
    },
  });
}
