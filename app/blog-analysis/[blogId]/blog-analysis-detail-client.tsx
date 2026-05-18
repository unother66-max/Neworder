"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, KeyRound, FileText, Type, AlignLeft, ImageIcon, Video, MessageCircle, Heart, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import TopNav from "@/components/top-nav";
import { GlobalLoading } from "@/components/global-loading";
import { HistoryTabChartCard, VisitorMetricsChartCard } from "@/components/blog-analysis-detail-mini-charts";
import type {
  BlogAnalysisPerformanceMeta,
  BlogAnalysisRecentPost,
  BlogAnalysisResult,
  BlogAnalysisHistoryPoint,
  BlogKeywordInsight,
  BlogValidKeyword,
  BlogPostPatternAnalysis,
  BlogTopicAverageComparison,
  BlogVisitorChartPoint,
} from "@/lib/blog-analysis-types";
import { analyzeBlogHistoryTrend } from "@/lib/blog-analysis-history-trend";
import { buildBlogAnalysisSummary } from "@/lib/blog-analysis-summary";
import { computeBlogKeywordInsights } from "@/lib/blog-keyword-insight";
import { computeRepresentativeValidKeywords } from "@/lib/blog-representative-keywords";
import { computeBlogScore, type BlogScoreResult } from "@/lib/blog-score";
import { extractBlogId, isValidNaverBlogId } from "@/lib/scraper";

function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function firstFiniteNumber(...values: Array<number | string | null | undefined>): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatPostMetric(value: number | string | null | undefined, suffix = ""): string {
  const n = firstFiniteNumber(value);
  if (n === null) return "-";
  return `${Math.round(n).toLocaleString()}${suffix}`;
}

function formatPercentMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return `${Number(value).toFixed(2)}%`;
}

function estimateDailyViewsFromPost(post: BlogAnalysisRecentPost): number | null {
  const direct = firstFiniteNumber(
    (post as RecentPostWithTrafficFields).dailyViewCount,
    (post as RecentPostWithTrafficFields).averageDailyViewCount,
    (post as RecentPostWithTrafficFields).avgDailyViewCount,
    (post as RecentPostWithTrafficFields).viewCount,
    (post as RecentPostWithTrafficFields).views
  );
  if (direct !== null) return Math.max(0, Math.round(direct));

  const comments = firstFiniteNumber(post.commentCount) ?? 0;
  const hearts = firstFiniteNumber(post.sympathyCount, post.likeCount) ?? 0;
  const shares = firstFiniteNumber(post.shareCount) ?? 0;
  const words = firstFiniteNumber(post.wordCount) ?? 0;
  const images = firstFiniteNumber(post.imageCount) ?? 0;
  const signal =
    comments * 4 +
    hearts * 2 +
    shares * 5 +
    Math.min(words / 220, 10) +
    Math.min(images / 4, 8);

  if (signal <= 0) return null;
  return Math.max(1, Math.round(signal));
}

function formatPostLevel(value: BlogAnalysisRecentPost["postLevel"]): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (Number.isFinite(n)) return `Lv.${Math.round(n)}`;
  return String(value);
}

type RecentPostWithTrafficFields = BlogAnalysisRecentPost & {
  viewCount?: number | null;
  views?: number | null;
  dailyViewCount?: number | null;
  averageDailyViewCount?: number | null;
  avgDailyViewCount?: number | null;
  trafficRatio?: number | null;
  inflowRatio?: number | null;
};

type PopularPostRow = BlogAnalysisRecentPost & {
  averageDailyViews: number | null;
  trafficRatio: number | null;
  popularSortScore: number;
};

function formatExposureStatus(post: BlogAnalysisRecentPost): string {
  const rawStatus = String(post.exposureStatus ?? "").trim();
  if (rawStatus) {
    const normalized = rawStatus.toLowerCase();
    if (["pending", "waiting", "반영 대기", "반영대기", "반영 대기중"].includes(normalized)) return "반영 대기중";
    if (["delayed", "delay", "노출 지연", "노출지연"].includes(normalized)) return "노출 지연";
    if (normalized === "analyzed") return "분석됨";
    if (["found", "exposed", "visible", "normal", "true", "정상 노출", "정상노출"].includes(normalized)) return "정상 노출";
    if (["missing", "omitted", "not_found", "hidden", "none", "false", "누락", "노출 누락", "노출누락"].includes(normalized)) return "노출 누락";
    return rawStatus;
  }

  if (post.foundOnSearch === true) return "정상 노출";
  if (post.foundOnSearch === false) return "노출 누락";
  return "-";
}

function exposureStatusClass(label: string): string {
  if (label === "정상 노출") return "bg-emerald-50 text-emerald-700";
  if (label === "노출 누락") return "bg-rose-50 text-rose-600";
  if (label === "노출 지연") return "bg-amber-50 text-amber-700";
  if (label === "반영 대기중") return "bg-indigo-50 text-indigo-700";
  if (label === "-") return "bg-slate-50 text-slate-400";
  return "bg-sky-50 text-sky-700";
}

function postScoreClass(score: number | null): string {
  if (score === null) return "text-slate-500";
  if (score >= 80) return "text-[#2563EB]";
  if (score >= 60) return "text-green-600";
  if (score >= 40) return "text-orange-500";
  return "text-rose-500";
}

function getPostPotentialScore(post: BlogAnalysisRecentPost, keywords: BlogValidKeyword[]): number | null {
  const realScore = firstFiniteNumber(post.potentialScore, post.postScore, post.score);
  if (realScore !== null) return clampPct(realScore);

  const title = String(post.title ?? "").trim();
  const wordCount = firstFiniteNumber(post.wordCount);
  const imageCount = firstFiniteNumber(post.imageCount);
  const commentCount = firstFiniteNumber(post.commentCount);
  const sympathyCount = firstFiniteNumber(post.sympathyCount, post.likeCount);
  const hasKeywordMatch = keywords.some((row) => {
    const keyword = String(row.keyword ?? "").trim();
    return keyword.length > 0 && title.includes(keyword);
  });
  const hasMeasuredSignal =
    wordCount !== null || imageCount !== null || commentCount !== null || sympathyCount !== null || hasKeywordMatch;

  if (!hasMeasuredSignal) return null;

  let score = 0;
  if (title) score += 20;
  if (wordCount !== null && wordCount >= 800) score += 20;
  if (imageCount !== null && imageCount >= 5) score += 20;
  if ((commentCount !== null && commentCount > 0) || (sympathyCount !== null && sympathyCount > 0)) score += 10;
  if (hasKeywordMatch) score += 20;

  return clampPct(score);
}

function formatVolumeCell(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return Math.round(n).toLocaleString("ko-KR");
}

function keywordInfluenceScoreClass(score: number): string {
  if (!Number.isFinite(score)) return "text-gray-600";
  if (score >= 80) return "text-red-600";
  if (score >= 60) return "text-orange-500";
  return "text-gray-600";
}

function formatKeywordScoreCell(score: number | null | undefined): string {
  if (score === null || score === undefined) return "-";
  const n = Number(score);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n)}`;
}

function formatExposureType(type: string | null | undefined): string {
  const value = String(type ?? "").trim().toLowerCase();
  if (value === "blog" || value === "view" || value === "popular") return "인기글";
  if (value === "integrated") return "통합검색";
  if (value === "smartblock") return "스마트블록";
  if (value === "none") return "-";
  return type ? String(type) : "-";
}

function getKeywordExposureLabel(row: BlogValidKeyword): string {
  if (row.integratedSearchBlock || row.integratedSearchRank != null) return "통합검색";
  if (firstFiniteNumber(row.smartBlockCount) != null && Number(row.smartBlockCount) > 0) return "스마트블록";
  const blogRank = firstFiniteNumber(row.blogRank);
  if (blogRank != null && blogRank >= 1 && blogRank <= 10) return "인기글";
  return formatExposureType(row.exposureType);
}

function formatSmartBlockCount(value: number | null | undefined): string {
  const n = firstFiniteNumber(value);
  if (n === null || n <= 0) return "-";
  return `${Math.round(n).toLocaleString("ko-KR")}개`;
}

function isDisplayValidKeyword(row: BlogValidKeyword): boolean {
  const status = row.keywordValidationStatus;
  if (status === "valid") return true;
  if (status != null) return false;
  const volume = firstFiniteNumber(row.monthlySearchVolume, row.totalVolume);
  const blogRank = firstFiniteNumber(row.blogRank);
  const smartBlockCount = firstFiniteNumber(row.smartBlockCount);
  return (
    volume !== null &&
    volume > 0 &&
    ((blogRank !== null && blogRank >= 1 && blogRank <= 10) ||
      row.integratedSearchBlock != null ||
      row.integratedSearchRank != null ||
      (smartBlockCount !== null && smartBlockCount > 0))
  );
}

function formatSaturation(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n).toLocaleString()}%`;
}

function competitionLevelClass(level: BlogKeywordInsight["competitionLevel"] | null | undefined): string {
  if (level === "낮음") return "text-green-600 font-bold";
  if (level === "보통") return "text-orange-500 font-bold";
  if (level === "높음") return "text-red-600 font-bold";
  return "text-gray-600";
}

function formatRankDisplay(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "-";
  const n = Number(rank);
  if (!Number.isFinite(n) || n < 1) return "-";
  return `${Math.floor(n).toLocaleString()}위`;
}

