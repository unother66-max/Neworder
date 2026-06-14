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
  previous?: PreviousReviewSnapshot | null
) {
  const visitorReviewCount =
    parsed.visitorReviewCount ?? previous?.visitorReviewCount ?? null;
  const blogReviewCount =
    parsed.blogReviewCount ?? previous?.blogReviewCount ?? null;
  const saveCount = parsed.saveCountText ?? previous?.saveCount ?? null;

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
    retainedFields: [
      ...(parsed.visitorReviewCount === null ? ["visitorReviewCount"] : []),
      ...(parsed.blogReviewCount === null ? ["blogReviewCount"] : []),
      ...(parsed.saveCountText === null ? ["saveCount"] : []),
    ],
  };
}
