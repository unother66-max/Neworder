import { getReviewDeltaPresentation } from "@/components/place-review-delta-badge";
import { parsePlaceReviewCount } from "@/lib/place-review-history";

export type MobilePlaceReviewHistoryRow = {
  id: string;
  dateLabel: string;
  totalReviewCount: number;
  visitorReviewCount: number;
  visitorReviewDiff?: number | null;
  blogReviewCount: number;
  blogReviewDiff?: number | null;
  saveCount: string | null;
  keywords: string[];
};

const numberFormat = new Intl.NumberFormat("ko-KR");

export function mobileReviewDateLabel(value: string): string {
  const firstLine = String(value ?? "").split(/\r?\n/, 1)[0]?.trim() ?? "";
  return firstLine.replace(/\s+\(/, "(") || "-";
}

export function mobileReviewSaveCount(value: string | null): string {
  const text = String(value ?? "").trim();
  if (!text) return "-";

  const parsed = parsePlaceReviewCount(value);
  if (parsed === null) return text === "-" ? "-" : text;

  return numberFormat.format(parsed);
}

function MobileReviewDiff({ value }: { value?: number | null }) {
  const presentation = getReviewDeltaPresentation(value);
  const toneClass =
    presentation.direction === "increase"
      ? "text-[#ef4444]"
      : presentation.direction === "decrease"
        ? "text-[#2563eb]"
        : "text-[#9ca3af]";

  return (
    <span
      data-mobile-review-delta={presentation.direction}
      aria-label={presentation.accessibleLabel}
      className={`ml-0.5 inline-flex shrink-0 whitespace-nowrap text-[9px] font-extrabold leading-none tabular-nums ${toneClass}`}
    >
      {presentation.label.replace(/\s+/g, "")}
    </span>
  );
}

export function PlaceReviewMobileHistoryHeader() {
  return (
    <div
      role="row"
      data-mobile-place-review-header
      className="grid min-w-0 grid-cols-[44px_36px_50px_50px_40px_minmax(0,1fr)] items-center gap-x-0.5 border-b border-[#e5e7eb] bg-[#f9fafb] px-1 py-2 text-[9px] font-extrabold leading-none text-[#6b7280]"
    >
      <span role="columnheader" className="text-center">날짜</span>
      <span role="columnheader" className="text-center">전체</span>
      <span role="columnheader" className="text-center">방문</span>
      <span role="columnheader" className="text-center">블로그</span>
      <span role="columnheader" className="text-center">저장</span>
      <span role="columnheader" className="min-w-0 truncate text-left">키워드</span>
    </div>
  );
}

export default function PlaceReviewMobileHistory({
  rows,
}: {
  rows: MobilePlaceReviewHistoryRow[];
}) {
  return (
    <div
      role="table"
      aria-label="모바일 리뷰 이력"
      data-mobile-place-review-history
      className="w-full min-w-0 overflow-hidden md:hidden"
    >
      <PlaceReviewMobileHistoryHeader />

      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-[#9ca3af]">
          아직 리뷰 추적 데이터가 없습니다.
        </div>
      ) : (
        <div role="rowgroup" className="divide-y divide-[#f3f4f6]">
          {rows.map((row) => {
            const keyword = row.keywords.join(", ") || "-";

            return (
              <div
                role="row"
                key={row.id}
                data-mobile-place-review-row={row.id}
                className="grid min-h-[46px] min-w-0 grid-cols-[44px_36px_50px_50px_40px_minmax(0,1fr)] items-center gap-x-0.5 bg-white px-1"
              >
                <div
                  role="cell"
                  data-mobile-place-review-cell="date"
                  className="whitespace-nowrap text-center text-[9px] font-bold tracking-[-0.04em] text-[#374151]"
                >
                  {mobileReviewDateLabel(row.dateLabel)}
                </div>

                <div
                  role="cell"
                  data-mobile-place-review-cell="total"
                  className="whitespace-nowrap text-center text-[10px] font-semibold tabular-nums text-[#111827]"
                >
                  {numberFormat.format(row.totalReviewCount)}
                </div>

                <div
                  role="cell"
                  data-mobile-place-review-cell="visitor"
                  className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap text-[10px] font-semibold tabular-nums text-[#111827]"
                >
                  <span>{numberFormat.format(row.visitorReviewCount)}</span>
                  <MobileReviewDiff value={row.visitorReviewDiff} />
                </div>

                <div
                  role="cell"
                  data-mobile-place-review-cell="blog"
                  className="flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap text-[10px] font-semibold tabular-nums text-[#111827]"
                >
                  <span>{numberFormat.format(row.blogReviewCount)}</span>
                  <MobileReviewDiff value={row.blogReviewDiff} />
                </div>

                <div
                  role="cell"
                  data-mobile-place-review-cell="save"
                  className="whitespace-nowrap text-center text-[10px] font-semibold tabular-nums text-[#111827]"
                >
                  {mobileReviewSaveCount(row.saveCount)}
                </div>

                <div
                  role="cell"
                  data-mobile-place-review-cell="keywords"
                  title={keyword}
                  className="min-w-0 truncate whitespace-nowrap text-left text-[9px] font-semibold text-[#374151]"
                >
                  {keyword}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
