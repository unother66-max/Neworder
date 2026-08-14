type ParsedReviewSnapshot = {
  reason?: string | null;
  chosenType?: "restaurant" | "place" | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCountText: string | null;
};

type PreviousReviewSnapshot = {
  visitorReviewCount: number;
  blogReviewCount: number;
  saveCount: string | null;
};

export function resolvePlaceReviewSnapshot(
  parsed: ParsedReviewSnapshot,
  previous?: PreviousReviewSnapshot | null
) {
  const visitorReviewCount = parsed.visitorReviewCount;
  const blogReviewCount = parsed.blogReviewCount;
  const canUsePartialPlaceSnapshot =
    parsed.reason === "REVIEW_METRICS_INCOMPLETE" &&
    parsed.chosenType === "place" &&
    visitorReviewCount !== null &&
    blogReviewCount !== null &&
    parsed.saveCountText === null;

  // 방문자·블로그 리뷰는 이번 요청에서 수집한 최신값만 사용한다.
  // 일반 플레이스처럼 네이버가 저장 수를 제공하지 않는 경우에만
  // 마지막 정상 저장 수를 유지해 리뷰 갱신 전체가 막히지 않게 한다.
  const saveCount =
    parsed.saveCountText ??
    (canUsePartialPlaceSnapshot ? previous?.saveCount : null) ??
    null;

  if (
    visitorReviewCount === null ||
    blogReviewCount === null ||
    (parsed.saveCountText === null && !canUsePartialPlaceSnapshot)
  ) {
    return null;
  }

  return {
    visitorReviewCount,
    blogReviewCount,
    totalReviewCount: visitorReviewCount + blogReviewCount,
    saveCount,
    retainedFields:
      parsed.saveCountText === null && previous?.saveCount != null
        ? ["saveCount"]
        : [],
    unavailableFields: parsed.saveCountText === null ? ["saveCount"] : [],
  };
}
