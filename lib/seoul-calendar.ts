/** Korea (Asia/Seoul, fixed UTC+9) calendar boundaries for aggregates */

export const SEOUL_TIMEZONE = "Asia/Seoul";

function seoulMidnightUtc(y: number, month: number, day: number): Date {
  return new Date(Date.UTC(y, month - 1, day) - 9 * 60 * 60 * 1000);
}

/** `yyyy-MM-dd` (서울 달력) → UTC instant 구간 `[start, endExclusive)` */
export function utcRangeForSeoulDateString(iso: string): {
  start: Date;
  endExclusive: Date;
} {
  const [ys, ms, ds] = iso.split("-").map((v) => parseInt(v, 10));
  const start = seoulMidnightUtc(ys, ms, ds);
  const endExclusive = seoulMidnightUtc(ys, ms, ds + 1);
  return { start, endExclusive };
}

/** `days`일치 서울 날짜 키 (오름차순, 막날≈오늘) */
export function recentSeoulDateStrings(days: number, reference = new Date()): string[] {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(
      seoulCalendarDateString(new Date(reference.getTime() - offset * 86_400_000))
    );
  }
  return [...new Set(keys)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** yyyy-mm-dd in Asia/Seoul for the instant `reference` */
export function seoulCalendarDateString(reference = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

/** `[start, endExclusive)` covering the Seoul calendar day that contains `reference` */
export function utcRangeSeoulCalendarDay(reference = new Date()): {
  start: Date;
  endExclusive: Date;
} {
  const iso = seoulCalendarDateString(reference);
  const [y, m, dom] = iso.split("-").map((v) => parseInt(v, 10));
  const start = seoulMidnightUtc(y, m, dom);
  const endExclusive = seoulMidnightUtc(y, m, dom + 1);
  return { start, endExclusive };
}

/** Asia/Seoul 기준 날짜·시간 문자열 (Intl, ko-KR 로케일) */
export function formatSeoulDateTime(
  d: Date,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }
): string {
  return new Intl.DateTimeFormat("ko-KR", {
    ...options,
    timeZone: SEOUL_TIMEZONE,
  }).format(d);
}
