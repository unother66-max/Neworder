import { NextResponse } from "next/server";
import {
  countBusinessesItemsInBatch,
  normalizePlaceSearchKeywordTypos,
} from "@/lib/place-keyword-fallback";
import { fetchBestPcmapBusinessesBatchJson } from "@/lib/pcmap-businesses-batch-fetch";
import {
  PLACE_ANALYSIS_BATCH_SCHEMA_VERSION,
  pcmapBatchHasNewOpeningField,
} from "@/lib/naver-place-new-open";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const raw = String(body.keyword || "").trim();
    if (!raw) {
      return NextResponse.json(
        { ok: false, message: "keyword 없음" },
        { status: 400 }
      );
    }

    const { normalized, typoCorrected } = normalizePlaceSearchKeywordTypos(raw);
    const { batch, mode } = await fetchBestPcmapBusinessesBatchJson(normalized);
    const itemCount = batch ? countBusinessesItemsInBatch(batch) : 0;
    const hasNewOpeningField = pcmapBatchHasNewOpeningField(batch);

    return NextResponse.json(
      {
        ok: true,
        keyword: raw,
        normalizedKeyword: normalized,
        typoCorrected,
        mode,
        schemaVersion: PLACE_ANALYSIS_BATCH_SCHEMA_VERSION,
        hasNewOpeningField,
        batch: itemCount > 0 && hasNewOpeningField ? batch : null,
        itemCount,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[pcmap-businesses-batch]", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "실패",
      },
      { status: 500 }
    );
  }
}
