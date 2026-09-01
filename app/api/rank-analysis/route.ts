import { NextResponse } from "next/server";

import {
  collectNaverPlaceTop300,
  validateTop300Keyword,
} from "@/lib/place-rank-top300";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "요청 형식을 확인해주세요." },
      { status: 400, headers: noStoreHeaders }
    );
  }

  const keywordValue =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).keyword
      : undefined;
  const validation = validateTop300Keyword(keywordValue);

  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, message: validation.message },
      { status: 400, headers: noStoreHeaders }
    );
  }

  try {
    const analysis = await collectNaverPlaceTop300(validation.keyword);
    console.log("[rank-analysis TOP300]", {
      keyword: analysis.keyword,
      total: analysis.total,
      searchMode: analysis.searchMode,
      source: analysis.source,
      naverRequestCount: analysis.naverRequestCount,
      requestOperationCount: analysis.requestOperationCount,
      completedPages: analysis.completedPages,
      duplicateCount: analysis.duplicateCount,
      partial: analysis.partial,
    });

    return NextResponse.json(
      { ok: true, ...analysis },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error("[rank-analysis TOP300]", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          "네이버 플레이스 순위를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 502, headers: noStoreHeaders }
    );
  }
}
