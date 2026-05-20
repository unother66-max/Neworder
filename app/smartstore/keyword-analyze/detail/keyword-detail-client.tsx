"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { PostlabsSlideHoverButton } from "@/components/postlabs-slide-hover-button";
import { ArrowLeft, Loader2, Search } from "lucide-react";

type RelatedKeywordAnalyzeItem = {
  keyword: string;
  monthlySearchVolume: number;
  productCount: number | null;
};

type KeywordSummary = {
  monthlySearchVolume: number;
  mobileSearchVolume: number;
  pcSearchVolume: number;
  productCount: number | null;
  competitionRate: number | null;
};

type DetailResponse =
  | {
      ok: true;
      keyword: string;
      summary: KeywordSummary;
      relatedKeywords: RelatedKeywordAnalyzeItem[];
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
      <p className={`mt-2 text-[22px] font-black tracking-[-0.03em] ${tone === "blue" ? "text-[#2563EB]" : "text-[#111827]"}`}>
        {value}
      </p>
    </div>
  );
}

export default function KeywordDetailClient({ initialKeyword }: { initialKeyword: string }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [searchInput, setSearchInput] = useState(initialKeyword);
  const [summary, setSummary] = useState<KeywordSummary | null>(null);
  const [relatedKeywords, setRelatedKeywords] = useState<RelatedKeywordAnalyzeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const mobileRatio = useMemo(() => {
    if (!summary || summary.monthlySearchVolume <= 0) return null;
    return Math.round((summary.mobileSearchVolume / summary.monthlySearchVolume) * 100);
  }, [summary]);

  const pcRatio = mobileRatio == null ? null : 100 - mobileRatio;

  const fetchDetail = useCallback(async (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) {
      setError("분석할 상품 키워드를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const res = await fetch("/api/smartstore/keyword-analyze/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: trimmed }),
      });
      const data = (await res.json()) as DetailResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.ok === false && data.error ? data.error : "상세 분석에 실패했습니다.");
      }
      setKeyword(data.keyword);
      setSearchInput(data.keyword);
      setSummary(data.summary);
      setRelatedKeywords(data.relatedKeywords);
      setWarning(data.warning ?? "");
      router.replace(`/smartstore/keyword-analyze/detail?keyword=${encodeURIComponent(data.keyword)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWarning("");
      setSummary(null);
      setRelatedKeywords([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (initialKeyword.trim()) {
      void fetchDetail(initialKeyword);
    }
  }, [fetchDetail, initialKeyword]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void fetchDetail(searchInput);
  };

  return (
    <>
      <TopNav activeSmartstoreSub="keyword-analyze" />
      <main className="min-h-screen bg-[#f8fafc] pt-24 text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => router.push("/smartstore/keyword-analyze")}
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-black text-[#6b7280] transition hover:text-[#2563EB]"
          >
            <ArrowLeft size={15} />
            목록으로
          </button>

          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                  {keyword ? `${keyword} 상세 분석` : "상품 키워드 상세 분석"}
                </h1>
                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  검색량, 상품량, 경쟁률과 연관 키워드 구조를 확인합니다.
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-4 border-t border-[#f3f4f6] pt-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9ca3af]"
                  />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="분석할 상품 키워드를 입력하세요"
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

          {warning ? (
            <div className="mt-5 rounded-[18px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12px] font-semibold leading-5 text-[#92400e]">
              {warning}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-5 flex min-h-[320px] items-center justify-center rounded-[22px] border border-[#e5e7eb] bg-white text-[14px] font-semibold text-[#9ca3af] shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
              <Loader2 size={18} className="mr-2 animate-spin" />
              키워드 상세 지표를 불러오는 중...
            </div>
          ) : summary ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <SummaryCard label="월 검색량" value={fmtNum(summary.monthlySearchVolume)} tone="blue" />
                  <SummaryCard label="모바일" value={fmtNum(summary.mobileSearchVolume)} />
                  <SummaryCard label="PC" value={fmtNum(summary.pcSearchVolume)} />
                  <SummaryCard label="상품량" value={fmtNum(summary.productCount)} />
                  <SummaryCard label="상품 경쟁률" value={fmtRate(summary.competitionRate)} />
                </div>

                <div className="rounded-[22px] border border-[#e5e7eb] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
                  <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                    검색 비율
                  </h2>
                  {mobileRatio == null || pcRatio == null ? (
                    <p className="mt-4 text-[13px] font-semibold text-[#9ca3af]">
                      검색 비율 데이터 준비 중
                    </p>
                  ) : (
                    <div className="mt-4">
                      <div className="h-3 overflow-hidden rounded-full bg-[#f3f4f6]">
                        <div
                          className="h-full rounded-full bg-[#2563EB]"
                          style={{ width: `${mobileRatio}%` }}
                        />
                      </div>
                      <div className="mt-3 flex justify-between text-[12px] font-bold text-[#6b7280]">
                        <span>모바일 {mobileRatio}%</span>
                        <span>PC {pcRatio}%</span>
                      </div>
                      <div className="mt-5 rounded-[16px] border border-dashed border-[#e5e7eb] bg-[#fcfcfc] px-4 py-8 text-center text-[13px] font-semibold text-[#9ca3af]">
                        성별/연령별 데이터는 준비 중입니다.
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[22px] border border-[#e5e7eb] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
                  <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                    검색 차트
                  </h2>
                  <div className="mt-4 rounded-[16px] border border-dashed border-[#e5e7eb] bg-[#fcfcfc] px-4 py-12 text-center text-[13px] font-semibold text-[#9ca3af]">
                    검색 추이 데이터는 추후 제공 예정입니다.
                  </div>
                </div>
              </div>

              <aside className="rounded-[22px] border border-[#e5e7eb] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
                <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                  연관 키워드
                </h2>
                <div className="mt-4 space-y-2">
                  {relatedKeywords.length > 0 ? (
                    relatedKeywords.slice(0, 6).map((item) => (
                      <button
                        key={item.keyword}
                        type="button"
                        onClick={() => void fetchDetail(item.keyword)}
                        className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#f3f4f6] bg-[#fcfcfc] px-3 py-3 text-left transition hover:border-[#c7d2fe] hover:bg-[#eef2ff]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-black text-[#111827]">
                            {item.keyword}
                          </span>
                          <span className="mt-1 block text-[11px] font-semibold text-[#9ca3af]">
                            상품량 {fmtNum(item.productCount)}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] font-black text-[#3730a3]">
                          {fmtNum(item.monthlySearchVolume)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#e5e7eb] bg-[#fcfcfc] px-4 py-8 text-center text-[13px] font-semibold text-[#9ca3af]">
                      연관 키워드 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </aside>
            </div>
          ) : (
            <div className="mt-5 min-h-[260px] rounded-[22px] border border-[#e5e7eb] bg-white px-6 py-16 text-center shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
              <p className="text-[16px] font-black text-[#111827]">키워드를 선택해 주세요</p>
              <p className="mt-2 text-[13px] text-[#9ca3af]">
                목록에서 분석 버튼을 누르거나 위 검색창에 키워드를 입력해 보세요.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
