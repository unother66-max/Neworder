import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import {
  type CheckPlaceRankListItem,
  mapAllSearchRowsToCheckPlaceRankList,
} from "@/lib/naver-map-all-search";
import { fetchBestPcmapBusinessesBatchJson } from "@/lib/pcmap-businesses-batch-fetch";
import {
  mergePcmapGraphqlBatch,
  parseNaverReviewCountField,
} from "@/lib/merge-pcmap-businesses-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// place 순위조회: 원래처럼 최대 280위까지 계산/표시
const DISPLAY = 280;
const SEARCH_CAP = 280;

// 🚨 [추가] 네이버 API 차단(429 에러) 방지를 위한 딜레이 함수
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const keyword = String(body.keyword || "").trim();
    const targetName = String(body.targetName || "").trim();

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: "keyword 필요" },
        { status: 400 }
      );
    }

    console.log("[check-place-rank] 시작:", keyword);

    // 1) allSearch는 NCAPTCHA로 자주 막히므로, PC맵 GraphQL(places/businesses)을 먼저 시도
    // 랭크 계산은 넉넉히(SEARCH_CAP) 보고, UI 표시는 DISPLAY만 내려준다.
    let fullList: CheckPlaceRankListItem[] = [];
    let usedSource: "pcmap-graphql" | "allSearch" = "pcmap-graphql";
    try {
      const { batch, mode } = await fetchBestPcmapBusinessesBatchJson(keyword);
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
          });
        }
      }
    } catch (e) {
      console.warn("[check-place-rank pcmap] 실패", e);
    }

    // 2) PC맵이 비었을 때만 allSearch(토큰/Playwright 포함)로 폴백
    let autoOk = false;
    if (fullList.length === 0) {
      usedSource = "allSearch";
      const auto = await fetchAllSearchPlacesAutoDetailed(keyword);
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
    const list = fullList.slice(0, DISPLAY);

    console.log("[check-place-rank 결과]", {
      source: usedSource,
      parsed: fullList.length,
      autoOk,
      rank,
    });

    const relatedCandidates = [keyword, `${keyword} 추천`, `${keyword} 근처`];
    const related = [];

    // 🚨 [수정] for...of 문을 사용해 요청 사이에 딜레이(숨 고르기)를 줍니다.
    for (let i = 0; i < relatedCandidates.length; i++) {
      const k = relatedCandidates[i];
      try {
        const volume = await getKeywordSearchVolume(k);
        related.push({
          keyword: k,
          ...volume,
        });
      } catch (e) {
        console.warn(`[check-place-rank] 키워드 검색량 조회 실패 (${k})`);
        related.push({
          keyword: k,
          total: 0,
          mobile: 0,
          pc: 0,
        });
      }

      // 마지막 키워드가 아니면 0.5초(500ms) 대기 후 다음 요청 진행
      if (i < relatedCandidates.length - 1) {
        await delay(500);
      }
    }

    return NextResponse.json({
      ok: true,
      keyword,
      related,
      list,
      rank,
    });
  } catch (e) {
    console.error("[check-place-rank ERROR]", e);
    return NextResponse.json(
      { ok: false, message: "서버 오류" },
      { status: 500 }
    );
  }
}