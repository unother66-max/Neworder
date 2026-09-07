export const PLACE_RANK_ANALYSIS_KEYWORD_PARAM = "keyword";

export function buildPlaceRankAnalysisHref(keyword: string): string {
  return `/place-rank-analysis?${PLACE_RANK_ANALYSIS_KEYWORD_PARAM}=${encodeURIComponent(
    keyword
  )}`;
}

export function readPlaceRankAnalysisKeyword(
  searchParams: Pick<URLSearchParams, "get">
): string {
  return searchParams.get(PLACE_RANK_ANALYSIS_KEYWORD_PARAM)?.trim() ?? "";
}
