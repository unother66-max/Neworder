/** Korea (Asia/Seoul, fixed UTC+9) calendar boundaries for aggregates */

function seoulMidnightUtc(y: number, month: number, day: number): Date {
  return new Date(Date.UTC(y, month - 1, day) - 9 * 60 * 60 * 1000);
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
