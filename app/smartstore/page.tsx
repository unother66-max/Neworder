"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { Pin, Trash2 } from "lucide-react";
import { registerSmartstoreProductWithClientMetaFallback } from "@/lib/smartstore-register-client-meta";

const MAX_KEYWORDS = 10;
const NAVER_PRICE_COMPARE_SVG_SRC = encodeURI("/naver_가격비교.svg");
/** place 카드와 동일한 ‘이미지 없음’ 자리용 */
const PRODUCT_CARD_PLACEHOLDER_IMG = "/file.svg";

// ─── Types ──────────────────────────────────────────────────────────────────

type KwItem = {
  id: string;
  keyword: string;
  mobileVolume: number | null;
  pcVolume: number | null;
  totalVolume: number | null;
  isTracking: boolean;
  latestRank: number | null;
  latestRankLabel: string;
  latestRankAt: string | null;
};

type SmartstoreProductRow = {
  id: string;
  name: string;
  category: string | null;
  productUrl: string;
  naverProductId: string | null;
  imageUrl: string | null;
  thumbnailLink?: string | null;
  isPinned: boolean;
  isAutoTracking: boolean;
  keywords: KwItem[];
  latestUpdatedAt: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtVolume(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return v.toLocaleString();
}

/** DB `name` 우선 (place.name과 동일 역할) */
function cardProductTitle(p: SmartstoreProductRow): string {
  const n = p.name?.trim();
  if (n) return n;
  return p.naverProductId ? `상품 #${p.naverProductId}` : "스마트스토어 상품";
}

function ProductCardThumb({
  imageUrl,
  alt,
}: {
  imageUrl: string | null;
  alt: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = imageUrl?.trim();
  if (!src || broken) {
    return (
      <div className="flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] ring-1 ring-[#e5e7eb]">
        <img
          src={PRODUCT_CARD_PLACEHOLDER_IMG}
          alt=""
          className="h-9 w-9 opacity-[0.35]"
          width={36}
          height={36}
          aria-hidden
        />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-[70px] w-[70px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SmartstoreRankPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<SmartstoreProductRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [trackingLoadingId, setTrackingLoadingId] = useState<string | null>(null);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [regUrl, setRegUrl] = useState("");
  const [regSaving, setRegSaving] = useState(false);
  const [regError, setRegError] = useState("");
  const [regMetaNotice, setRegMetaNotice] = useState("");

  const [kwModalProduct, setKwModalProduct] = useState<SmartstoreProductRow | null>(null);
  const [kwInput, setKwInput] = useState("");
  const [pendingKeywords, setPendingKeywords] = useState<string[]>([]);
  const [deletingKwId, setDeletingKwId] = useState<string | null>(null);
  const [kwSaving, setKwSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  const fetchProducts = useCallback(async (): Promise<SmartstoreProductRow[]> => {
    setListLoading(true);
    try {
      const res = await fetch("/api/smartstore-product-list", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      const list: SmartstoreProductRow[] = data.ok ? (data.products ?? []) : [];
      if (data.ok) setProducts(list);
      return list;
    } catch (e) {
      console.warn("[smartstore] fetchProducts error:", e);
      return [];
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted || !session) return;
    fetchProducts();
  }, [mounted, session, fetchProducts]);

  const q = searchText.trim();
  const filteredProducts = products.filter((p) => {
    if (!q) return true;
    if (p.name.includes(q)) return true;
    if (p.naverProductId?.includes(q)) return true;
    if (p.productUrl.includes(q)) return true;
    return p.keywords.some((k) => k.keyword.includes(q));
  });

  const handleToggleTracking = async (p: SmartstoreProductRow) => {
    if (trackingLoadingId) return;
    setTrackingLoadingId(p.id);
    const next = !p.isAutoTracking;
    try {
      const res = await fetch("/api/smartstore-toggle-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: p.id, isTracking: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "자동추적 변경 실패");
        return;
      }
      setProducts((prev) =>
        prev.map((row) =>
          row.id === p.id
            ? {
                ...row,
                isAutoTracking: next,
                keywords: row.keywords.map((k) => ({ ...k, isTracking: next })),
              }
            : row
        )
      );
    } catch (e) {
      console.warn(e);
    } finally {
      setTrackingLoadingId(null);
    }
  };

  const handleTogglePin = async (p: SmartstoreProductRow) => {
    if (pinningId) return;
    setPinningId(p.id);
    try {
      const res = await fetch("/api/smartstore-product-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: p.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "핀 변경 실패");
        return;
      }
      await fetchProducts();
    } catch (e) {
      console.warn(e);
    } finally {
      setPinningId(null);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm("이 상품을 삭제하시겠습니까?")) return;
    setDeletingId(productId);
    try {
      const res = await fetch("/api/smartstore-product-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "삭제 실패");
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (e) {
      console.warn(e);
    } finally {
      setDeletingId(null);
    }
  };

  const closeRegister = () => {
    setRegisterOpen(false);
    setRegUrl("");
    setRegError("");
  };

  const handleRegisterSave = async () => {
  if (regSaving) return;

  const url = regUrl.trim();
  if (!url) {
    setRegError("상품 URL을 입력해주세요.");
    return;
  }

  setRegSaving(true);
  setRegError("");

  try {
    // 1️⃣ productId 추출
    const productIdMatch = url.match(/products\/(\d+)/);
    const productId = productIdMatch?.[1];

    if (!productId) {
      setRegError("상품 ID 추출 실패");
      return;
    }

    // 2️⃣ channelUid 추출
    const channelMatch = url.match(/brand\.naver\.com\/([^\/]+)/);
    const channelUid = channelMatch?.[1];

    if (!channelUid) {
      setRegError("채널 정보 추출 실패");
      return;
    }

    // 3️⃣ 서버 저장 (🔥 핵심)
    const saveRes = await fetch("/api/smartstore-product-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        productUrl: url,
      }),
    });

    const data = await saveRes.json();

    if (!data.ok) {
      setRegError(data.error || "등록 실패");
      return;
    }

    // 4️⃣ 성공 처리
    closeRegister();
    await fetchProducts();

  } catch (e) {
    console.warn(e);
    setRegError("등록 중 오류가 발생했습니다.");
  } finally {
    setRegSaving(false);
  }
};

  const openKwModal = (p: SmartstoreProductRow) => {
    setKwModalProduct(p);
    setPendingKeywords([]);
    setKwInput("");
    setDeletingKwId(null);
  };

  const closeKwModal = () => {
    setKwModalProduct(null);
    setPendingKeywords([]);
    setKwInput("");
    setDeletingKwId(null);
  };

  const addDirectKeywords = () => {
    if (!kwModalProduct) return;
    const parts = kwInput.split(",").map((s) => s.trim()).filter(Boolean);
    const savedSet = new Set(kwModalProduct.keywords.map((k) => k.keyword));
    setPendingKeywords((prev) => {
      const next = [...prev];
      for (const kw of parts) {
        if (savedSet.has(kw) || next.includes(kw)) continue;
        if (kwModalProduct.keywords.length + next.length >= MAX_KEYWORDS) {
          alert(`키워드는 상품당 최대 ${MAX_KEYWORDS}개까지 등록할 수 있어요.`);
          break;
        }
        next.push(kw);
      }
      return next;
    });
    setKwInput("");
  };

  const removePendingKeyword = (kw: string) => {
    setPendingKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const removeSavedKeyword = async (row: KwItem) => {
    if (!kwModalProduct || deletingKwId) return;
    setDeletingKwId(row.id);
    try {
      const res = await fetch("/api/smartstore-keyword-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ keywordId: row.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "삭제 실패");
        return;
      }
      const updated = {
        ...kwModalProduct,
        keywords: kwModalProduct.keywords.filter((k) => k.id !== row.id),
      };
      setKwModalProduct(updated);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      console.warn(e);
    } finally {
      setDeletingKwId(null);
    }
  };

  const saveKeywords = async () => {
    if (!kwModalProduct || kwSaving) return;
    if (pendingKeywords.length === 0) return;
    if (kwModalProduct.keywords.length + pendingKeywords.length > MAX_KEYWORDS) {
      alert(`키워드는 상품당 최대 ${MAX_KEYWORDS}개까지 등록할 수 있어요.`);
      return;
    }
    setKwSaving(true);
    try {
      await Promise.all(
        pendingKeywords.map(async (keyword) => {
          const res = await fetch("/api/smartstore-keyword-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ productId: kwModalProduct.id, keyword }),
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || `${keyword} 저장 실패`);
        })
      );
      await fetchProducts();
      setPendingKeywords([]);
      closeKwModal();
    } catch (e) {
      console.warn(e);
      alert(e instanceof Error ? e.message : "키워드 저장 중 오류가 났어요.");
    } finally {
      setKwSaving(false);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav activeSmartstoreSub="rank-naver-price" />
        <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <TopNav activeSmartstoreSub="rank-naver-price" />
        <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
          <div className="text-[15px] text-[#6b7280]">로그인 페이지로 이동 중...</div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav activeSmartstoreSub="rank-naver-price" />
      <main className="min-h-screen bg-[#f4f4f5] text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    상품 순위 추적
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2 py-1">
                    <span className="text-[11px] font-black text-[#03c75a]">N</span>
                    <img
                      src={NAVER_PRICE_COMPARE_SVG_SRC}
                      alt="가격비교"
                      width={78}
                      height={16}
                      className="h-4 w-auto"
                    />
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  스마트스토어 상품의 가격비교 키워드 순위를 추적합니다. 키워드 등록 시 월 검색량을
                  조회하고, 검색 순위 수집은 추후 연동됩니다.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
             <div className="relative w-full sm:w-[320px]">
  <input
    type="text"
    value={searchText}
    onChange={(e) => setSearchText(e.target.value)}
    placeholder="상품명, 상품 ID, 키워드 검색"
    className="h-[44px] w-full rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-4 pr-11 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
  />
  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">
    🔍
  </div>
</div>
                <button
                  type="button"
                  onClick={() => {
                    setRegMetaNotice("");
                    setRegisterOpen(true);
                  }}
                  className="h-[44px] min-w-[108px] rounded-[14px] bg-[#b91c1c] px-4 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b]"
                >
                  상품 등록
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] pt-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                    등록된 상품
                  </h2>
                  <span className="rounded-full border border-[#e5e7eb] bg-[#fafafa] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                    상품 관리
                  </span>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                    {filteredProducts.length}개
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-[#6b7280]">
                  {listLoading ? "상품 목록 불러오는 중..." : "가격비교 키워드 순위 추적"}
                </p>
              </div>
              <div className="text-[11px] text-[#9ca3af]">
                * 검색 순위는 수집 API 연동 후 표시됩니다. 월 검색량은 키워드 저장 시 조회됩니다.
              </div>
            </div>
          </div>

          {regMetaNotice ? (
            <div
              role="status"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
            >
              <span className="min-w-0">{regMetaNotice}</span>
              <button
                type="button"
                onClick={() => setRegMetaNotice("")}
                className="shrink-0 rounded-[10px] px-3 py-1.5 text-[12px] font-bold text-amber-900 hover:bg-amber-100"
              >
                닫기
              </button>
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {listLoading ? (
              <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-6 py-14 text-center text-[14px] text-[#9ca3af]">
                불러오는 중...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[18px] font-bold text-[#111827]">아직 등록된 상품이 없어요</p>
                <p className="mt-2 text-[14px] text-[#9ca3af]">
                  상단의 상품 등록 버튼으로 스마트스토어 상품 URL을 추가해보세요.
                </p>
              </div>
            ) : (
              filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-5 py-4 md:px-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <ProductCardThumb
                          imageUrl={p.imageUrl}
                          alt={cardProductTitle(p)}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {p.isPinned && (
                              <Pin className="h-[14px] w-[14px] fill-[#b91c1c] stroke-[#b91c1c]" />
                            )}
                            <h3 className="text-[20px] font-black tracking-[-0.03em] text-[#111827]">
                              {cardProductTitle(p)}
                            </h3>
                            {p.category?.trim() ? (
                              <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                                {p.category.trim()}
                              </span>
                            ) : null}
                          </div>

                          <p
                            className="mt-1.5 truncate text-[13px] text-[#6b7280]"
                            title={p.productUrl || undefined}
                          >
                            {p.productUrl || "-"}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                            <span className="font-semibold text-[#6b7280]">바로가기</span>
                            {p.productUrl ? (
                              <a
                                href={p.productUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-full items-center truncate rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
                              >
                                스마트스토어
                              </a>
                            ) : (
                              <span className="text-[#c0c6d0]">URL 없음</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:flex-nowrap xl:justify-end">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(p)}
                          disabled={pinningId === p.id}
                          className={`inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-white transition hover:bg-[#f9fafb] ${pinningId === p.id ? "opacity-60" : ""}`}
                          aria-label="상단 고정"
                        >
                          <Pin
                            className={`h-[20px] w-[20px] transition ${
                              p.isPinned
                                ? "fill-[#b91c1c] stroke-[#b91c1c]"
                                : "stroke-[#6b7280]"
                            }`}
                            strokeWidth={2}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            alert(
                              "순위 변화 차트·이력은 2차에서 제공됩니다. 지금은 키워드를 등록하고 목록을 유지해 주세요."
                            )
                          }
                          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                        >
                          순위 변화 보기
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleTracking(p)}
                          disabled={trackingLoadingId === p.id}
                          className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] px-4 text-[14px] font-bold transition ${
                            p.isAutoTracking
                              ? "bg-[#b91c1c] text-white shadow-[0_10px_22px_rgba(185,28,28,0.16)] hover:bg-[#991b1b]"
                              : "border border-[#d1d5db] bg-white text-[#111827] hover:bg-[#f9fafb]"
                          } ${trackingLoadingId === p.id ? "opacity-60" : ""}`}
                        >
                          {trackingLoadingId === p.id
                            ? "처리 중..."
                            : `자동추적 ${p.isAutoTracking ? "ON" : "OFF"}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => openKwModal(p)}
                          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] bg-[#b91c1c] px-4 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b]"
                        >
                          키워드 관리
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className={`inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-white transition hover:bg-[#fef2f2] ${deletingId === p.id ? "opacity-60" : ""}`}
                          aria-label="삭제"
                        >
                          {deletingId === p.id ? (
                            <span className="text-[12px] text-[#dc2626]">...</span>
                          ) : (
                            <Trash2 className="h-[18px] w-[18px] stroke-[#dc2626]" strokeWidth={2} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#f3f4f6] px-5 pb-4 md:px-6">
                    <div className="mb-2 mt-3">
                      <p className="text-[11px] font-semibold text-[#6b7280]">키워드별 순위</p>
                    </div>
                    <div className="overflow-x-auto rounded-[14px] border border-[#e5e7eb]">
                      <table className="min-w-full border-collapse">
                        <thead className="bg-[#f9fafb]">
                          <tr>
                            {["키워드", "월 검색량", "모바일", "PC", "검색 순위"].map((h) => (
                              <th
                                key={h}
                                className="border-b border-[#e5e7eb] px-4 py-2.5 text-center text-[11px] font-extrabold text-[#6b7280] first:text-left"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {p.keywords.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-[12px] text-[#9ca3af]">
                                키워드를 등록하면 가격비교 검색 기준 순위를 표시할 수 있어요.
                                <br />
                                <span className="font-semibold">[키워드 관리]</span> 버튼으로 시작하세요.
                              </td>
                            </tr>
                          ) : (
                            p.keywords.map((kw) => (
                              <tr
                                key={kw.id}
                                className="border-t border-[#f3f4f6] bg-white hover:bg-[#fafafa]"
                              >
                                <td className="px-4 py-3 text-[13px] font-semibold text-[#111827]">
                                  {kw.keyword}
                                </td>
                                <td className="px-4 py-3 text-center text-[13px] text-[#6b7280]">
                                  {fmtVolume(kw.totalVolume)}
                                </td>
                                <td className="px-4 py-3 text-center text-[13px] text-[#6b7280]">
                                  {fmtVolume(kw.mobileVolume)}
                                </td>
                                <td className="px-4 py-3 text-center text-[13px] text-[#6b7280]">
                                  {fmtVolume(kw.pcVolume)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`text-[13px] font-bold ${
                                      kw.latestRankLabel !== "-" ? "text-[#111827]" : "text-[#9ca3af]"
                                    }`}
                                  >
                                    {kw.latestRankLabel}
                                  </span>
                                  {kw.latestRankAt && (
                                    <p className="text-[10px] text-[#9ca3af]">
                                      {new Date(kw.latestRankAt).toLocaleString("ko-KR")}
                                    </p>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-right text-[11px] text-[#9ca3af]">
                      최근 업데이트:{" "}
                      <span className="font-semibold text-[#6b7280]">{p.latestUpdatedAt || "-"}</span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {registerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
          <div className="w-full max-w-[520px] rounded-[24px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-5">
              <h2 className="text-[18px] font-black text-[#111827]">상품 등록</h2>
              <button
                type="button"
                onClick={closeRegister}
                className="text-[22px] leading-none text-[#9ca3af] hover:text-[#111827]"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-[13px] leading-relaxed text-[#6b7280]">
                추적할 스마트스토어·브랜드스토어 상품 페이지 주소를 입력하세요. 브라우저 주소창의{" "}
                <span className="font-bold text-[#374151]">상품 상세 URL</span>을 붙여넣으면 됩니다.
              </p>
              <label className="mt-4 block text-[12px] font-bold text-[#4b5563]">상품 URL</label>
              <input
                type="url"
                value={regUrl}
                onChange={(e) => setRegUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegisterSave()}
                placeholder="https://smartstore.naver.com/…/products/1234567890"
                className="mt-2 w-full rounded-[12px] border border-[#e5e7eb] px-4 py-3 text-[14px] focus:border-[#b91c1c] focus:outline-none"
              />
              {regError && <p className="mt-2 text-[13px] text-[#dc2626]">{regError}</p>}
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeRegister}
                  className="h-[46px] rounded-[14px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleRegisterSave}
                  disabled={regSaving}
                  className="h-[46px] rounded-[14px] bg-[#b91c1c] px-5 text-[14px] font-bold text-white transition hover:bg-[#991b1b] disabled:opacity-60"
                >
                  {regSaving ? "상품 정보 수집 중..." : "등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {kwModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
          <div className="w-full max-w-[860px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
                    KEYWORD MANAGER
                  </p>
                  <h2 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-[#111827]">
                    {kwModalProduct.name}
                  </h2>
                  <p className="mt-2 text-[14px] text-[#6b7280]">
                    등록된 키워드는 아래 표에서 확인·삭제할 수 있고, 새 키워드는 추가 후 저장하면
                    네이버 검색광고 키워드도구로 월 검색량을 불러옵니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeKwModal}
                  className="rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="max-h-[78vh] overflow-y-auto px-6 py-6">
              <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-[#4b5563]">등록된 키워드</p>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-bold text-[#4b5563]">
                    {kwModalProduct.keywords.length}개
                  </span>
                </div>
                <div className="mt-3 overflow-x-auto rounded-[14px] border border-[#e5e7eb]">
                  <table className="min-w-full border-collapse text-[13px]">
                    <thead className="bg-[#f9fafb]">
                      <tr>
                        {["키워드", "월 검색량", "모바일", "PC", ""].map((h, i) => (
                          <th
                            key={`kw-col-${i}`}
                            className="border-b border-[#e5e7eb] px-3 py-2 text-center text-[11px] font-extrabold text-[#6b7280] first:text-left last:w-[72px]"
                          >
                            {h || " "}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kwModalProduct.keywords.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-8 text-center text-[13px] text-[#9ca3af]"
                          >
                            아래에서 키워드를 추가한 뒤 &quot;키워드 저장&quot;을 눌러주세요.
                          </td>
                        </tr>
                      ) : (
                        kwModalProduct.keywords.map((k) => (
                          <tr key={k.id} className="border-t border-[#f3f4f6] bg-white">
                            <td className="px-3 py-2.5 font-semibold text-[#111827]">
                              {k.keyword}
                            </td>
                            <td className="px-3 py-2.5 text-center text-[#6b7280]">
                              {fmtVolume(k.totalVolume)}
                            </td>
                            <td className="px-3 py-2.5 text-center text-[#6b7280]">
                              {fmtVolume(k.mobileVolume)}
                            </td>
                            <td className="px-3 py-2.5 text-center text-[#6b7280]">
                              {fmtVolume(k.pcVolume)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => removeSavedKeyword(k)}
                                disabled={deletingKwId === k.id}
                                className="text-[12px] font-bold text-[#dc2626] hover:underline disabled:opacity-50"
                              >
                                {deletingKwId === k.id ? "…" : "삭제"}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                <p className="text-[13px] font-bold text-[#4b5563]">직접 키워드 추가</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={kwInput}
                    onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addDirectKeywords()}
                    placeholder="쉼표(,)로 여러 개 입력 가능"
                    className="h-[48px] flex-1 rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[14px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={addDirectKeywords}
                    className="h-[48px] rounded-[16px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                  >
                    추가
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-[#4b5563]">저장할 새 키워드</p>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-bold text-[#4b5563]">
                    {pendingKeywords.length}개
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {pendingKeywords.length === 0 ? (
                    <div className="w-full rounded-[14px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 py-8 text-center text-[14px] text-[#9ca3af]">
                      위 입력란에서 키워드를 추가하면 여기에 표시됩니다.
                    </div>
                  ) : (
                    pendingKeywords.map((kw, idx) => (
                      <div
                        key={`${kw}-${idx}`}
                        className="inline-flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-[13px] font-bold text-[#111827]"
                      >
                        <span>{kw}</span>
                        <button
                          type="button"
                          onClick={() => removePendingKeyword(kw)}
                          className="text-[#dc2626] transition hover:opacity-80"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-[#f3f4f6] bg-[#fcfcfc] px-6 py-4">
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeKwModal}
                  className="h-[46px] rounded-[14px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveKeywords}
                  disabled={kwSaving || pendingKeywords.length === 0}
                  className="h-[46px] rounded-[14px] bg-[#111827] px-5 text-[14px] font-bold text-white transition hover:bg-[#1f2937] disabled:opacity-60"
                >
                  {kwSaving ? "저장 중..." : "키워드 저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
