import { NextResponse } from "next/server";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import {
  type CheckPlaceRankListItem,
  mapAllSearchRowsToCheckPlaceRankList,
  extractPlacesFromAllSearchJson,
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
const SEARCH_CAP = 600;

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
    const body = await req.json();
const keyword = String(body.keyword || "").trim();
const targetName = String(body.targetName || "").trim();
const browserAllSearchJson = body?.browserAllSearchJson ?? null;

    if (!keyword) {
      return NextResponse.json(
        { ok: false, message: "keyword 필요" },
        { status: 400 }
      );
    }

    console.log("[check-place-rank] 시작:", keyword);

// 1) 브라우저에서 직접 가져온 allSearch JSON이 있으면 그걸 최우선 사용
let fullList: CheckPlaceRankListItem[] = [];
let usedSource: "browser-allSearch" | "pcmap-graphql" | "allSearch" = "pcmap-graphql";

if (browserAllSearchJson) {
  try {
    const browserMapped = mapRawAllSearchJsonToCheckPlaceRankList(
      browserAllSearchJson,
      SEARCH_CAP
    );

    if (browserMapped.length > 0) {
      fullList = browserMapped;
      usedSource = "browser-allSearch";
      console.log("[check-place-rank browser-allSearch]", {
        parsed: browserMapped.length,
      });
    } else {
      console.warn("[check-place-rank browser-allSearch] 파싱 결과 0건");
    }
  } catch (e) {
    console.warn("[check-place-rank browser-allSearch] 실패", e);
  }
}

// 2) 브라우저 allSearch가 없거나 비었으면 기존 pcmap 시도
if (fullList.length === 0) {
  usedSource = "pcmap-graphql";
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
}

// 3) 마지막 fallback: 서버 allSearch(auto)
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

    console.log("==================================================");
console.log(`🔎 [전수조사] 현재 서버가 파싱한 전체 매장 수: ${fullList.length}개`);
console.log(
  "💡 [상위 1~50위]",
  fullList.slice(0, 10).map((row) => `${row.rank}위:${row.name}`)
);
console.log(
  "💡 [전체 이름 검색용]",
  fullList.map((row) => row.name).join(" | ")
);
console.log("==================================================");

    console.log("[check-place-rank 결과]", {
      source: usedSource,
      parsed: fullList.length,
      autoOk,
      rank,
    });

    const relatedCandidates = [keyword, `${keyword} 추천`, `${keyword} 근처`];

    const related = [];

    for (const k of relatedCandidates) {
      try {
        const volume = await getKeywordSearchVolume(k);
        related.push({
          keyword: k,
          ...volume,
        });
      } catch {
        related.push({
          keyword: k,
          total: 0,
          mobile: 0,
          pc: 0,
        });
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
