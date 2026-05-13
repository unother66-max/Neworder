/**
 * GPT 없이, 현재 산출된 점수·패턴·주제 평균만으로 짧은 해석 문구를 만듭니다.
 */

import type { BlogPostPatternAnalysis, BlogTopicAverageComparison } from "@/lib/blog-analysis-types";
import type { BlogScoreResult } from "@/lib/blog-score";

export type BlogAnalysisSummaryInput = {
  blogScore: BlogScoreResult;
  validKeywordCount: number | null;
  patternAnalysis: BlogPostPatternAnalysis | null;
  topicAverageComparison: BlogTopicAverageComparison | null;
};

function finite(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

/**
 * 2~4줄, 중복·과장을 피한 짧은 문장들
 */
export function buildBlogAnalysisSummary(input: BlogAnalysisSummaryInput): string[] {
  const { blogScore, validKeywordCount, patternAnalysis, topicAverageComparison } = input;
  const { totalScore, keywordInfluenceScore, contentInfluenceScore, influenceScore, grade, level } = blogScore;

  const lines: string[] = [];
  const vk = finite(validKeywordCount);

  const myTopic = finite(topicAverageComparison?.myTotalScore);
  const avgTopic = finite(topicAverageComparison?.averageTotalScore);
  if (myTopic !== null && avgTopic !== null) {
    const diff = myTopic - avgTopic;
    if (diff >= 5) {
      lines.push("같은 추정 주제 안에서 보면, 종합 점수는 동료 평균보다 한 편 높은 편이에요.");
    } else if (diff <= -5) {
      lines.push("같은 추정 주제 평균과 비교하면, 종합 점수는 아직 여유가 있어 보여요.");
    } else {
      lines.push("같은 주제 묶음 안에서는 점수가 평균과 비슷한 구간에 가까워요.");
    }
  }

  if (keywordInfluenceScore >= 62 && contentInfluenceScore <= 48) {
    lines.push("검색·키워드 쪽 신호가 더 드러나고, 글감·활동 리듬은 조금 더 챙기면 좋겠어요.");
  } else if (contentInfluenceScore >= 58 && keywordInfluenceScore <= 45) {
    lines.push("포스팅 리듬·분량은 괜찮은 편인데, 잡히는 유효 키워드를 넓혀 볼 여지가 있어요.");
  } else if (keywordInfluenceScore >= 55 && contentInfluenceScore >= 55) {
    lines.push("키워드와 콘텐츠 양쪽이 한쪽으로 치우치지 않고 묶여 있어요.");
  }

  if (vk !== null) {
    if (vk >= 8) {
      lines.push("검색량 있는 키워드가 제목에 여럿 잡혀 있어요.");
    } else if (vk <= 2) {
      lines.push("당장은 유효 키워드가 많지 않아서, 제목·주제를 조금 더 정리해 보면 도움이 될 수 있어요.");
    }
  }

  if (patternAnalysis) {
    const ts = finite(patternAnalysis.titleLengthScore) ?? 0;
    const cs = finite(patternAnalysis.contentLengthScore) ?? 0;
    const ims = finite(patternAnalysis.imageCountScore) ?? 0;
    const weak = Math.min(ts, cs, ims);
    const strong = Math.max(ts, cs, ims);
    if (strong >= 65 && weak <= 38) {
      lines.push("최근 글 패턴은 잘 나가는 한 가지와, 손보면 좋을 한 가지가 같이 보여요.");
    } else if (ts >= 60 && cs >= 55) {
      lines.push("제목·본문 길이 패턴은 무난한 편에 가깝게 맞춰져 있어요.");
    } else if (ims >= 60 && ts < 45) {
      lines.push("이미지 구성은 나쁘지 않은데, 제목 길이·구성은 조금만 다듬어 볼 만해요.");
    }
  }

  if (grade === "S" || grade === "A") {
    if (level <= 5 && lines.length < 4) {
      lines.push("등급은 높은데 레벨은 아직 오르는 중이라, 기록이 쌓이면 더 선명해질 수 있어요.");
    }
  }

  if (lines.length < 2) {
    if (influenceScore >= 60) {
      lines.push("지금 기준으로는 전반적인 영향력 지표가 무난한 편이에요.");
    } else {
      lines.push("지금은 점수가 한 번에 튀기보다, 꾸준히 쌓이는 타입에 가까워 보여요.");
    }
    const tsSafe = finite(totalScore);
    if (tsSafe !== null && lines.length < 4) {
      lines.push(`Lv.${level}·등급 ${grade}, 종합 ${tsSafe.toFixed(1)}점 구간이에요.`);
    }
  }

  const seen = new Set<string>();
  const unique = lines.filter((l) => {
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });

  return unique.slice(0, 4);
}
