"use client";

import React, { useCallback, useState } from "react";
import TopNav from "@/components/top-nav";
import { PostlabsSlideHoverButton } from "@/components/postlabs-slide-hover-button";
import { ExternalLink, Loader2, Search, Store } from "lucide-react";

const PRODUCT_PLACEHOLDER_IMG = "/file.svg";

type StoreAnalyzeItem = {
  rank: number;
  imageUrl?: string;
  productName: string;
  productUrl?: string;
  category?: string | null;
  price?: number | null;
  discountedPrice?: number | null;
  deliveryFee?: string | null;
  sixMonthSales?: number | null;
  reviewCount?: number | null;
  rating?: number | null;
  score?: number | null;
  tags?: string[] | null;
  naverShoppingId?: string | null;
};

type AnalyzeResponse =
  | {
      ok: true;
      storeName: string;
      inputUrl: string;
      normalizedStoreUrl: string;
      productId: string | null;
      analyzedFromProductUrl: boolean;
      items: StoreAnalyzeItem[];
      warning?: string;
    }
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

export default function SmartstoreStoreAnalyzePage() {
  const [url, setUrl] = useState("");
  const [storeName, setStoreName] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [normalizedStoreUrl, setNormalizedStoreUrl] = useState("");
  const [analyzedFromProductUrl, setAnalyzedFromProductUrl] = useState(false);
  const [items, setItems] = useState<StoreAnalyzeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const analyze = useCallback(async () => {
    const targetUrl = url.trim();
    if (!targetUrl) {
      setError("분석할 스마트스토어 또는 상품 URL을 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const res = await fetch("/api/smartstore/store-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, limit: 40 }),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.ok === false && data.error ? data.error : "분석에 실패했습니다.");
      }
      setStoreName(data.storeName);
      setInputUrl(data.inputUrl);
      setNormalizedStoreUrl(data.normalizedStoreUrl);
      setAnalyzedFromProductUrl(data.analyzedFromProductUrl);
      setItems(data.items);
      setWarning(data.warning ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWarning("");
      setNormalizedStoreUrl("");
      setAnalyzedFromProductUrl(false);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [url]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void analyze();
  };

  return (
    <>
      <TopNav activeSmartstoreSub="store-analyze" />
      <main className="min-h-screen bg-[#f8fafc] pt-24 text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    스마트스토어 분석
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-black text-[#2563EB]">
                    <Store size={13} />
                    상품 1~40개
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  현재 판매하고 있는 상품 수, 가격, 리뷰 수, 평점 등을 분석할 수 있습니다.
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
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="스마트스토어 또는 상품 URL을 입력하세요"
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
                  {storeName
                    ? `${storeName} 기준 ${items.length}개 상품`
                    : "스토어 URL을 입력하면 결과가 표시됩니다."}
                </p>
              </div>
              <span className="truncate text-[11px] font-semibold text-[#9ca3af]">
                {normalizedStoreUrl || inputUrl || "상품 목록 조회 전용"}
              </span>
            </div>

            {analyzedFromProductUrl ? (
              <div className="border-b border-[#dbeafe] bg-[#eff6ff] px-4 py-2.5 text-[12px] font-semibold leading-5 text-[#1d4ed8] md:px-6">
                상품 URL에서 스토어 정보를 추출해 분석했습니다.
              </div>
            ) : null}

            {warning ? (
              <div className="border-b border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12px] font-semibold leading-5 text-[#92400e] md:px-6">
                {warning}
              </div>
            ) : null}

            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center text-[14px] font-semibold text-[#9ca3af]">
                <Loader2 size={18} className="mr-2 animate-spin" />
                스마트스토어 상품 목록을 불러오는 중...
              </div>
            ) : items.length === 0 ? (
              <div className="min-h-[260px] px-6 py-16 text-center">
                <p className="text-[16px] font-black text-[#111827]">아직 분석 결과가 없어요</p>
                <p className="mt-2 text-[13px] text-[#9ca3af]">
                  스마트스토어 또는 상품 URL을 입력하고 분석 버튼을 눌러보세요.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1180px] w-full table-fixed border-collapse">
                  <thead className="bg-[#fcfcfc]">
                    <tr className="border-b border-[#f3f4f6] text-left text-[11px] font-black uppercase tracking-[0.02em] text-[#9ca3af]">
                      <th className="w-[72px] px-4 py-3 text-center">순위</th>
                      <th className="w-[80px] px-4 py-3">이미지</th>
                      <th className="w-[330px] px-4 py-3">상품명</th>
                      <th className="w-[220px] px-4 py-3">카테고리</th>
                      <th className="w-[110px] px-4 py-3 text-right">판매가</th>
                      <th className="w-[100px] px-4 py-3 text-right">배송비</th>
                      <th className="w-[120px] px-4 py-3 text-right">6개월 판매량</th>
                      <th className="w-[90px] px-4 py-3 text-right">리뷰</th>
                      <th className="w-[80px] px-4 py-3 text-right">평점</th>
                      <th className="w-[80px] px-4 py-3 text-right">점수</th>
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
                          <ProductThumb src={item.imageUrl} alt={item.productName} />
                        </td>
                        <td className="px-4 py-3">
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
                        </td>
                        <td className="truncate px-4 py-3 text-[#6b7280]">
                          {fmtText(item.category)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-[#111827]">
                          {item.discountedPrice != null &&
                          item.price != null &&
                          item.discountedPrice < item.price
                            ? fmtWon(item.discountedPrice)
                            : fmtWon(item.price)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#6b7280]">
                          {fmtText(item.deliveryFee)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#9ca3af]">
                          {fmtNum(item.sixMonthSales)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#6b7280]">
                          {fmtNum(item.reviewCount)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#6b7280]">
                          {item.rating == null ? "-" : item.rating.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#9ca3af]">
                          {item.score == null ? "-" : item.score.toFixed(1)}
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
