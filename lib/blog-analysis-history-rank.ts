/**
 * BlogAnalysisHistory 레코드 목록에서 blogId별 최신 1건·서비스 내 순위 계산 (로컬 규칙).
 */

export type BlogAnalysisRankSlice = {
  blogId: string;
  totalScore: number | null;
  visitorCount: number | null;
  analyzedAt: Date;
  blogTopic: string | null;
};

function scoreForSort(t: number | null | undefined): number {
  if (t === null || t === undefined) return Number.NEGATIVE_INFINITY;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

function visitorForSort(v: number | null | undefined): number {
  if (v === null || v === undefined) return Number.NEGATIVE_INFINITY;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
}

/** analyzedAt 내림차순으로 조회된 행에서 blogId별 첫 행만 남김(=최신). */
export function pickLatestHistoryPerBlogId<T extends { blogId: string }>(
  rowsOrderedByAnalyzedAtDesc: T[]
): T[] {
  const map = new Map<string, T>();
  for (const r of rowsOrderedByAnalyzedAtDesc) {
    if (!map.has(r.blogId)) map.set(r.blogId, r);
  }
  return [...map.values()];
}

/** totalScore desc → 동점 시 analyzedAt 최신 → visitorCount 높은 순 */
export function sortBlogAnalysisSnapshotsForRank<T extends BlogAnalysisRankSlice>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const ds = scoreForSort(b.totalScore) - scoreForSort(a.totalScore);
    if (ds !== 0) return ds;
    const dt = b.analyzedAt.getTime() - a.analyzedAt.getTime();
    if (dt !== 0) return dt;
    return visitorForSort(b.visitorCount) - visitorForSort(a.visitorCount);
  });
}

export function rankPlace1Based<T extends { blogId: string }>(
  sorted: T[],
  blogId: string
): number | null {
  const i = sorted.findIndex((r) => r.blogId === blogId);
  return i === -1 ? null : i + 1;
}

/** 주제 순위는 주제가 있고 '기타'가 아닐 때만 계산 */
export function isTopicRankingEligible(topic: string | null | undefined): topic is string {
  const t = String(topic ?? "").trim();
  return t.length > 0 && t !== "기타";
}
