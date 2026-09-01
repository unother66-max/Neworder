import { NextResponse } from "next/server";

import {
  collectNaverWebResults,
  validateWebAnalysisKeyword,
} from "@/lib/web-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "요청 형식을 확인해주세요." },
      { status: 400 }
    );
  }

  const keywordValue =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).keyword
      : undefined;
  const validation = validateWebAnalysisKeyword(keywordValue);

  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, message: validation.message },
      { status: 400 }
    );
  }

  try {
    const analysis = await collectNaverWebResults(validation.keyword);

    if (analysis.successfulPages.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "네이버 웹검색 페이지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
          ...analysis,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, ...analysis });
  } catch (error) {
    console.error("[web-analysis]", error);
    return NextResponse.json(
      {
        ok: false,
        message: "웹 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 500 }
    );
  }
}
