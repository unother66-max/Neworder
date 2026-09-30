import { NextResponse } from "next/server";

import {
  NAVER_PCMAP_GRAPHQL_URL,
  buildGetPlacesListBatch,
  buildGetPlacesListFetchHeadersForServer,
  pickBusinessesCoords,
} from "@/lib/naver-map-businesses-shared";
import { fetchAllSearchPlacesAutoDetailed } from "@/lib/naver-map-all-search-auto";
import { mergePcmapGraphqlBatch } from "@/lib/merge-pcmap-businesses-batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PlaceCandidate = {
  id: string;
  name: string;
  category: string;
  businessCategory: string;
  roadAddress: string;
  address: string;
  x: string;
  y: string;
  thumUrl: string;
};

type Coords = {
  x: string;
  y: string;
};

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function categoryText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean).join(" > ");
  }
  return text(value);
}

function toCandidate(raw: unknown): PlaceCandidate | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;
  const id = text(item.id);
  const name = text(item.name);

  if (!id || !name) return null;

  return {
    id,
    name,
    category: categoryText(item.category),
    businessCategory: text(item.businessCategory),
    roadAddress: text(item.roadAddress),
    address: text(item.address ?? item.fullAddress),
    x: text(item.x),
    y: text(item.y),
    thumUrl: text(
      item.thumUrl ?? item.imageUrl ?? item.thumbnail ?? item.image
    ),
  };
}

function dedupeCandidates(rows: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set<string>();
  const out: PlaceCandidate[] = [];

  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }

  return out;
}

/**
 * 기존 공용 파일을 수정하지 않고 이 route 안에서만 검색어 기준 지도 중심 좌표를 얻는다.
 * 전국 업체를 서울 한남 좌표로만 검색하던 문제를 피하기 위한 내부 전용 helper.
 */
