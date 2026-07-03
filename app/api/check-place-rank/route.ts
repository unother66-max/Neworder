import { NextResponse } from "next/server";
import { createAdminAlert } from "@/lib/admin-alert";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import {
  type AllSearchCheckPlaceFailureCode,
  type CheckPlaceRankListItem,
  logBrowserAllSearchMixedOrderAnalysis,
  mapAllSearchRowsToCheckPlaceRankList,
  extractPlacesFromAllSearchJson,
  extractPlacesFromAllSearchJsonPreservingPositions,
  fetchAllSearchPlacesForIntentKeyword,
} from "@/lib/naver-map-all-search";
import { isIntentMixedKeyword } from "@/lib/check-place-rank-intent";
import { fetchPcmapPlaceListGraphql } from "@/lib/pcmap-place-list-graphql";
import { fetchPcmapRestaurantsGraphqlDiagnostic } from "@/lib/pcmap-restaurants-graphql-diagnostic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// place 순위조회: 계산/표시 범위를 동일 상수로 관리
const RANK_SCAN_LIMIT = 280;
const DISPLAY = RANK_SCAN_LIMIT;
const SEARCH_CAP = RANK_SCAN_LIMIT;

function normalizeText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const s = String(value).trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/&/g, "and")
    .replace(/앤/g, "and")
    .replace(/[()[\]{}'"`.,·•\-_/]/g, "")
    .trim();
}

function shouldUseRestaurantGraphql(params: {
  keyword: string;
  category?: string;
}): boolean {
  const text = `${params.keyword} ${params.category ?? ""}`.toLowerCase();
  if (
    /(필라테스|바레|헬스|피트니스|요가|학원|아카데미|미용|뷰티|네일|병원|의원|약국|치과|fitness|pilates|barre|academy|beauty|hospital)/i.test(text)
  ) {
    return false;
  }
  return /(맛집|음식|식당|레스토랑|카페|커피|피자|치킨|고기|한식|양식|중식|일식|분식|술집|와인|브런치|restaurant|cafe|coffee|food|pizza)/i.test(text);
}

function mapPcmapItemsToCheckPlaceRankList(
  items: unknown[],
  display: number
): CheckPlaceRankListItem[] {
  const list = Array.isArray(items) ? items : [];

  return list.slice(0, display).map((raw, index) => {
    const it =
      raw != null && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};

    const visitor = Number(it["visitorReviewCount"] ?? 0) || 0;
    const blog = Number(it["blogCafeReviewCount"] ?? 0) || 0;
    const total = visitor + blog;

    return {
      rank: index + 1,
      placeId: String(it["id"] ?? "").trim(),
      name: String(it["name"] ?? "").trim(),
      category: String(it["category"] ?? it["businessCategory"] ?? "").trim(),
      address: String(
        it["roadAddress"] ?? it["address"] ?? it["fullAddress"] ?? ""
      ).trim(),
      imageUrl: "",
      review: { visitor, blog, total },
    };
  });
}

