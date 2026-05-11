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
import { fetchBestPcmapBusinessesBatchJson } from "@/lib/pcmap-businesses-batch-fetch";
import {
  mergePcmapGraphqlBatch,
  parseNaverReviewCountField,
} from "@/lib/merge-pcmap-businesses-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// place 순위조회: 계산/표시 범위를 동일 상수로 관리
const RANK_SCAN_LIMIT = 280;
const DISPLAY = RANK_SCAN_LIMIT;
const SEARCH_CAP = RANK_SCAN_LIMIT;
const PCMAP_FETCH_TIMEOUT_MS = 18_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

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

function pickImageUrl(item: Record<string, unknown>): string {
  if (!item || typeof item !== "object") return "";
  const candidates = [
    item["imageUrl"],
    item["thumbnail"],
    item["thumUrl"],
    item["image"],
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const s = typeof c === "string" ? c.trim() : String(c).trim();
    if (s && s !== "undefined" && s !== "null") return s;
  }
  return "";
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

    const visitor = parseNaverReviewCountField(it["visitorReviewCount"]);
    const blog = parseNaverReviewCountField(it["blogCafeReviewCount"]);
    const totalRaw = parseNaverReviewCountField(it["totalReviewCount"]);
    const total =
      typeof totalRaw === "number" && totalRaw > 0
        ? totalRaw
        : visitor + blog;

    return {
      rank: index + 1,
      placeId: String(it["id"] ?? "").trim(),
      name: String(it["name"] ?? "").trim(),
      category: String(it["category"] ?? it["businessCategory"] ?? "").trim(),
      address: String(
        it["roadAddress"] ?? it["address"] ?? it["fullAddress"] ?? ""
      ).trim(),
      imageUrl: pickImageUrl(it),
      review: { visitor, blog, total },
    };
  });
}

function mapRawAllSearchJsonToCheckPlaceRankList(
  rawJson: unknown,
  display: number
): CheckPlaceRankListItem[] {
  const rows = extractPlacesFromAllSearchJson(rawJson);
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return mapAllSearchRowsToCheckPlaceRankList(rows, display);
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
    let usedSource: "browser-allSearch" | "pcmap-graphql" | "allSearch" =
      "pcmap-graphql";
    let autoOk = false;
    let failureCode: AllSearchCheckPlaceFailureCode | null = null;
    let failureMessage: string | null = null;

    // 1) 브라우저에서 직접 가져온 allSearch JSON이 있으면 그걸 최우선 사용
    // 추천형 키워드: 광고/섹션 헤더도 stub으로 위치 보존 → rank 압축 방지
    if (browserAllSearchJson) {
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

    // 2) 추천형 키워드: allSearch 우선
    // 무토큰 + position-preserving 먼저 시도 → 실패 시 token 기반 fallback
    // ※ pcmap-graphql은 일반 업종 순위에 최적화되어 있어 추천형 키워드 순위가 부정확함
    if (fullList.length === 0 && shouldPreferAllSearch) {
      usedSource = "allSearch";

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

      // tokenless 실패 시 → token 기반 allSearch (filtered, stubs 미포함)
      if (fullList.length === 0) {
        fallbackUsed = true;
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

    // 3) pcmap-graphql: 일반 키워드 기본 경로 + 추천형(allSearch 실패 시) 추정 순위 fallback
    if (fullList.length === 0) {
      if (shouldPreferAllSearch) fallbackUsed = true;
      usedSource = "pcmap-graphql";

      try {
        const { batch, mode } = await timedNaverFetch(() =>
          withTimeout(
            fetchBestPcmapBusinessesBatchJson(actualKeyword),
            PCMAP_FETCH_TIMEOUT_MS,
            `[check-place-rank pcmap] timeout ${PCMAP_FETCH_TIMEOUT_MS}ms`
          )
        );

        if (batch) {
          const merged = mergePcmapGraphqlBatch(batch);

          const mapped = mapPcmapItemsToCheckPlaceRankList(
            merged.items,
            SEARCH_CAP
          );

          if (mapped.length > 0) {
            fullList = mapped;

            console.log("[check-place-rank pcmap]", {
              mode,
              mergedCount: merged.items.length,
              parsed: mapped.length,
              gqlErrors: merged.graphqlErrors,
              intentFallbackEstimate: shouldPreferAllSearch,
            });
          }
        }
      } catch (e) {
        console.warn(
          "[check-place-rank pcmap] 실패/timeout -> allSearch fallback",
          e
        );
      }
    }

    // 4) 최종 fallback: 서버 allSearch(auto) — 일반 키워드 pcmap 실패 시
    if (fullList.length === 0 && !shouldPreferAllSearch) {
      fallbackUsed = true;
      usedSource = "allSearch";
      const auto = await timedNaverFetch(() =>
        fetchAllSearchPlacesAutoDetailed(actualKeyword, {
          x,
          y,
        })
      );
      autoOk = auto.ok;
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
    const skipVolume = body.skipVolume === true;

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

    const blockAlertCodes: AllSearchCheckPlaceFailureCode[] = [
      "NCAPTCHA",
      "CE_EMPTY_TOKEN",
    ];
    if (
      failureCode &&
      blockAlertCodes.includes(failureCode) &&
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
