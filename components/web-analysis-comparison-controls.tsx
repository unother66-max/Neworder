import {
  WEB_ANALYSIS_COMPARISON_DAYS,
  type WebAnalysisComparisonDays,
  type WebAnalysisRankHistory,
} from "@/lib/web-analysis-history";

export default function WebAnalysisComparisonControls({
  history,
  selectedDays,
  warning,
  onSelect,
}: {
  history?: WebAnalysisRankHistory;
  selectedDays: WebAnalysisComparisonDays | null;
  warning?: string | null;
  onSelect: (daysAgo: WebAnalysisComparisonDays) => void;
}) {
  const snapshotsByDays = new Map(
    (history?.snapshots ?? []).map((snapshot) => [
      snapshot.daysAgo,
      snapshot,
    ] as const)
  );
  const selectedSnapshot =
    selectedDays === null ? null : snapshotsByDays.get(selectedDays) ?? null;

  return (
    <>
      {history ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-[#eef0f3] pt-3 md:flex-row md:items-center md:justify-between">
          <div
            className="flex flex-wrap gap-1.5"
            aria-label="과거 웹문서 수집순위 비교 날짜"
          >
            {WEB_ANALYSIS_COMPARISON_DAYS.map((daysAgo) => {
              const snapshot = snapshotsByDays.get(daysAgo);
              const selected = selectedDays === daysAgo;
              return (
                <button
                  key={daysAgo}
                  type="button"
                  disabled={!snapshot}
                  aria-pressed={selected}
                  aria-label={
                    snapshot
                      ? `${daysAgo}일전 수집순위와 비교`
                      : `${daysAgo}일전 기록 없음`
                  }
                  title={snapshot ? snapshot.snapshotDate : "기록 없음"}
                  data-web-comparison-days={daysAgo}
                  onClick={() => onSelect(daysAgo)}
                  className={`h-8 rounded-[9px] border px-2.5 text-[10px] font-bold transition md:text-[11px] ${
                    selected
                      ? "border-[#93b4f8] bg-[#eff6ff] text-[#2563eb]"
                      : snapshot
                        ? "border-[#d1d5db] bg-white text-[#4b5563] hover:bg-[#f8fafc]"
                        : "cursor-not-allowed border-[#e5e7eb] bg-[#f8fafc] text-[#cbd5e1]"
                  }`}
                >
                  {daysAgo}일전
                </button>
              );
            })}
          </div>
          <p className="text-[10px] font-semibold text-[#6b7280] md:text-[11px]">
            {history.currentDate} 수집순위 기준
            {selectedSnapshot
              ? ` · ${selectedSnapshot.snapshotDate}(${selectedSnapshot.daysAgo}일전) 비교`
              : ""}
          </p>
        </div>
      ) : null}

      {warning ? (
        <p
          role="status"
          className="mt-2 text-[10px] font-semibold text-amber-700 md:text-[11px]"
        >
          {warning}
        </p>
      ) : null}
    </>
  );
}
