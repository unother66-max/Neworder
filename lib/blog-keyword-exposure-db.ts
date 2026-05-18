import type { BlogValidKeyword } from "@/lib/blog-analysis-types";
import { normalizeBlogtalkExposureType } from "@/lib/blog-keyword-blogtalk";
import { prisma } from "@/lib/prisma";

export function buildBlogKeywordExposureUpsertArgs(blogId: string, keyword: BlogValidKeyword) {
  const exposureType = normalizeBlogtalkExposureType(keyword);
  return {
    where: {
      blogId_keyword: {
        blogId,
        keyword: keyword.keyword,
      },
    },
    create: {
      blogId,
      keyword: keyword.keyword,
      keywordValidationStatus: keyword.keywordValidationStatus ?? null,
      exposureType,
      integratedSearchRank: keyword.integratedSearchRank ?? null,
      integratedSearchBlock: keyword.integratedSearchBlock ?? null,
      smartBlockCount: keyword.smartBlockCount ?? null,
      blogRank: keyword.blogRank ?? null,
      monthlySearchVolume: keyword.monthlySearchVolume ?? keyword.totalVolume ?? null,
      mobileSearchVolume: keyword.mobileVolume ?? null,
      pcSearchVolume: keyword.pcVolume ?? null,
      contentSaturation: keyword.contentSaturation ?? null,
      sourcePostUrl: keyword.sourcePostUrl ?? null,
      sourcePostTitle: keyword.sourcePostTitle ?? null,
      checkedAt: new Date(),
    },
    update: {
      keywordValidationStatus: keyword.keywordValidationStatus ?? null,
      exposureType,
      integratedSearchRank: keyword.integratedSearchRank ?? null,
      integratedSearchBlock: keyword.integratedSearchBlock ?? null,
      smartBlockCount: keyword.smartBlockCount ?? null,
      blogRank: keyword.blogRank ?? null,
      monthlySearchVolume: keyword.monthlySearchVolume ?? keyword.totalVolume ?? null,
      mobileSearchVolume: keyword.mobileVolume ?? null,
      pcSearchVolume: keyword.pcVolume ?? null,
      contentSaturation: keyword.contentSaturation ?? null,
      sourcePostUrl: keyword.sourcePostUrl ?? null,
      sourcePostTitle: keyword.sourcePostTitle ?? null,
      checkedAt: new Date(),
    },
  };
}

export async function upsertBlogKeywordExposureSnapshotsForKeywords(
  blogId: string,
  keywords: BlogValidKeyword[]
): Promise<void> {
  await Promise.all(
    keywords.map((keyword) =>
      prisma.blogKeywordExposureSnapshot.upsert(buildBlogKeywordExposureUpsertArgs(blogId, keyword))
    )
  );
}

export async function upsertDirtyBlogKeywordExposureSnapshots(
  blogId: string,
  validKeywords: BlogValidKeyword[],
  dirtyNormalizedKeywordKeys: string[],
  normalizeKeywordKey: (value: string) => string
): Promise<void> {
  const byNorm = new Map<string, BlogValidKeyword>();
  for (const row of validKeywords) {
    const nk = normalizeKeywordKey(row.keyword);
    if (!nk) continue;
    byNorm.set(nk, row);
  }
  await Promise.all(
    dirtyNormalizedKeywordKeys.map((nk) => {
      const keyword = byNorm.get(nk);
      if (!keyword) return Promise.resolve();
      return prisma.blogKeywordExposureSnapshot.upsert(buildBlogKeywordExposureUpsertArgs(blogId, keyword));
    })
  );
}

export async function deleteBlogKeywordExposureSnapshotsNotInKeywordList(
  blogId: string,
  keywords: BlogValidKeyword[]
): Promise<void> {
  if (keywords.length === 0) return;
  await prisma.blogKeywordExposureSnapshot.deleteMany({
    where: {
      blogId,
      keyword: { notIn: keywords.map((k) => k.keyword) },
    },
  });
}
