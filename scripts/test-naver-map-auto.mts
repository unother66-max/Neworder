/**
 * one-off: npx tsx scripts/test-naver-map-auto.mts [keyword]
 * allSearch 자동 경로(무토큰→Playwright) 스모크 테스트
 *
 * 전체 상한(기본 3분): NAVER_MAP_AUTO_TEST_OVERALL_MS 로 조정
 */
import { fetchAllSearchPlacesAutoDetailed } from "../lib/naver-map-all-search-auto";

const kw = process.argv[2] || "서울역 필라테스";
const overallRaw = parseInt(
  String(process.env.NAVER_MAP_AUTO_TEST_OVERALL_MS || "").trim(),
  10
);
const overallMs =
  Number.isFinite(overallRaw) && overallRaw >= 30_000 && overallRaw <= 600_000
    ? overallRaw
    : 180_000;

const killTimer = setTimeout(() => {
  console.error(
    `[test-naver-map-auto] 전체 ${overallMs}ms 초과로 종료합니다. (환경: NAVER_MAP_AUTO_TEST_OVERALL_MS)`
  );
  process.exit(124);
}, overallMs);

console.error(
  `[test-naver-map-auto] 시작 keyword="${kw}" overallMs=${overallMs} (fetch 기본 20초·NAVER_MAP_FETCH_TIMEOUT_MS)`
);

try {
  const r = await fetchAllSearchPlacesAutoDetailed(kw);
  clearTimeout(killTimer);
  console.log(
    r.ok
      ? { ok: true, totalCount: r.totalCount, sample: r.places.slice(0, 3) }
      : { ok: false, failureCode: r.failureCode, userMessage: r.userMessage }
  );
  process.exit(r.ok ? 0 : 1);
} catch (e) {
  clearTimeout(killTimer);
  console.error("[test-naver-map-auto] 예외", e);
  process.exit(1);
}
