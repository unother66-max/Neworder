/**
 * 플레이스 순위(/api/check-place-rank) 키워드 단위 동시 실행 개수.
 * 405·429 등 차단 응답이 늘면 1로 낮춰 보세요.
 */
// 네이버 pcmap은 같은 IP의 짧은 병렬 burst에 405를 반환하는 경우가 있다.
// 각 키워드 내부 페이지는 직렬로 유지하고, 키워드만 최대 2개까지 병렬 조회한다.
export const PLACE_RANK_KEYWORD_CHECK_CONCURRENCY = 2;

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
    fc === "PCMAP_HTTP_405" ||
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
