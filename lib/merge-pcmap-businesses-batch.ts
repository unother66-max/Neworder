/**
 * map.naver.com → pcmap-api.place.naver.com GraphQL 배치 응답 병합.
 * @see DevTools Network graphql — businesses(오가닉) + adBusinesses(광고)
 */

export function parseNaverReviewCountField(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v))
    return Math.max(0, Math.floor(v));
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** GraphQL errors[].message — string일 때만 trim 등 문자열 연산 (내부 charAt 등 안전) */
function toTrimmedGraphqlErrorMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function collectBatchErrors(batch: unknown[]): string[] {
  const out: string[] = [];
  for (const item of batch) {
    if (item == null || typeof item !== "object") continue;

    const rawErrors = (item as { errors?: unknown }).errors;
    if (rawErrors === undefined || rawErrors === null) continue;

    if (!Array.isArray(rawErrors)) {
      console.log("[mergePcmapGraphqlBatch] invalid error item", item);
      continue;
    }

    for (const err of rawErrors) {
      if (err == null || typeof err !== "object") {
        console.log("[mergePcmapGraphqlBatch] invalid error item", item);
        continue;
      }

      const msgRaw = (err as { message?: unknown }).message;
      if (typeof msgRaw !== "string") {
        console.log("[mergePcmapGraphqlBatch] invalid error item", item);
        continue;
      }

      const msg = toTrimmedGraphqlErrorMessage(msgRaw);
      if (!msg) continue;
      // 네이버 PC맵 GraphQL 일부 응답에 포함되는 서버측 메시지(우리 스택 아님) — Vercel 로그·gqlErrors 노이즈만 줄임
      if (
        msg.includes("Cannot read properties of undefined") &&
        msg.includes("charAt")
      ) {
        continue;
      }
      out.push(msg);
    }
  }
  return out;
}

/** map.naver 왼쪽 목록은 DevTools 기준 `places` 우선 — 없을 때만 `businesses` */



export type MergePcmapBatchResult = {
  items: unknown[];
  total: number;
  graphqlErrors: string[];
};

/**
 * 광고(adBusinesses)를 모은 뒤 오가닉(places·businesses)을 이어 붙임.
 * 동일 place id가 양쪽에 있으면 광고 행만 유지(오가닉에서 제거).
 */
export function mergePcmapGraphqlBatch(batch: unknown): MergePcmapBatchResult {
  if (!Array.isArray(batch) || batch.length === 0) {
    return { items: [], total: 0, graphqlErrors: [] };
  }

  const gqlErrors = collectBatchErrors(batch);
  const adItems: unknown[] = [];
  const organicChunks: unknown[] = [];
  let organicTotal = 0;
  let adTotal = 0;
  const adSeenIds = new Set<string>();

  for (const part of batch) {
    const data = (part as { data?: Record<string, unknown> })?.data;
    if (!data || typeof data !== "object") continue;

    const adRoot = data.adBusinesses as
      | { total?: number; items?: unknown[] }
      | undefined;
    if (adRoot && typeof adRoot === "object" && Array.isArray(adRoot.items)) {
      adTotal = Math.max(adTotal, Number(adRoot.total || 0));
      for (const it of adRoot.items) {
        const row = it as { id?: string; adId?: string };
        const id = String(row?.id ?? "").trim();
        if (!id || adSeenIds.has(id)) continue;
        adSeenIds.add(id);
        adItems.push({
          ...(it as Record<string, unknown>),
          isPromotedAd: true,
          adId: String(row?.adId ?? "").trim() || undefined,
        });
      }
    }

    const roots = [
      data.places as { total?: number; items?: unknown[] } | undefined,
      data.businesses as { total?: number; items?: unknown[] } | undefined,
    ];
    
    for (const root of roots) {
      if (!root || !Array.isArray(root.items)) continue;
    
      organicTotal = Math.max(
        organicTotal,
        Number(root.total || 0)
      );
    
      for (const it of root.items) {
        organicChunks.push(it);
      }
    }
  }

  const organicSeen = new Set<string>();
  const organicDeduped: unknown[] = [];
  for (const it of organicChunks) {
    const row = it as { id?: string };
    const id = String(row?.id ?? "").trim();
    if (id) {
      if (organicSeen.has(id)) continue;
      organicSeen.add(id);
    }
    organicDeduped.push(it);
  }

  const organicFiltered = organicDeduped.filter((it) => {
    const row = it as { id?: string };
    const id = String(row?.id ?? "").trim();
    return !id || !adSeenIds.has(id);
  });

  const items = [...adItems, ...organicFiltered];
  const total = Math.max(organicTotal, adTotal, items.length);

  const graphqlErrors = gqlErrors.filter(
    (m) => typeof m === "string" && toTrimmedGraphqlErrorMessage(m).length > 0
  );

  return { items, total, graphqlErrors };
}
