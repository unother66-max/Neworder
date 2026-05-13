/**
 * 일 단위로 압축된 히스토리 포인트에서 최근 흐름을 짧은 문장으로 요약합니다.
 */

import type { BlogAnalysisHistoryPoint } from "@/lib/blog-analysis-types";

function finiteNum(v: number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export type BlogHistoryTrend = {
  /** 상단 핵심 카드용 짧은 라벨 */
  compactLabel: string;
  /** 히스토리 블록 아래 해설 */
  narrative: string;
};

const SCORE_EPS = 1;
const KW_EPS = 0.51;
const RANK_EPS = 2;

/**
 * 최근 포인트들(시간 오름차순)을 보고 흐름을 판단합니다.
 */
export function analyzeBlogHistoryTrend(points: BlogAnalysisHistoryPoint[]): BlogHistoryTrend {
  if (points.length < 2) {
    return {
      compactLabel: "기록 부족",
      narrative: "비교할 만큼 쌓인 분석 기록이 아직 없어요. 며칠 간격으로 다시 보면 흐름이 보일 거예요.",
    };
  }

  const slice = points.slice(-4);
  const first = slice[0];
  const last = slice[slice.length - 1];

  const s0 = finiteNum(first.totalScore);
  const s1 = finiteNum(last.totalScore);
  const k0 = finiteNum(first.validKeywordCount);
  const k1 = finiteNum(last.validKeywordCount);
  const tr0 = finiteNum(first.totalRank);
  const tr1 = finiteNum(last.totalRank);
  const pk0 = finiteNum(first.topicRank);
  const pk1 = finiteNum(last.topicRank);

  const dScore = s0 !== undefined && s1 !== undefined ? s1 - s0 : 0;
  const dKw = k0 !== undefined && k1 !== undefined ? k1 - k0 : 0;
  const dTotalRank = tr0 !== undefined && tr1 !== undefined ? tr1 - tr0 : 0;
  const dTopicRank = pk0 !== undefined && pk1 !== undefined ? pk1 - pk0 : 0;

  const scoreFlat = s0 !== undefined && s1 !== undefined && Math.abs(dScore) < SCORE_EPS;
  const kwFlat = k0 !== undefined && k1 !== undefined && Math.abs(dKw) < KW_EPS;
  const rankFlat =
    (tr0 === undefined || tr1 === undefined || Math.abs(dTotalRank) < RANK_EPS) &&
    (pk0 === undefined || pk1 === undefined || Math.abs(dTopicRank) < RANK_EPS);

  if (scoreFlat && kwFlat && rankFlat) {
    return {
      compactLabel: "큰 변화 없음",
      narrative:
        "최근 기록만 보면 점수·키워드·순위 모두 크게 움직이진 않았어요. 트렌드를 보려면 조금 더 간격을 두고 모아 보는 게 좋아요.",
    };
  }

  const parts: string[] = [];

  if (s0 !== undefined && s1 !== undefined && Math.abs(dScore) >= SCORE_EPS) {
    if (dScore > 0) parts.push(`영향력 점수는 최근 구간에서 약 ${dScore.toFixed(1)}점 올랐어요.`);
    else parts.push(`영향력 점수는 최근 구간에서 약 ${Math.abs(dScore).toFixed(1)}점 내려갔어요.`);
  }

  if (k0 !== undefined && k1 !== undefined && Math.abs(dKw) >= KW_EPS) {
    const rounded = Math.round(dKw);
    if (rounded > 0) parts.push(`유효 키워드는 +${rounded}개 늘었어요.`);
    else parts.push(`유효 키워드는 ${rounded}개 줄었어요.`);
  }

  if (tr0 !== undefined && tr1 !== undefined && Math.abs(dTotalRank) >= RANK_EPS) {
    if (dTotalRank < 0) parts.push(`전체 순위는 숫자 기준으로 ${Math.abs(Math.round(dTotalRank))}계단 정도 좋아진 모습이에요.`);
    else parts.push(`전체 순위는 숫자가 ${Math.round(dTotalRank)}만큼 뒤로 밀린 구간이에요.`);
  } else if (tr0 !== undefined && tr1 !== undefined) {
    parts.push("전체 순위는 거의 비슷하게 유지됐어요.");
  }

  if (pk0 !== undefined && pk1 !== undefined && Math.abs(dTopicRank) >= RANK_EPS) {
    if (dTopicRank < 0) parts.push(`주제 순위도 한결 가까워졌어요.`);
    else if (dTopicRank > 0) parts.push(`주제 순위는 조금 밀린 편이에요.`);
  } else if (pk0 !== undefined && pk1 !== undefined) {
    parts.push("주제 순위는 큰 출렁임 없이 이어졌어요.");
  }

  let compactLabel = "혼합";
  if (dScore > SCORE_EPS && (tr1 === undefined || tr0 === undefined || dTotalRank <= 0)) {
    compactLabel = "점수 상승";
  } else if (dScore < -SCORE_EPS) {
    compactLabel = "점수 조정";
  } else if (dTotalRank < -RANK_EPS || dTopicRank < -RANK_EPS) {
    compactLabel = "순위 개선";
  } else if (dTotalRank > RANK_EPS || dTopicRank > RANK_EPS) {
    compactLabel = "순위 밀림";
  } else if (dKw > KW_EPS) {
    compactLabel = "키워드 증가";
  } else if (dKw < -KW_EPS) {
    compactLabel = "키워드 감소";
  } else if (scoreFlat && kwFlat && !rankFlat) {
    compactLabel = "순위 위주 변동";
  }

  const narrative = parts.length > 0 ? parts.join(" ") : "최근 구간에서 일부 지표만 조금 움직였어요.";

  return { compactLabel, narrative };
}
