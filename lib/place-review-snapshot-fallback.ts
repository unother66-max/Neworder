type ParsedReviewSnapshot = {
  reason?: string | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
  saveCountText: string | null;
};

type PreviousReviewSnapshot = {
  visitorReviewCount: number;
  blogReviewCount: number;
  saveCount: string;
};

export function resolvePlaceReviewSnapshot(
  parsed: ParsedReviewSnapshot,
  previous?: PreviousReviewSnapshot | null
) {
  const visitorReviewCount = parsed.visitorReviewCount;
  const blogReviewCount = parsed.blogReviewCount;
  const canRetainPreviousSaveCount =
    parsed.reason === "REVIEW_METRICS_INCOMPLETE" &&
    visitorReviewCount !== null &&
    blogReviewCount !== null &&
    parsed.saveCountText === null;

  // 방문자·블로그 리뷰는 이번 요청에서 수집한 최신값만 사용한다.
  // 일반 플레이스처럼 네이버가 저장 수를 제공하지 않는 경우에만
  // 마지막 정상 저장 수를 유지해 리뷰 갱신 전체가 막히지 않게 한다.
  const saveCount =
    parsed.saveCountText ??
    (canRetainPreviousSaveCount ? previous?.saveCount : null) ??
    null;

  if (
    visitorReviewCount === null ||
    blogReviewCount === null ||
    saveCount === null
  ) {
    return null;
  }

  return {
    visitorReviewCount,
    blogReviewCount,
    totalReviewCount: visitorReviewCount + blogReviewCount,
    saveCount,
    retainedFields: parsed.saveCountText === null ? ["saveCount"] : [],
  };
}
