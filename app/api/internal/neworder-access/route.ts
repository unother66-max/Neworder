import { NextResponse } from "next/server";

import { getNewOrderAccess } from "@/lib/neworder/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getNewOrderAccess();
    return NextResponse.json(
      { ok: true, canAccess: Boolean(access) },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (cause) {
    console.error("[internal/neworder-access]", cause);
    return NextResponse.json(
      { ok: false, canAccess: false },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  }
}
