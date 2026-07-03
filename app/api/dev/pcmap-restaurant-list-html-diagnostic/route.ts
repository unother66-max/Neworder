import { NextResponse } from "next/server";
import { fetchPcmapRestaurantListHtmlDiagnostic } from "@/lib/pcmap-restaurant-list-html-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const keyword = String(body.keyword ?? "").trim();
    if (!keyword) {
      return NextResponse.json(
        { ok: false, debugReason: "KEYWORD_EMPTY" },
        { status: 400 }
      );
    }
    const result = await fetchPcmapRestaurantListHtmlDiagnostic({
      keyword,
      targetName: String(body.targetName ?? "").trim(),
      x: String(body.x ?? "").trim() || undefined,
      y: String(body.y ?? "").trim() || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[pcmap restaurant/list HTML diagnostic] fatal", { message });
    return NextResponse.json(
      { ok: false, debugReason: "FETCH_OR_PARSE_ERROR", message },
      { status: 502 }
    );
  }
}