async function fetchSearchCoords(keyword: string): Promise<Coords | null> {
  try {
    const response = await fetch(
      `https://map.naver.com/p/search/${encodeURIComponent(keyword)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      }
    );

    if (!response.ok) return null;

    const html = await response.text();

    // 현재/과거 네이버 지도 초기 상태에서 흔히 보이는 center: [x, y] 형태.
    const centerMatch = html.match(
      /["']center["']\s*:\s*\[\s*["']?(\d{2,3}\.\d+)["']?\s*,\s*["']?(\d{2}\.\d+)["']?\s*\]/
    );

    if (centerMatch?.[1] && centerMatch?.[2]) {
      return { x: centerMatch[1], y: centerMatch[2] };
    }

    // 일부 빌드에서 좌표가 x/y 객체로 직렬화되는 경우의 보조 패턴.
    const xyMatch = html.match(
      /["']x["']\s*:\s*["']?(\d{2,3}\.\d+)["']?\s*,\s*["']y["']\s*:\s*["']?(\d{2}\.\d+)["']?/
    );

    if (xyMatch?.[1] && xyMatch?.[2]) {
      return { x: xyMatch[1], y: xyMatch[2] };
    }

    return null;
  } catch {
    return null;
  }
}

function buildQueryVariants(keyword: string): string[] {
  const base = keyword.replace(/\s+/g, " ").trim();
  const variants = [base];

  // "직영점/본점/지점" 때문에 검색이 0건이 되는 경우 한 번 더 완화해서 찾는다.
  const withoutBranchSuffix = base
    .replace(/\s+(직영점|본점|지점)$/u, "")
    .trim();

  if (withoutBranchSuffix && withoutBranchSuffix !== base) {
    variants.push(withoutBranchSuffix);
  }

  // 그래도 0건이면 마지막 단어를 한 번만 제거해서 후보를 확보한다.
  // 자동 확정은 프론트에서 원래 상호명과 정확히 일치할 때만 하므로
  // 이 완화 검색 결과가 곧바로 잘못 확정되지는 않는다.
  const words = withoutBranchSuffix.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const shorter = words.slice(0, -1).join(" ").trim();
    if (shorter && !variants.includes(shorter)) variants.push(shorter);
  }

  return variants.slice(0, 3);
}

async function fetchPcmapCandidatesForQuery(
  query: string
): Promise<PlaceCandidate[]> {
  const searchCoords = await fetchSearchCoords(query);
  const coords = searchCoords ?? pickBusinessesCoords(query);

  const batchBody = buildGetPlacesListBatch(query, coords, {
    display: 30,
    start: 1,
  });

  const response = await fetch(NAVER_PCMAP_GRAPHQL_URL, {
    method: "POST",
    headers: buildGetPlacesListFetchHeadersForServer(query, coords),
    body: JSON.stringify(batchBody),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`PCMAP_HTTP_${response.status}`);
  }

  const rawText = await response.text();
  const trimmed = rawText.trimStart();

  if (!trimmed || trimmed.startsWith("<")) {
    throw new Error("PCMAP_NON_JSON");
  }

  let batch: unknown;
  try {
    batch = JSON.parse(rawText);
  } catch {
    throw new Error("PCMAP_JSON_PARSE");
  }

  const merged = mergePcmapGraphqlBatch(batch);

  return dedupeCandidates(
    merged.items
      .map(toCandidate)
      .filter((row): row is PlaceCandidate => Boolean(row))
  ).slice(0, 10);
}

async function fetchPcmapCandidates(
  keyword: string
): Promise<PlaceCandidate[]> {
  const merged: PlaceCandidate[] = [];

  for (const query of buildQueryVariants(keyword)) {
    try {
      const places = await fetchPcmapCandidatesForQuery(query);
      merged.push(...places);

      // 정확 검색에서 충분한 후보가 잡히면 추가 완화 검색은 하지 않는다.
      if (places.length >= 3) break;
    } catch (error) {
      console.warn("[neworder/place-id] pcmap query 실패", {
        keyword,
        query,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return dedupeCandidates(merged).slice(0, 10);
}

async function fetchAutoAllSearchCandidates(
  keyword: string
): Promise<{
  places: PlaceCandidate[];
  failureCode?: string;
}> {
  // 마지막 fallback. 기본 좌표는 기존 코드 그대로 두되, 여기까지 오는 경우는
  // pcmap + 완화검색까지 모두 후보를 못 찾았을 때뿐이다.
  const coords = pickBusinessesCoords(keyword);
  const result = await fetchAllSearchPlacesAutoDetailed(keyword, coords);

  if (!result.ok) {
    return {
      places: [],
      failureCode: result.failureCode,
    };
  }

  const places = result.places
    .map((row) =>
      toCandidate({
        ...row,
        imageUrl: row.thumUrl,
      })
    )
    .filter((row): row is PlaceCandidate => Boolean(row));

  return {
    places: dedupeCandidates(places).slice(0, 10),
  };
}

export async function POST(request: Request) {
  let keyword = "";

  try {
    const body = (await request.json()) as { keyword?: unknown };
    keyword = text(body.keyword);

    if (!keyword) {
      return NextResponse.json(
        { ok: false, code: "KEYWORD_EMPTY", message: "검색어가 비어 있습니다." },
        { status: 400 }
      );
    }

    // 1순위: 검색어 위치 중심 pcmap + 최대 2회 완화 검색
    const pcmapPlaces = await fetchPcmapCandidates(keyword);

    if (pcmapPlaces.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "pcmap",
        places: pcmapPlaces,
        totalCount: pcmapPlaces.length,
      });
    }

    // 2순위: 기존 PostLabs 자동 allSearch
    const auto = await fetchAutoAllSearchCandidates(keyword);

    if (auto.places.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "allSearch-auto",
        places: auto.places,
        totalCount: auto.places.length,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        code: auto.failureCode || "NAVER_SEARCH_UNAVAILABLE",
        message:
          "검색 결과를 찾지 못했거나 네이버 지도 조회가 일시적으로 제한되었습니다.",
      },
      { status: 502 }
    );
  } catch (error) {
    console.error("[neworder/place-id] 조회 실패", {
      keyword,
      reason: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        ok: false,
        code: "LOOKUP_FAILED",
        message: "플레이스 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
