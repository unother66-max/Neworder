import { NextRequest, NextResponse } from "next/server";
import { collectBlogDiscoveryCandidates } from "@/lib/blog-discovery";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function authorizeCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = value === null ? NaN : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const keywordLimit = parseBoundedInt(req.nextUrl.searchParams.get("keywordLimit"), 5, 1, 20);
  const resultsPerKeyword = parseBoundedInt(req.nextUrl.searchParams.get("resultsPerKeyword"), 10, 1, 30);
  const maxSaveCount = parseBoundedInt(req.nextUrl.searchParams.get("maxSaveCount"), 100, 1, 500);

  try {
    const result = await collectBlogDiscoveryCandidates(prisma, {
      keywordLimit,
      resultsPerKeyword,
      maxSaveCount,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron blog-discovery] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Blog discovery failed",
      },
      { status: 500 }
    );
  }
}
