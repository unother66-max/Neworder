"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatSignedDiff, topicComparisonBandLabel } from "@/lib/blog-topic-comparison-format";
import { extractBlogId, isValidNaverBlogId } from "@/lib/scraper";

function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
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

function formatCmpScorePt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return `${Number(n).toFixed(1)}점`;
}

function formatCmpKeywordsCt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  const x = Number(n);
  const core = Number.isInteger(x) ? x.toLocaleString() : (Math.round(x * 10) / 10).toFixed(1);
  return `${core}개`;
}

function formatCmpVisitorCt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return `${Math.round(Number(n)).toLocaleString()}명`;
}

function formatCmpPostingFreq(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return `${Number(n).toFixed(2)}개`;
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

function pctVsAvgPhrase(my: number | null | undefined, avg: number | null | undefined): string | null {
  if (my == null || avg == null || !Number.isFinite(Number(my)) || !Number.isFinite(Number(avg))) return null;
  const a = Number(avg);
  if (Math.abs(a) < 1e-6) return null;
  const p = Math.round(((Number(my) - a) / a) * 100);
  if (p === 0) return "주제 평균과 비슷해요.";
  if (p > 0) return `주제 평균보다 약 ${p}% 높아요.`;
  return `주제 평균보다 약 ${Math.abs(p)}% 낮아요.`;
}

function CompactCompareRow({
  label,
  myDisplay,
  avgDisplay,
  diffDecimals,
  myRaw,
  avgRaw,
}: {
  label: string;
  myDisplay: string;
  avgDisplay: string;
  diffDecimals: number;
  myRaw: number | null | undefined;
  avgRaw: number | null | undefined;
}) {
  const band = topicComparisonBandLabel(myRaw, avgRaw);
  const diffStr = formatSignedDiff(myRaw, avgRaw, diffDecimals);
  const extra = pctVsAvgPhrase(myRaw, avgRaw);
  return (
    <div className="py-2.5 border-b border-gray-50 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
        {band ? <span className={`text-[10px] ${band.className}`}>{band.label}</span> : <span className="text-[10px] text-gray-400">—</span>}
      </div>
      <p className="text-[15px] font-black text-[#111827] mt-0.5 tabular-nums">{myDisplay}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">
        평균 <span className="font-semibold text-slate-700 tabular-nums">{avgDisplay}</span>
        <span className="mx-1 text-gray-300">·</span>
        차이 <span className="font-semibold text-[#2563EB] tabular-nums">{diffStr}</span>
      </p>
      {extra ? <p className="text-[11px] font-semibold text-slate-700 mt-1 leading-snug">{extra}</p> : null}
    </div>
  );
}

/** 블톡식: 회색=주제 평균, 색상=나 (동일 0~100 눈금) */
function PeerMeDualBar({
  title,
  peerScore,
  myScore,
  peerDisplay,
  myDisplay,
}: {
  title: string;
  peerScore: number | null;
  myScore: number;
  peerDisplay: string;
  myDisplay: string;
}) {
  const pp = peerScore != null && Number.isFinite(peerScore) ? clampPct(peerScore) : 0;
  const mp = clampPct(myScore);
  const meBetter = peerScore == null || !Number.isFinite(peerScore) || myScore >= peerScore - 0.25;
  return (
    <div className="py-2 border-b border-gray-100 last:border-b-0">
      <p className="text-[11px] font-bold text-slate-800 mb-1">{title}</p>
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between text-[9px] text-gray-400">
            <span>주제 평균</span>
            <span className="tabular-nums text-slate-600">{peerDisplay}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 mt-0.5 overflow-hidden">
            <div className="h-full rounded-full bg-slate-400" style={{ width: `${pp}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[9px] text-gray-400">
            <span>나</span>
            <span className="tabular-nums font-bold text-[#111827]">{myDisplay}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 mt-0.5 overflow-hidden">
            <div className={`h-full rounded-full ${meBetter ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${mp}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PatternPeerMeDualBar({
  title,
  caption,
  myScore,
  peerScore,
  myMetricLabel,
  peerMetricLabel,
}: {
  title: string;
  caption?: string;
  myScore: number;
  peerScore: number | null;
  myMetricLabel: string;
  peerMetricLabel: string;
}) {
  const pp = peerScore != null ? clampPct(peerScore) : 0;
  const mp = clampPct(myScore);
  const meBetter = peerScore == null || myScore >= peerScore - 1;
  return (
    <div className="py-2 border-b border-gray-100 last:border-b-0">
      <p className="text-[11px] font-bold text-slate-800">{title}</p>
      {caption ? <p className="text-[9px] text-gray-400 mt-0.5 mb-1 leading-snug">{caption}</p> : null}
      <div className="space-y-1.5 mt-1">
        <div>
          <div className="flex justify-between text-[9px] text-gray-400">
            <span>주제 평균</span>
            <span className="tabular-nums text-slate-700">{peerMetricLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 mt-0.5 overflow-hidden">
            <div className="h-full rounded-full bg-slate-400" style={{ width: `${pp}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[9px] text-gray-400">
            <span>나</span>
            <span className="tabular-nums font-bold text-[#111827]">{myMetricLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 mt-0.5 overflow-hidden">
            <div className={`h-full rounded-full ${meBetter ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${mp}%` }} />
          </div>
        </div>
      </div>
      <p className="text-[9px] text-slate-500 mt-1 tabular-nums">패턴 점수 {Math.round(myScore)}점</p>
    </div>
  );
}

type Props = { blogId: string };

export default function BlogAnalysisDetailClient({ blogId }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(blogId);
  const [activeTab, setActiveTab] = useState("recent");
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
  const peerTotalDisplay = peerTotalScore != null ? `${peerTotalScore.toFixed(1)}점` : null;
  const peerKeywordInfl = estimatePeerKeywordInfluence(topicAverageComparison?.averageValidKeywordCount ?? null);
  const peerContentInfl = estimatePeerContentInfluence(topicAverageComparison?.averagePostingFrequency ?? null);

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
    <main className="min-h-screen bg-[#f8fafc] pt-24 pb-20">
      <TopNav />
      <section className="mx-auto max-w-[1180px] px-4 sm:px-5 py-6 sm:py-8">
        <p className="mb-3">
          <Link href="/blog-analysis" className="text-sm font-semibold text-[#2563EB] hover:underline">
            ← 블로그 분석 검색
          </Link>
        </p>

        <div className="mb-4 rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchAnother();
              }}
              placeholder="블로그 아이디 또는 주소를 입력해주세요."
              className="h-10 flex-1 rounded-xl border border-[#d8dde6] px-3 text-sm outline-none focus:border-[#2563EB]"
            />
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleSearchAnother()}
                className="h-10 min-w-[100px] rounded-xl bg-[#333] px-4 text-sm font-bold text-white hover:bg-[#2563EB]"
              >
                분석 시작
              </button>
              <Link
                href="/blog-analysis"
                className="h-10 inline-flex items-center justify-center rounded-xl border border-[#e5e7eb] bg-slate-50 px-4 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                검색 기록
              </Link>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <h1 className="text-lg sm:text-xl font-black text-[#111827] tracking-tight">블로그 채널 분석</h1>
          <p className="mt-0.5 text-[11px] sm:text-[12px] text-gray-500">
            <span className="font-semibold text-[#111827]">{nickname}</span>
            <span className="text-gray-400"> · @{resolvedBlogId}</span>
          </p>
          {analyzedAt ? (
            <p className="text-[9px] text-gray-400 mt-0.5 tabular-nums">분석 시각 · {formatAnalyzedAt(analyzedAt)}</p>
          ) : null}
        </div>

        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* 1행: 프로필 + 최신 순위 + 블로그 정보 */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch">
            <div className="w-full lg:w-[240px] shrink-0 order-1">
              <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-sm text-center h-full">
                <div className="h-14 w-14 rounded-full bg-gray-100 mx-auto mb-2 flex items-center justify-center text-xl overflow-hidden border border-[#e5e7eb]">
                  {profileImage ? <img src={profileImage} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-300">👤</span>}
                </div>
                <h3 className="text-[15px] font-bold text-[#111827] leading-tight">{nickname}</h3>
                <p className="text-[10px] text-gray-400">@{resolvedBlogId}</p>
                <div className="mt-3 pt-2 border-t border-gray-50 text-left space-y-1.5">
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>운영 등급</span>
                    <span className={`font-black ${blogScoreResult.grade === "S" || blogScoreResult.grade === "A" ? "text-[#2563EB]" : "text-[#f59e0b]"}`}>
                      {blogScoreResult.grade}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] text-gray-500">레벨</span>
                    <span className="text-xl font-black text-[#111827]">Lv.{blogScoreResult.level}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>영향력 지수</span>
                    <span className="font-black text-[#111827] tabular-nums">{blogScoreResult.totalScore.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${clampPct(blogScoreResult.totalScore)}%` }} />
                  </div>
                  <p className="text-[8px] text-gray-400">다음 레벨까지 {blogScoreResult.nextLevelRemaining.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-2 min-w-0 order-2">
              <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-600 px-3 py-1.5">
                  <span className="text-[10px] font-bold text-white tracking-tight">최신 순위</span>
                </div>
                <div className="p-2 sm:p-3">
                  <div className="grid grid-cols-3 gap-2 divide-x divide-gray-100">
                    <div className="text-center px-1 first:pl-0">
                      <p className="text-[9px] text-gray-400">유효 키워드</p>
                      <p className="text-base sm:text-lg font-black text-red-600 tabular-nums mt-0.5">
                        {validKeywordCount != null ? `${validKeywordCount.toLocaleString()}개` : "—"}
                      </p>
                      <p className="text-[8px] text-gray-400 mt-0.5">검색량 0 초과</p>
                    </div>
                    <div className="text-center px-1">
                      <p className="text-[9px] text-gray-400">전체 순위</p>
                      <p className="text-base sm:text-lg font-black text-orange-500 tabular-nums mt-0.5">{formatRankDisplay(totalRank)}</p>
                      <p className="text-[8px] text-gray-400 mt-0.5">히스토리 기준</p>
                    </div>
                    <div className="text-center px-1 last:pr-0">
                      <p className="text-[9px] text-gray-400">주제 순위</p>
                      <p className="text-base sm:text-lg font-black text-orange-500 tabular-nums mt-0.5">{formatRankDisplay(topicRank)}</p>
                      <p className="text-[8px] text-gray-400 mt-0.5">같은 주제 안</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-600 px-3 py-1.5">
                  <span className="text-[10px] font-bold text-white tracking-tight">블로그 정보</span>
                </div>
                <div className="p-2 sm:p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-center">
                    {blogInfoItems.map((o, i) => (
                      <div key={i} className="rounded-lg bg-slate-50/80 py-1.5 px-0.5 min-h-[52px] flex flex-col justify-center">
                        <p className="font-bold text-[11px] sm:text-[12px] text-[#111827] tabular-nums truncate">{o.value}</p>
                        <p className="text-[8px] text-gray-400 mt-0.5 leading-tight">{o.label}</p>
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
          <div className="rounded-2xl border border-[#2563EB]/20 bg-gradient-to-b from-[#f8fafc] to-white p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-[#2563EB]">AI 분석 요약</span>
              <span className="text-[8px] text-gray-400">규칙 기반 · 참고</span>
            </div>
            <ul className="space-y-1">
              {summaryLines.slice(0, 3).map((line, i) => (
                <li key={i} className="text-[11px] sm:text-[12px] text-slate-800 leading-snug pl-2.5 border-l-2 border-[#2563EB]/30">
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* 영향력 · 포스팅 패턴 (2열) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3 sm:p-4 shadow-sm flex flex-col h-full">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-[13px] font-bold text-[#111827]">최근 블로그 영향력</h4>
                <span className="text-[9px] text-gray-400 shrink-0">주제 평균 대비</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center mb-2">
                <div className="rounded-lg bg-slate-50 py-1.5 px-0.5">
                  <p className="text-[9px] text-gray-400">종합</p>
                  <p className={`text-[11px] font-bold ${tierCaption(blogScoreResult.influenceScore).className}`}>
                    {tierCaption(blogScoreResult.influenceScore).label}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 py-1.5 px-0.5">
                  <p className="text-[9px] text-gray-400">키워드</p>
                  <p className={`text-[11px] font-bold ${tierCaption(blogScoreResult.keywordInfluenceScore).className}`}>
                    {tierCaption(blogScoreResult.keywordInfluenceScore).label}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 py-1.5 px-0.5">
                  <p className="text-[9px] text-gray-400">콘텐츠</p>
                  <p className={`text-[11px] font-bold ${tierCaption(blogScoreResult.contentInfluenceScore).className}`}>
                    {tierCaption(blogScoreResult.contentInfluenceScore).label}
                  </p>
                </div>
              </div>
              <p className="text-[9px] text-gray-400 mb-1.5 leading-snug">회색 막대는 주제 평균, 색 막대는 나예요. 같은 0~100 눈금으로 비교됩니다.</p>
              <div className="flex-1 min-h-0">
                <PeerMeDualBar
                  title="종합 영향력"
                  peerScore={peerTotalForBar}
                  myScore={blogScoreResult.influenceScore}
                  peerDisplay={peerTotalDisplay ?? "—"}
                  myDisplay={`${blogScoreResult.influenceScore.toFixed(1)}점`}
                />
                <PeerMeDualBar
                  title="키워드 영향력"
                  peerScore={peerKeywordInfl != null ? clampPct(peerKeywordInfl) : null}
                  myScore={blogScoreResult.keywordInfluenceScore}
                  peerDisplay={peerKeywordInfl != null ? `${peerKeywordInfl.toFixed(1)}점(추정)` : "—"}
                  myDisplay={`${blogScoreResult.keywordInfluenceScore.toFixed(1)}점`}
                />
                <PeerMeDualBar
                  title="콘텐츠 영향력"
                  peerScore={peerContentInfl != null ? clampPct(peerContentInfl) : null}
                  myScore={blogScoreResult.contentInfluenceScore}
                  peerDisplay={peerContentInfl != null ? `${peerContentInfl.toFixed(1)}점(추정)` : "—"}
                  myDisplay={`${blogScoreResult.contentInfluenceScore.toFixed(1)}점`}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3 sm:p-4 shadow-sm flex flex-col h-full">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-[13px] font-bold text-[#111827]">포스팅 패턴</h4>
                <span className="text-[9px] text-gray-400 shrink-0">주제 평균 대비</span>
              </div>
              {!patternAnalysis ? (
                <p className="text-[12px] text-gray-400 py-3">최근 공개 글을 불러오지 못했거나 분석할 포스트가 없습니다.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-1.5 text-center mb-2">
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <p className="text-[9px] text-gray-400">제목</p>
                      <p className={`text-[11px] font-bold ${patternTierCaption(Number(patternAnalysis.titleLengthScore ?? 0)).className}`}>
                        {patternTierCaption(Number(patternAnalysis.titleLengthScore ?? 0)).label}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <p className="text-[9px] text-gray-400">본문</p>
                      <p className={`text-[11px] font-bold ${patternTierCaption(Number(patternAnalysis.contentLengthScore ?? 0)).className}`}>
                        {patternTierCaption(Number(patternAnalysis.contentLengthScore ?? 0)).label}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <p className="text-[9px] text-gray-400">이미지</p>
                      <p className={`text-[11px] font-bold ${patternTierCaption(Number(patternAnalysis.imageCountScore ?? 0)).className}`}>
                        {patternTierCaption(Number(patternAnalysis.imageCountScore ?? 0)).label}
                      </p>
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-400 mb-1 leading-snug">주제 평균을 패턴 점수로 환산해 같은 눈금에 비교해요.</p>
                  <div className="flex-1 min-h-0">
                    <PatternPeerMeDualBar
                      title="제목 길이"
                      caption="짧거나 과하게 길면 불리할 수 있어요."
                      myScore={Number(patternAnalysis.titleLengthScore ?? 0)}
                      peerScore={roughTitleScoreFromPeerChars(topicAverageComparison?.averageTitleLength)}
                      myMetricLabel={formatAvgTitleChars(patternAnalysis.averageTitleLength)}
                      peerMetricLabel={formatAvgTitleChars(topicAverageComparison?.averageTitleLength)}
                    />
                    <PatternPeerMeDualBar
                      title="본문 길이"
                      caption="분량이 너무 얕으면 패턴 점수가 약해질 수 있어요."
                      myScore={Number(patternAnalysis.contentLengthScore ?? 0)}
                      peerScore={roughContentScoreFromPeerChars(topicAverageComparison?.averageContentLength)}
                      myMetricLabel={formatAvgBodyChars(patternAnalysis.averageContentLength)}
                      peerMetricLabel={formatAvgBodyChars(topicAverageComparison?.averageContentLength)}
                    />
                    <PatternPeerMeDualBar
                      title="이미지 수"
                      caption="거의 없거나 과하면 점수가 흔들릴 수 있어요."
                      myScore={Number(patternAnalysis.imageCountScore ?? 0)}
                      peerScore={roughImageScoreFromPeerCount(topicAverageComparison?.averageImageCount)}
                      myMetricLabel={formatAvgImages(patternAnalysis.averageImageCount)}
                      peerMetricLabel={formatAvgImages(topicAverageComparison?.averageImageCount)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 키워드 테이블 */}
          <div className="rounded-2xl border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
              <h4 className="text-[10px] font-bold text-gray-600 tracking-tighter">● 유효 키워드 상세 (검색량 &gt; 0)</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 whitespace-nowrap">키워드</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">총 검색량</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">모바일</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">PC</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">점수</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">등장</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">최근</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 text-right whitespace-nowrap">경쟁</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {validKeywords.length > 0 ? (
                    validKeywords.map((row, i) => {
                      const insight = keywordInsights.find((k) => k.keyword === row.keyword);
                      return (
                        <tr key={`${row.keyword}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-3 py-2 text-[11px] font-bold text-[#111827] whitespace-nowrap">{row.keyword}</td>
                          <td className="px-3 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {formatVolumeCell(insight?.totalVolume ?? row.totalVolume)}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {formatVolumeCell(insight?.mobileVolume ?? row.mobileVolume)}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {formatVolumeCell(insight?.pcVolume ?? row.pcVolume)}
                          </td>
                          <td
                            className={`px-3 py-2 text-[10px] text-right tabular-nums whitespace-nowrap font-bold ${insight ? keywordInfluenceScoreClass(insight.keywordScore) : "text-gray-600"}`}
                          >
                            {insight ? formatKeywordScoreCell(insight.keywordScore) : "-"}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {insight && Number.isFinite(insight.matchedPostCount) ? insight.matchedPostCount.toLocaleString() : "-"}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-600 text-right tabular-nums whitespace-nowrap">
                            {insight ? formatPostDate(insight.lastAppearedAt) : "-"}
                          </td>
                          <td className={`px-3 py-2 text-[10px] text-right whitespace-nowrap ${insight ? competitionLevelClass(insight.competitionLevel) : "text-gray-600"}`}>
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

          {/* 주제 평균 비교 */}
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3 sm:p-4 shadow-sm">
            <h4 className="text-[13px] font-bold mb-0.5 text-[#111827]">같은 주제 평균과 비교</h4>
            <p className="text-[9px] text-gray-400 mb-2 leading-snug">동료 블로그 스냅샷 평균 · 현재 블로그는 계산에서 제외</p>
            {!topicAverageComparison ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-slate-50/60 px-3 py-3 text-center text-[11px] text-gray-400">
                비교할 동료 표본이 아직 부족합니다. 분석을 다시 실행하면 채워질 수 있어요.
              </div>
            ) : (
              <>
                <p className="text-[10px] text-gray-500 mb-2">
                  주제 <span className="font-bold text-[#111827]">{topicAverageComparison.topic?.trim() || "—"}</span>
                  <span className="text-gray-300"> · </span>표본 {topicAverageComparison.sampleCount}개
                </p>
                <CompactCompareRow
                  label="영향력 점수"
                  myDisplay={formatCmpScorePt(topicAverageComparison.myTotalScore)}
                  avgDisplay={formatCmpScorePt(topicAverageComparison.averageTotalScore)}
                  diffDecimals={1}
                  myRaw={topicAverageComparison.myTotalScore}
                  avgRaw={topicAverageComparison.averageTotalScore}
                />
                <CompactCompareRow
                  label="키워드 개수(평균 대비)"
                  myDisplay={formatCmpKeywordsCt(topicAverageComparison.myValidKeywordCount)}
                  avgDisplay={formatCmpKeywordsCt(topicAverageComparison.averageValidKeywordCount)}
                  diffDecimals={1}
                  myRaw={topicAverageComparison.myValidKeywordCount}
                  avgRaw={topicAverageComparison.averageValidKeywordCount}
                />
                <CompactCompareRow
                  label="방문자 수"
                  myDisplay={formatCmpVisitorCt(topicAverageComparison.myVisitorCount)}
                  avgDisplay={formatCmpVisitorCt(topicAverageComparison.averageVisitorCount)}
                  diffDecimals={1}
                  myRaw={topicAverageComparison.myVisitorCount}
                  avgRaw={topicAverageComparison.averageVisitorCount}
                />
                <CompactCompareRow
                  label="작성 빈도"
                  myDisplay={formatCmpPostingFreq(topicAverageComparison.myPostingFrequency)}
                  avgDisplay={formatCmpPostingFreq(topicAverageComparison.averagePostingFrequency)}
                  diffDecimals={2}
                  myRaw={topicAverageComparison.myPostingFrequency}
                  avgRaw={topicAverageComparison.averagePostingFrequency}
                />
                <CompactCompareRow
                  label="평균 제목 길이"
                  myDisplay={formatAvgTitleChars(topicAverageComparison.myAverageTitleLength)}
                  avgDisplay={formatAvgTitleChars(topicAverageComparison.averageTitleLength)}
                  diffDecimals={1}
                  myRaw={topicAverageComparison.myAverageTitleLength}
                  avgRaw={topicAverageComparison.averageTitleLength}
                />
                <CompactCompareRow
                  label="평균 본문 길이"
                  myDisplay={formatAvgBodyChars(topicAverageComparison.myAverageContentLength)}
                  avgDisplay={formatAvgBodyChars(topicAverageComparison.averageContentLength)}
                  diffDecimals={0}
                  myRaw={topicAverageComparison.myAverageContentLength}
                  avgRaw={topicAverageComparison.averageContentLength}
                />
                <CompactCompareRow
                  label="평균 이미지 수"
                  myDisplay={formatAvgImages(topicAverageComparison.myAverageImageCount)}
                  avgDisplay={formatAvgImages(topicAverageComparison.averageImageCount)}
                  diffDecimals={1}
                  myRaw={topicAverageComparison.myAverageImageCount}
                  avgRaw={topicAverageComparison.averageImageCount}
                />
              </>
            )}
          </div>

          {/* 포스팅 */}
          <div>
            <div className="flex gap-1 mb-2 bg-gray-100/50 p-1 rounded-xl w-fit">
              {[{ id: "recent", label: "최근 포스팅" }, { id: "popular", label: "인기글 목록" }].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === tab.id ? "bg-white shadow-sm" : "text-gray-400"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-500">발행일</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-500">제목</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-gray-500 text-center w-10">분석</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentPosts.length > 0 ? (
                    recentPosts.map((post, i) => (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-[10px] text-gray-400 whitespace-nowrap">{formatPostDate(post.createdAt)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-[#111827] min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {post.thumbnail ? (
                              <img src={post.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover border border-gray-100" />
                            ) : null}
                            <a href={post.url} target="_blank" rel="noreferrer" className="hover:text-[#2563EB] transition-colors truncate">
                              {post.title}
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button type="button" className="p-1.5 hover:bg-gray-100 rounded-lg text-sm">
                            🔍
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-300 text-xs">
                        최근 글이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
