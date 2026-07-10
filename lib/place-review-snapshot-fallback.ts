type ParsedReviewSnapshot = {
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
  _previous?: PreviousReviewSnapshot | null
) {
  void _previous;
  const visitorReviewCount = parsed.visitorReviewCount;
  const blogReviewCount = parsed.blogReviewCount;
  const saveCount = parsed.saveCountText;

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
    retainedFields: [],
  };
}
