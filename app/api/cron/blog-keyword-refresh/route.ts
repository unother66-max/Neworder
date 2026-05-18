import { NextResponse } from "next/server";
import {
  DEFAULT_STALE_EXPOSURE_RECHECK_LIMIT,
  refreshBlogKeywords,
  selectBlogsForKeywordCronRefresh,
  type RefreshBlogKeywordsFailure,
  type RefreshBlogKeywordsSuccess,
} from "@/lib/blog-keyword-refresh-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

function parsePositiveInt(raw: string | undefined, fallback: number, max = 100): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function cronBlogKeywordRefreshLimit(): number {
  return parsePositiveInt(process.env.CRON_BLOG_KEYWORD_REFRESH_LIMIT, 5, 50);
}

function keywordRefreshStaleDays(): number {
  return parsePositiveInt(process.env.BLOG_KEYWORD_REFRESH_STALE_DAYS, 14, 365);
}

function summarizeCronBlogResult(
  blogId: string,
  r: RefreshBlogKeywordsSuccess | RefreshBlogKeywordsFailure
) {
  if (!r.ok) {
    return {
      blogId,
      ok: false as const,
      error: r.error,
      validKeywordCount: null as number | null,
      confirmedVolumeKeywordCount: null as number | null,
      remainingVolumeUnknownKeywordCount: null as number | null,
      staleExposureRecheckedCount: null as number | null,
      staleExposureDeferredCount: null as number | null,
      searchAdAttemptedCount: null as number | null,
      searchAd429Stopped: null as boolean | null,
      refreshMs: null as number | null,
    };
  }
  const d = r.debug;
  return {
    blogId,
    ok: true as const,
    validKeywordCount: r.validKeywordCount,
    confirmedVolumeKeywordCount: d.volumeLookupPlanConfirmedVolumeEntries ?? null,
    remainingVolumeUnknownKeywordCount: d.volumeLookupPlanRemainingUnknownEntries ?? null,
    staleExposureRecheckedCount: d.staleExposureRecheckedCount ?? null,
    staleExposureDeferredCount: d.staleExposureDeferredCount ?? null,
    searchAdAttemptedCount: d.searchAdAttemptedCount ?? null,
    searchAd429Stopped: d.searchAd429Stopped ?? null,
    refreshMs: r.refreshMs,
  };
}

function verifyCronAuth(req: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const isValidCronSecret = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
  if (cronSecret && !isValidCronSecret && !isVercelCron) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = new Date().toISOString();
  const staleDays = keywordRefreshStaleDays();
  const batchLimit = cronBlogKeywordRefreshLimit();
  const staleExposureRecheckLimit = DEFAULT_STALE_EXPOSURE_RECHECK_LIMIT;

  try {
    const { candidateBlogCount, selected, skippedFreshCount, unionBlogCount } =
      await selectBlogsForKeywordCronRefresh({
        staleDays,
        maxProcess: batchLimit,
      });

    const batchDeferredCount = Math.max(0, candidateBlogCount - selected.length);
    const skippedCount = skippedFreshCount + batchDeferredCount;

    const results: ReturnType<typeof summarizeCronBlogResult>[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const row of selected) {
      try {
        const ref = await refreshBlogKeywords({
          blogId: row.blogId,
          source: "cron",
          staleExposureRecheckLimit,
          revalidateWindowMs: staleDays * 86400000,
        });
        if (!ref.ok) {
          failedCount += 1;
          results.push(summarizeCronBlogResult(row.blogId, { ok: false, blogId: row.blogId, error: ref.error }));
        } else {
          successCount += 1;
          results.push(summarizeCronBlogResult(row.blogId, ref));
        }
      } catch (e) {
        failedCount += 1;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[blog-keyword-refresh-cron] blog failure", { blogId: row.blogId, error: msg });
        results.push(
          summarizeCronBlogResult(row.blogId, { ok: false, blogId: row.blogId, error: msg })
        );
      }
    }

    const processedBlogCount = selected.length;

    console.log(
      "[blog-keyword-refresh-cron]",
      JSON.stringify({
        startedAt,
        staleDays,
        staleExposureRecheckLimit,
        batchLimit,
        unionBlogCount,
        candidateBlogCount,
        selectedBlogCount: selected.length,
        processedBlogCount,
        successCount,
        failedCount,
        skippedCount,
        skippedFreshCount,
        batchDeferredCount,
        results,
      })
    );

    return NextResponse.json({
      ok: true,
      startedAt,
      staleDays,
      staleExposureRecheckLimit,
      batchLimit,
      unionBlogCount,
      candidateBlogCount,
      selectedBlogCount: selected.length,
      processedBlogCount,
      successCount,
      failedCount,
      skippedCount,
      skippedFreshCount,
      batchDeferredCount,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[blog-keyword-refresh-cron] fatal", { startedAt, staleDays, error: msg });
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