function formatAnalyzedAt(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function clampPct(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

function tierCaption(score: number): { label: string; className: string } {
  const s = clampPct(score);
  if (s >= 80) return { label: "우수", className: "text-[#2563EB]" };
  if (s >= 60) return { label: "양호", className: "text-green-600" };
  if (s >= 40) return { label: "평균", className: "text-orange-500" };
  return { label: "평균 이하", className: "text-red-500" };
}

function patternTierCaption(score: number): { label: string; className: string } {
  const s = clampPct(score);
  if (s >= 75) return { label: "매우 우수", className: "text-[#2563EB]" };
  if (s >= 50) return { label: "우수", className: "text-green-600" };
  if (s >= 25) return { label: "평균", className: "text-orange-500" };
  return { label: "평균 이하", className: "text-red-500" };
}

function formatRoundedNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return Math.round(x).toLocaleString("ko-KR");
}

function formatAvgTitleChars(n: number | null | undefined): string {
  const s = formatRoundedNumber(n);
  return s === "-" ? "-" : `${s}자`;
}

function formatAvgBodyChars(n: number | null | undefined): string {
  const s = formatRoundedNumber(n);
  return s === "-" ? "-" : `${s}자`;
}

function formatAvgImages(n: number | null | undefined): string {
  const s = formatRoundedNumber(n);
  return s === "-" ? "-" : `${s}개`;
}

/** 주제 평균 유효 키워드 수만 알 때 대략적인 동료 키워드 영향력(0~100) */
function estimatePeerKeywordInfluence(avgVk: number | null | undefined): number | null {
  if (avgVk == null || !Number.isFinite(Number(avgVk))) return null;
  const vk = Math.max(0, Number(avgVk));
  const partK = Math.min(1, vk / 100) * 60;
  const filler = 22;
  return Math.min(100, Math.round((partK + filler) * 100) / 100);
}

/** 주제 평균 작성 빈도만 알 때 대략적인 동료 콘텐츠 영향력(0~100) */
function estimatePeerContentInfluence(avgFreq: number | null | undefined): number | null {
  if (avgFreq == null || !Number.isFinite(Number(avgFreq))) return null;
  const f = Math.max(0, Number(avgFreq));
  const partF = Math.min(1, f / 1) * 35;
  const filler = 28;
  return Math.min(100, Math.round((partF + filler) * 100) / 100);
}

function roughTitleScoreFromPeerChars(chars: number | null | undefined): number | null {
  if (chars == null || !Number.isFinite(Number(chars))) return null;
  const c = Number(chars);
  if (c < 8) return 38;
  if (c <= 20) return 72;
  if (c <= 32) return 58;
  return 46;
}

function roughContentScoreFromPeerChars(chars: number | null | undefined): number | null {
  if (chars == null || !Number.isFinite(Number(chars))) return null;
  const c = Number(chars);
  if (c < 400) return 40;
  if (c <= 2000) return 68;
  if (c <= 4000) return 62;
  return 55;
}

function roughImageScoreFromPeerCount(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const x = Number(n);
  if (x < 1) return 36;
  if (x <= 4) return 70;
  if (x <= 8) return 58;
  return 48;
}

// ─── Premium UI helpers ────────────────────────────────────────────────────

type TierStyle = { color: string; bg: string; dot: string; gradient: string };

function getTierStyle(label: string): TierStyle {
  if (label === "매우 우수")
    return {
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      dot: "bg-indigo-500",
      gradient: "bg-gradient-to-r from-indigo-500 to-cyan-400",
    };
  if (label === "우수")
    return {
      color: "text-cyan-700",
      bg: "bg-cyan-50",
      dot: "bg-cyan-500",
      gradient: "bg-gradient-to-r from-cyan-500 to-teal-400",
    };
  if (label === "양호")
    return {
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      dot: "bg-emerald-500",
      gradient: "bg-gradient-to-r from-emerald-400 to-teal-500",
    };
  if (label === "평균")
    return {
      color: "text-amber-700",
      bg: "bg-amber-50",
      dot: "bg-amber-500",
      gradient: "bg-gradient-to-r from-amber-400 to-orange-400",
    };
  return {
    color: "text-rose-600",
    bg: "bg-rose-50",
    dot: "bg-rose-500",
    gradient: "bg-gradient-to-r from-rose-400 to-pink-500",
  };
}

function PremiumStatCol({
  name,
  tier,
  delay = 0,
}: {
  name: string;
  tier: { label: string; className: string };
  delay?: number;
}) {
  const s = getTierStyle(tier.label);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className="flex flex-col items-center justify-center text-center px-2 sm:px-3 py-3 sm:py-4 border-r border-slate-100 last:border-r-0 flex-1 min-w-0 select-none"
    >
      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 tracking-wide uppercase mb-2 leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
        {name}
      </p>
      <span
        className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.dot}`} />
        {tier.label}
      </span>
    </motion.div>
  );
}

function PremiumCompareBar({
  Icon,
  title,
  peerLabel,
  peerText,
  peerPct,
  myLabel,
  myText,
  myPct,
  tierLabel,
  delay = 0,
}: {
  Icon: LucideIcon;
  title: string;
  peerLabel: string;
  peerText: string;
  peerPct: number | null;
  myLabel: string;
  myText: string;
  myPct: number | null;
  tierLabel: string;
  delay?: number;
}) {
  const s = getTierStyle(tierLabel);
  const pp = peerPct != null && Number.isFinite(peerPct) ? clampPct(peerPct) : null;
  const mp = myPct != null && Number.isFinite(myPct) ? clampPct(myPct) : null;
  const hasPeerBar = peerText !== "-" && pp != null;
  const hasMyBar = myText !== "-" && mp != null;
  const peerW = hasPeerBar && pp != null ? Math.max(pp, 6) : 0;
  const myW = hasMyBar && mp != null ? Math.max(mp, 6) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className="py-3 border-b border-slate-100/70 last:border-0 flex gap-3 min-w-0"
    >
      <div className="shrink-0 mt-0.5">
        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200/60 flex items-center justify-center">
          <Icon size={13} className="text-slate-600" strokeWidth={2} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-slate-700 mb-2 tracking-tight leading-none">{title}</p>
        <div className="space-y-2">
          <div>
            <div className="flex items-baseline justify-between mb-[3px]">
              <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{peerLabel}</span>
              <span className="text-[10px] font-semibold text-slate-500 tabular-nums">{hasPeerBar ? peerText : "—"}</span>
            </div>
            <div className="h-[7px] rounded-full bg-slate-100 overflow-hidden">
              {hasPeerBar && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${peerW}%` }}
                  transition={{ duration: 0.7, ease: "easeOut", delay: delay + 0.1 }}
                  className="h-full rounded-full bg-slate-300/90 backdrop-blur-[1px]"
                  style={{ maxWidth: "100%" }}
                />
              )}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-[3px]">
              <span className="text-[9px] font-medium text-slate-400 uppercase tracking-widest">{myLabel}</span>
              <span className="text-[10px] font-bold text-slate-800 tabular-nums tracking-tight">{hasMyBar ? myText : "—"}</span>
            </div>
            <div className="h-[7px] rounded-full bg-slate-100 overflow-hidden">
              {hasMyBar && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${myW}%` }}
                  transition={{ duration: 0.85, ease: "easeOut", delay: delay + 0.25 }}
                  className={`h-full rounded-full ${s.gradient}`}
                  style={{ maxWidth: "100%", boxShadow: "0 0 6px rgba(0,0,0,0.08)" }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function finiteOrNull(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function proportionalPatternWidths(peerValue: number | null | undefined, myValue: number | null | undefined) {
  const peer = finiteOrNull(peerValue);
  const mine = finiteOrNull(myValue);
  const maxValue = Math.max(peer ?? 0, mine ?? 0, 1);
  const toWidth = (value: number | null) => {
    if (value == null || value <= 0) return null;
    return Math.max(6, Math.round((value / maxValue) * 100));
  };
  return {
    peerPct: toWidth(peer),
    myPct: toWidth(mine),
  };
}

function influencePeerSentence(metricLabel: string, my: number, peer: number | null): string {
  if (peer == null) return "비교 데이터가 부족해요.";
  const d = my - peer;
  if (Math.abs(d) < 0.05) return `${metricLabel}이(가) 주제 평균과 비슷해요.`;
  if (d < 0) return `${metricLabel}이(가) 주제 평균 대비 ${Math.abs(d).toFixed(2)}점 낮아요.`;
  return `${metricLabel}이(가) 주제 평균 대비 ${d.toFixed(2)}점 높아요.`;
}

function patternPeerSentence(kind: "title" | "body" | "image", myRaw: number | null, peerRaw: number | null): string {
  if (myRaw == null || peerRaw == null) return "비교 데이터가 부족해요.";
  const m = myRaw;
  const p = peerRaw;
  const d = Math.round(m - p);
  const label = kind === "title" ? "제목 길이" : kind === "body" ? "본문 길이" : "이미지 수";
  if (d === 0) return `${label}이(가) 동일한 카테고리의 상위권 평균과 같아요.`;
  if (kind === "image") {
    if (d > 0) return `${label}이(가) 동일한 카테고리의 상위권 평균 대비 ${Math.abs(d)}장 많아요.`;
    return `${label}이(가) 동일한 카테고리의 상위권 평균 대비 ${Math.abs(d)}장 적어요.`;
  }
  if (d > 0) return `${label}이(가) 동일한 카테고리의 상위권 평균 대비 ${Math.abs(d)}자 길어요.`;
  return `${label}이(가) 동일한 카테고리의 상위권 평균 대비 ${Math.abs(d)}자 짧아요.`;
}

type ComparisonTone = "low" | "high" | "neutral" | "muted";

type ComparisonSummaryItem = {
  label: string;
  prefix: string;
  value?: string;
  suffix?: string;
  tone: ComparisonTone;
};

function comparisonToneClass(tone: ComparisonTone): string {
  if (tone === "low") return "text-rose-500";
  if (tone === "high") return "text-emerald-500";
  if (tone === "neutral") return "text-amber-500";
  return "text-slate-400";
}

function influencePeerItem(metricLabel: string, my: number, peer: number | null): ComparisonSummaryItem {
  if (peer == null) {
    return {
      label: metricLabel,
      prefix: "비교 데이터가 부족해요.",
      tone: "muted",
    };
  }

  const diff = my - peer;
  if (Math.abs(diff) < 0.05) {
    return {
      label: metricLabel,
      prefix: `${metricLabel}가 같은 레벨 평균과 `,
      value: "비슷해요.",
      tone: "neutral",
    };
  }

  return {
    label: metricLabel,
    prefix: `${metricLabel}가 같은 레벨 평균 대비 `,
    value: `${Math.abs(diff).toFixed(2)}점`,
    suffix: diff < 0 ? " 낮아요." : " 높아요.",
    tone: diff < 0 ? "low" : "high",
  };
}

function patternPeerItem(
  label: string,
  myRaw: number | null,
  peerRaw: number | null,
  unit: "자" | "장"
): ComparisonSummaryItem {
  if (myRaw == null || peerRaw == null) {
    return {
      label,
      prefix: "비교 데이터가 부족해요.",
      tone: "muted",
    };
  }

  const diff = Math.round(myRaw - peerRaw);
  if (diff === 0) {
    return {
      label,
      prefix: `${label}가 동일한 카테고리의 상위권 평균과 `,
      value: "비슷해요.",
      tone: "neutral",
    };
  }

  const positiveSuffix = unit === "장" ? " 많아요." : " 길어요.";
  const negativeSuffix = unit === "장" ? " 적어요." : " 짧아요.";

  return {
    label,
    prefix: `${label}가 동일한 카테고리의 상위권 평균 대비 `,
    value: `${Math.abs(diff).toLocaleString()}${unit}`,
    suffix: diff > 0 ? positiveSuffix : negativeSuffix,
    tone: diff > 0 ? "high" : "low",
  };
}


type Props = { blogId: string; forceKeywordRefreshDev?: boolean };
type BottomTab = "recent" | "popular" | "keywords";
const RECENT_POSTS_ROWS_PER_PAGE = 10;
const POPULAR_POSTS_ROWS_PER_PAGE = 10;
const KEYWORD_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
/** 동일 blogId 자동 keyword-refresh 동시/연속 호출 완화 (sessionStorage + ref) */
const KEYWORD_AUTO_REFRESH_INFLIGHT_MS = 12 * 60 * 1000;
const POSTLABS_OVERALL_RANK_DESCRIPTION =
  "PostLabs에 누적 분석된 블로그 데이터를 기준으로 유효 키워드, 영향력 지수, 최근 활동성 등을 종합해 산정하는 자체 순위입니다. 네이버 공식 순위가 아닙니다.";
const POSTLABS_TOPIC_RANK_DESCRIPTION =
  "같은 공식 블로그 주제 안에서 PostLabs 자체 기준으로 비교한 순위입니다. 데이터가 충분히 쌓인 뒤 제공됩니다.";

export default function BlogAnalysisDetailClient({ blogId, forceKeywordRefreshDev = false }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(blogId);
  const [activeTab, setActiveTab] = useState<BottomTab>("recent");
  const [recentPostsPage, setRecentPostsPage] = useState(1);
  const [recentPostsVisibleCount, setRecentPostsVisibleCount] = useState(RECENT_POSTS_ROWS_PER_PAGE);
  const [popularPostsVisibleCount, setPopularPostsVisibleCount] = useState(POPULAR_POSTS_ROWS_PER_PAGE);
  const [keywordPage, setKeywordPage] = useState(1);
  const [keywordPageSize, setKeywordPageSize] = useState<(typeof KEYWORD_PAGE_SIZE_OPTIONS)[number]>(30);
  const [rankTab, setRankTab] = useState<"total" | "topic" | "keywords">("total");
  const [loading, setLoading] = useState(() => isValidNaverBlogId(blogId));
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [visitor, setVisitor] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [resolvedBlogId, setResolvedBlogId] = useState("");
  const [totalVisitor, setTotalVisitor] = useState(0);
  const [recentPosts, setRecentPosts] = useState<BlogAnalysisRecentPost[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [postCount, setPostCount] = useState<number | null>(null);
  const [scrapCount, setScrapCount] = useState<number | null>(null);
  const [postingFrequency, setPostingFrequency] = useState<number | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  const [validKeywords, setValidKeywords] = useState<BlogValidKeyword[]>([]);
  const [representativeValidKeywords, setRepresentativeValidKeywords] = useState<BlogValidKeyword[]>([]);
  const [keywordInsights, setKeywordInsights] = useState<BlogKeywordInsight[]>([]);
  const [validKeywordCount, setValidKeywordCount] = useState<number | null>(null);
  const [blogTopic, setBlogTopic] = useState<string | null>(null);

  const [totalRank, setTotalRank] = useState<number | null>(null);
  const [topicRank, setTopicRank] = useState<number | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  const [blogScoreResult, setBlogScoreResult] = useState<BlogScoreResult | null>(null);

  const [historyPoints, setHistoryPoints] = useState<BlogAnalysisHistoryPoint[]>([]);
  const [visitorChartData, setVisitorChartData] = useState<BlogVisitorChartPoint[]>([]);

  const [patternAnalysis, setPatternAnalysis] = useState<BlogPostPatternAnalysis | null>(null);

  const [topicAverageComparison, setTopicAverageComparison] = useState<BlogTopicAverageComparison | null>(null);

  const [analysisPerformance, setAnalysisPerformance] = useState<BlogAnalysisPerformanceMeta | null>(null);
  /** 자동·수동 keyword-refresh 진행 중 (중복 호출 방지; sessionStorage 자동 락과 무관) */
  const [isKeywordRefreshing, setIsKeywordRefreshing] = useState(false);
  const [keywordRefreshError, setKeywordRefreshError] = useState<string | null>(null);
  const keywordRefreshInFlightRef = useRef(false);
  /** 수동 업데이트: 동기식 중복 클릭 방지 (자동 refresh의 sessionStorage 락과 별도) */
  const manualKeywordRefreshBusyRef = useRef(false);

  const applyKeywordRefresh = useCallback(
    (kws: BlogValidKeyword[], cnt: number | null, postsOverride?: BlogAnalysisRecentPost[]) => {
      const posts = postsOverride ?? recentPosts;
      const insights = computeBlogKeywordInsights(posts, kws);
      setValidKeywords(kws);
      setValidKeywordCount(cnt);
      setKeywordInsights(insights);
      setRepresentativeValidKeywords(
        computeRepresentativeValidKeywords({
          validKeywords: kws,
          recentPosts: posts,
          keywordInsights: insights,
        })
      );
      setBlogScoreResult(
        computeBlogScore({
          blogId: resolvedBlogId || blogId,
          visitorCount: visitor,
          totalVisitCount: totalVisitor,
          visitorChartData,
          postCount,
          postingFrequency,
          subscriberCount,
          recentPosts: posts,
          patternAnalysis,
          validKeywords: kws,
          keywordInsights: insights,
          validKeywordCount: cnt,
        })
      );
    },
    [
      recentPosts,
      resolvedBlogId,
      blogId,
      visitor,
      totalVisitor,
      visitorChartData,
      postCount,
      postingFrequency,
      subscriberCount,
      patternAnalysis,
    ]
  );

  const applyKeywordRefreshRef = useRef(applyKeywordRefresh);
  applyKeywordRefreshRef.current = applyKeywordRefresh;

  const loadAnalysis = useCallback(async () => {
    if (!isValidNaverBlogId(blogId)) return;

    setLoading(true);
    setFetchError(null);
    setKeywordRefreshError(null);
    setHistoryPoints([]);
    setVisitorChartData([]);
    setKeywordInsights([]);
    setRepresentativeValidKeywords([]);
    setPatternAnalysis(null);
    setTopicAverageComparison(null);
    setBlogScoreResult(null);

    setAnalysisPerformance(null);

    try {
      if (process.env.NODE_ENV === "development" && forceKeywordRefreshDev) {
        console.log(
          "[blog-analysis dev] forceKeywordRefresh=1 — 분석 후 자동 keyword-refresh 가 실행됩니다."
        );
      }
      const response = await fetch("/api/blog-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blogUrl: blogId,
          ...(forceKeywordRefreshDev ? { forceKeywordRefresh: true } : {}),
        }),
      });
      const data = (await response.json()) as BlogAnalysisResult & { error?: string };

      if (response.ok) {
        setNickname(data.nickname);
        setResolvedBlogId(data.blogId);
        setVisitor(data.visitor ?? null);
        setTotalVisitor(data.totalVisitCount ?? data.totalVisitor ?? 0);
        setVisitorChartData(data.visitorChartData ?? []);
        if (process.env.NODE_ENV === "development") {
          console.log("[blog-analysis] visitor frontend response", {
            dailyVisitCount: data.visitor ?? null,
            averageVisitCount: null,
            totalVisitCount: data.totalVisitCount ?? data.totalVisitor ?? 0,
            visitorChartData: data.visitorChartData ?? [],
          });
        }
        setRecentPosts(data.recentPosts ?? []);
        setRecentPostsPage(1);
        setRecentPostsVisibleCount(RECENT_POSTS_ROWS_PER_PAGE);
        setPostCount(data.postCount ?? null);
        setScrapCount(data.scrapCount ?? null);
        setPostingFrequency(data.postingFrequency ?? null);
        setSubscriberCount(data.subscriberCount ?? null);
        setValidKeywords(data.validKeywords ?? []);
        setRepresentativeValidKeywords(data.representativeValidKeywords ?? []);
        setKeywordInsights(data.keywordInsights ?? []);
        setValidKeywordCount(data.validKeywordCount ?? null);
        setBlogTopic(data.blogTopic ?? null);
        setTotalRank(data.totalRank ?? null);
        setTopicRank(data.topicRank ?? null);
        setAnalyzedAt(data.analyzedAt ?? null);
        setPatternAnalysis(data.patternAnalysis ?? null);
        if (process.env.NODE_ENV === "development") {
          console.log("[blog-analysis] pattern frontend render input", {
            averageTitleLength: data.patternAnalysis?.averageTitleLength ?? null,
            averageContentLength: data.patternAnalysis?.averageContentLength ?? null,
            averageImageCount: data.patternAnalysis?.averageImageCount ?? null,
          });
        }
        setTopicAverageComparison(data.topicAverageComparison ?? null);

        setAnalysisPerformance(data.performance ?? null);

        setProfileImage(data.profileImage || null);

        setBlogScoreResult(
          computeBlogScore({
            blogId: data.blogId,
            visitorCount: data.visitor,
            totalVisitCount: data.totalVisitCount ?? data.totalVisitor ?? null,
            visitorChartData: data.visitorChartData ?? [],
            postCount: data.postCount,
            postingFrequency: data.postingFrequency,
            subscriberCount: data.subscriberCount,
            recentPosts: data.recentPosts ?? [],
            patternAnalysis: data.patternAnalysis ?? null,
            validKeywords: data.validKeywords ?? [],
            keywordInsights: data.keywordInsights ?? [],
            validKeywordCount: data.validKeywordCount ?? null,
          })
        );

        try {
          const hr = await fetch(`/api/blog-analysis/history?blogId=${encodeURIComponent(data.blogId)}&days=14`);
          const hj = (await hr.json()) as { ok?: boolean; points?: BlogAnalysisHistoryPoint[] };
          if (hr.ok && Array.isArray(hj.points)) {
            setHistoryPoints(hj.points);
            if (process.env.NODE_ENV === "development") {
              console.log("[blog-analysis] visitor history frontend response", {
                points: hj.points.map((point) => ({
                  analyzedAt: point.analyzedAt,
                  visitorCount: point.visitorCount ?? null,
                })),
              });
            }
          } else setHistoryPoints([]);
        } catch (e) {
          console.warn("[blog-analysis] 히스토리 조회 실패:", e);
          setHistoryPoints([]);
        }

        const postsForKw = data.recentPosts ?? [];
        if (process.env.NODE_ENV === "development") {
          console.log("[blog-analysis keyword-auto-check client]", {
            blogId: data.blogId,
            keywordRefreshNeeded: data.keywordRefreshNeeded ?? false,
            latestKeywordCheckedAt: data.latestKeywordCheckedAt ?? null,
            keywordCacheAgeDays: data.keywordCacheAgeDays ?? null,
            validKeywordCount: data.validKeywordCount ?? null,
            usedCachedKeywordCount:
              data.usedCachedKeywordCount ?? data.performance?.usedCachedKeywordCount ?? null,
            autoRefreshStarted: false,
            autoRefreshCompleted: false,
          });
        }

        if (data.keywordRefreshNeeded === true && typeof window !== "undefined") {
          const targetId = String(data.blogId).trim();
          if (isValidNaverBlogId(targetId)) {
            const lockKey = `keyword_refresh_inflight_${targetId}`;
            if (forceKeywordRefreshDev) {
              sessionStorage.removeItem(lockKey);
            }
            const prevTs = Number(sessionStorage.getItem(lockKey) ?? "");
            const lockFresh =
              Number.isFinite(prevTs) && Date.now() - prevTs < KEYWORD_AUTO_REFRESH_INFLIGHT_MS;

            if (!lockFresh && !keywordRefreshInFlightRef.current) {
              keywordRefreshInFlightRef.current = true;
              sessionStorage.setItem(lockKey, String(Date.now()));
              setKeywordRefreshError(null);
              setIsKeywordRefreshing(true);

              if (process.env.NODE_ENV === "development") {
                console.log("[blog-analysis keyword-auto-check client]", {
                  blogId: targetId,
                  keywordRefreshNeeded: true,
                  latestKeywordCheckedAt: data.latestKeywordCheckedAt ?? null,
                  keywordCacheAgeDays: data.keywordCacheAgeDays ?? null,
                  validKeywordCount: data.validKeywordCount ?? null,
                  usedCachedKeywordCount: data.usedCachedKeywordCount ?? null,
                  autoRefreshStarted: true,
                });
              }

              void (async () => {
                try {
                  const kr = await fetch("/api/blog-analysis/keyword-refresh", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      blogUrl: targetId,
                      ...(forceKeywordRefreshDev ? { force: true } : {}),
                    }),
                  });
                  const payload = (await kr.json()) as {
                    ok?: boolean;
                    validKeywords?: BlogValidKeyword[];
                    validKeywordCount?: number | null;
                    error?: string;
                  };
                  if (!kr.ok || !payload.ok) {
                    if (process.env.NODE_ENV === "development") {
                      console.warn("[blog-analysis keyword-auto-check client]", {
                        blogId: targetId,
                        autoRefreshCompleted: false,
                        error: payload.error ?? String(kr.status),
                      });
                    }
                    return;
                  }
                  applyKeywordRefreshRef.current(
                    payload.validKeywords ?? [],
                    payload.validKeywordCount ?? null,
                    postsForKw
                  );
                  if (process.env.NODE_ENV === "development") {
                    console.log("[blog-analysis keyword-auto-check client]", {
                      blogId: targetId,
                      autoRefreshCompleted: true,
                      validKeywordCount: payload.validKeywordCount ?? null,
                    });
                  }
                } catch (err) {
                  if (process.env.NODE_ENV === "development") {
                    console.warn("[blog-analysis keyword-auto-check client]", {
                      blogId: targetId,
                      autoRefreshCompleted: false,
                      error: String(err),
                    });
                  }
                } finally {
                  keywordRefreshInFlightRef.current = false;
                  sessionStorage.removeItem(lockKey);
                  setIsKeywordRefreshing(false);
                }
              })();
            }
          }
        }
      } else {
        setFetchError(data.error ?? "분석에 실패했습니다.");
      }
    } catch {
      setFetchError("분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [blogId, forceKeywordRefreshDev]);

  const handleManualKeywordRefresh = useCallback(async () => {
    const targetId = String(resolvedBlogId || blogId).trim();
    if (!isValidNaverBlogId(targetId)) return;
    if (manualKeywordRefreshBusyRef.current || isKeywordRefreshing) return;

    manualKeywordRefreshBusyRef.current = true;
    setKeywordRefreshError(null);
    setIsKeywordRefreshing(true);
    try {
      const kr = await fetch("/api/blog-analysis/keyword-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blogUrl: targetId,
          ...(forceKeywordRefreshDev ? { force: true } : {}),
        }),
      });
      const payload = (await kr.json()) as {
        ok?: boolean;
        validKeywords?: BlogValidKeyword[];
        validKeywordCount?: number | null;
        error?: string;
      };
      if (!kr.ok || !payload.ok) {
        setKeywordRefreshError(payload.error ?? `요청 실패 (${kr.status})`);
        return;
      }
      applyKeywordRefresh(
        payload.validKeywords ?? [],
        payload.validKeywordCount ?? null,
        recentPosts
      );
    } catch {
      setKeywordRefreshError("유효 키워드 업데이트 중 오류가 발생했습니다.");
    } finally {
      manualKeywordRefreshBusyRef.current = false;
      setIsKeywordRefreshing(false);
    }
  }, [
    applyKeywordRefresh,
    blogId,
    forceKeywordRefreshDev,
    isKeywordRefreshing,
    recentPosts,
    resolvedBlogId,
  ]);

  useEffect(() => {
    setSearchInput(blogId);
  }, [blogId]);

  useEffect(() => {
    if (!isValidNaverBlogId(blogId)) return;
    void loadAnalysis();
  }, [blogId, loadAnalysis]);

  const handleSearchAnother = () => {
    const raw = searchInput.trim();
    if (!raw) {
      alert("블로그 아이디 또는 주소를 입력해주세요.");
      return;
    }
    const id = extractBlogId(raw);
    if (!id) {
      alert("올바른 네이버 블로그 아이디 또는 주소를 입력해주세요.");
      return;
    }
    router.push(`/blog-analysis/${encodeURIComponent(id)}`);
  };

  const historyTrend = useMemo(() => analyzeBlogHistoryTrend(historyPoints), [historyPoints]);
  const currentResultValidKeywordCount = useMemo(() => {
    if (validKeywordCount != null) return validKeywordCount;
    if (representativeValidKeywords.length > 0) return representativeValidKeywords.length;

    const latestHistoryPoint = historyPoints.find((point) => {
      const value = point.validKeywordCount;
      return value != null && Number.isFinite(Number(value));
    });
    return latestHistoryPoint?.validKeywordCount ?? null;
  }, [historyPoints, representativeValidKeywords.length, validKeywordCount]);

  const summaryLines = useMemo(() => {
    if (!blogScoreResult) return [];
    return buildBlogAnalysisSummary({
      blogScore: blogScoreResult,
      validKeywordCount,
      patternAnalysis,
      topicAverageComparison,
    });
  }, [blogScoreResult, validKeywordCount, patternAnalysis, topicAverageComparison]);

  const peerTotalScore =
    topicAverageComparison?.averageTotalScore != null && Number.isFinite(Number(topicAverageComparison.averageTotalScore))
      ? Number(topicAverageComparison.averageTotalScore)
      : null;
  const peerTotalForBar = peerTotalScore != null ? clampPct(peerTotalScore) : null;
  const peerKeywordInfl = estimatePeerKeywordInfluence(topicAverageComparison?.averageValidKeywordCount ?? null);
  const peerContentInfl = estimatePeerContentInfluence(topicAverageComparison?.averagePostingFrequency ?? null);

  const influenceSummaryItems = useMemo(() => {
    if (!blogScoreResult) return [] as ComparisonSummaryItem[];
    return [
      influencePeerItem("영향력 점수", blogScoreResult.influenceScore, peerTotalScore),
      influencePeerItem("키워드 영향력 점수", blogScoreResult.keywordInfluenceScore, peerKeywordInfl),
      influencePeerItem("콘텐츠 영향력 점수", blogScoreResult.contentInfluenceScore, peerContentInfl),
    ];
  }, [blogScoreResult, peerTotalScore, peerKeywordInfl, peerContentInfl]);

  const influenceHasAnyPeerBar = peerTotalScore != null || peerKeywordInfl != null || peerContentInfl != null;

  const patternSummaryItems = useMemo(() => {
    if (!patternAnalysis) return [] as ComparisonSummaryItem[];
    const pt = finiteOrNull(topicAverageComparison?.averageTitleLength);
    const mt = finiteOrNull(patternAnalysis.averageTitleLength);
    const pb = finiteOrNull(topicAverageComparison?.averageContentLength);
    const mb = finiteOrNull(patternAnalysis.averageContentLength);
    const pi = finiteOrNull(topicAverageComparison?.averageImageCount);
    const mi = finiteOrNull(patternAnalysis.averageImageCount);
    return [
      patternPeerItem("제목 길이", mt, pt, "자"),
      patternPeerItem("본문 길이", mb, pb, "자"),
      patternPeerItem("이미지 수", mi, pi, "장"),
    ];
  }, [patternAnalysis, topicAverageComparison]);

  const patternHasAnyPeerBar = useMemo(() => {
    if (!patternAnalysis) return false;
    const t = roughTitleScoreFromPeerChars(topicAverageComparison?.averageTitleLength);
    const c = roughContentScoreFromPeerChars(topicAverageComparison?.averageContentLength);
    const i = roughImageScoreFromPeerCount(topicAverageComparison?.averageImageCount);
    return t != null || c != null || i != null;
  }, [patternAnalysis, topicAverageComparison]);

  const recentPostsTotalPages = Math.max(1, Math.ceil(recentPosts.length / RECENT_POSTS_ROWS_PER_PAGE));
  const recentPostsPageStart = (recentPostsPage - 1) * RECENT_POSTS_ROWS_PER_PAGE;
  const visibleRecentPosts = recentPosts.slice(recentPostsPageStart, recentPostsPageStart + recentPostsVisibleCount);
  const canShowMoreRecentPosts = recentPostsPageStart + recentPostsVisibleCount < recentPosts.length;
  const displayValidKeywords = useMemo(
    () => validKeywords.filter((row) => isDisplayValidKeyword(row)),
    [validKeywords]
  );
  const keywordTotalPages = Math.max(1, Math.ceil(displayValidKeywords.length / keywordPageSize));
  const keywordPageStart = (keywordPage - 1) * keywordPageSize;
  const visibleValidKeywords = displayValidKeywords.slice(keywordPageStart, keywordPageStart + keywordPageSize);
  const popularPosts = useMemo<PopularPostRow[]>(() => {
    const rows = recentPosts.map((post) => {
      const postWithTraffic = post as RecentPostWithTrafficFields;
      const averageDailyViews = estimateDailyViewsFromPost(post);
      return {
        ...post,
        averageDailyViews,
        trafficRatio: firstFiniteNumber(postWithTraffic.trafficRatio, postWithTraffic.inflowRatio),
        popularSortScore: averageDailyViews ?? 0,
      };
    });
    const totalEstimatedViews = rows.reduce((sum, row) => sum + (row.averageDailyViews ?? 0), 0);

    return rows
      .map((row) => ({
        ...row,
        trafficRatio:
          row.trafficRatio ??
          (row.averageDailyViews !== null && totalEstimatedViews > 0
            ? (row.averageDailyViews / totalEstimatedViews) * 100
            : null),
      }))
      .sort((a, b) => {
        if (b.popularSortScore !== a.popularSortScore) return b.popularSortScore - a.popularSortScore;
        const bd = new Date(b.publishedAt ?? b.createdAt ?? 0).getTime();
        const ad = new Date(a.publishedAt ?? a.createdAt ?? 0).getTime();
        return (Number.isFinite(bd) ? bd : 0) - (Number.isFinite(ad) ? ad : 0);
      });
  }, [recentPosts]);
  const visiblePopularPosts = popularPosts.slice(0, popularPostsVisibleCount);
  const canShowMorePopularPosts = popularPostsVisibleCount < popularPosts.length;

  useEffect(() => {
    if (recentPostsPage <= recentPostsTotalPages) return;
    setRecentPostsPage(recentPostsTotalPages);
    setRecentPostsVisibleCount(RECENT_POSTS_ROWS_PER_PAGE);
  }, [recentPostsPage, recentPostsTotalPages]);

  useEffect(() => {
    if (keywordPage <= keywordTotalPages) return;
    setKeywordPage(keywordTotalPages);
  }, [keywordPage, keywordTotalPages]);

  useEffect(() => {
    setPopularPostsVisibleCount(POPULAR_POSTS_ROWS_PER_PAGE);
  }, [recentPosts]);

  const handleRecentPostsPageChange = (page: number) => {
    setRecentPostsPage(page);
    setRecentPostsVisibleCount(RECENT_POSTS_ROWS_PER_PAGE);
  };

  const handleShowMoreRecentPosts = () => {
    setRecentPostsVisibleCount((count) => count + RECENT_POSTS_ROWS_PER_PAGE);
  };

  const handleKeywordPageSizeChange = (value: string) => {
    const next = KEYWORD_PAGE_SIZE_OPTIONS.find((option) => option === Number(value)) ?? 30;
    setKeywordPageSize(next);
    setKeywordPage(1);
  };

  const blogInfoItems = [
    { label: "블로그 주제", value: blogTopic != null && blogTopic.trim() !== "" ? blogTopic : "-" },
    {
      label: "게시물 수",
      value: postCount != null ? `${postCount.toLocaleString()}개` : "-",
    },
    {
      label: "포스팅 작성 빈도",
      value: postingFrequency != null ? `${postingFrequency.toFixed(2)}개` : "-",
    },
    { label: "스크랩 수", value: scrapCount != null ? `${scrapCount.toLocaleString()}개` : "-" },
    {
      label: "이웃 수",
      value: subscriberCount != null ? `${subscriberCount.toLocaleString()}명` : "-",
    },
  ];

  if (!isValidNaverBlogId(blogId)) {
    return (
      <main className="min-h-screen bg-[#f8fafc] pt-24 pb-20">
        <TopNav />
        <section className="mx-auto max-w-[1180px] px-5 py-8">
          <p className="mb-4">
            <Link href="/blog-analysis" className="text-sm font-semibold text-[#2563EB] hover:underline">
              ← 블로그 분석 검색
            </Link>
          </p>
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-8 shadow-sm text-center">
            <p className="text-[15px] font-semibold text-[#111827] mb-2">올바르지 않은 블로그 아이디입니다.</p>
            <p className="text-sm text-gray-500 mb-6">네이버 블로그 아이디 형식으로 다시 시도해 주세요.</p>
            <Link
              href="/blog-analysis"
              className="inline-flex h-11 items-center rounded-[14px] bg-[#333] px-6 font-bold text-white hover:bg-[#2563EB]"
            >
              검색으로 돌아가기
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (loading && !blogScoreResult) {
    return (
      <>
        <TopNav />
        <GlobalLoading message="블로그를 분석 중입니다..." />
      </>
    );
  }

  if (fetchError && !blogScoreResult) {
    return (
      <main className="min-h-screen bg-[#f8fafc] pt-24 pb-20">
        <TopNav />
        <section className="mx-auto max-w-[1180px] px-5 py-8">
          <p className="mb-4">
            <Link href="/blog-analysis" className="text-sm font-semibold text-[#2563EB] hover:underline">
              ← 블로그 분석 검색
            </Link>
          </p>
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-8 shadow-sm text-center">
            <p className="text-[15px] font-semibold text-[#111827] mb-2">{fetchError}</p>
            <p className="text-sm text-gray-500 mb-6">잠시 후 다시 시도해 주세요.</p>
            <button
              type="button"
              onClick={() => void loadAnalysis()}
              className="inline-flex h-11 items-center rounded-[14px] bg-[#333] px-6 font-bold text-white hover:bg-[#2563EB]"
            >
              다시 시도
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!blogScoreResult) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] pt-24 pb-12">
      <TopNav />
      <section className="mx-auto max-w-[1024px] px-3 sm:px-4 py-4 sm:py-5">
        <p className="mb-2">
          <Link href="/blog-analysis" className="text-xs sm:text-sm font-semibold text-[#2563EB] hover:underline">
            ← 블로그 분석 검색
          </Link>
        </p>

        <div className="mb-3 rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchAnother();
              }}
              placeholder="블로그 아이디 또는 주소를 입력해주세요."
              className="h-9 flex-1 rounded-xl border border-slate-200 px-2.5 text-sm outline-none focus:border-[#2563EB]"
            />
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleSearchAnother()}
                className="h-9 min-w-[92px] rounded-xl bg-[#333] px-3 text-xs font-bold text-white hover:bg-[#2563EB]"
              >
                분석 시작
              </button>
              <Link
                href="/blog-analysis"
                className="h-9 inline-flex items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 px-3 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                검색 기록
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-2">
          <h1 className="text-base sm:text-lg font-bold text-[#111827] tracking-tight">블로그 채널 분석</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-semibold text-[#111827]">{nickname}</span>
            <span className="text-gray-400"> · @{resolvedBlogId}</span>
          </p>
          {analyzedAt ? (
            <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">분석 시각 · {formatAnalyzedAt(analyzedAt)}</p>
          ) : null}
        </div>

        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* 1행: 프로필 + 최신 순위 + 블로그 정보 */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch">
            <div className="w-full lg:w-[210px] shrink-0 order-1">
              <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm text-center h-full flex flex-col justify-center">
                <div className="h-12 w-12 rounded-full bg-gray-100 mx-auto mb-2 flex items-center justify-center text-lg overflow-hidden border border-slate-200/60 shadow-sm">
                  {profileImage ? <img src={profileImage} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-300">👤</span>}
                </div>
                <h3 className="text-sm font-semibold text-slate-800 leading-tight tracking-tight">{nickname}</h3>
                <p className="text-[10px] text-slate-400 truncate px-1 mt-0.5">@{resolvedBlogId}</p>
                <div className="mt-3 pt-2.5 border-t border-slate-100 text-left space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>운영 등급</span>
                    <span className={`font-bold text-xs ${blogScoreResult.grade === "S" || blogScoreResult.grade === "A" ? "text-indigo-600" : "text-amber-600"}`}>
                      {blogScoreResult.grade}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-[10px] text-slate-500 shrink-0">레벨</span>
                    <span className="text-base font-bold tabular-nums tracking-tight text-slate-800">Lv.{blogScoreResult.level}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 gap-2">
                    <span className="shrink-0">영향력 지수</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{blogScoreResult.totalScore.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-400 to-cyan-400 rounded-full transition-all duration-700" style={{ width: `${clampPct(blogScoreResult.totalScore)}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-400 leading-tight">다음 레벨까지 {blogScoreResult.nextLevelRemaining.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-w-0 order-2">
              <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-3 py-1.5">
                  <span className="text-[10px] font-semibold text-white/90 tracking-wider uppercase">최신 순위</span>
                </div>
                <div className="p-2 sm:p-2.5">
                  <div className="grid grid-cols-3 gap-0 divide-x divide-slate-100/80">
                    <div className="flex flex-col items-center justify-center text-center px-2 py-2 min-h-[72px] sm:min-h-[80px] gap-1">
                      <p className="text-xl sm:text-2xl font-bold text-indigo-600 tabular-nums leading-none tracking-tight">
                        {currentResultValidKeywordCount != null ? `${currentResultValidKeywordCount.toLocaleString()}개` : "—"}
                      </p>
                      <p className="text-[9px] font-medium text-slate-500 leading-none">유효 키워드</p>
                      <p className="text-[8px] text-slate-400 leading-tight">검색량 0 초과</p>
                    </div>
                    <div
                      className="flex flex-col items-center justify-center text-center px-2 py-2 min-h-[72px] sm:min-h-[80px] gap-1"
                      title={POSTLABS_OVERALL_RANK_DESCRIPTION}
                    >
                      <p className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums leading-none tracking-tight break-all">
                        {formatRankDisplay(totalRank)}
                      </p>
                      <p className="text-[9px] font-medium text-slate-500 leading-none">전체 순위</p>
                      <p className="text-[8px] text-slate-400 leading-tight">
                        {totalRank != null ? "PostLabs 기준" : "데이터 누적 후 제공"}
                      </p>
                    </div>
                    <div
                      className="flex flex-col items-center justify-center text-center px-2 py-2 min-h-[72px] sm:min-h-[80px] gap-1"
                      title={POSTLABS_TOPIC_RANK_DESCRIPTION}
                    >
                      <p className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums leading-none tracking-tight break-all">
                        {formatRankDisplay(topicRank)}
                      </p>
                      <p className="text-[9px] font-medium text-slate-500 leading-none">주제 순위</p>
                      <p className="text-[8px] text-slate-400 leading-tight">
                        {topicRank != null ? "PostLabs 기준" : "데이터 누적 후 제공"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-3 py-1.5">
                  <span className="text-[10px] font-semibold text-white/90 tracking-wider uppercase">블로그 정보</span>
                </div>
                <div className="p-2 sm:p-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
                    {blogInfoItems.map((o, i) => (
                      <div key={i} className="rounded-xl bg-slate-50/80 py-1.5 px-1 min-h-[50px] sm:min-h-[52px] flex flex-col items-center justify-center gap-1 border border-slate-100/60">
                        <p className="font-semibold text-xs sm:text-sm text-slate-800 tabular-nums truncate max-w-full leading-none">{o.value}</p>
                        <p className="text-[8px] text-slate-400 leading-tight">{o.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2행: 방문자 지표 + 순위/키워드 그래프 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <VisitorMetricsChartCard
              historyPoints={historyPoints}
              visitorChartData={visitorChartData}
              dailyVisitor={visitor}
              totalVisitor={totalVisitor}
            />
            <HistoryTabChartCard
              historyPoints={historyPoints}
              rankTab={rankTab}
              setRankTab={setRankTab}
              liveTotalRank={totalRank}
              liveTopicRank={topicRank}
              liveValidKeywordCount={validKeywordCount}
              historyTrend={historyTrend}
            />
          </div>

          {/* AI 요약 (컴팩트) */}
          <div className="rounded-2xl border border-sky-200/70 bg-sky-50/40 px-2 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-sky-700">AI 분석 요약</span>
              <span className="text-[9px] text-sky-600/80">참고</span>
            </div>
            <ul className="space-y-0.5">
              {summaryLines.slice(0, 3).map((line, i) => (
                <li
                  key={i}
                  className={`text-xs leading-snug pl-2 border-l-2 border-sky-300/50 ${
                    i === 0 ? "font-semibold text-slate-900" : "font-normal text-slate-600"
                  }`}
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* 영향력 · 포스팅 패턴 (2열) — Premium SaaS 리포트 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
            {/* ── 최근 블로그 영향력 ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              whileHover={{ y: -1, transition: { duration: 0.2 } }}
              className="rounded-3xl border border-slate-200/70 bg-gradient-to-b from-white to-slate-50/60 p-4 sm:p-5 shadow-[0_1px_4px_rgb(0,0,0,0.04),0_6px_20px_rgb(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgb(0,0,0,0.06),0_10px_28px_rgb(0,0,0,0.06)] transition-shadow duration-300 flex flex-col min-w-0 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shrink-0">
                    <BarChart3 size={12} className="text-white" strokeWidth={2.5} />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 tracking-tight">최근 블로그 영향력</h4>
                </div>
                <span className="text-[9px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">주제 평균 대비</span>
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-100 border border-slate-100/80 rounded-2xl overflow-hidden bg-white/70">
                <PremiumStatCol name="영향력 지수" tier={tierCaption(blogScoreResult.influenceScore)} delay={0} />
                <PremiumStatCol name="키워드 영향력" tier={tierCaption(blogScoreResult.keywordInfluenceScore)} delay={0.08} />
                <PremiumStatCol name="콘텐츠 영향력" tier={tierCaption(blogScoreResult.contentInfluenceScore)} delay={0.16} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {influenceSummaryItems.map((item) => (
                  <p key={item.label} className="rounded-xl border border-slate-100 bg-white/70 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
                    <span>{item.prefix}</span>
                    {item.value ? (
                      <span className={`font-semibold ${comparisonToneClass(item.tone)}`}>{item.value}</span>
                    ) : null}
                    {item.suffix ? (
                      <span className={`font-semibold ${comparisonToneClass(item.tone)}`}>{item.suffix}</span>
                    ) : null}
                  </p>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-100/70 pt-2 min-w-0">
                {!influenceHasAnyPeerBar ? (
                  <p className="text-[9px] text-slate-400 mb-2">평균 데이터 없음</p>
                ) : null}
                <PremiumCompareBar
                  Icon={BarChart3}
                  title="영향력 지수"
                  peerLabel={`Lv.${blogScoreResult.level} 평균`}
                  peerText={peerTotalScore != null ? peerTotalScore.toFixed(2) : "-"}
                  peerPct={peerTotalForBar}
                  myLabel="나의 점수"
                  myText={blogScoreResult.influenceScore.toFixed(2)}
                  myPct={clampPct(blogScoreResult.influenceScore)}
                  tierLabel={tierCaption(blogScoreResult.influenceScore).label}
                  delay={0.1}
                />
                <PremiumCompareBar
                  Icon={KeyRound}
                  title="키워드 영향력"
                  peerLabel={`Lv.${blogScoreResult.level} 평균`}
                  peerText={peerKeywordInfl != null ? peerKeywordInfl.toFixed(2) : "-"}
                  peerPct={peerKeywordInfl != null ? clampPct(peerKeywordInfl) : null}
                  myLabel="나의 점수"
                  myText={blogScoreResult.keywordInfluenceScore.toFixed(2)}
                  myPct={clampPct(blogScoreResult.keywordInfluenceScore)}
                  tierLabel={tierCaption(blogScoreResult.keywordInfluenceScore).label}
                  delay={0.2}
                />
                <PremiumCompareBar
                  Icon={FileText}
                  title="콘텐츠 영향력"
                  peerLabel={`Lv.${blogScoreResult.level} 평균`}
                  peerText={peerContentInfl != null ? peerContentInfl.toFixed(2) : "-"}
                  peerPct={peerContentInfl != null ? clampPct(peerContentInfl) : null}
                  myLabel="나의 점수"
                  myText={blogScoreResult.contentInfluenceScore.toFixed(2)}
                  myPct={clampPct(blogScoreResult.contentInfluenceScore)}
                  tierLabel={tierCaption(blogScoreResult.contentInfluenceScore).label}
                  delay={0.3}
                />
              </div>
            </motion.div>

            {/* ── 포스팅 패턴 ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.06, ease: "easeOut" }}
              whileHover={{ y: -1, transition: { duration: 0.2 } }}
              className="rounded-3xl border border-slate-200/70 bg-gradient-to-b from-white to-slate-50/60 p-4 sm:p-5 shadow-[0_1px_4px_rgb(0,0,0,0.04),0_6px_20px_rgb(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgb(0,0,0,0.06),0_10px_28px_rgb(0,0,0,0.06)] transition-shadow duration-300 flex flex-col min-w-0 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
                    <FileText size={12} className="text-white" strokeWidth={2.5} />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800 tracking-tight">포스팅 패턴</h4>
                </div>
                <span className="text-[9px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">주제 평균 대비</span>
              </div>

              {!patternAnalysis ? (
                <p className="text-xs text-slate-400 py-2">최근 공개 글을 불러오지 못했거나 분석할 포스트가 없습니다.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 divide-x divide-slate-100 border border-slate-100/80 rounded-2xl overflow-hidden bg-white/70">
                    <PremiumStatCol name="제목 길이" tier={patternTierCaption(Number(patternAnalysis.titleLengthScore ?? 0))} delay={0.06} />
                    <PremiumStatCol name="본문 길이" tier={patternTierCaption(Number(patternAnalysis.contentLengthScore ?? 0))} delay={0.14} />
                    <PremiumStatCol name="이미지 수" tier={patternTierCaption(Number(patternAnalysis.imageCountScore ?? 0))} delay={0.22} />
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {patternSummaryItems.map((item) => (
                      <p key={item.label} className="rounded-xl border border-slate-100 bg-white/70 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
                        <span>{item.prefix}</span>
                        {item.value ? (
                          <span className={`font-semibold ${comparisonToneClass(item.tone)}`}>{item.value}</span>
                        ) : null}
                        {item.suffix ? (
                          <span className={`font-semibold ${comparisonToneClass(item.tone)}`}>{item.suffix}</span>
                        ) : null}
                      </p>
                    ))}
                  </div>

                  <div className="mt-4 border-t border-slate-100/70 pt-2 min-w-0">
                    {!patternHasAnyPeerBar ? (
                      <p className="text-[9px] text-slate-400 mb-2">평균 데이터 없음</p>
                    ) : null}
                    {(() => {
                      const tSc = Number(patternAnalysis.titleLengthScore ?? 0);
                      const cSc = Number(patternAnalysis.contentLengthScore ?? 0);
                      const iSc = Number(patternAnalysis.imageCountScore ?? 0);
                      const titleWidths = proportionalPatternWidths(
                        topicAverageComparison?.averageTitleLength,
                        patternAnalysis.averageTitleLength
                      );
                      const contentWidths = proportionalPatternWidths(
                        topicAverageComparison?.averageContentLength,
                        patternAnalysis.averageContentLength
                      );
                      const imageWidths = proportionalPatternWidths(
                        topicAverageComparison?.averageImageCount,
                        patternAnalysis.averageImageCount
                      );
                      return (
                        <>
                          <PremiumCompareBar
                            Icon={Type}
                            title="제목 길이"
                            peerLabel="상위권 평균"
                            peerText={formatAvgTitleChars(topicAverageComparison?.averageTitleLength)}
                            peerPct={titleWidths.peerPct}
                            myLabel="나의 평균"
                            myText={formatAvgTitleChars(patternAnalysis.averageTitleLength)}
                            myPct={titleWidths.myPct}
                            tierLabel={patternTierCaption(tSc).label}
                            delay={0.15}
                          />
                          <PremiumCompareBar
                            Icon={AlignLeft}
                            title="본문 길이"
                            peerLabel="상위권 평균"
                            peerText={formatAvgBodyChars(topicAverageComparison?.averageContentLength)}
                            peerPct={contentWidths.peerPct}
                            myLabel="나의 평균"
                            myText={formatAvgBodyChars(patternAnalysis.averageContentLength)}
                            myPct={contentWidths.myPct}
                            tierLabel={patternTierCaption(cSc).label}
                            delay={0.25}
                          />
                          <PremiumCompareBar
                            Icon={ImageIcon}
                            title="이미지 수"
                            peerLabel="상위권 평균"
                            peerText={formatAvgImages(topicAverageComparison?.averageImageCount)}
                            peerPct={imageWidths.peerPct}
                            myLabel="나의 평균"
                            myText={formatAvgImages(patternAnalysis.averageImageCount)}
                            myPct={imageWidths.myPct}
                            tierLabel={patternTierCaption(iSc).label}
                            delay={0.35}
                          />
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </motion.div>
          </div>

          {/* 하단 탭 테이블 */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/70 px-2.5 py-2">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100/80 p-1">
                {[
                  { key: "recent", label: "최근 포스팅" },
                  { key: "popular", label: "인기글 목록" },
                  { key: "keywords", label: "유효 키워드" },
                ].map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key as BottomTab)}
                      className={`h-9 rounded-lg text-[12px] font-bold transition-all ${
                        isActive
                          ? "bg-slate-800 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              {isKeywordRefreshing && activeTab === "keywords" ? (
                <p className="mt-2 px-2 text-center text-[10px] text-slate-500">
                  유효 키워드 업데이트 중...
                </p>
              ) : null}
            </div>

            {activeTab === "recent" ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-left">
                      <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">노출 상태</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-center whitespace-nowrap">레벨</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">발행일</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500">제목</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">공유</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">가능성</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">반응성</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">관련성</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {recentPosts.length > 0 ? (
                          visibleRecentPosts.map((post, i) => {
                            const publishedAt = post.publishedAt ?? post.createdAt;
                            const potentialScore = getPostPotentialScore(post, validKeywords);
                            const reactivityScore = firstFiniteNumber(post.reactivityScore);
                            const relatednessScore = firstFiniteNumber(post.relatednessScore);
                            const exposureStatus = formatExposureStatus(post);
                            const heartCount = firstFiniteNumber(
                              post.sympathyCount,
                              (post as BlogAnalysisRecentPost & { heartCount?: number | null }).heartCount,
                              post.likeCount
                            );
                            const detailItems = [
                              { label: "사진", value: firstFiniteNumber(post.imageCount) ?? 0, icon: ImageIcon },
                              { label: "동영상", value: firstFiniteNumber(post.videoCount) ?? 0, icon: Video },
                              { label: "글자", value: firstFiniteNumber(post.wordCount) ?? 0, icon: Type },
                              { label: "댓글", value: firstFiniteNumber(post.commentCount) ?? 0, icon: MessageCircle },
                              { label: "하트", value: heartCount ?? 0, icon: Heart },
                            ];

                            return (
                              <tr key={`${post.url || post.title}-${recentPostsPageStart + i}`} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-3 py-2 align-top whitespace-nowrap">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${exposureStatusClass(exposureStatus)}`}>
                                    {exposureStatus}
                                  </span>
                                </td>
                                <td className="px-3 py-2 align-top text-center text-[11px] font-bold text-slate-700 whitespace-nowrap">
                                  {formatPostLevel(post.postLevel)}
                                </td>
                                <td className="px-3 py-2 align-top text-[10px] text-gray-400 whitespace-nowrap tabular-nums">
                                  {formatPostDate(publishedAt)}
                                </td>
                                <td className="px-3 py-2 align-top min-w-0">
                                  <div className="min-w-0">
                                    <a href={post.url} target="_blank" rel="noreferrer" className="block text-xs font-bold text-[#111827] hover:text-[#2563EB] transition-colors truncate">
                                      {post.title || "-"}
                                    </a>
                                    <div className="mt-1 flex max-w-[540px] flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-gray-400">
                                      {detailItems.map((item) => (
                                        <span key={item.label} className="inline-flex items-center gap-0.5 whitespace-nowrap">
                                          <item.icon className="h-3 w-3 text-gray-300" aria-hidden="true" />
                                          <span className="sr-only">{item.label}</span>
                                          <span>{formatPostMetric(item.value)}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top text-right text-[11px] font-bold text-slate-700 tabular-nums whitespace-nowrap">
                                  {formatPostMetric(post.shareCount)}
                                </td>
                                <td className={`px-3 py-2 align-top text-right text-[11px] font-bold tabular-nums whitespace-nowrap ${postScoreClass(potentialScore)}`}>
                                  {potentialScore === null ? "-" : `${Math.round(potentialScore)}점`}
                                </td>
                                <td className={`px-3 py-2 align-top text-right text-[11px] font-bold tabular-nums whitespace-nowrap ${postScoreClass(reactivityScore)}`}>
                                  {reactivityScore === null ? "-" : `${Math.round(reactivityScore)}점`}
                                </td>
                                <td className={`px-3 py-2 align-top text-right text-[11px] font-bold tabular-nums whitespace-nowrap ${postScoreClass(relatednessScore)}`}>
                                  {relatednessScore === null ? "-" : `${Math.round(relatednessScore)}점`}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-xs">
                              최근 포스팅 데이터를 불러오지 못했어요. 다시 분석하면 표시될 수 있습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                {recentPosts.length > 0 ? (
                  <div className="border-t border-slate-100 bg-white px-3 py-3">
                    {canShowMoreRecentPosts ? (
                      <button
                        type="button"
                        onClick={handleShowMoreRecentPosts}
                        className="mb-2.5 flex h-9 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
                      >
                        더보기
                      </button>
                    ) : null}
                    {recentPostsTotalPages > 1 ? (
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {Array.from({ length: recentPostsTotalPages }, (_, index) => {
                          const page = index + 1;
                          const isActive = page === recentPostsPage;
                          return (
                            <button
                              key={page}
                              type="button"
                              onClick={() => handleRecentPostsPageChange(page)}
                              className={`h-7 min-w-7 rounded-lg px-2 text-[11px] font-bold transition-colors ${
                                isActive
                                  ? "bg-[#111827] text-white"
                                  : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                              }`}
                              aria-current={isActive ? "page" : undefined}
                            >
                              {page}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                </>
              ) : null}

            {activeTab === "popular" ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">발행일</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500">제목</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">일 평균 조회수</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">유입 비율</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-center whitespace-nowrap">분석</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {visiblePopularPosts.length > 0 ? (
                        visiblePopularPosts.map((post, i) => {
                          const publishedAt = post.publishedAt ?? post.createdAt;
                          const heartCount = firstFiniteNumber(
                            post.sympathyCount,
                            (post as BlogAnalysisRecentPost & { heartCount?: number | null }).heartCount,
                            post.likeCount
                          );
                          const detailItems = [
                            { label: "사진", value: firstFiniteNumber(post.imageCount) ?? 0, icon: ImageIcon },
                            { label: "동영상", value: firstFiniteNumber(post.videoCount) ?? 0, icon: Video },
                            { label: "글자", value: firstFiniteNumber(post.wordCount) ?? 0, icon: Type },
                            { label: "댓글", value: firstFiniteNumber(post.commentCount) ?? 0, icon: MessageCircle },
                            { label: "하트", value: heartCount ?? 0, icon: Heart },
                          ];
                          return (
                            <tr key={`${post.url || post.title}-popular-${i}`} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-3 py-2 align-top text-[10px] text-gray-400 whitespace-nowrap tabular-nums">
                                {formatPostDate(publishedAt)}
                              </td>
                              <td className="px-3 py-2 align-top min-w-0">
                                <a href={post.url} target="_blank" rel="noreferrer" className="block text-xs font-bold text-[#111827] hover:text-[#2563EB] transition-colors truncate">
                                  {post.title || "-"}
                                </a>
                                <div className="mt-1 flex max-w-[540px] flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-gray-400">
                                  {detailItems.map((item) => (
                                    <span key={item.label} className="inline-flex items-center gap-0.5 whitespace-nowrap">
                                      <item.icon className="h-3 w-3 text-gray-300" aria-hidden="true" />
                                      <span className="sr-only">{item.label}</span>
                                      <span>{formatPostMetric(item.value)}</span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top text-right text-[11px] font-bold text-slate-700 tabular-nums whitespace-nowrap">
                                {post.averageDailyViews === null ? "-" : `${post.averageDailyViews.toLocaleString("ko-KR")}회`}
                              </td>
                              <td className="px-3 py-2 align-top text-right text-[11px] font-bold text-slate-700 tabular-nums whitespace-nowrap">
                                {formatPercentMetric(post.trafficRatio)}
                              </td>
                              <td className="px-3 py-2 align-top text-center whitespace-nowrap">
                                {post.url ? (
                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-800 hover:text-white"
                                    aria-label="포스팅 열기"
                                  >
                                    <Search className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-300">
                                    <Search className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-xs">
                            인기글 데이터 준비중입니다. 최근 포스팅 메트릭이 쌓이면 표시됩니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {canShowMorePopularPosts ? (
                  <div className="border-t border-slate-100 bg-white px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setPopularPostsVisibleCount((count) => count + POPULAR_POSTS_ROWS_PER_PAGE)}
                      className="flex h-9 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
                    >
                      더보기
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeTab === "keywords" ? (
              <>
                <div className="border-b border-slate-100 bg-slate-50/40 px-3 py-2">
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    유효 키워드는 약 2주 간격으로 자동 갱신되며, 필요할 때 직접 업데이트할 수 있습니다.
                  </p>
                  {keywordRefreshError ? (
                    <p className="mt-1.5 text-[10px] font-semibold text-red-600">{keywordRefreshError}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
                  <div className="text-[11px] font-semibold text-slate-500">
                    유효 키워드 <span className="text-slate-900">{displayValidKeywords.length.toLocaleString("ko-KR")}개</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void handleManualKeywordRefresh()}
                      disabled={
                        loading ||
                        isKeywordRefreshing ||
                        !isValidNaverBlogId(String(resolvedBlogId || blogId).trim())
                      }
                      className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-45"
                    >
                      {isKeywordRefreshing ? "유효 키워드 업데이트 중..." : "유효 키워드 업데이트"}
                    </button>
                    <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                      표시 개수
                      <select
                        value={keywordPageSize}
                        onChange={(event) => handleKeywordPageSizeChange(event.target.value)}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none focus:border-slate-400"
                      >
                        {KEYWORD_PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}개
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left">
                    <thead className="bg-slate-50/80 border-b border-slate-100">
                      <tr>
                        <th className="px-2.5 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">키워드</th>
                        <th className="px-2.5 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">노출 위치</th>
                        <th className="px-2.5 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">통합검색 노출 위치</th>
                        <th className="px-2.5 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">스마트블록 개수</th>
                        <th className="px-2.5 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">블로그 순위</th>
                        <th className="px-2.5 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">월간 검색량</th>
                        <th className="px-2.5 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">콘텐츠 포화도</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {visibleValidKeywords.length > 0 ? (
                        visibleValidKeywords.map((row, i) => (
                          <tr key={`${row.keyword}-${keywordPageStart + i}`} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-2.5 py-2 text-[11px] font-semibold text-[#111827] whitespace-nowrap">{row.keyword}</td>
                            <td className="px-2.5 py-2 text-[10px] font-semibold text-slate-600 whitespace-nowrap">
                              {getKeywordExposureLabel(row)}
                            </td>
                            <td className="px-2.5 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                              {row.integratedSearchBlock ?? formatRankDisplay(row.integratedSearchRank)}
                            </td>
                            <td className="px-2.5 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                              {formatSmartBlockCount(row.smartBlockCount)}
                            </td>
                            <td className="px-2.5 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                              {formatRankDisplay(row.blogRank)}
                            </td>
                            <td className="px-2.5 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                              {formatVolumeCell(row.monthlySearchVolume ?? row.totalVolume)}
                            </td>
                            <td className="px-2.5 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                              {formatSaturation(row.contentSaturation)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-xs">
                            {validKeywordCount === null ? "키워드 후보·검색량 조회 전이거나 없습니다." : "유효 키워드가 없습니다."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {keywordTotalPages > 1 ? (
                  <div className="border-t border-slate-100 bg-white px-3 py-3">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {Array.from({ length: keywordTotalPages }, (_, index) => {
                        const page = index + 1;
                        const isActive = page === keywordPage;
                        return (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setKeywordPage(page)}
                            className={`h-7 min-w-7 rounded-lg px-2 text-[11px] font-bold transition-colors ${
                              isActive
                                ? "bg-[#111827] text-white"
                                : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                            }`}
                            aria-current={isActive ? "page" : undefined}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
