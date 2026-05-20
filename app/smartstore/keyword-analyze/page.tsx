"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { PostlabsSlideHoverButton } from "@/components/postlabs-slide-hover-button";
import { BarChart3, Loader2, Search } from "lucide-react";
import { SMARTSTORE_KEYWORD_ANALYZE_LIMIT } from "@/lib/smartstore-keyword-analyze";

type RelatedKeywordAnalyzeItem = {
  keyword: string;
  monthlySearchVolume: number;
  productCount: number | null;
};

type KeywordAnalyzeItem = {
  keyword: string;
  monthlySearchVolume: number;
  mobileSearchVolume: number;
  pcSearchVolume: number;
  productCount: number | null;
  competitionRate: number | null;
  category: string | null;
  relatedKeywords: RelatedKeywordAnalyzeItem[];
};

type KeywordSummary = {
  monthlySearchVolume: number;
  mobileSearchVolume: number;
  pcSearchVolume: number;
  productCount: number | null;
  competitionRate: number | null;
};

type AnalyzeResponse =
  | {
      ok: true;
      keyword: string;
      summary: KeywordSummary;
      items: KeywordAnalyzeItem[];
      warning?: string;
    }
  | { ok: false; error?: string };

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toLocaleString();
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtText(v: string | null | undefined): string {
  const t = v?.trim();
  return t ? t : "-";
}

