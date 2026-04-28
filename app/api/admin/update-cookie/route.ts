import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  // 테스트 목적: 전체 허용
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
};

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: CORS_HEADERS }
  );
}

// 브라우저의 사전 확인(OPTIONS) 요청에 대응
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  const apiKey = String(process.env.ADMIN_API_KEY || "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_API_KEY not configured" },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const provided =
    String(req.headers.get("x-api-key") || "").trim() ||
    String(req.headers.get("authorization") || "").trim().replace(/^Bearer\s+/i, "");

  if (!provided || provided !== apiKey) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const cookie = String((body as any)?.cookie ?? "").trim();
  if (!cookie) {
    return NextResponse.json(
      { ok: false, error: "cookie required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  await prisma.systemConfig.upsert({
    where: { id: "global" },
    update: { naverCookie: cookie },
    create: { id: "global", naverCookie: cookie },
  });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}

