"use client";

import { useState } from "react";
import TopNav from "@/components/top-nav";
import PageHeader from "@/components/page-header";
import type {
  BlogAnalysisRecentPost,
  BlogAnalysisResult,
  BlogAnalysisHistoryPoint,
  BlogValidKeyword,
  BlogPostPatternAnalysis,
  BlogTopicAverageComparison,
} from "@/lib/blog-analysis-types";
import { BlogAnalysisHistoryPanel } from "@/components/blog-analysis-history-panel";
import { computeBlogScore, type BlogScoreResult } from "@/lib/blog-score";
import { formatSignedDiff, topicComparisonBandLabel } from "@/lib/blog-topic-comparison-format";

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

/** 포스팅 패턴 점수 구간 (0~24 / 25~49 / 50~74 / 75~100) */
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

function PatternGaugeRow({
  title,
  caption,
  score,
  avgDisplay,
  barClass,
}: {
  title: string;
  caption: string;
  score: number;
  avgDisplay: string;
  barClass: string;
}) {
  const tier = patternTierCaption(score);
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="font-bold">{title}</span>
        <span className={`font-bold ${tier.className}`}>{tier.label}</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-2">{caption}</p>
      <div className="flex items-center gap-3 mb-1">
        <div className="h-2 flex-1 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${clampPct(score)}%` }} />
        </div>
        <span className="text-[11px] font-bold text-[#111827] tabular-nums shrink-0">{avgDisplay}</span>
      </div>
    </div>
  );
}

