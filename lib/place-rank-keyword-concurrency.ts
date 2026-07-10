/**
 * 플레이스 순위(/api/check-place-rank) 키워드 단위 동시 실행 개수.
 * 405·429 등 차단 응답이 늘면 1로 낮춰 보세요.
 */
export function resolvePlaceRankKeywordConcurrency(
  serverRaw = process.env.PLACE_RANK_CONCURRENCY,
  publicFallbackRaw = process.env.NEXT_PUBLIC_PLACE_RANK_CONCURRENCY
): number {
  const raw = serverRaw ?? publicFallbackRaw;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(3, Math.max(1, Math.floor(parsed)));
}

// 5개 등록 키워드 실측에서 2와 요청 수·순위가 같고 차단 없이 더 빨라 기본 3.
export const PLACE_RANK_KEYWORD_CHECK_CONCURRENCY =
  resolvePlaceRankKeywordConcurrency();

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
