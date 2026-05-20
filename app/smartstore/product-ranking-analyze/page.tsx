"use client";

import React, { useCallback, useState } from "react";
import TopNav from "@/components/top-nav";
import { PostlabsSlideHoverButton } from "@/components/postlabs-slide-hover-button";
import { BarChart3, ExternalLink, Loader2, Search } from "lucide-react";

const PRODUCT_PLACEHOLDER_IMG = "/file.svg";

type ProductRankingItem = {
  rank: number;
  productName: string;
  productUrl?: string;
  imageUrl?: string;
  storeName?: string;
  category?: string;
  price?: number | null;
  deliveryFee?: string | null;
  reviewCount?: number | null;
  rating?: number | null;
  sellerGrade?: string | null;
};

type AnalyzeResponse =
  | { ok: true; keyword: string; items: ProductRankingItem[] }
  | { ok: false; error?: string };

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toLocaleString();
}

function fmtWon(v: number | null | undefined): string {
  if (v == null) return "-";
  return `${v.toLocaleString()}원`;
}

function fmtText(v: string | null | undefined): string {
  const t = v?.trim();
  return t ? t : "-";
}

function ProductThumb({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  const imageSrc = src?.trim();
  if (!imageSrc || broken) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] ring-1 ring-[#e5e7eb] md:h-14 md:w-14">
        <img
          src={PRODUCT_PLACEHOLDER_IMG}
          alt=""
          className="h-7 w-7 opacity-[0.35]"
          aria-hidden
        />
      </div>
    );
  }
  return (
    <img
      src={imageSrc}
      alt={alt}
      className="h-12 w-12 shrink-0 rounded-[12px] object-cover ring-1 ring-[#e5e7eb] md:h-14 md:w-14"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

export default function SmartstoreProductRankingAnalyzePage() {
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [items, setItems] = useState<ProductRankingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analyze = useCallback(async () => {
    const kw = keyword.trim();
    if (!kw) {
      setError("분석할 키워드를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/smartstore/product-ranking-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw, limit: 40 }),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.ok === false && data.error ? data.error : "분석에 실패했습니다.");
      }
      setSubmittedKeyword(data.keyword);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      <TopNav activeSmartstoreSub="product-ranking-analyze" />
      <main className="min-h-screen bg-[#f8fafc] pt-24 text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    스마트스토어 상품 순위 분석
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-black text-[#2563EB]">
                    <BarChart3 size={13} />
                    1~40위
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  키워드 기준 네이버 쇼핑 상품 순위를 광고 제외 자연검색 기준으로 확인합니다.
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

          <div className="mt-5 overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)]">
            <div className="flex flex-col gap-2 border-b border-[#f3f4f6] px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
              <div>
                <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                  분석 결과
                </h2>
                <p className="mt-1 text-[12px] text-[#9ca3af]">
                  {submittedKeyword ? `"${submittedKeyword}" 기준 ${items.length}개 상품` : "키워드를 입력하면 결과가 표시됩니다."}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[#9ca3af]">
                광고 제외 후 순위 재정렬
              </span>
            </div>

            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center text-[14px] font-semibold text-[#9ca3af]">
                <Loader2 size={18} className="mr-2 animate-spin" />
                네이버 쇼핑 순위를 불러오는 중...
              </div>
            ) : items.length === 0 ? (
              <div className="min-h-[260px] px-6 py-16 text-center">
                <p className="text-[16px] font-black text-[#111827]">아직 분석 결과가 없어요</p>
                <p className="mt-2 text-[13px] text-[#9ca3af]">
                  검색 키워드를 입력하고 분석 버튼을 눌러보세요.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1120px] w-full table-fixed border-collapse">
                  <thead className="bg-[#fcfcfc]">
                    <tr className="border-b border-[#f3f4f6] text-left text-[11px] font-black uppercase tracking-[0.02em] text-[#9ca3af]">
                      <th className="w-[72px] px-4 py-3 text-center">순위</th>
                      <th className="w-[360px] px-4 py-3">상품명</th>
                      <th className="w-[150px] px-4 py-3">판매처</th>
                      <th className="w-[110px] px-4 py-3">셀러등급</th>
                      <th className="w-[220px] px-4 py-3">카테고리</th>
                      <th className="w-[110px] px-4 py-3 text-right">판매가</th>
                      <th className="w-[100px] px-4 py-3 text-right">배송비</th>
                      <th className="w-[90px] px-4 py-3 text-right">리뷰</th>
                      <th className="w-[80px] px-4 py-3 text-right">평점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={`${item.rank}-${item.productUrl ?? item.productName}`}
                        className="border-b border-[#f3f4f6] text-[13px] text-[#374151] last:border-b-0 hover:bg-[#f8fafc]"
                      >
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-[#111827] px-2 text-[12px] font-black text-white">
                            {item.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ProductThumb src={item.imageUrl} alt={item.productName} />
                            <div className="min-w-0">
                              <div className="line-clamp-2 text-[13px] font-black leading-5 text-[#111827]">
                                {item.productName}
                              </div>
                              {item.productUrl ? (
                                <a
                                  href={item.productUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#2563EB] hover:underline"
                                >
                                  상품 보기 <ExternalLink size={12} />
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="truncate px-4 py-3 font-bold text-[#111827]">
                          {fmtText(item.storeName)}
                        </td>
                        <td className="px-4 py-3 text-[#9ca3af]">{fmtText(item.sellerGrade)}</td>
                        <td className="truncate px-4 py-3 text-[#6b7280]">
                          {fmtText(item.category)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#111827]">
                          {fmtWon(item.price)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#9ca3af]">
                          {fmtText(item.deliveryFee)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#9ca3af]">
                          {fmtNum(item.reviewCount)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#9ca3af]">
                          {item.rating == null ? "-" : item.rating.toFixed(2)}
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
