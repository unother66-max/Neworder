import { NextResponse } from "next/server";
import {
  countBusinessesItemsInBatch,
  normalizePlaceSearchKeywordTypos,
} from "@/lib/place-keyword-fallback";
import { fetchBestPcmapBusinessesBatchJson } from "@/lib/pcmap-businesses-batch-fetch";

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

    return NextResponse.json({
      ok: true,
      keyword: raw,
      normalizedKeyword: normalized,
      typoCorrected,
      mode,
      batch: itemCount > 0 ? batch : null,
      itemCount,
    });
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
