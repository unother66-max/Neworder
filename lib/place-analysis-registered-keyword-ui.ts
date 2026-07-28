export function getRegisteredKeywordEmptyLabel(
  cacheStatus: string | null | undefined
): "수집 대기" | "수집 지연" | "-" {
  const status = String(cacheStatus ?? "");
  if (/DELAYED|COOLDOWN|CIRCUIT/i.test(status)) return "수집 지연";
  if (/QUEUE|PROCESSING|PENDING/i.test(status)) return "수집 대기";
  return "-";
}

type RegisteredKeywordCollectionItem = {
  registeredKeywordsStatus?: string | null;
  registeredKeywords?:
    | Array<
        | string
        | {
            volume?: number | null;
            volumeStatus?: string | null;
          }
      >
    | null;
};

export function hasCollectedRegisteredKeywords(
  item: RegisteredKeywordCollectionItem
): boolean {
  return (
    item.registeredKeywordsStatus === "AVAILABLE" &&
    Array.isArray(item.registeredKeywords)
  );
}

export function hasPendingRegisteredKeywordVolumes(
  item: RegisteredKeywordCollectionItem
): boolean {
  if (!hasCollectedRegisteredKeywords(item)) return false;
  return (item.registeredKeywords ?? []).some((keyword) => {
    if (typeof keyword === "string") return true;
    return !(
      (keyword.volumeStatus === "AVAILABLE" ||
        keyword.volumeStatus === "ZERO") &&
      typeof keyword.volume === "number" &&
      Number.isFinite(keyword.volume)
    );
  });
}

export function getRegisteredKeywordProgressLabel(progress: {
  total: number;
  available: number;
  pending: number;
  volumePending: number;
  running: boolean;
  delayed?: boolean;
}): string {
  if (progress.pending === 0) {
    const completed =
      `대표키워드 ${progress.available}/${progress.total}개 매장 반영 완료`;
    if (progress.volumePending === 0) return completed;
    return `${completed} · 검색량 ${progress.volumePending}개 매장 ${
      progress.running ? "보완 중" : "추후 보완"
    }`;
  }
  if (progress.running) {
    return (
      `대표키워드 수집 중 · ${progress.available}/${progress.total}개 매장 완료 ` +
      `(${progress.pending}개 남음)`
    );
  }
  if (!progress.delayed) {
    return (
      `대표키워드 ${progress.available}/${progress.total}개 매장 반영 · ` +
      `${progress.pending}개 수집 대기`
    );
  }
  return (
    `대표키워드 ${progress.available}/${progress.total}개 매장 반영 · ` +
    `${progress.pending}개 수집 지연`
  );
}

export function isRegisteredKeywordCollectionDelayed(params: {
  queueStatus: string | null | undefined;
  collectionPending: number;
  retryableCollection: number;
}): boolean {
  return (
    params.queueStatus === "GLOBAL_COOLDOWN" ||
    (params.collectionPending > 0 && params.retryableCollection === 0)
  );
}
