import { confirmedMonthlyVolumes } from "@/lib/blog-keyword-volume";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import {
  extractBlogPostKey,
  makePostMatchKey,
  NaverSearchBlockedError,
  NaverSearchParseError,
  searchNaverBlogRankForTarget,
} from "@/lib/naver";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

type SessionWithUserId = {
  user?: {
    id?: string | null;
  } | null;
} | null;

type CheckRankResponse = {
  ok: boolean;
  rank: number | null;
  rankText: string;
  organicRank: number | null;
  outOfRange: boolean;
  matchedTitle: string | null;
  matchedUrl: string | null;
  checkedCount: number;
  debugReason:
    | "blogId-logNo"
    | "title"
    | "possible title match but url mismatch"
    | "no-match"
    | "invalid-target";
  source: "pc-blog-tab";
  searchVolume:
    | string
    | {
        ok?: boolean;
        total?: number;
        mobile?: number;
        pc?: number;
      };
  cached: boolean;
  stale: boolean;
  checkedAt: string;
  message?: string;
  error?: string;
  errorCode?: "NAVER_BLOCKED" | "PARSE_FAILED";
};

const RANK_SEARCH_LIMIT = 100;
const RANK_CACHE_TTL_MS = 5 * 60 * 1000;
const rankCache = new Map<string, { expiresAt: number; value: CheckRankResponse }>();
const pendingRankChecks = new Map<string, Promise<CheckRankResponse>>();

