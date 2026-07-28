export type PlaceAnalysisRegisteredKeyword = {
  keyword: string;
  volume: number | null;
  volumeStatus: "AVAILABLE" | "ZERO" | "PENDING" | "UNAVAILABLE";
};

type LegacyRegisteredKeyword = string | PlaceAnalysisRegisteredKeyword;

function formatVolume(item: PlaceAnalysisRegisteredKeyword): string {
  if (item.volumeStatus === "PENDING") return "수집 대기";
  return item.volume === null ? "-" : item.volume.toLocaleString("ko-KR");
}

export function normalizePlaceAnalysisRegisteredKeywords(params: {
  registeredKeywords?: LegacyRegisteredKeyword[] | null;
  registeredKeywordsStatus?: "AVAILABLE" | "UNAVAILABLE";
  legacyKeywords?: string[] | null;
}): PlaceAnalysisRegisteredKeyword[] | null {
  if (params.registeredKeywordsStatus === "UNAVAILABLE") return null;

  const source = Array.isArray(params.registeredKeywords)
    ? params.registeredKeywords
    : Array.isArray(params.legacyKeywords)
      ? params.legacyKeywords
      : null;
  if (source === null) return null;
  const seenKeywords = new Set<string>();

  return source
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          keyword: item.normalize("NFKC").trim(),
          volume: null,
          volumeStatus: "UNAVAILABLE" as const,
          index,
        };
      }
      const keyword = String(item?.keyword ?? "").normalize("NFKC").trim();
      const volume =
        typeof item?.volume === "number" && Number.isFinite(item.volume)
          ? Math.max(0, Math.floor(item.volume))
          : null;
      return {
        keyword,
        volume,
        volumeStatus:
          volume === null
            ? item?.volumeStatus === "PENDING"
              ? ("PENDING" as const)
              : ("UNAVAILABLE" as const)
            : volume === 0
              ? ("ZERO" as const)
              : ("AVAILABLE" as const),
        index,
      };
    })
    .filter((item) => Boolean(item.keyword))
    .filter((item) => {
      const key = item.keyword.toLocaleLowerCase("ko-KR");
      if (seenKeywords.has(key)) return false;
      seenKeywords.add(key);
      return true;
    })
    .sort((a, b) => {
      if (a.volume === null && b.volume === null) return a.index - b.index;
      if (a.volume === null) return 1;
      if (b.volume === null) return -1;
      return b.volume - a.volume || a.index - b.index;
    })
    .map((item) => ({
      keyword: item.keyword,
      volume: item.volume,
      volumeStatus: item.volumeStatus,
    }));
}

export function PlaceAnalysisRegisteredKeywords({
  keywords,
  emptyLabel,
  compact = false,
}: {
  keywords: PlaceAnalysisRegisteredKeyword[] | null;
  emptyLabel: string;
  compact?: boolean;
}) {
  if (!keywords || keywords.length === 0) {
    return (
      <span className={compact ? "text-[11px] text-[#9ca3af]" : "text-[11px] text-[#9ca3af] md:text-[12px]"}>
        {emptyLabel}
      </span>
    );
  }

  const allKeywordText = keywords
    .map((item) => `${item.keyword} ${formatVolume(item)}`)
    .join("\n");

  return (
    <div
      className={
        compact
          ? "flex max-w-[165px] flex-wrap gap-1 overflow-visible"
          : "flex max-w-[230px] flex-wrap gap-1 md:gap-1.5"
      }
      title={allKeywordText}
      aria-label={`대표키워드와 검색량: ${allKeywordText.replace(/\n/g, ", ")}`}
    >
      {keywords.map((item) => (
        <span
          key={item.keyword}
          data-registered-keyword={item.keyword}
          className={
            compact
              ? "inline-flex shrink-0 whitespace-nowrap rounded-[6px] border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold leading-5 text-blue-700"
              : "rounded-[6px] border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 md:px-2 md:py-1 md:text-[11px]"
          }
        >
          {item.keyword}&nbsp;
          <span className="tabular-nums text-blue-500">
            {formatVolume(item)}
          </span>
        </span>
      ))}
    </div>
  );
}
