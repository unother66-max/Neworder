import type { PrismaClient } from "@prisma/client";

const NAVER_BLOG_SEARCH_API = "https://openapi.naver.com/v1/search/blog.json";
const BLOG_DISCOVERY_SOURCE = "naver_search_api";

// TODO: 운영 단계에서는 DB나 관리자 화면에서 seed keyword를 관리합니다.
export const DEFAULT_BLOG_DISCOVERY_KEYWORDS = [
  "패션 블로그",
  "화장품 리뷰",
  "뷰티 블로그",
  "맛집 블로그",
  "방콕 맛집",
  "필라테스 후기",
  "성수 카페",
  "강남 피부관리",
  "네일샵 추천",
  "스마트스토어 후기",
] as const;

type NaverBlogSearchItem = {
  link?: string;
  bloggerlink?: string;
};

type BlogCandidate = {
  blogId: string;
  blogUrl: string;
  seedKeyword: string;
};

export type BlogDiscoveryResult = {
  ok: true;
  source: typeof BLOG_DISCOVERY_SOURCE;
  keywords: string[];
  searchedKeywordCount: number;
  fetchedItemCount: number;
  candidateCount: number;
  skippedExistingProfileCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedDuplicateCount: number;
  savedCount: number;
};

function naverCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없습니다.");
  }
  return { clientId, clientSecret };
}

function normalizeBlogId(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(raw)) return null;
  return raw.toLowerCase();
}

export function extractNaverBlogIdFromUrl(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;

  try {
    const withProtocol = raw.startsWith("http") ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "blog.naver.com" || hostname === "m.blog.naver.com") {
      const blogId = parsed.pathname.split("/").filter(Boolean)[0] ?? parsed.searchParams.get("blogId");
      return normalizeBlogId(blogId);
    }

    if (hostname.endsWith(".blog.me")) {
      return normalizeBlogId(hostname.replace(/\.blog\.me$/i, ""));
    }

    const blogId = parsed.searchParams.get("blogId");
    return normalizeBlogId(blogId);
  } catch {
    return null;
  }
}

function candidateFromItem(item: NaverBlogSearchItem, seedKeyword: string): BlogCandidate | null {
  const blogId =
    extractNaverBlogIdFromUrl(item.bloggerlink) ??
    extractNaverBlogIdFromUrl(item.link);
  if (!blogId) return null;

  return {
    blogId,
    blogUrl: `https://blog.naver.com/${blogId}`,
    seedKeyword,
  };
}

async function fetchBlogSearchCandidates(
  keyword: string,
  display: number,
  credentials: { clientId: string; clientSecret: string }
): Promise<{ fetchedItemCount: number; candidates: BlogCandidate[] }> {
  const url = new URL(NAVER_BLOG_SEARCH_API);
  url.searchParams.set("query", keyword);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "sim");

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": credentials.clientId,
      "X-Naver-Client-Secret": credentials.clientSecret,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`네이버 블로그 검색 API 호출 실패(${keyword}): ${res.status}`);
  }

  const data = (await res.json()) as { items?: NaverBlogSearchItem[] };
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    fetchedItemCount: items.length,
    candidates: items.map((item) => candidateFromItem(item, keyword)).filter((item): item is BlogCandidate => Boolean(item)),
  };
}

function normalizeKeywordList(keywords: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const keyword of keywords) {
    const trimmed = keyword.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= limit) break;
  }

  return normalized;
}

export async function collectBlogDiscoveryCandidates(
  prisma: PrismaClient,
  options?: {
    keywords?: readonly string[];
    keywordLimit?: number;
    resultsPerKeyword?: number;
    maxSaveCount?: number;
  }
): Promise<BlogDiscoveryResult> {
  const keywordLimit = Math.min(Math.max(options?.keywordLimit ?? 5, 1), 20);
  const resultsPerKeyword = Math.min(Math.max(options?.resultsPerKeyword ?? 10, 1), 30);
  const maxSaveCount = Math.min(Math.max(options?.maxSaveCount ?? 100, 1), 500);
  const keywords = normalizeKeywordList(options?.keywords ?? DEFAULT_BLOG_DISCOVERY_KEYWORDS, keywordLimit);
  const credentials = naverCredentials();

  const candidateByBlogId = new Map<string, BlogCandidate>();
  let fetchedItemCount = 0;

  for (const keyword of keywords) {
    const result = await fetchBlogSearchCandidates(keyword, resultsPerKeyword, credentials);
    fetchedItemCount += result.fetchedItemCount;

    for (const candidate of result.candidates) {
      if (!candidateByBlogId.has(candidate.blogId)) {
        candidateByBlogId.set(candidate.blogId, candidate);
      }
      if (candidateByBlogId.size >= maxSaveCount) break;
    }

    if (candidateByBlogId.size >= maxSaveCount) break;
  }

  const candidates = [...candidateByBlogId.values()].slice(0, maxSaveCount);
  const blogIds = candidates.map((candidate) => candidate.blogId);
  const existingProfiles = blogIds.length
    ? await prisma.blogProfile.findMany({
        where: { blogId: { in: blogIds } },
        select: { blogId: true },
      })
    : [];
  const existingProfileIds = new Set(existingProfiles.map((profile) => profile.blogId));
  const queueTargets = candidates.filter((candidate) => !existingProfileIds.has(candidate.blogId));

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedDuplicateCount = 0;

  for (const candidate of queueTargets) {
    const existing = await prisma.blogDiscoveryQueue.findUnique({
      where: { blogId: candidate.blogId },
      select: { id: true },
    });

    if (existing) {
      skippedDuplicateCount += 1;
      await prisma.blogDiscoveryQueue.update({
        where: { blogId: candidate.blogId },
        data: {
          blogUrl: candidate.blogUrl,
          source: BLOG_DISCOVERY_SOURCE,
          priority: 50,
          errorMessage: null,
        },
      });
      updatedCount += 1;
      continue;
    }

    await prisma.blogDiscoveryQueue.create({
      data: {
        blogId: candidate.blogId,
        blogUrl: candidate.blogUrl,
        source: BLOG_DISCOVERY_SOURCE,
        seedKeyword: candidate.seedKeyword,
        status: "pending",
        priority: 50,
      },
    });
    insertedCount += 1;
  }

  return {
    ok: true,
    source: BLOG_DISCOVERY_SOURCE,
    keywords,
    searchedKeywordCount: keywords.length,
    fetchedItemCount,
    candidateCount: candidates.length,
    skippedExistingProfileCount: candidates.length - queueTargets.length,
    insertedCount,
    updatedCount,
    skippedDuplicateCount,
    savedCount: insertedCount + updatedCount,
  };
}