function InfluenceTierLabel({ score }: { score: number }) {
  const t = tierCaption(score);
  return <span className={`font-bold ${t.className}`}>{t.label}</span>;
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

function TopicComparisonRow({
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
  return (
    <div className="py-4 border-b border-gray-50 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-bold text-[#111827]">{label}</span>
        {band ? <span className={`text-[12px] ${band.className}`}>{band.label}</span> : <span className="text-[12px] text-gray-400 font-bold">—</span>}
      </div>
      <p className="text-[12px] text-[#4b5563] leading-relaxed break-words">
        <span className="text-gray-500">내 블로그</span> <span className="font-semibold text-[#111827] tabular-nums">{myDisplay}</span>
        <span className="text-gray-300 mx-1.5">/</span>
        <span className="text-gray-500">주제 평균</span> <span className="font-semibold text-[#111827] tabular-nums">{avgDisplay}</span>
        <span className="text-gray-300 mx-1.5">/</span>
        <span className="text-gray-500">차이</span>{" "}
        <span className="font-semibold text-[#111827] tabular-nums">{diffStr}</span>
      </p>
    </div>
  );
}

function TopicAverageComparisonRows({ data }: { data: BlogTopicAverageComparison }) {
  return (
    <>
      <p className="text-[11px] text-gray-500 mb-4">
        주제{" "}
        <span className="font-bold text-[#111827]">{data.topic != null && String(data.topic).trim() !== "" ? data.topic : "—"}</span>
        <span className="text-gray-400"> · </span>
        표본 블로그 <span className="font-bold tabular-nums">{data.sampleCount}</span>개 (히스토리 기준)
      </p>
      <TopicComparisonRow
        label="영향력 점수"
        myDisplay={formatCmpScorePt(data.myTotalScore)}
        avgDisplay={formatCmpScorePt(data.averageTotalScore)}
        diffDecimals={1}
        myRaw={data.myTotalScore}
        avgRaw={data.averageTotalScore}
      />
      <TopicComparisonRow
        label="유효 키워드"
        myDisplay={formatCmpKeywordsCt(data.myValidKeywordCount)}
        avgDisplay={formatCmpKeywordsCt(data.averageValidKeywordCount)}
        diffDecimals={1}
        myRaw={data.myValidKeywordCount}
        avgRaw={data.averageValidKeywordCount}
      />
      <TopicComparisonRow
        label="방문자 수"
        myDisplay={formatCmpVisitorCt(data.myVisitorCount)}
        avgDisplay={formatCmpVisitorCt(data.averageVisitorCount)}
        diffDecimals={1}
        myRaw={data.myVisitorCount}
        avgRaw={data.averageVisitorCount}
      />
      <TopicComparisonRow
        label="작성 빈도"
        myDisplay={formatCmpPostingFreq(data.myPostingFrequency)}
        avgDisplay={formatCmpPostingFreq(data.averagePostingFrequency)}
        diffDecimals={2}
        myRaw={data.myPostingFrequency}
        avgRaw={data.averagePostingFrequency}
      />
      <TopicComparisonRow
        label="평균 제목 길이"
        myDisplay={formatAvgTitleChars(data.myAverageTitleLength)}
        avgDisplay={formatAvgTitleChars(data.averageTitleLength)}
        diffDecimals={1}
        myRaw={data.myAverageTitleLength}
        avgRaw={data.averageTitleLength}
      />
      <TopicComparisonRow
        label="평균 글자 수"
        myDisplay={formatAvgBodyChars(data.myAverageContentLength)}
        avgDisplay={formatAvgBodyChars(data.averageContentLength)}
        diffDecimals={0}
        myRaw={data.myAverageContentLength}
        avgRaw={data.averageContentLength}
      />
      <TopicComparisonRow
        label="평균 이미지 수"
        myDisplay={formatAvgImages(data.myAverageImageCount)}
        avgDisplay={formatAvgImages(data.averageImageCount)}
        diffDecimals={1}
        myRaw={data.myAverageImageCount}
        avgRaw={data.averageImageCount}
      />
    </>
  );
}

export default function BlogAnalysisPage() {
  const [blogUrl, setBlogUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("recent");
  const [rankTab, setRankTab] = useState<"total" | "topic" | "keywords">("total");

  const [hasResult, setHasResult] = useState(false);
  const [visitor, setVisitor] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [blogId, setBlogId] = useState("");
  const [totalVisitor, setTotalVisitor] = useState(0);
  const [recentPosts, setRecentPosts] = useState<BlogAnalysisRecentPost[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [postCount, setPostCount] = useState<number | null>(null);
  const [postingFrequency, setPostingFrequency] = useState<number | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);

  const [validKeywords, setValidKeywords] = useState<BlogValidKeyword[]>([]);
  const [validKeywordCount, setValidKeywordCount] = useState<number | null>(null);
  const [blogTopic, setBlogTopic] = useState<string | null>(null);

  const [totalRank, setTotalRank] = useState<number | null>(null);
  const [topicRank, setTopicRank] = useState<number | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  const [blogScoreResult, setBlogScoreResult] = useState<BlogScoreResult | null>(null);

  const [historyPoints, setHistoryPoints] = useState<BlogAnalysisHistoryPoint[]>([]);

  const [patternAnalysis, setPatternAnalysis] = useState<BlogPostPatternAnalysis | null>(null);

  const [topicAverageComparison, setTopicAverageComparison] = useState<BlogTopicAverageComparison | null>(null);

  const handleAnalyze = async () => {
    if (!blogUrl) return alert("블로그 주소를 입력해주세요!");
    setLoading(true);
    setHistoryPoints([]);
    setPatternAnalysis(null);
    setTopicAverageComparison(null);
    try {
      const response = await fetch("/api/blog-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogUrl }),
      });
      const data = (await response.json()) as BlogAnalysisResult & { error?: string };
      
      if (response.ok) {
        setHasResult(true);
        setNickname(data.nickname);
        setBlogId(data.blogId);
        setVisitor(data.visitor ?? null);
        setTotalVisitor(data.totalVisitor);
        setRecentPosts(data.recentPosts ?? []);
        setPostCount(data.postCount ?? null);
        setPostingFrequency(data.postingFrequency ?? null);
        setSubscriberCount(data.subscriberCount ?? null);
        setValidKeywords(data.validKeywords ?? []);
        setValidKeywordCount(data.validKeywordCount ?? null);
        setBlogTopic(data.blogTopic ?? null);
        setTotalRank(data.totalRank ?? null);
        setTopicRank(data.topicRank ?? null);
        setAnalyzedAt(data.analyzedAt ?? null);
        setPatternAnalysis(data.patternAnalysis ?? null);
        setTopicAverageComparison(data.topicAverageComparison ?? null);

        // ★ 서버에서 내려준 안전한 이미지를 그대로 세팅
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
          const hr = await fetch(
            `/api/blog-analysis/history?blogId=${encodeURIComponent(data.blogId)}&days=14`
          );
          const hj = (await hr.json()) as { ok?: boolean; points?: BlogAnalysisHistoryPoint[] };
          if (hr.ok && Array.isArray(hj.points)) setHistoryPoints(hj.points);
          else setHistoryPoints([]);
        } catch (e) {
          console.warn("[blog-analysis] 히스토리 조회 실패:", e);
          setHistoryPoints([]);
        }
      } else { alert(data.error ?? "분석에 실패했습니다."); }
    } catch { alert("분석 중 오류가 발생했습니다."); }
    finally { setLoading(false); }
  };

  const blogInfoItems = [
    { label: "주제", value: blogTopic != null && blogTopic.trim() !== "" ? blogTopic : "-" },
    {
      label: "게시물",
      value: postCount != null ? `${postCount.toLocaleString()}개` : "-",
    },
    {
      label: "작성빈도",
      value: postingFrequency != null ? `${postingFrequency.toFixed(2)}개` : "-",
    },
    { label: "스크랩", value: "-" },
    {
      label: "이웃 수",
      value: subscriberCount != null ? `${subscriberCount.toLocaleString()}명` : "-",
    },
  ];

  return (
    <main className="min-h-screen bg-[#f8fafc] pt-24 pb-20">
      <TopNav />
      <section className="mx-auto max-w-[1180px] px-5 py-8">
        <PageHeader title="블로그 채널 분석" description="내 블로그의 실질적인 영향력과 검색 노출 지수를 정밀하게 분석합니다." />

        <div className="mt-8 rounded-[18px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input type="text" value={blogUrl} onChange={(e) => setBlogUrl(e.target.value)} placeholder="https://blog.naver.com/아이디" className="h-[46px] flex-1 rounded-[12px] border border-[#d8dde6] px-4 outline-none focus:border-[#2563EB]" />
            <div className="flex h-[46px] min-w-[150px] items-center justify-center rounded-[14px] border border-[#e5e7eb] bg-[#f3f4f6] px-4 text-[14px] font-bold">
              방문자 {visitor !== null ? visitor.toLocaleString() : "-"}
            </div>
            <button onClick={handleAnalyze} disabled={loading} className="h-[46px] min-w-[120px] rounded-[14px] bg-[#333] px-5 font-bold text-white hover:bg-[#2563EB] disabled:opacity-50">
              {loading ? "분석 중..." : "분석 시작"}
            </button>
          </div>
        </div>

        {hasResult && blogScoreResult && (
          <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-6 md:flex-row">
              <div className="w-full md:w-[280px] shrink-0">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm text-center h-full">
                  
                  {/* ★ 완전히 깔끔해진 프로필 사진 영역 ★ */}
                  <div className="h-20 w-20 rounded-full bg-gray-100 mx-auto mb-3 flex items-center justify-center text-3xl overflow-hidden border border-[#e5e7eb] shadow-sm">
                    {profileImage ? (
                      <img 
                        src={profileImage} 
                        alt="프로필" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <span className="text-gray-300">👤</span>
                    )}
                  </div>

                  <h3 className="text-[18px] font-bold text-[#111827]">{nickname}</h3>
                  <p className="text-[13px] text-gray-400">@{blogId}</p>
                  <div className="mt-6 pt-6 border-t border-gray-50 text-left">
                    <div className="flex justify-between items-end text-[13px] mb-1 text-gray-500">
                      <span>블로그 레벨 / 운영 등급</span>
                      <span className={`text-[16px] font-black ${blogScoreResult.grade === "S" || blogScoreResult.grade === "A" ? "text-[#2563EB]" : "text-[#f59e0b]"}`}>
                        {blogScoreResult.grade}
                      </span>
                    </div>
                    <div className="text-[32px] font-black text-[#111827] mb-2">Lv.{blogScoreResult.level}</div>
                    <div className="flex justify-between text-[10px] mb-1 text-gray-400">
                      <span>영향력 지수 : {blogScoreResult.totalScore}</span>
                      <span className="text-[#2563EB] font-bold">다음 레벨까지 {blogScoreResult.nextLevelRemaining.toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000" style={{ width: `${clampPct(blogScoreResult.totalScore)}%` }}></div>
                    </div>
                    <div className="mt-4 p-3 bg-gray-50 rounded-xl text-[11px] text-gray-500 leading-tight">
                      <span className="font-bold text-[#111827]">TIPS: </span>
                      {blogScoreResult.level < 6 && (blogScoreResult.grade === "S" || blogScoreResult.grade === "A") 
                        ? "레벨은 낮지만 최근 통합검색/스마트블록 노출이 우수한 떡상 블로그입니다."
                        : blogScoreResult.level >= 7 && (blogScoreResult.grade === "C" || blogScoreResult.grade === "D")
                        ? "과거 영향력은 높지만 최근 검색 노출 활동이 다소 부족한 상태입니다."
                        : "레벨과 등급이 비례하여 꾸준하게 성장하고 있는 블로그입니다."}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 우측 지표들 */}
              <div className="flex-1 space-y-4">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-400 mb-4 tracking-tighter">● 최신 순위</h4>
                  <p className="text-[11px] text-gray-400 text-center mb-3">서비스 내 분석 히스토리 기준 (비공식)</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="border-r border-gray-50"><p className="text-xl font-black text-[#111827]">{validKeywordCount != null ? `${validKeywordCount.toLocaleString()}개` : "-"}</p><p className="text-[11px] text-gray-400 mt-1">유효 키워드</p></div>
                    <div className="border-r border-gray-50"><p className="text-xl font-black text-[#111827]">{formatRankDisplay(totalRank)}</p><p className="text-[11px] text-gray-400 mt-1">전체 순위</p></div>
                    <div><p className="text-xl font-black text-[#111827]">{formatRankDisplay(topicRank)}</p><p className="text-[11px] text-gray-400 mt-1">주제 순위</p></div>
                  </div>
                  {analyzedAt ? (
                    <p className="text-[11px] text-gray-400 mt-3 text-center tabular-nums">최근 분석 · {formatAnalyzedAt(analyzedAt)}</p>
                  ) : null}
                </div>
                <BlogAnalysisHistoryPanel points={historyPoints} />
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-400 mb-4 tracking-tighter">● 블로그 정보</h4>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {blogInfoItems.map((o, i) => (
                      <div key={i}>
                        <p className="font-bold text-[14px] text-[#111827] mb-1">{o.value}</p>
                        <p className="text-[10px] text-gray-400">{o.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 중간 그래프/분석 박스 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <h4 className="px-6 py-3 bg-gray-600 text-white font-bold text-sm">방문자 수 지표</h4>
                <div className="p-6 flex gap-4 h-44">
                  <div className="flex-1 border-b border-l border-gray-50 relative">
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none"><path d="M0 80 L20 75 L40 85 L60 70 L80 75 L100 60" fill="none" stroke="#ef4444" strokeWidth="2"/></svg>
                  </div>
                  <div className="w-32 text-right space-y-4">
                    <p className="text-xs text-green-500 font-bold">전일 대비 -</p>
                    <div><p className="text-[10px] text-gray-400">일일</p><p className="font-black text-lg">{visitor != null ? `${visitor.toLocaleString()}명` : "-"}</p></div>
                    <div><p className="text-[10px] text-gray-400">누적</p><p className="font-black text-sm">{totalVisitor.toLocaleString()}명</p></div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="flex border-b border-gray-50">
                   <button type="button" onClick={() => setRankTab("total")} className={`px-5 py-3 text-sm font-bold ${rankTab === "total" ? "bg-gray-600 text-white" : "text-gray-400"}`}>전체 순위</button>
                   <button type="button" onClick={() => setRankTab("topic")} className={`px-5 py-3 text-sm font-bold ${rankTab === "topic" ? "bg-gray-600 text-white" : "text-gray-400"}`}>주제 순위</button>
                   <button type="button" onClick={() => setRankTab("keywords")} className={`px-5 py-3 text-sm font-bold ${rankTab === "keywords" ? "bg-gray-600 text-white" : "text-gray-400"}`}>유효키워드</button>
                </div>
                <div className="p-6 flex-1 flex gap-4">
                  <div className="flex-1 bg-gray-50/50 rounded-lg relative overflow-hidden"><svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none"><path d="M0 20 L40 60 L100 40" fill="none" stroke="#ef4444" strokeWidth="2"/></svg></div>
                  <div className="w-32 text-right">
                    {rankTab === "keywords" ? (
                      <>
                        <p className="text-[10px] text-gray-400 mb-4">검색량 기준</p>
                        <p className="text-[10px] text-gray-400">유효 키워드</p>
                        <p className="font-black text-[#111827] text-xl">{validKeywordCount != null ? `${validKeywordCount.toLocaleString()}개` : "-"}</p>
                      </>
                    ) : rankTab === "topic" ? (
                      <>
                        <p className="text-[10px] text-gray-400 mb-4">히스토리 기준</p>
                        <p className="text-[10px] text-gray-400">주제 내</p>
                        <p className="font-black text-[#111827] text-xl">{formatRankDisplay(topicRank)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[10px] text-gray-400 mb-4">히스토리 기준</p>
                        <p className="text-[10px] text-gray-400">전체</p>
                        <p className="font-black text-[#111827] text-xl">{formatRankDisplay(totalRank)}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
                <h4 className="text-[16px] font-bold mb-6 text-[#111827]">최근 블로그 영향력을 분석했어요 ⓘ</h4>
                <div className="space-y-8">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-bold">영향력 지수</span>
                      <InfluenceTierLabel score={blogScoreResult.influenceScore} />
                    </div>
                    <p className="text-[11px] text-gray-400 mb-2">임시 가중치로 산출한 종합 영향력 점수예요.</p>
                    <div className="h-2 w-full bg-gray-100 rounded-full"><div className="h-full bg-orange-400 rounded-full transition-all duration-500" style={{ width: `${clampPct(blogScoreResult.influenceScore)}%` }}></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-bold">키워드 영향력</span>
                      <InfluenceTierLabel score={blogScoreResult.keywordInfluenceScore} />
                    </div>
                    <p className="text-[11px] text-gray-400 mb-2">유효 키워드·방문자·이웃 가중치로 산출한 임시 지표예요.</p>
                    <div className="h-2 w-full bg-gray-100 rounded-full"><div className="h-full bg-red-400 rounded-full transition-all duration-500" style={{ width: `${clampPct(blogScoreResult.keywordInfluenceScore)}%` }}></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-bold">콘텐츠 영향력</span>
                      <InfluenceTierLabel score={blogScoreResult.contentInfluenceScore} />
                    </div>
                    <p className="text-[11px] text-gray-400 mb-2">게시물 수·작성 빈도·최근 포스팅 개수 기반 임시 지표예요.</p>
                    <div className="h-2 w-full bg-gray-100 rounded-full"><div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${clampPct(blogScoreResult.contentInfluenceScore)}%` }}></div></div>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
                <h4 className="text-[16px] font-bold mb-6 text-[#111827]">최근 포스팅의 패턴을 분석했어요 ⓘ</h4>
                {!patternAnalysis ? (
                  <p className="text-[13px] text-gray-400 leading-relaxed">
                    최근 공개 글 본문을 불러오지 못했거나 분석 가능한 포스트가 없습니다. 모바일에서 공개되는 글만 반영됩니다.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center mb-8">
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">평균 제목 길이</p>
                        <p className={`font-bold ${patternTierCaption(Number(patternAnalysis.titleLengthScore ?? 0)).className}`}>
                          {patternTierCaption(Number(patternAnalysis.titleLengthScore ?? 0)).label}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 tabular-nums">{formatAvgTitleChars(patternAnalysis.averageTitleLength)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">평균 글자 수</p>
                        <p className={`font-bold ${patternTierCaption(Number(patternAnalysis.contentLengthScore ?? 0)).className}`}>
                          {patternTierCaption(Number(patternAnalysis.contentLengthScore ?? 0)).label}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 tabular-nums">{formatAvgBodyChars(patternAnalysis.averageContentLength)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400 mb-1">평균 이미지 수</p>
                        <p className={`font-bold ${patternTierCaption(Number(patternAnalysis.imageCountScore ?? 0)).className}`}>
                          {patternTierCaption(Number(patternAnalysis.imageCountScore ?? 0)).label}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 tabular-nums">{formatAvgImages(patternAnalysis.averageImageCount)}</p>
                      </div>
                    </div>
                    <div className="space-y-8">
                      <PatternGaugeRow
                        title="평균 제목 길이"
                        caption="최근 글 제목 길이 평균이에요. 10~30자 근처일 때 패턴 점수가 높아요."
                        score={Number(patternAnalysis.titleLengthScore ?? 0)}
                        avgDisplay={formatAvgTitleChars(patternAnalysis.averageTitleLength)}
                        barClass="bg-orange-400"
                      />
                      <PatternGaugeRow
                        title="평균 본문 길이"
                        caption="본문 텍스트 길이 평균이에요. 충분한 분량일수록 패턴 점수가 오르는 구간이 있어요."
                        score={Number(patternAnalysis.contentLengthScore ?? 0)}
                        avgDisplay={formatAvgBodyChars(patternAnalysis.averageContentLength)}
                        barClass="bg-red-400"
                      />
                      <PatternGaugeRow
                        title="평균 이미지 수"
                        caption="글당 이미지 태그 개수 평균이에요. 과적·부족 모두 패턴 점수가 내려갈 수 있어요."
                        score={Number(patternAnalysis.imageCountScore ?? 0)}
                        avgDisplay={formatAvgImages(patternAnalysis.averageImageCount)}
                        barClass="bg-blue-400"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 shadow-sm mt-6">
              <h4 className="text-[16px] font-bold mb-2 text-[#111827]">같은 주제 평균과 비교했어요 ⓘ</h4>
              <p className="text-[11px] text-gray-400 mb-5 leading-relaxed">
                서비스 내 분석 히스토리만 모아 같은 추정 주제를 가진 블로그들의 최신 스냅샷 평균과 비교한 참고 지표예요. 네이버 공식 노출·순위 지표와 다릅니다. 주제 평균은{" "}
                <span className="font-semibold text-gray-600">현재 블로그를 제외한</span> 동료 스냅샷만으로 계산합니다.
              </p>
              {!topicAverageComparison ? (
                <p className="text-[13px] text-gray-400 leading-relaxed">
                  같은 주제의 비교 데이터가 아직 부족합니다. 분석 데이터가 쌓이면 평균 비교가 표시됩니다.
                </p>
              ) : (
                <TopicAverageComparisonRows data={topicAverageComparison} />
              )}
            </div>

            <div className="mt-8 rounded-[24px] border border-gray-100 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
                <h4 className="text-[13px] font-bold text-gray-600 tracking-tighter">● 유효 키워드 (검색량 &gt; 0)</h4>
              </div>
              <table className="w-full text-left">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500">키워드</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 text-right">합계 검색량</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 text-right">모바일</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 text-right">PC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {validKeywords.length > 0 ? (
                    validKeywords.map((row, i) => (
                      <tr key={`${row.keyword}-${i}`} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-[#111827]">{row.keyword}</td>
                        <td className="px-6 py-4 text-xs text-gray-600 text-right tabular-nums">{formatVolumeCell(row.totalVolume)}</td>
                        <td className="px-6 py-4 text-xs text-gray-600 text-right tabular-nums">{formatVolumeCell(row.mobileVolume)}</td>
                        <td className="px-6 py-4 text-xs text-gray-600 text-right tabular-nums">{formatVolumeCell(row.pcVolume)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm">
                        {validKeywordCount === null
                          ? "제목에서 키워드 후보를 만들지 못했거나 검색량 조회 전입니다."
                          : "검색량이 확인된 유효 키워드가 없습니다."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-8">
              <div className="flex gap-1 mb-4 bg-gray-100/50 p-1 rounded-xl w-fit">
                {[{ id: "recent", label: "최근 포스팅" }, { id: "popular", label: "인기글 목록" }].map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? "bg-white shadow-sm" : "text-gray-400"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr><th className="px-6 py-4 text-xs font-bold text-gray-500">발행일</th><th className="px-6 py-4 text-xs font-bold text-gray-500">제목</th><th className="px-6 py-4 text-xs font-bold text-gray-500 text-center">분석</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentPosts.length > 0 ? recentPosts.map((post, i) => (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-5 text-xs text-gray-400">{formatPostDate(post.createdAt)}</td>
                        <td className="px-6 py-5 text-sm font-bold text-[#111827]">
                          <div className="flex items-center gap-3 min-w-0">
                            {post.thumbnail ? (
                              <img src={post.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover border border-gray-100" />
                            ) : null}
                            <a href={post.url} target="_blank" rel="noreferrer" className="hover:text-[#2563EB] transition-colors truncate">{post.title}</a>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center"><button type="button" className="p-2 hover:bg-gray-100 rounded-lg">🔍</button></td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} className="px-6 py-10 text-center text-gray-300 text-sm">최근 글이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}