import type { BlogKeywordValidationStatus, BlogValidKeyword } from "@/lib/blog-analysis-types";
import { inferKeywordValidationStatus, normalizeBlogtalkExposureType } from "@/lib/blog-keyword-blogtalk";
import type { BlogKeywordExposureSnapshot } from "@prisma/client";

export function prismaExposureSnapshotToBlogKeyword(row: BlogKeywordExposureSnapshot): BlogValidKeyword {
  const base: BlogValidKeyword = {
    keyword: row.keyword,
    totalVolume: row.monthlySearchVolume,
    monthlySearchVolume: row.monthlySearchVolume,
    mobileVolume: row.mobileSearchVolume,
    pcVolume: row.pcSearchVolume,
    exposureType: row.exposureType,
    integratedSearchRank: row.integratedSearchRank,
    integratedSearchBlock: row.integratedSearchBlock,
    smartBlockCount: row.smartBlockCount,
    blogRank: row.blogRank,
    contentSaturation: row.contentSaturation,
    sourcePostUrl: row.sourcePostUrl,
    sourcePostTitle: row.sourcePostTitle,
    checkedAt: row.checkedAt.toISOString(),
  };
  return {
    ...base,
    exposureType: normalizeBlogtalkExposureType(base),
    keywordValidationStatus:
      (row.keywordValidationStatus as BlogKeywordValidationStatus | null) ?? inferKeywordValidationStatus(base),
  };
}
