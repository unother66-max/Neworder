"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { GripVertical, Pin, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  sortOrder?: number | null;
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

type KeywordRecommendation = {
  keyword: string;
  monthlyVolume: number;
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

  const PendingKeywordSortableItem = ({
    kw,
    kwModalProduct,
    recommendations,
    removePendingKeyword,
  }: {
    kw: string;
    kwModalProduct: SmartstoreProductRow;
    recommendations: KeywordRecommendation[];
    removePendingKeyword: (kw: string) => void;
  }) => {
    const saved = kwModalProduct.keywords.find((k) => k.keyword === kw);
    const rec = recommendations.find((r) => r.keyword === kw);
    const vol = saved?.totalVolume ?? rec?.monthlyVolume ?? null;

    const {
      attributes,
      listeners,
      setNodeRef,
      setActivatorNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: kw });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      touchAction: "none",
      ...(isDragging
        ? {
            boxShadow: "0 10px 24px rgba(15,23,42,0.14)",
            opacity: 0.15,
          }
        : null),
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 rounded-[12px] border border-[#f3f4f6] bg-white p-3 shadow-sm mb-2 last:mb-0"
      >
        <div
          ref={setActivatorNodeRef}
          className="cursor-grab active:cursor-grabbing"
          {...listeners}
          {...attributes}
          aria-label="드래그로 순서 변경"
          role="button"
          tabIndex={0}
        >
          <GripVertical size={16} className="text-[#d1d5db] transition hover:text-[#9ca3af]" />
        </div>

        <span className="flex-1 text-[14px] font-medium text-[#374151]">{kw}</span>

        {vol == null ? null : (
          <span className="shrink-0 text-[11px] font-semibold text-[#9ca3af]">
            {fmtVolume(vol)}
          </span>
        )}

        <button
          type="button"
          onClick={() => removePendingKeyword(kw)}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[#9ca3af] transition-colors hover:bg-[#fee2e2] hover:text-[#ef4444]"
          aria-label="키워드 제거"
        >
          <span className="text-[14px]">✕</span>
        </button>
      </div>
    );
  };

  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<SmartstoreProductRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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
  const [recommendations, setRecommendations] = useState<KeywordRecommendation[]>([]);
  const [isRecLoading, setIsRecLoading] = useState(false);
  const [activeDragKeyword, setActiveDragKeyword] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  const fetchProducts = useCallback(
    async (opts?: { silent?: boolean }): Promise<SmartstoreProductRow[]> => {
      if (!opts?.silent) setListLoading(true);
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
        if (!opts?.silent) setListLoading(false);
      }
    },
    []
  );

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
    if (p.category?.includes(q)) return true;
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

  const handleUpdateProduct = async (p: SmartstoreProductRow) => {
    if (updatingId) return;
    const url = p.productUrl?.trim();
    if (!url) {
      alert("상품 URL이 없어 업데이트할 수 없어요.");
      return;
    }
    setUpdatingId(p.id);
    try {
      const res = await fetch("/api/smartstore-product-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productUrl: url }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || "업데이트 실패");
        return;
      }

      const rankErrors: string[] = [];
      let rankConfigError: string | null = null;
      if (p.keywords.length > 0) {
        for (const kw of p.keywords) {
          const rr = await fetch("/api/smartstore-keyword-check-rank", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ keywordId: kw.id, maxResults: 1000 }),
          });
          const rd = await rr.json().catch(() => ({}));
          if (!rr.ok) {
            if (rr.status === 503 && typeof rd.error === "string") {
              rankConfigError = rd.error;
              break;
            }
            rankErrors.push(`${kw.keyword}: ${rd.error || `HTTP ${rr.status}`}`);
          }
        }
      }

      await fetchProducts({ silent: true });

      if (rankConfigError) {
        alert(`상품 정보는 갱신됐어요.\n\n키워드 순위: ${rankConfigError}`);
      } else if (rankErrors.length > 0) {
        const head = rankErrors.slice(0, 4).join("\n");
        const more = rankErrors.length > 4 ? `\n… 외 ${rankErrors.length - 4}건` : "";
        alert(`상품 정보는 갱신됐어요.\n\n일부 키워드 순위 조회 실패:\n${head}${more}`);
      }
    } catch (e) {
      console.warn(e);
      alert("업데이트 중 오류가 발생했습니다.");
    } finally {
      setUpdatingId(null);
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

      closeRegister();
      await fetchProducts();
    } catch (e) {
      console.warn(e);
      setRegError("등록 중 오류가 발생했습니다.");
    } finally {
      setRegSaving(false);
    }
  };

  const openKwModal = async (p: SmartstoreProductRow) => {
    setKwModalProduct(p);
    setPendingKeywords(p.keywords.map((k) => k.keyword));
    setKwInput("");
    setDeletingKwId(null);
    setRecommendations([]);
    setIsRecLoading(true);
    try {
      const res = await fetch(`/api/smartstore-keyword-recommend?productId=${p.id}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        console.warn("[smartstore] keyword recommend error:", data?.error || res.status);
        setRecommendations([]);
        return;
      }
      const list: KeywordRecommendation[] = Array.isArray(data.recommendations)
        ? data.recommendations
        : [];
      setRecommendations(list);
    } catch (e) {
      console.warn("[smartstore] keyword recommend fetch error:", e);
      setRecommendations([]);
    } finally {
      setIsRecLoading(false);
    }
  };

  const closeKwModal = () => {
    setKwModalProduct(null);
    setPendingKeywords([]);
    setKwInput("");
    setDeletingKwId(null);
    setRecommendations([]);
    setIsRecLoading(false);
  };

  const addDirectKeywords = () => {
    if (!kwModalProduct) return;
    const parts = kwInput.split(",").map((s) => s.trim()).filter(Boolean);
    const savedSet = new Set(kwModalProduct.keywords.map((k) => k.keyword));
    setPendingKeywords((prev) => {
      const next = [...prev];
      for (const kw of parts) {
        if (savedSet.has(kw) || next.includes(kw)) continue;
        if (next.length >= MAX_KEYWORDS) {
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

  const toggleRecommendedKeyword = (kw: string, checked: boolean) => {
    if (!kwModalProduct) return;
    const savedSet = new Set(kwModalProduct.keywords.map((k) => k.keyword));
    if (savedSet.has(kw)) return;

    if (!checked) {
      setPendingKeywords((prev) => prev.filter((k) => k !== kw));
      return;
    }

    setPendingKeywords((prev) => {
      if (prev.includes(kw)) return prev;
      if (prev.length >= MAX_KEYWORDS) {
        alert(`키워드는 상품당 최대 ${MAX_KEYWORDS}개까지 등록할 수 있어요.`);
        return prev;
      }
      return [...prev, kw];
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handlePendingDragStart = (event: DragStartEvent) => {
    setActiveDragKeyword(String(event.active.id));
  };

  const handlePendingDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragKeyword(null);
    if (!over) return;
    if (active.id === over.id) return;
    setPendingKeywords((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handlePendingDragCancel = () => {
    setActiveDragKeyword(null);
  };

  const saveKeywords = async () => {
    if (!kwModalProduct || kwSaving) return;
    setKwSaving(true);
    try {
      const keywordList = (() => {
        const raw = (pendingKeywords as unknown[]).map((k) =>
          typeof k === "string" ? k : String((k as any)?.keyword ?? "")
        );
        const trimmed = raw.map((s) => String(s ?? "").trim()).filter(Boolean);
        // 중복 제거(첫 등장 기준)
        const seen = new Set<string>();
        const uniq: string[] = [];
        for (const kw of trimmed) {
          if (seen.has(kw)) continue;
          seen.add(kw);
          uniq.push(kw);
        }
        return uniq;
      })();

      const res = await fetch("/api/smartstore-keyword-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: kwModalProduct.id,
          keywords: keywordList,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "키워드 저장(동기화) 실패");
      }
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
                * 검색 순위는 각 상품 「업데이트」로 갱신됩니다. 월 검색량은 키워드 저장 시 조회됩니다.
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
                            <h3 className="text-[14px] font-bold leading-snug tracking-[-0.02em] text-[#111827] md:text-[15px]">
                              {cardProductTitle(p)}
                            </h3>
                          </div>

                          {p.category?.trim() ? (
                            <p className="mt-1 text-[12px] font-semibold leading-snug text-[#9ca3af] break-words">
                              {p.category.trim()}
                            </p>
                          ) : null}

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
                          onClick={() => handleUpdateProduct(p)}
                          disabled={updatingId === p.id}
                          className={`inline-flex h-[42px] shrink-0 items-center justify-center rounded-[14px] bg-[#111827] px-4 text-[14px] font-bold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {updatingId === p.id
                            ? p.keywords.length > 0
                              ? "업데이트·순위 조회 중..."
                              : "업데이트 중..."
                            : "업데이트"}
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
                          onClick={() => void openKwModal(p)}
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
                                키워드를 등록한 뒤 상단 「업데이트」로 순위를 갱신하면 네이버 쇼핑 검색 기준 순위가
                                표시돼요.
                                <br />
                                <span className="font-semibold">[키워드 관리]</span>에서 키워드를 추가하세요.
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
                                    className={`text-[13px] ${
                                      kw.latestRankLabel === "-"
                                        ? "font-bold text-[#9ca3af]"
                                        : kw.latestRankLabel === "1000위 밖" ||
                                            kw.latestRankLabel === "미노출"
                                          ? "font-bold text-[#94a3b8]"
                                          : "font-bold text-[#111827]"
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
          <div className="w-full max-w-[560px] rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="border-b border-[#f3f4f6] bg-white px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-extrabold tracking-[-0.01em] text-[#111827]">
                  키워드 관리
                </p>
                <button
                  type="button"
                  onClick={closeKwModal}
                  className="rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-bold text-[#6b7280] transition hover:bg-[#f9fafb]"
                >
                  닫기
                </button>
              </div>
            </div>

            {/* Reorder 좌표 계산 안정화를 위해 모달 본문은 block + overflow visible로 유지하고,
                내부 섹션(추천/키워드 리스트)만 자체 스크롤을 사용합니다. */}
            <div className="px-6 py-6">
              <div className="rounded-[16px] bg-[#f9fafb] p-4">
                <div className="flex items-center gap-4">
                  <img
                    src={kwModalProduct.imageUrl || PRODUCT_CARD_PLACEHOLDER_IMG}
                    alt={cardProductTitle(kwModalProduct)}
                    className="h-16 w-16 rounded-lg object-cover ring-1 ring-[#e5e7eb]"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-[#111827]">
                      {cardProductTitle(kwModalProduct)}
                    </p>
                    {kwModalProduct.category?.trim() ? (
                      <p className="mt-1 truncate text-[12px] font-semibold text-[#6b7280]">
                        {kwModalProduct.category.trim()}
                      </p>
                    ) : (
                      <p className="mt-1 text-[12px] font-semibold text-[#9ca3af]">카테고리 없음</p>
                    )}
                    <p className="mt-2 text-[12px] text-[#6b7280]">
                      새 키워드는 저장 시 네이버 키워드도구로 월 검색량을 불러옵니다.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-[#4b5563]">키워드 선택 추가</p>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-bold text-[#4b5563]">
                    {recommendations.length}개
                  </span>
                </div>

                {isRecLoading ? (
                  <div className="mt-3 rounded-[14px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 py-6 text-center text-[12px] text-[#6b7280]">
                    추천 키워드를 추출 중입니다...
                  </div>
                ) : recommendations.length === 0 ? (
                  <div className="mt-3 rounded-[14px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 py-6 text-center text-[12px] text-[#9ca3af]">
                    추천 키워드가 없습니다.
                  </div>
                ) : (
                  <div className="mt-3 max-h-[220px] overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {recommendations.map((rec, idx) => {
                      const kw = String(rec.keyword ?? "").trim();
                      if (!kw) return null;
                      const savedSet = new Set(kwModalProduct.keywords.map((k) => k.keyword));
                      const isSaved = savedSet.has(kw);
                      const checked = pendingKeywords.includes(kw);
                      const vol = Number(rec.monthlyVolume ?? 0) || 0;
                      const volTone =
                        vol >= 10000
                          ? "text-[#2563eb] bg-[#eff6ff] border-[#bfdbfe]"
                          : vol >= 1000
                            ? "text-[#16a34a] bg-[#f0fdf4] border-[#bbf7d0]"
                            : "text-[#6b7280] bg-[#f3f4f6] border-[#e5e7eb]";
                      const baseCls =
                        "inline-flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-left transition active:scale-95";
                      return (
                        <button
                          type="button"
                          key={`${kw}-${idx}`}
                          disabled={isSaved}
                          onClick={() => toggleRecommendedKeyword(kw, !checked)}
                          className={`${baseCls} ${
                            isSaved
                              ? "cursor-not-allowed border-[#e5e7eb] opacity-60"
                              : checked
                                ? "border-[#111827] ring-1 ring-[#111827]/10"
                                : "border-[#e5e7eb] hover:border-[#d1d5db] hover:bg-[#fafafa]"
                          }`}
                        >
                          <span className="text-[12px] font-semibold text-[#111827]">{kw}</span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${volTone}`}
                          >
                            월 검색량 {fmtVolume(vol)}
                          </span>
                          {isSaved ? (
                            <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#6b7280]">
                              등록됨
                            </span>
                          ) : checked ? (
                            <span className="shrink-0 rounded-full bg-[#111827] px-2 py-0.5 text-[10px] font-bold text-white">
                              선택
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    </div>
                  </div>
                )}
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
                    className="h-[42px] flex-1 rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[13px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={addDirectKeywords}
                    className="h-[42px] rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[13px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                  >
                    추가
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-[#4b5563]">키워드 순서변경</p>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-bold text-[#4b5563]">
                    {pendingKeywords.length}개
                  </span>
                </div>
                {pendingKeywords.length === 0 ? (
                  <div className="mt-3 flex h-[80px] items-center justify-center rounded-[14px] border border-dashed border-[#e5e7eb] text-[13px] text-[#9ca3af]">
                    추가된 키워드가 없습니다.
                  </div>
                ) : (
                  <div
                    id="keyword-scroll-container"
                    className="mt-3 max-h-[300px] overflow-y-auto pr-1"
                    style={{ position: "relative" }}
                  >
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handlePendingDragStart}
                      onDragEnd={handlePendingDragEnd}
                      onDragCancel={handlePendingDragCancel}
                    >
                      <SortableContext
                        items={pendingKeywords}
                        strategy={verticalListSortingStrategy}
                      >
                        {pendingKeywords.map((kw) => (
                          <PendingKeywordSortableItem
                            key={kw}
                            kw={kw}
                            kwModalProduct={kwModalProduct}
                            recommendations={recommendations}
                            removePendingKeyword={removePendingKeyword}
                          />
                        ))}
                      </SortableContext>
                      <DragOverlay dropAnimation={null}>
                        {activeDragKeyword ? (
                          <div className="flex items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-white p-3 shadow-md">
                            <GripVertical size={16} className="text-[#9ca3af]" />
                            <span className="text-[14px] font-medium text-[#374151]">
                              {activeDragKeyword}
                            </span>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  </div>
                )}
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
