/**
 * 클라이언트(브라우저)에서 map.naver.com allSearch JSON을 직접 fetch — 디버그/mixed-order 분석 전용.
 * UI에 노출하지 않고 콘솔·서버 로그 분석용.
 *
 * 동작은 서버 `buildAllSearchUrlCheckPlaceRankStyle`와 동일한 URL/파라미터를 사용합니다.
 * 크로스 오리진 CORS로 실패할 수 있음(쿠키/Referer 정책에 따라 다름). 실패 시 호출부에서 무시하면 됨.
 */

import {
  NAVER_MAP_ALL_SEARCH_CHECK_PLACE_UA,
  buildAllSearchRefererCheckPlaceRankStyle,
  buildAllSearchUrlCheckPlaceRankStyle,
} from "@/lib/naver-map-all-search";

export type DebugBrowserAllSearchResult =
  | { ok: true; json: unknown }
  | { ok: false; error: string };

/**
 * 브라우저 세션으로 지도와 동일한 allSearch GET을 시도하고 JSON을 반환합니다.
 * 성공 시 반환값을 `/api/check-place-rank`의 `browserAllSearchJson`으로 넣으면 서버에서 mixed-order 분석 로그가 출력됩니다.
 */
export async function debugFetchBrowserAllSearchJson(params: {
  keyword: string;
  x?: string;
  y?: string;
}): Promise<DebugBrowserAllSearchResult> {
  const keyword = String(params.keyword ?? "").trim();
  if (!keyword) {
    return { ok: false, error: "빈 키워드" };
  }

  const coords =
    params.x && params.y ? { x: String(params.x), y: String(params.y) } : undefined;

  const url = buildAllSearchUrlCheckPlaceRankStyle(keyword, coords);

  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: buildAllSearchRefererCheckPlaceRankStyle(keyword),
        "User-Agent": NAVER_MAP_ALL_SEARCH_CHECK_PLACE_UA,
      },
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.debug(
          "[browser-allsearch-debug] HTTP 실패",
          keyword,
          res.status
        );
      }
      return { ok: false, error: `HTTP ${res.status}` };
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "JSON_PARSE" };
    }

    if (process.env.NODE_ENV === "development") {
      const preview = text.length > 400 ? `${text.slice(0, 400)}…` : text;
      console.debug("[browser-allsearch-debug] ok", keyword, "preview", preview);
    }

    return { ok: true, json };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (process.env.NODE_ENV === "development") {
      console.debug("[browser-allsearch-debug] fetch 실패", keyword, msg);
    }
    return { ok: false, error: msg };
  }
}