function SummaryCard({
  label,
  value,
  tone = "dark",
}: {
  label: string;
  value: string;
  tone?: "dark" | "blue";
}) {
  return (
    <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
      <p className="text-[12px] font-bold text-[#9ca3af]">{label}</p>
      <p
        className={`mt-2 truncate text-[22px] font-black tracking-[-0.03em] ${
          tone === "blue" ? "text-[#2563EB]" : "text-[#111827]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default function SmartstoreKeywordAnalyzePage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [summary, setSummary] = useState<KeywordSummary | null>(null);
  const [items, setItems] = useState<KeywordAnalyzeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const goDetail = useCallback(
    (kw: string) => {
      router.push(`/smartstore/keyword-analyze/detail?keyword=${encodeURIComponent(kw)}`);
    },
    [router]
  );

  const analyze = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setError("분석할 상품 키워드를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const res = await fetch("/api/smartstore/keyword-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, limit: SMARTSTORE_KEYWORD_ANALYZE_LIMIT }),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.ok === false && data.error ? data.error : "분석에 실패했습니다.");
      }
      setSubmittedKeyword(data.keyword);
      setSummary(data.summary);
      setItems(data.items);
      setWarning(data.warning ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWarning("");
      setSummary(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void analyze();
  };

  return (
    <>
      <TopNav activeSmartstoreSub="keyword-analyze" />
      <main className="min-h-screen bg-[#f8fafc] pt-24 text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                  스마트스토어 상품 키워드 분석
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-black text-[#2563EB]">
                  <BarChart3 size={13} />
                  키워드 {SMARTSTORE_KEYWORD_ANALYZE_LIMIT}개
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                상품 키워드의 검색량, 상품량, 경쟁률과 연관 키워드를 함께 확인합니다.
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-4 border-t border-[#f3f4f6] pt-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9ca3af]"
                  />
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="예: 머리핀, 강아지 간식, 캠핑 의자"
                    className="h-[46px] w-full rounded-[14px] border border-[#e5e7eb] bg-[#fbfbfb] pl-11 pr-4 text-[14px] font-semibold text-[#111827] outline-none transition focus:border-[#2563EB] focus:bg-white focus:ring-4 focus:ring-[#2563EB]/10"
                  />
                </div>
                <PostlabsSlideHoverButton
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  className={[
                    "h-[46px] min-w-[112px] rounded-[14px] border border-white/10 bg-[#333333] px-5 text-[13px] font-bold text-white",
                    "shadow-[0_10px_24px_rgba(15,23,42,0.16)] hover:border-white/25 hover:shadow-[0_16px_34px_rgba(37,99,235,0.24)]",
                    "active:translate-y-[1px] active:scale-[0.99]",
                    loading ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {loading ? "분석 중..." : "분석"}
                  </span>
                </PostlabsSlideHoverButton>
              </div>
            </form>
          </div>

          {error ? (
            <div className="mt-5 rounded-[18px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-[13px] font-semibold text-[#be123c]">
              {error}
            </div>
          ) : null}

          {summary ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <SummaryCard label="키워드명" value={submittedKeyword || "-"} tone="blue" />
              <SummaryCard label="월 검색량" value={fmtNum(summary.monthlySearchVolume)} />
              <SummaryCard label="모바일" value={fmtNum(summary.mobileSearchVolume)} />
              <SummaryCard label="PC" value={fmtNum(summary.pcSearchVolume)} />
              <SummaryCard label="상품량" value={fmtNum(summary.productCount)} />
              <SummaryCard label="상품 경쟁률" value={fmtRate(summary.competitionRate)} />
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
            <div className="flex flex-col gap-2 border-b border-[#f3f4f6] px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
              <div>
                <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                  분석 결과
                </h2>
                <p className="mt-1 text-[12px] text-[#9ca3af]">
                  {submittedKeyword
                    ? `"${submittedKeyword}" 기준 ${items.length}개 키워드`
                    : "키워드를 입력하면 결과가 표시됩니다."}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[#9ca3af]">
                SearchAD + 쇼핑 상품량 기준
              </span>
            </div>

            {warning ? (
              <div className="border-b border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12px] font-semibold leading-5 text-[#92400e] md:px-6">
                {warning}
              </div>
            ) : null}

            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center text-[14px] font-semibold text-[#9ca3af]">
                <Loader2 size={18} className="mr-2 animate-spin" />
                키워드 지표를 불러오는 중...
              </div>
            ) : items.length === 0 ? (
              <div className="min-h-[260px] px-6 py-16 text-center">
                <p className="text-[16px] font-black text-[#111827]">아직 분석 결과가 없어요</p>
                <p className="mt-2 text-[13px] text-[#9ca3af]">
                  상품 키워드를 입력하고 분석 버튼을 눌러보세요.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1120px] w-full table-fixed border-collapse">
                  <thead className="bg-[#fcfcfc]">
                    <tr className="border-b border-[#f3f4f6] text-left text-[11px] font-black uppercase tracking-[0.02em] text-[#9ca3af]">
                      <th className="w-[72px] px-4 py-3 text-center">번호</th>
                      <th className="w-[180px] px-4 py-3">키워드</th>
                      <th className="w-[110px] px-4 py-3 text-right">월 검색량</th>
                      <th className="w-[100px] px-4 py-3 text-right">모바일</th>
                      <th className="w-[90px] px-4 py-3 text-right">PC</th>
                      <th className="w-[110px] px-4 py-3 text-right">상품량</th>
                      <th className="w-[120px] px-4 py-3 text-right">상품 경쟁률</th>
                      <th className="w-[220px] px-4 py-3">카테고리</th>
                      <th className="w-[110px] px-4 py-3 text-center">분석</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr
                        key={item.keyword}
                        className="border-b border-[#f3f4f6] text-[13px] text-[#374151] last:border-b-0 hover:bg-[#f8fafc]"
                      >
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#111827] px-2 text-[12px] font-black text-white">
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => goDetail(item.keyword)}
                            className="text-left text-[13px] font-black text-[#111827] hover:text-[#2563EB]"
                          >
                            {item.keyword}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#111827]">
                          {fmtNum(item.monthlySearchVolume)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#6b7280]">
                          {fmtNum(item.mobileSearchVolume)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#6b7280]">
                          {fmtNum(item.pcSearchVolume)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#111827]">
                          {fmtNum(item.productCount)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#6b7280]">
                          {fmtRate(item.competitionRate)}
                        </td>
                        <td className="truncate px-4 py-3 text-[#9ca3af]">
                          {fmtText(item.category)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => goDetail(item.keyword)}
                            className="inline-flex h-9 items-center justify-center rounded-[12px] bg-[#eef2ff] px-3 text-[12px] font-black text-[#3730a3] transition hover:bg-[#3730a3] hover:text-white active:scale-[0.98]"
                          >
                            분석
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
