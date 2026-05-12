/**
 * 플레이스 순위(/api/check-place-rank) 키워드 단위 동시 실행 개수.
 * 429·NCAPTCHA·CE_EMPTY_TOKEN 등이 늘면 2로 낮춰 보세요.
 */
export const PLACE_RANK_KEYWORD_CHECK_CONCURRENCY = 3;

export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];

  const results: R[] = new Array(n);
  let nextIndex = 0;
  const workers = Math.max(1, Math.min(concurrency, n));

  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= n) break;
      results[i] = await fn(items[i]!, i);
    }
  };

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export function logPlaceRankKeywordBlockingResponse(params: {
  context: string;
  keyword: string;
  httpStatus: number;
  failureCode?: unknown;
  message?: unknown;
}): void {
  const fc =
    typeof params.failureCode === "string" ? params.failureCode : null;
  const blocked =
    params.httpStatus === 429 ||
    fc === "NCAPTCHA" ||
    fc === "CE_EMPTY_TOKEN";
  if (!blocked) return;

  console.warn(`[${params.context}] 차단성 응답`, {
    keyword: params.keyword,
    httpStatus: params.httpStatus,
    failureCode: fc,
    message:
      typeof params.message === "string"
        ? params.message
        : params.message != null
          ? String(params.message)
          : null,
  });
}
