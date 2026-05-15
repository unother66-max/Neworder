"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, KeyRound, FileText, Type, AlignLeft, ImageIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import TopNav from "@/components/top-nav";
import { GlobalLoading } from "@/components/global-loading";
import { HistoryTabChartCard, VisitorMetricsChartCard } from "@/components/blog-analysis-detail-mini-charts";
import type {
  BlogAnalysisRecentPost,
  BlogAnalysisResult,
  BlogAnalysisHistoryPoint,
  BlogKeywordInsight,
  BlogValidKeyword,
  BlogPostPatternAnalysis,
  BlogTopicAverageComparison,
} from "@/lib/blog-analysis-types";
import { analyzeBlogHistoryTrend } from "@/lib/blog-analysis-history-trend";
import { buildBlogAnalysisSummary } from "@/lib/blog-analysis-summary";
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

function formatPostLevel(value: BlogAnalysisRecentPost["postLevel"]): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
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
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString();
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

function formatAvgTitleChars(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  const rounded = Math.round(x * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${s}자`;
}

function formatAvgBodyChars(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `${Math.round(x).toLocaleString()}자`;
}

function formatAvgImages(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  const rounded = Math.round(x * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${s}개`;
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


type Props = { blogId: string };
const RECENT_POSTS_ROWS_PER_PAGE = 5;

export default function BlogAnalysisDetailClient({ blogId }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(blogId);
  const [activeTab, setActiveTab] = useState("recent");
  const [recentPostsPage, setRecentPostsPage] = useState(1);
  const [recentPostsVisibleCount, setRecentPostsVisibleCount] = useState(RECENT_POSTS_ROWS_PER_PAGE);
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
  const [postingFrequency, setPostingFrequency] = useState<number | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  const [validKeywords, setValidKeywords] = useState<BlogValidKeyword[]>([]);
  const [keywordInsights, setKeywordInsights] = useState<BlogKeywordInsight[]>([]);
  const [validKeywordCount, setValidKeywordCount] = useState<number | null>(null);
  const [blogTopic, setBlogTopic] = useState<string | null>(null);

  const [totalRank, setTotalRank] = useState<number | null>(null);
  const [topicRank, setTopicRank] = useState<number | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  const [blogScoreResult, setBlogScoreResult] = useState<BlogScoreResult | null>(null);

  const [historyPoints, setHistoryPoints] = useState<BlogAnalysisHistoryPoint[]>([]);

  const [patternAnalysis, setPatternAnalysis] = useState<BlogPostPatternAnalysis | null>(null);

  const [topicAverageComparison, setTopicAverageComparison] = useState<BlogTopicAverageComparison | null>(null);

  const loadAnalysis = useCallback(async () => {
    if (!isValidNaverBlogId(blogId)) return;

    setLoading(true);
    setFetchError(null);
    setHistoryPoints([]);
    setKeywordInsights([]);
    setPatternAnalysis(null);
    setTopicAverageComparison(null);
    setBlogScoreResult(null);

    try {
      const response = await fetch("/api/blog-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogUrl: blogId }),
      });
      const data = (await response.json()) as BlogAnalysisResult & { error?: string };

      if (response.ok) {
        setNickname(data.nickname);
        setResolvedBlogId(data.blogId);
        setVisitor(data.visitor ?? null);
        setTotalVisitor(data.totalVisitor);
        setRecentPosts(data.recentPosts ?? []);
        setRecentPostsPage(1);
        setRecentPostsVisibleCount(RECENT_POSTS_ROWS_PER_PAGE);
        setPostCount(data.postCount ?? null);
        setPostingFrequency(data.postingFrequency ?? null);
        setSubscriberCount(data.subscriberCount ?? null);
        setValidKeywords(data.validKeywords ?? []);
        setKeywordInsights(data.keywordInsights ?? []);
        setValidKeywordCount(data.validKeywordCount ?? null);
        setBlogTopic(data.blogTopic ?? null);
        setTotalRank(data.totalRank ?? null);
        setTopicRank(data.topicRank ?? null);
        setAnalyzedAt(data.analyzedAt ?? null);
        setPatternAnalysis(data.patternAnalysis ?? null);
        setTopicAverageComparison(data.topicAverageComparison ?? null);

        setProfileImage(data.profileImage || null);

        setBlogScoreResult(
          computeBlogScore({
            visitorCount: data.visitor,
            postCount: data.postCount,
            postingFrequency: data.postingFrequency,
            subscriberCount: data.subscriberCount,
            recentPosts: data.recentPosts ?? [],
            validKeywordCount: data.validKeywordCount ?? null,
          })
        );

        try {
          const hr = await fetch(`/api/blog-analysis/history?blogId=${encodeURIComponent(data.blogId)}&days=14`);
          const hj = (await hr.json()) as { ok?: boolean; points?: BlogAnalysisHistoryPoint[] };
          if (hr.ok && Array.isArray(hj.points)) setHistoryPoints(hj.points);
          else setHistoryPoints([]);
        } catch (e) {
          console.warn("[blog-analysis] 히스토리 조회 실패:", e);
          setHistoryPoints([]);
        }
      } else {
        setFetchError(data.error ?? "분석에 실패했습니다.");
      }
    } catch {
      setFetchError("분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [blogId]);

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

  const influenceSummaryLines = useMemo(() => {
    if (!blogScoreResult) return [] as string[];
    const lines: string[] = [];
    if (peerTotalScore != null) {
      lines.push(influencePeerSentence("영향력 점수", blogScoreResult.influenceScore, peerTotalScore));
    }
    if (peerKeywordInfl != null) {
      lines.push(influencePeerSentence("키워드 영향력 점수", blogScoreResult.keywordInfluenceScore, peerKeywordInfl));
    }
    if (peerContentInfl != null) {
      lines.push(influencePeerSentence("콘텐츠 영향력 점수", blogScoreResult.contentInfluenceScore, peerContentInfl));
    }
    if (lines.length === 0) return ["비교 데이터가 부족해요."];
    return lines;
  }, [blogScoreResult, peerTotalScore, peerKeywordInfl, peerContentInfl]);

  const influenceHasAnyPeerBar = peerTotalScore != null || peerKeywordInfl != null || peerContentInfl != null;

  const patternSummaryLines = useMemo(() => {
    if (!patternAnalysis) return [] as string[];
    const lines: string[] = [];
    const pt = finiteOrNull(topicAverageComparison?.averageTitleLength);
    const mt = finiteOrNull(patternAnalysis.averageTitleLength);
    if (pt != null && mt != null) {
      lines.push(patternPeerSentence("title", mt, pt));
    }
    const pb = finiteOrNull(topicAverageComparison?.averageContentLength);
    const mb = finiteOrNull(patternAnalysis.averageContentLength);
    if (pb != null && mb != null) {
      lines.push(patternPeerSentence("body", mb, pb));
    }
    const pi = finiteOrNull(topicAverageComparison?.averageImageCount);
    const mi = finiteOrNull(patternAnalysis.averageImageCount);
    if (pi != null && mi != null) {
      lines.push(patternPeerSentence("image", mi, pi));
    }
    if (lines.length === 0) return ["비교 데이터가 부족해요."];
    return lines;
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

  useEffect(() => {
    if (recentPostsPage <= recentPostsTotalPages) return;
    setRecentPostsPage(recentPostsTotalPages);
    setRecentPostsVisibleCount(RECENT_POSTS_ROWS_PER_PAGE);
  }, [recentPostsPage, recentPostsTotalPages]);

  const handleRecentPostsPageChange = (page: number) => {
    setRecentPostsPage(page);
    setRecentPostsVisibleCount(RECENT_POSTS_ROWS_PER_PAGE);
  };

  const handleShowMoreRecentPosts = () => {
    setRecentPostsVisibleCount((count) => count + RECENT_POSTS_ROWS_PER_PAGE);
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
    { label: "스크랩 수", value: "-" },
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
                        {validKeywordCount != null ? `${validKeywordCount.toLocaleString()}개` : "—"}
                      </p>
                      <p className="text-[9px] font-medium text-slate-500 leading-none">유효 키워드</p>
                      <p className="text-[8px] text-slate-400 leading-tight">검색량 0 초과</p>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center px-2 py-2 min-h-[72px] sm:min-h-[80px] gap-1">
                      <p className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums leading-none tracking-tight break-all">
                        {formatRankDisplay(totalRank)}
                      </p>
                      <p className="text-[9px] font-medium text-slate-500 leading-none">전체 순위</p>
                      <p className="text-[8px] text-slate-400 leading-tight">히스토리 기준</p>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center px-2 py-2 min-h-[72px] sm:min-h-[80px] gap-1">
                      <p className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums leading-none tracking-tight break-all">
                        {formatRankDisplay(topicRank)}
                      </p>
                      <p className="text-[9px] font-medium text-slate-500 leading-none">주제 순위</p>
                      <p className="text-[8px] text-slate-400 leading-tight">같은 주제 안</p>
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
            <VisitorMetricsChartCard historyPoints={historyPoints} dailyVisitor={visitor} totalVisitor={totalVisitor} />
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

              <div className="mt-3 space-y-0.5 px-0.5">
                {influenceSummaryLines.map((sentence, i) => (
                  <p key={i} className="text-[11px] text-slate-500 leading-snug">
                    {sentence}
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

                  <div className="mt-3 space-y-0.5 px-0.5">
                    {patternSummaryLines.map((sentence, i) => (
                      <p key={i} className="text-[11px] text-slate-500 leading-snug">
                        {sentence}
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
                      const peerT = roughTitleScoreFromPeerChars(topicAverageComparison?.averageTitleLength);
                      const peerC = roughContentScoreFromPeerChars(topicAverageComparison?.averageContentLength);
                      const peerI = roughImageScoreFromPeerCount(topicAverageComparison?.averageImageCount);
                      return (
                        <>
                          <PremiumCompareBar
                            Icon={Type}
                            title="제목 길이"
                            peerLabel="상위권 평균"
                            peerText={formatAvgTitleChars(topicAverageComparison?.averageTitleLength)}
                            peerPct={peerT != null ? clampPct(peerT) : null}
                            myLabel="나의 평균"
                            myText={formatAvgTitleChars(patternAnalysis.averageTitleLength)}
                            myPct={clampPct(tSc)}
                            tierLabel={patternTierCaption(tSc).label}
                            delay={0.15}
                          />
                          <PremiumCompareBar
                            Icon={AlignLeft}
                            title="본문 길이"
                            peerLabel="상위권 평균"
                            peerText={formatAvgBodyChars(topicAverageComparison?.averageContentLength)}
                            peerPct={peerC != null ? clampPct(peerC) : null}
                            myLabel="나의 평균"
                            myText={formatAvgBodyChars(patternAnalysis.averageContentLength)}
                            myPct={clampPct(cSc)}
                            tierLabel={patternTierCaption(cSc).label}
                            delay={0.25}
                          />
                          <PremiumCompareBar
                            Icon={ImageIcon}
                            title="이미지 수"
                            peerLabel="상위권 평균"
                            peerText={formatAvgImages(topicAverageComparison?.averageImageCount)}
                            peerPct={peerI != null ? clampPct(peerI) : null}
                            myLabel="나의 평균"
                            myText={formatAvgImages(patternAnalysis.averageImageCount)}
                            myPct={clampPct(iSc)}
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

          {/* 키워드 테이블 */}
          <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/80 px-2 py-1.5">
              <h4 className="text-[10px] font-bold text-slate-600">유효 키워드 상세 (검색량 &gt; 0)</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 whitespace-nowrap">키워드</th>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">총 검색량</th>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">모바일</th>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">PC</th>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">점수</th>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">등장</th>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">최근</th>
                    <th className="px-2.5 py-1.5 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">경쟁</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {validKeywords.length > 0 ? (
                    validKeywords.map((row, i) => {
                      const insight = keywordInsights.find((k) => k.keyword === row.keyword);
                      return (
                        <tr key={`${row.keyword}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-2.5 py-1.5 text-[11px] font-semibold text-[#111827] whitespace-nowrap">{row.keyword}</td>
                          <td className="px-2.5 py-1.5 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {formatVolumeCell(insight?.totalVolume ?? row.totalVolume)}
                          </td>
                          <td className="px-2.5 py-1.5 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {formatVolumeCell(insight?.mobileVolume ?? row.mobileVolume)}
                          </td>
                          <td className="px-2.5 py-1.5 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {formatVolumeCell(insight?.pcVolume ?? row.pcVolume)}
                          </td>
                          <td
                            className={`px-2.5 py-1.5 text-[10px] text-right tabular-nums whitespace-nowrap font-bold ${insight ? keywordInfluenceScoreClass(insight.keywordScore) : "text-gray-600"}`}
                          >
                            {insight ? formatKeywordScoreCell(insight.keywordScore) : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {insight && Number.isFinite(insight.matchedPostCount) ? insight.matchedPostCount.toLocaleString() : "-"}
                          </td>
                          <td className="px-2.5 py-1.5 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {insight ? formatPostDate(insight.lastAppearedAt) : "-"}
                          </td>
                          <td className={`px-2.5 py-1.5 text-[10px] text-right whitespace-nowrap ${insight ? competitionLevelClass(insight.competitionLevel) : "text-gray-600"}`}>
                            {insight ? insight.competitionLevel : "-"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-gray-400 text-[11px]">
                        {validKeywordCount === null ? "키워드 후보·검색량 조회 전이거나 없습니다." : "유효 키워드가 없습니다."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 포스팅 */}
          <div>
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50/70 px-2.5 py-2">
                <div className="flex gap-0.5 bg-slate-100/80 p-0.5 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setActiveTab("recent")}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${activeTab === "recent" ? "bg-white shadow-sm text-slate-900" : "text-gray-400"}`}
                  >
                    최근 포스팅
                  </button>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold text-gray-400 cursor-not-allowed"
                  >
                    인기글 목록
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">준비중</span>
                  </button>
                </div>
              </div>
              {activeTab === "recent" ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left">
                      <thead className="bg-slate-50/80 border-b border-slate-100">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">노출 상태</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-center whitespace-nowrap">레벨</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">발행일</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500">제목</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">공유</th>
                          <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">가능성</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {recentPosts.length > 0 ? (
                          visibleRecentPosts.map((post, i) => {
                            const publishedAt = post.publishedAt ?? post.createdAt;
                            const potentialScore = getPostPotentialScore(post, validKeywords);
                            const exposureStatus = String(post.exposureStatus ?? "").trim() || "분석됨";
                            const sympathyCount = firstFiniteNumber(post.sympathyCount, post.likeCount);
                            const detailItems = [
                              firstFiniteNumber(post.wordCount) !== null ? `글자 ${formatPostMetric(post.wordCount, "자")}` : null,
                              firstFiniteNumber(post.imageCount) !== null ? `이미지 ${formatPostMetric(post.imageCount, "장")}` : null,
                              firstFiniteNumber(post.commentCount) !== null ? `댓글 ${formatPostMetric(post.commentCount)}` : null,
                              sympathyCount !== null ? `공감 ${formatPostMetric(sympathyCount)}` : null,
                            ].filter(Boolean);

                            return (
                              <tr key={`${post.url || post.title}-${recentPostsPageStart + i}`} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-3 py-2 align-top whitespace-nowrap">
                                  <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
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
                                  <div className="flex items-start gap-2 min-w-0">
                                    {post.thumbnail ? (
                                      <img src={post.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover border border-slate-100" />
                                    ) : null}
                                    <div className="min-w-0">
                                      <a href={post.url} target="_blank" rel="noreferrer" className="block text-xs font-bold text-[#111827] hover:text-[#2563EB] transition-colors truncate">
                                        {post.title || "-"}
                                      </a>
                                      <div className="mt-1 flex max-w-[540px] flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-gray-400">
                                        {detailItems.map((item) => (
                                          <span key={item}>{item}</span>
                                        ))}
                                        {post.url ? (
                                          <a href={post.url} target="_blank" rel="noreferrer" className="max-w-[320px] truncate text-slate-400 hover:text-[#2563EB]">
                                            {post.url}
                                          </a>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top text-right text-[11px] font-bold text-slate-700 tabular-nums whitespace-nowrap">
                                  {formatPostMetric(post.shareCount)}
                                </td>
                                <td className={`px-3 py-2 align-top text-right text-[11px] font-bold tabular-nums whitespace-nowrap ${postScoreClass(potentialScore)}`}>
                                  {potentialScore === null ? "-" : `${Math.round(potentialScore)}점`}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-xs">
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
              ) : (
                <div className="px-3 py-8 text-center text-gray-400 text-xs">
                  인기글 목록은 준비중입니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