function isDev() {
  return process.env.NODE_ENV === "development";
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildCacheKey(keyword: string, postLink: string) {
  const normalizedKeyword = normalizeKeyword(keyword);
  const targetKey = makePostMatchKey(postLink);
  if (targetKey) return `${normalizedKeyword}::${targetKey}`;
  return `${normalizedKeyword}::${postLink.trim().replace(/#.*$/, "").replace(/\/+$/, "")}`;
}

type SearchVolumeRaw = Awaited<ReturnType<typeof getKeywordSearchVolume>>;

function normalizeSearchVolume(volumeRaw: SearchVolumeRaw | string): CheckRankResponse["searchVolume"] {
  if (typeof volumeRaw === "string") return volumeRaw;

  const normalized = confirmedMonthlyVolumes(volumeRaw);
  return normalized != null
    ? {
        ...volumeRaw,
        ok: true,
        total: normalized.totalVolume,
        mobile: normalized.mobileVolume ?? volumeRaw.mobile,
        pc: normalized.pcVolume ?? volumeRaw.pc,
      }
    : volumeRaw;
}

async function getSafeKeywordSearchVolume(keyword: string) {
  try {
    return normalizeSearchVolume(await getKeywordSearchVolume(keyword));
  } catch (error) {
    console.error("[check-rank] search volume error:", error);
    return "-";
  }
}

function buildRankFailureResponse(
  error: NaverSearchBlockedError | NaverSearchParseError,
  searchVolume: CheckRankResponse["searchVolume"]
): CheckRankResponse {
  return {
    ok: false,
    rank: null,
    rankText: "일시적 조회 제한",
    organicRank: null,
    outOfRange: false,
    matchedTitle: null,
    matchedUrl: null,
    checkedCount: 0,
    debugReason: "no-match",
    source: "pc-blog-tab",
    searchVolume,
    cached: false,
    stale: false,
    checkedAt: new Date().toISOString(),
    error: error.message,
    errorCode: error.code,
  };
}

async function runCheckRank(
  keyword: string,
  postLink: string,
  postTitle: string,
  cacheKey: string
): Promise<CheckRankResponse> {
  const now = Date.now();
  const cached = rankCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      ...cached.value,
      cached: true,
    };
  }

  const pending = pendingRankChecks.get(cacheKey);
  if (pending) {
    const value = await pending;
    return {
      ...value,
      cached: true,
    };
  }

  const task = (async (): Promise<CheckRankResponse> => {
    const targetKey = makePostMatchKey(postLink);
    const targetPostKey = extractBlogPostKey(postLink);

    if (!targetKey) {
      return {
        ok: false,
        rank: null,
        rankText: "오류",
        organicRank: null,
        outOfRange: false,
        matchedTitle: null,
        matchedUrl: null,
        checkedCount: 0,
        debugReason: "invalid-target",
        source: "pc-blog-tab",
        searchVolume: "-",
        cached: false,
        stale: false,
        checkedAt: new Date().toISOString(),
        error: "포스트 URL을 확인해주세요.",
      };
    }

    if (isDev()) {
      console.log("[check-rank] keyword", keyword);
      console.log("[check-rank] target url", postLink);
      console.log("[check-rank] target blogId/logNo", targetPostKey);
    }

    const volumePromise = getSafeKeywordSearchVolume(keyword);
    let rankSearch: Awaited<ReturnType<typeof searchNaverBlogRankForTarget>>;

    try {
      rankSearch = await searchNaverBlogRankForTarget(
        keyword,
        targetKey,
        postTitle,
        RANK_SEARCH_LIMIT
      );
    } catch (error) {
      const searchVolume = await volumePromise;
      if (error instanceof NaverSearchBlockedError || error instanceof NaverSearchParseError) {
        return buildRankFailureResponse(error, searchVolume);
      }
      throw error;
    }

    const matched = rankSearch.matched;
    const matchSource = rankSearch.matchedReason;

    const searchVolume = await volumePromise;

    if (isDev()) {
      console.log("[check-rank] search url", rankSearch.searchUrls[0] ?? null);
      console.log("[check-rank] parsed result count", rankSearch.results.length);
      console.log("[check-rank] search cache", {
        cached: rankSearch.cached,
        stale: rankSearch.stale,
        fetchedAt: rankSearch.fetchedAt,
        checkedLimit: rankSearch.checkedLimit,
      });
      console.log(
        "[check-rank] first 20 results title/url/blogId/logNo",
        rankSearch.results.slice(0, 20).map((item) => ({
          rank: item.rank,
          organicRank: item.organicRank,
          title: item.title,
          url: item.url,
          key: item.key,
          isAd: item.isAd,
        }))
      );
      console.log("[check-rank] matched rank", matched?.rank ?? null);
      if (!matched) {
        console.log("[check-rank] no match reason", {
          targetKey,
          hasPostTitle: Boolean(postTitle.trim()),
          checkedCount: rankSearch.results.length,
        });
      }
    }

    const value: CheckRankResponse = {
      ok: true,
      rank: matched?.rank ?? null,
      rankText: matched ? `${matched.rank}위` : `${rankSearch.checkedLimit}위 밖`,
      organicRank: matched?.organicRank ?? null,
      outOfRange: !matched,
      matchedTitle: matched?.title ?? null,
      matchedUrl: matched?.url ?? null,
      checkedCount: rankSearch.checkedLimit,
      debugReason:
        matchSource === "title"
          ? "possible title match but url mismatch"
          : matchSource ?? "no-match",
      source: "pc-blog-tab",
      searchVolume: searchVolume || "-",
      cached: rankSearch.cached,
      stale: rankSearch.stale,
      checkedAt: rankSearch.fetchedAt,
      message: matched ? undefined : `${rankSearch.checkedLimit}위 밖`,
    };

    rankCache.set(cacheKey, {
      expiresAt: Date.now() + RANK_CACHE_TTL_MS,
      value,
    });

    return value;
  })();

  pendingRankChecks.set(cacheKey, task);

  try {
    return await task;
  } finally {
    pendingRankChecks.delete(cacheKey);
  }
}

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions)) as SessionWithUserId;
    if (!session?.user?.id) {
      return Response.json({ rank: "로그인 필요", searchVolume: "-", error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const keyword = body.keyword as string;
    const postLink = body.postLink as string;
    const postTitle = typeof body.postTitle === "string" ? body.postTitle : "";

    if (!keyword?.trim()) {
      return Response.json({
        ok: false,
        rank: null,
        rankText: "키워드 없음",
        outOfRange: false,
        error: "키워드를 입력해주세요.",
        searchVolume: "-",
      });
    }

    if (!postLink?.trim()) {
      return Response.json({
        ok: false,
        rank: null,
        rankText: "링크 없음",
        outOfRange: false,
        error: "포스트 링크가 없습니다.",
        searchVolume: "-",
      });
    }

    const cacheKey = buildCacheKey(keyword, postLink);
    const result = await runCheckRank(keyword, postLink, postTitle, cacheKey);
    const status = result.ok
      ? 200
      : result.errorCode === "NAVER_BLOCKED"
        ? 503
        : result.errorCode === "PARSE_FAILED"
          ? 502
          : 400;
    return Response.json(result, { status });
  } catch (error) {
    if (error instanceof NaverSearchBlockedError) {
      console.error("[check-rank] error reason", {
        code: error.code,
        status: error.status,
      });

      return Response.json(
        {
          ok: false,
          rank: null,
          rankText: "일시적 조회 제한",
          organicRank: null,
          outOfRange: false,
          matchedTitle: null,
          matchedUrl: null,
          checkedCount: 0,
          debugReason: "no-match",
          source: "pc-blog-tab",
          searchVolume: "-",
          cached: false,
          stale: false,
          checkedAt: new Date().toISOString(),
          error: error.message,
          errorCode: error.code,
        },
        { status: 503 }
      );
    }

    if (error instanceof NaverSearchParseError) {
      console.error("[check-rank] error reason", {
        code: error.code,
      });

      return Response.json(
        {
          ok: false,
          rank: null,
          rankText: "일시적 조회 제한",
          organicRank: null,
          outOfRange: false,
          matchedTitle: null,
          matchedUrl: null,
          checkedCount: 0,
          debugReason: "no-match",
          source: "pc-blog-tab",
          searchVolume: "-",
          cached: false,
          stale: false,
          checkedAt: new Date().toISOString(),
          error: error.message,
          errorCode: error.code,
        },
        { status: 502 }
      );
    }

    console.error("check-rank error:", error);

    return Response.json({
      ok: false,
      rank: null,
      rankText: "오류",
      outOfRange: false,
      error: "순위와 검색량을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      searchVolume: "-",
    }, { status: 500 });
  }
}
