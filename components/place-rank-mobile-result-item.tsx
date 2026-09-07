import PlaceRankMetricValue from "@/components/place-rank-metric-value";
import { decodeHtmlText } from "@/lib/html-text";
import {
  getTop300RankMovement,
  getTop300RankMovementLabel,
  type Top300SnapshotMetric,
  type Top300RankMovement,
} from "@/lib/place-rank-top300-history";

export type MobilePlaceRankResult = {
  rank: number;
  placeId: string;
  name: string;
  category: string;
  thumbnail?: string;
  rating: string | null;
  visitorReviewCount: number | null;
  blogReviewCount: number | null;
};

function formatCount(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString("ko-KR") : "-";
}

function formatTextMetric(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return text || "-";
}

function parseNumericMetric(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim();
  const parsed = Number(text);
  return text && Number.isFinite(parsed) ? parsed : null;
}

function rankMovementTone(movement: Top300RankMovement): string {
  if (movement.kind === "up") return "text-[#ef4444]";
  if (movement.kind === "down") return "text-[#2563eb]";
  if (movement.kind === "new") return "text-[#2563eb]";
  return "text-[#9ca3af]";
}

function rankMovementAccessibleLabel(movement: Top300RankMovement): string {
  if (movement.kind === "up") {
    return `이전 ${movement.previousRank}위 대비 ${movement.amount}위 상승`;
  }
  if (movement.kind === "down") {
    return `이전 ${movement.previousRank}위 대비 ${movement.amount}위 하락`;
  }
  if (movement.kind === "new") return "비교일 TOP300 신규 진입";
  return `이전 ${movement.previousRank}위와 동일`;
}

export function PlaceRankMobileResultHeader() {
  return (
    <div
      data-mobile-place-rank-header
      className="grid min-w-0 grid-cols-[46px_36px_minmax(0,1fr)_34px_46px_46px] items-center gap-x-1 border-b border-[#e5e7eb] bg-[#f8fafc] px-2 py-1.5 text-[9px] font-bold leading-3 text-[#6b7280]"
    >
      <span className="text-center">순위</span>
      <span />
      <span className="min-w-0 truncate text-left">업체명</span>
      <span className="text-center">평점</span>
      <span className="text-center">방문</span>
      <span className="text-center">블로그</span>
    </div>
  );
}

export default function PlaceRankMobileResultItem({
  row,
  previousRanks,
  previousMetrics = null,
  comparisonActive = false,
}: {
  row: MobilePlaceRankResult;
  previousRanks: ReadonlyMap<string, number> | null;
  previousMetrics?: ReadonlyMap<string, Top300SnapshotMetric> | null;
  comparisonActive?: boolean;
}) {
  const movement = previousRanks
    ? getTop300RankMovement(row.rank, row.placeId, previousRanks)
    : null;
  const rating = formatTextMetric(row.rating);
  const visitorReviewCount = formatCount(row.visitorReviewCount);
  const blogReviewCount = formatCount(row.blogReviewCount);
  const previousMetric = previousMetrics?.get(row.placeId);
  const displayName = decodeHtmlText(row.name);

  return (
    <article
      role="listitem"
      data-mobile-place-rank-row={row.placeId}
      aria-label={`${row.rank}위 ${displayName}, 평점 ${rating}, 방문리뷰 ${visitorReviewCount}, 블로그리뷰 ${blogReviewCount}`}
      className="grid min-h-[52px] min-w-0 grid-cols-[46px_36px_minmax(0,1fr)_34px_46px_46px] items-center gap-x-1 px-2 py-2"
    >
      <div
        data-mobile-place-rank-cell="rank"
        className="flex min-w-0 items-center justify-center gap-0.5 whitespace-nowrap font-black tabular-nums"
      >
        <span className="text-[11px] text-[#2563eb]">{row.rank}</span>
        {movement ? (
          <span
            data-rank-movement={movement.kind}
            aria-label={rankMovementAccessibleLabel(movement)}
            className={`text-[8px] font-extrabold ${rankMovementTone(
              movement
            )}`}
          >
            {getTop300RankMovementLabel(movement)}
          </span>
        ) : null}
      </div>

      {row.thumbnail ? (
        <img
          src={row.thumbnail}
          alt={`${displayName} 대표 이미지`}
          width={36}
          height={36}
          loading="lazy"
          referrerPolicy="no-referrer"
          data-mobile-place-rank-cell="thumbnail"
          className="h-9 w-9 shrink-0 rounded-[8px] border border-[#eef0f3] object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          data-mobile-place-rank-cell="thumbnail"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#eef0f3] bg-[#f8fafc] text-[7px] font-bold text-[#cbd5e1]"
        >
          이미지
        </div>
      )}

      <div
        data-mobile-place-rank-cell="name"
        title={displayName}
        className="min-w-0 truncate text-[11px] font-bold leading-4 text-[#111827]"
      >
        {displayName}
      </div>

      <div
        data-mobile-place-rank-cell="rating"
        className="whitespace-nowrap text-center text-[10px] font-bold tabular-nums text-[#374151]"
      >
        <PlaceRankMetricValue
          value={rating}
          currentValue={parseNumericMetric(row.rating)}
          previousValue={previousMetric?.rating}
          comparisonActive={comparisonActive}
          fractionDigits={2}
          compact
        />
      </div>
      <div
        data-mobile-place-rank-cell="visitor"
        className="whitespace-nowrap text-center text-[10px] font-semibold tabular-nums text-[#4b5563]"
      >
        <PlaceRankMetricValue
          value={visitorReviewCount}
          currentValue={row.visitorReviewCount}
          previousValue={previousMetric?.visitorReviewCount}
          comparisonActive={comparisonActive}
          compact
        />
      </div>
      <div
        data-mobile-place-rank-cell="blog"
        className="whitespace-nowrap text-center text-[10px] font-semibold tabular-nums text-[#4b5563]"
      >
        <PlaceRankMetricValue
          value={blogReviewCount}
          currentValue={row.blogReviewCount}
          previousValue={previousMetric?.blogReviewCount}
          comparisonActive={comparisonActive}
          compact
        />
      </div>
    </article>
  );
}