export async function POST(req: Request) {
  try {
    const perfStartMs = Date.now();
    const body = await req.json();
    const keyword = String(body.keyword || "").trim();

    let actualKeyword = keyword;

    const compactKeyword = keyword.replace(/\s+/g, "");

    if (compactKeyword === "이태원데이트") {
      actualKeyword = keyword;
      console.log("[추천형 키워드 보정]", {
        original: keyword,
        actualKeyword,
      });
    }
    const targetName = String(body.targetName || "").trim();
    const placeCategory = String(body.placeCategory || body.category || "").trim();
    const browserAllSearchJson = body?.browserAllSearchJson ?? null;
    const x = body.x ? String(body.x) : "";
    const y = body.y ? String(body.y) : "";

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: "keyword 필요" },
        { status: 400 }
      );
    }

    let naverMsAccum = 0;
    const timedNaverFetch = async <T>(fn: () => Promise<T>): Promise<T> => {
      const s = Date.now();
      try {
        return await fn();
      } finally {
        naverMsAccum += Date.now() - s;
      }
    };
    let volumeMsAccum = 0;
    let fallbackUsed = false;

    console.log("[check-place-rank] 시작:", keyword);

    // 추천형 여부를 최상단에서 결정 — 이후 모든 분기에서 참조
    const shouldPreferAllSearch = isIntentMixedKeyword(actualKeyword);

    let fullList: CheckPlaceRankListItem[] = [];
    let usedSource:
      | "browser-allSearch"
      | "pcmap-graphql"
      | "pcmap-place-graphql"
      | "allSearch" = "pcmap-graphql";
    let autoOk = false;
    let failureCode:
      | AllSearchCheckPlaceFailureCode
      | "PCMAP_HTTP_405"
      | "PCMAP_GRAPHQL_FAILED"
      | null = null;
    let failureMessage: string | null = null;
    // 운영 순위조회에서는 allSearch를 사용하지 않는다.
    const skipAllSearchFallback = true;
    let resultStatus:
      | "FOUND"
      | "OUT_OF_RANGE_280"
      | "PARTIAL_FAILED"
      | "NEED_DEEP_CHECK"
      | "PCMAP_HTTP_405" = "PARTIAL_FAILED";
    let checkedCount = 0;

    const useRestaurantGraphql = shouldUseRestaurantGraphql({
      keyword: actualKeyword,
      category: placeCategory,
    });
    usedSource = useRestaurantGraphql
      ? "pcmap-graphql"
      : "pcmap-place-graphql";

    // pcmap GraphQL을 HTML 선요청 없이 1페이지부터 직접 조회한다.
    try {
      const graphqlResult = useRestaurantGraphql
        ? await timedNaverFetch(() =>
            fetchPcmapRestaurantsGraphqlDiagnostic({
              keyword: actualKeyword,
              targetName,
              x: x || undefined,
              y: y || undefined,
              start: 1,
              display: 70,
              maxPages: 4,
              fallbackToHtml: false,
            })
          )
        : await timedNaverFetch(() =>
            fetchPcmapPlaceListGraphql({
              keyword: actualKeyword,
              targetName,
              x: x || undefined,
              y: y || undefined,
              start: 1,
              display: 70,
              maxPages: 4,
            })
          );
      fullList = mapPcmapItemsToCheckPlaceRankList(
        graphqlResult.items,
        SEARCH_CAP
      );
      checkedCount = fullList.length;

      if (graphqlResult.status === "FOUND") {
        resultStatus = "FOUND";
        failureCode = null;
        failureMessage = null;
      } else if (graphqlResult.status === "OUT_OF_RANGE_280") {
        resultStatus = "OUT_OF_RANGE_280";
        failureCode = null;
        failureMessage = "280위 밖";
      } else {
        resultStatus = "PARTIAL_FAILED";
        failureCode = "PCMAP_GRAPHQL_FAILED";
        failureMessage = "일부 순위 조회 실패 / 마지막 저장 순위 유지";
      }

      console.log("[check-place-rank pcmap GraphQL 280]", {
        htmlPreflight: false,
        graphqlMode: useRestaurantGraphql ? "restaurant" : "place",
        operationName: graphqlResult.operationName,
        requestedStarts: graphqlResult.requestedStarts,
        completedPages: graphqlResult.completedPages,
        graphqlParsed: graphqlResult.parsedCount,
        checkedCount,
        targetRank: graphqlResult.rank,
        resultStatus,
        debugReason: graphqlResult.debugReason,
      });
    } catch (error) {
      resultStatus = "PARTIAL_FAILED";
      failureCode = "PCMAP_GRAPHQL_FAILED";
      failureMessage = "현재 조회 차단됨 / 마지막 저장 순위 유지";
      console.warn("[check-place-rank pcmap GraphQL 280] 예외", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // 브라우저 allSearch JSON은 명시적인 development 진단에서만 사용한다.
    // 추천형 키워드: 광고/섹션 헤더도 stub으로 위치 보존 → rank 압축 방지
    if (
      fullList.length === 0 &&
      browserAllSearchJson &&
      process.env.NODE_ENV !== "production" &&
      body?.useBrowserAllSearchDiagnostic === true
    ) {
      if (shouldPreferAllSearch) {
        logBrowserAllSearchMixedOrderAnalysis(
          actualKeyword,
          browserAllSearchJson
        );
      }
      try {
        const rows = shouldPreferAllSearch
          ? extractPlacesFromAllSearchJsonPreservingPositions(browserAllSearchJson)
          : extractPlacesFromAllSearchJson(browserAllSearchJson);

        const browserMapped = mapAllSearchRowsToCheckPlaceRankList(
          rows,
          SEARCH_CAP
        );

        if (browserMapped.length > 0) {
          fullList = browserMapped;
          usedSource = "browser-allSearch";
          console.log("[check-place-rank browser-allSearch]", {
            intentKeyword: shouldPreferAllSearch,
            rawRows: rows.length,
            realPlaces: browserMapped.filter((r) => r.placeId).length,
            stubs: browserMapped.filter((r) => !r.placeId).length,
          });
        } else {
          console.warn("[check-place-rank browser-allSearch] 파싱 결과 0건");
        }
      } catch (e) {
        console.warn("[check-place-rank browser-allSearch] 실패", e);
      }
    }

    // 3) 서버 allSearch fallback — pcmap 실패(또는 결과 0) 시에만 호출
    if (
      fullList.length === 0 &&
      shouldPreferAllSearch &&
      !skipAllSearchFallback
    ) {
      fallbackUsed = true;
      usedSource = "allSearch";
      console.warn(
        "[check-place-rank] 추천형: pcmap 결과 없음 → allSearch fallback 시도"
      );

      const tokenless = await timedNaverFetch(() =>
        fetchAllSearchPlacesForIntentKeyword(actualKeyword, { x, y })
      );

      if (tokenless.ok) {
        const mapped = mapAllSearchRowsToCheckPlaceRankList(
          tokenless.places,
          SEARCH_CAP
        );
        if (mapped.length > 0) {
          fullList = mapped;
          autoOk = true;
          console.log("[check-place-rank allSearch 추천형 tokenless]", {
            totalRows: tokenless.places.length,
            realPlaces: mapped.filter((r) => r.placeId).length,
            stubs: mapped.filter((r) => !r.placeId).length,
          });
        }
      } else {
        console.warn("[check-place-rank allSearch 추천형 tokenless 실패]", {
          failureCode: tokenless.failureCode,
        });
        failureCode = tokenless.failureCode;
        if (
          tokenless.failureCode === "NCAPTCHA" ||
          tokenless.failureCode === "CE_EMPTY_TOKEN"
        ) {
          failureMessage = "네이버 보안 응답으로 순위 확인 실패";
        } else {
          failureMessage = tokenless.userMessage;
        }
      }

      if (fullList.length === 0) {
        const auto = await timedNaverFetch(() =>
          fetchAllSearchPlacesAutoDetailed(actualKeyword, {
            x,
            y,
          })
        );
        autoOk = auto.ok;
        if (auto.ok && auto.places.length > 0) {
          fullList = mapAllSearchRowsToCheckPlaceRankList(
            auto.places,
            SEARCH_CAP
          );
          console.log("[check-place-rank allSearch 추천형 token-based]", {
            places: auto.places.length,
            note: "위치 보존 미적용(token 필요 환경) — rank 압축 가능성 있음",
          });
          failureCode = null;
          failureMessage = null;
        } else if (!auto.ok) {
          failureCode = auto.failureCode;
          if (
            auto.failureCode === "NCAPTCHA" ||
            auto.failureCode === "CE_EMPTY_TOKEN"
          ) {
            failureMessage = "네이버 보안 응답으로 순위 확인 실패";
          } else {
            failureMessage = auto.userMessage;
          }
        }
      }
    }

    if (
      fullList.length === 0 &&
      !shouldPreferAllSearch &&
      !skipAllSearchFallback
    ) {
      fallbackUsed = true;
      usedSource = "allSearch";
      const auto = await timedNaverFetch(() =>
        fetchAllSearchPlacesAutoDetailed(actualKeyword, {
          x,
          y,
        })
      );
      autoOk = auto.ok;
      if (!auto.ok) {
        failureCode = auto.failureCode;
        failureMessage =
          auto.failureCode === "NCAPTCHA" ||
          auto.failureCode === "CE_EMPTY_TOKEN"
            ? "네이버 보안 응답으로 순위 확인 실패"
            : auto.userMessage;
      }
      const pack = auto.ok ? auto : null;
      fullList =
        pack && pack.places.length > 0
          ? mapAllSearchRowsToCheckPlaceRankList(pack.places, SEARCH_CAP)
          : [];
    }

    const rank =
      targetName && fullList.length > 0
        ? (() => {
            const nTarget = normalizeText(targetName);
            if (!nTarget) return "-";
            const idxExact = fullList.findIndex((row) => {
              const nm =
                row && typeof row === "object" && "name" in row
                  ? (row as { name?: unknown }).name
                  : "";
              return normalizeText(nm) === nTarget;
            });
            const idx =
              idxExact >= 0
                ? idxExact
                : fullList.findIndex((row) => {
                    const nm =
                      row && typeof row === "object" && "name" in row
                        ? (row as { name?: unknown }).name
                        : "";
                    const n = normalizeText(nm);
                    if (!n || !nTarget) return false;
                    return n.includes(nTarget) || nTarget.includes(n);
                  });
            return idx >= 0 ? String(idx + 1) : "-";
          })()
        : "-";

    if (rank !== "-") {
      resultStatus = "FOUND";
      failureCode = null;
      failureMessage = null;
    } else if (
      (usedSource === "pcmap-graphql" || usedSource === "pcmap-place-graphql") &&
      fullList.length > 0 &&
      resultStatus !== "OUT_OF_RANGE_280" &&
      resultStatus !== "PARTIAL_FAILED"
    ) {
      resultStatus = "NEED_DEEP_CHECK";
      failureMessage = "추가 확인 필요";
    }
    const canSaveRank = resultStatus === "FOUND" && rank !== "-";

    // 추천형 키워드는 stub(placeId 없는 위치 보존용 항목)을 display에서 제외
    // rank 계산(findIndex)은 stub 포함 fullList 기준이므로 rank 정확도는 유지됨
    const list = (
      shouldPreferAllSearch
        ? fullList.filter((row) => row.placeId)
        : fullList
    ).slice(0, DISPLAY);

    // 추천형: 데이터 소스에 따른 정확도 표시 (프론트 안내용)
    let accuracy: "exact" | "source" | "estimated" | undefined;
    let warningOut: string | null = null;

    if (shouldPreferAllSearch && fullList.length > 0) {
      if (usedSource === "browser-allSearch") {
        accuracy = "source";
        warningOut = null;
        failureCode = null;
        failureMessage = null;
      } else if (usedSource === "allSearch") {
        accuracy = "exact";
        warningOut = null;
        failureCode = null;
        failureMessage = null;
      } else if (usedSource === "pcmap-graphql") {
        accuracy = "estimated";
        warningOut =
          "추천형 키워드는 네이버 화면 순서와 다를 수 있는 추정 순위입니다.";
      }
    }

    console.log("==================================================");
    console.log(`🔎 [전수조사] 현재 서버가 파싱한 전체 매장 수: ${fullList.length}개`);
    console.log(
      "💡 [상위 10개]",
      fullList.slice(0, 10).map((row) => `${row.rank}위:${row.name}`)
    );
    console.log("==================================================");

    console.log("[check-place-rank 결과]", {
      source: usedSource,
      parsed: fullList.length,
      autoOk,
      rank,
      failureCode,
    });

    const relatedCandidates = [keyword, `${keyword} 추천`, `${keyword} 근처`];

    // DB에 저장된 검색량이 있으면 우선 사용, 없을 때만 API 호출.
    // body.skipVolume=true면 전체 API 호출 생략.
    // body.relatedVolume = { [keyword]: { mobile, pc, total } } 형태.
    type VolumeEntry = { mobile?: number; pc?: number; total?: number };
    const dbVolume = (body.relatedVolume ?? {}) as Record<string, VolumeEntry>;
    const skipVolume = body.skipVolume === true || !canSaveRank;

    const related = await Promise.all(
      relatedCandidates.map(async (k) => {
        const db = dbVolume[k];
        if (
          skipVolume ||
          (db && typeof db.mobile === "number" && typeof db.pc === "number")
        ) {
          return {
            keyword: k,
            mobile: db?.mobile ?? 0,
            pc: db?.pc ?? 0,
            total: db?.total ?? (db?.mobile ?? 0) + (db?.pc ?? 0),
          };
        }
        const sv = Date.now();
        try {
          const vol = await getKeywordSearchVolume(k);
          volumeMsAccum += Date.now() - sv;
          return { keyword: k, ...vol };
        } catch {
          volumeMsAccum += Date.now() - sv;
          return { keyword: k, mobile: 0, pc: 0, total: 0 };
        }
      })
    );

    if (
      failureCode &&
      (failureCode === "NCAPTCHA" || failureCode === "CE_EMPTY_TOKEN") &&
      fullList.length === 0
    ) {
      void createAdminAlert({
        type: "place",
        level: "error",
        title: "플레이스 순위 조회 실패",
        message: `키워드: ${keyword} / 사유: ${failureCode}`,
        meta: {
          source: "check-place-rank",
          keyword,
          targetName: targetName || undefined,
          failureCode,
          failureMessage: failureMessage ?? undefined,
        },
      });
    }

    const warningsCount =
      (typeof warningOut === "string" && warningOut.trim() ? 1 : 0) +
      (typeof failureMessage === "string" && failureMessage.trim() ? 1 : 0);

    console.log("[rank-perf]", {
      keyword: actualKeyword,
      totalMs: Date.now() - perfStartMs,
      naverMs: Math.round(naverMsAccum),
      volumeMs: Math.round(volumeMsAccum),
      dbMs: 0,
      fallbackUsed,
      failureCode: failureCode ?? null,
      warningsCount,
    });

    return NextResponse.json({
      ok: true,
      keyword,
      related,
      list,
      rank,
      source: usedSource,
      resultStatus,
      parsed: fullList.length,
      checkedCount,
      canSaveRank,
      displayRank:
        resultStatus === "FOUND"
          ? `${rank}위`
          : resultStatus === "OUT_OF_RANGE_280"
            ? "280위 밖"
            : resultStatus === "NEED_DEEP_CHECK"
            ? "추가 확인 필요"
            : "현재 조회 차단됨 / 마지막 저장 순위 유지",
      failureCode,
      message: failureMessage,
      ...(shouldPreferAllSearch &&
      fullList.length > 0 &&
      typeof accuracy !== "undefined"
        ? { accuracy, warning: warningOut }
        : {}),
    });
  } catch (e) {
    console.error("[check-place-rank ERROR]", e);
    void createAdminAlert({
      type: "place",
      level: "error",
      title: "플레이스 순위 조회 서버 오류",
      message:
        e instanceof Error
          ? `check-place-rank: ${e.message}`
          : "check-place-rank: 알 수 없는 오류",
      meta: { source: "check-place-rank" },
    });
    return NextResponse.json(
      { ok: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}
