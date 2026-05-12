/** 클라이언트 안전: 평균 대비 ±10% 구간 라벨 */

export function topicComparisonBandLabel(
  my: number | null | undefined,
  avg: number | null | undefined
): { label: string; className: string } | null {
  if (my === null || my === undefined || !Number.isFinite(Number(my))) return null;
  if (avg === null || avg === undefined || !Number.isFinite(Number(avg))) return null;
  const m = Number(my);
  const a = Number(avg);
  if (a === 0 && m === 0)
    return { label: "평균", className: "text-orange-500 font-bold" };
  if (a === 0 && m > 0)
    return { label: "평균 이상", className: "text-[#2563EB] font-bold" };
  if (a === 0 && m < 0)
    return { label: "평균 이하", className: "text-red-500 font-bold" };

  const ratio = m / a;
  if (ratio >= 1.1) return { label: "평균 이상", className: "text-[#2563EB] font-bold" };
  if (ratio <= 0.9) return { label: "평균 이하", className: "text-red-500 font-bold" };
  return { label: "평균", className: "text-orange-500 font-bold" };
}

export function formatSignedDiff(my: number | null | undefined, avg: number | null | undefined, decimals: number): string {
  if (my === null || my === undefined || !Number.isFinite(Number(my))) return "—";
  if (avg === null || avg === undefined || !Number.isFinite(Number(avg))) return "—";
  const d = Number(my) - Number(avg);
  if (!Number.isFinite(d)) return "—";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(decimals)}`;
}
