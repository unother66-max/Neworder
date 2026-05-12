"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import TopNav from "@/components/top-nav";
import { SmartstoreProductRegisterModal } from "@/components/smartstore-product-register-modal";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

const PRODUCT_CARD_PLACEHOLDER_IMG = "/file.svg";

type TargetRow = {
  id: string;
  createdAt: string;
  target: {
    id: string;
    productId: string;
    productUrl: string;
    name: string;
    imageUrl: string | null;
    storeName: string | null;
    reviewCount: number | null;
    reviewRating: number | null;
    reviewPhotoVideoCount: number | null;
    reviewMonthlyUseCount: number | null;
    reviewRepurchaseCount: number | null;
    reviewStorePickCount: number | null;
    reviewStarSummary: any;
    updatedAtLabel: string;
  };
  latestHistory: {
    trackedDate: string;
    reviewCount: number;
    reviewRating: number | null;
    createdAt: string;
  } | null;
  prevHistory: {
    trackedDate: string;
    reviewCount: number;
    reviewRating: number | null;
    createdAt: string;
  } | null;
  delta: {
    reviewCount: number | null;
    reviewRating: number | null;
    reviewPhotoVideoCount: number | null;
    reviewMonthlyUseCount: number | null;
    reviewRepurchaseCount: number | null;
    reviewStorePickCount: number | null;
  };
};

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toLocaleString();
}

function fmtRating(v: number | null | undefined): string {
  if (v == null) return "-";
  return v.toFixed(2);
}

function DeltaChip({ n }: { n: number | null | undefined }) {
  if (n == null || n === 0) {
    return (
      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-extrabold text-[#9ca3af]">
        <Minus size={12} /> 0
      </div>
    );
  }
  const up = n > 0;
  return (
    <div
      className={[
        "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold",
        up ? "bg-[#ecfdf5] text-[#059669]" : "bg-[#fff1f2] text-[#e11d48]",
      ].join(" ")}
    >
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {up ? "+" : ""}
      {n}
    </div>
  );
}

function starSummaryToCounts(v: any): Record<"1" | "2" | "3" | "4" | "5", number> | null {
  if (!v || typeof v !== "object") return null;
  const get = (k: "1" | "2" | "3" | "4" | "5") => {
    const n = Number((v as any)[k]);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  };
  return { "1": get("1"), "2": get("2"), "3": get("3"), "4": get("4"), "5": get("5") };
}

function StarBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 shrink-0 text-[11px] font-black text-[#6b7280]">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f3f4f6]">
        <div
          className="h-2 rounded-full bg-[#111827]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-[56px] shrink-0 text-right text-[11px] font-extrabold text-[#111827]">
        {fmtNum(count)}
      </div>
      <div className="w-10 shrink-0 text-right text-[11px] font-semibold text-[#9ca3af]">
        {pct}%
      </div>
    </div>
  );
}

function StarTrackTick({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="min-w-0">
      <div className="h-1 overflow-hidden rounded-full bg-[#e5e7eb]">
        <div className="h-1 rounded-full bg-[#111827]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-center text-[10px] font-semibold text-[#6b7280]">{label}</div>
    </div>
  );
}

function MetricStat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: number | null | undefined;
}) {
  const d =
    delta == null || delta === 0
      ? "- 0"
      : delta > 0
        ? `+ ${delta.toLocaleString()}`
        : `- ${Math.abs(delta).toLocaleString()}`;
  return (
    <div className="flex h-[54px] w-full min-w-0 max-w-none flex-col justify-center rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-2 md:h-[62px] md:w-full md:min-h-[62px] md:min-w-0 md:max-w-none md:rounded-[12px] md:px-3">
      <div className="truncate text-[10px] font-semibold leading-none text-[#6b7280]">{label}</div>
      <div className="mt-1 flex min-w-0 items-end justify-between gap-1.5">
        <div className="min-w-0 truncate text-[14px] font-semibold leading-none tracking-[-0.02em] text-[#111827] md:text-[16px] md:font-black">
          {value}
        </div>
        <div className="shrink-0 text-[10px] font-semibold leading-none text-[#9ca3af]">{d}</div>
      </div>
    </div>
  );
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const finalSrc = src?.trim();
  if (!finalSrc || broken) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px]">
        <img
          src={PRODUCT_CARD_PLACEHOLDER_IMG}
          alt=""
          className="h-7 w-7 opacity-[0.35] md:h-8 md:w-8"
          width={32}
          height={32}
          aria-hidden
        />
      </div>
    );
  }
  return (
    <img
      src={finalSrc}
      alt={alt}
      className="h-12 w-12 shrink-0 rounded-[12px] object-cover ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px]"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  );
}

export default function SmartstoreReviewTrackPage() {
  const { status } = useSession();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [error, setError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addRegError, setAddRegError] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");

  const [syncingTargetId, setSyncingTargetId] = useState<string | null>(null);
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [recentByProductId, setRecentByProductId] = useState<
    Record<
      string,
      Array<{
        reviewKey: string;
        postedAt: string | null;
        rating: number | null;
        author: string | null;
        content: string;
        createdAt: string;
      }>
    >
  >({});

  // 디자인 통일용 상태값 (호버 및 마우스 위치)
  const [isAddHovered, setIsAddHovered] = useState(false);
  const [isSyncAllHovered, setIsSyncAllHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [syncAllMousePos, setSyncAllMousePos] = useState({ x: 0, y: 0 });
  const [updateHover, setUpdateHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleSyncAllMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSyncAllMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleUpdateMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setUpdateHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  useEffect(() => setMounted(true), []);

  const fetchTargets = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/smartstore-review-targets", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "불러오기 실패");
      }
      setTargets(Array.isArray(data?.targets) ? data.targets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetchTargets();
    }
  }, [mounted, status, router, fetchTargets]);

  const selectedTarget: TargetRow | null = useMemo(() => {
    return targets[0] ?? null;
  }, [targets]);

  const closeAddModal = () => {
    setAddOpen(false);
    setShowManualInput(false);
    setManualName("");
    setManualImageUrl("");
    setAddUrl("");
    setAddRegError("");
  };

  const handleReviewRegisterAuto = async () => {
    if (adding) return;
    const url = addUrl.trim();
    if (!url) {
      setAddRegError("상품 URL을 입력해주세요.");
      return;
    }

    setAdding(true);
    setAddRegError("");
    setShowManualInput(false);

    try {
      const saveRes = await fetch("/api/smartstore-product-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productUrl: url,
          space: "NAVER_REVIEW",
        }),
      });

      const data = (await saveRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!saveRes.ok || !data.ok) {
        setAddRegError(data.error || `등록 실패 (HTTP ${saveRes.status})`);
        setShowManualInput(true);
        return;
      }

      closeAddModal();
      await fetchTargets();
    } catch (e) {
      console.warn(e);
      setAddRegError("등록 중 오류가 발생했습니다.");
      setShowManualInput(true);
    } finally {
      setAdding(false);
    }
  };

  const handleReviewRegisterManual = async () => {
    if (adding) return;
    const url = addUrl.trim();
    if (!url) {
      setAddRegError("상품 URL을 입력해주세요.");
      return;
    }
    const n = manualName.trim();
    const img = manualImageUrl.trim();
    if (!n) {
      setAddRegError("수동 등록: 상품명을 입력해주세요.");
      return;
    }
    if (!img) {
      setAddRegError("수동 등록: 이미지 URL을 입력해주세요.");
      return;
    }

    setAdding(true);
    setAddRegError("");
    try {
      const saveRes = await fetch("/api/smartstore-product-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productUrl: url,
          space: "NAVER_REVIEW",
          skipMetaFetch: true,
          name: n,
          imageUrl: img,
          thumbnailLink: img,
        }),
      });
      const data = (await saveRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!saveRes.ok || !data.ok) {
        setAddRegError(data.error || `수동 등록 실패 (HTTP ${saveRes.status})`);
        setShowManualInput(true);
        return;
      }
      closeAddModal();
      await fetchTargets();
    } catch (e) {
      console.warn(e);
      setAddRegError("수동 등록 중 오류가 발생했습니다.");
      setShowManualInput(true);
    } finally {
      setAdding(false);
    }
  };

  const removeTarget = useCallback(async (targetId: string) => {
    if (!confirm("리뷰 관리 대상에서 삭제할까요?")) return;
    setError("");
    try {
      const res = await fetch(`/api/smartstore-review-targets?id=${encodeURIComponent(targetId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "삭제 실패");
      }
      await fetchTargets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchTargets]);

  const syncOne = useCallback(async (t: TargetRow) => {
    setSyncingTargetId(t.id);
    setError("");
    setSyncWarning("");
    try {
      const res = await fetch("/api/smartstore-review-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: t.target.productId }),
      });
      const data = (await res.json()) as any;
      if (res.status === 429) {
        throw new Error(typeof data?.error === "string" ? data.error : "네이버 차단(429)");
      }
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "동기화 실패");
      }
      // 차단으로 인한 partial 응답 (status 200, ok: false, partial: true)
      if (data?.partial === true) {
        setSyncWarning(
          typeof data?.message === "string"
            ? data.message
            : "네이버 차단으로 최신 리뷰 수를 갱신하지 못했습니다. 기존 데이터를 유지합니다."
        );
        await fetchTargets();
        return;
      }
      if (Array.isArray(data?.recentReviews)) {
        setRecentByProductId((prev) => ({ ...prev, [t.target.id]: data.recentReviews }));
      }
      await fetchTargets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncingTargetId(null);
    }
  }, [fetchTargets]);

  const syncAll = useCallback(async () => {
    if (targets.length === 0) return;
    setSyncAllLoading(true);
    setError("");
    setSyncWarning("");
    try {
      for (const t of targets) {
        // stop early if user navigates
        // eslint-disable-next-line no-await-in-loop
        await syncOne(t);
      }
    } finally {
      setSyncAllLoading(false);
    }
  }, [targets, syncOne]);

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-[#f8fafc] pt-20 text-[#111111] md:pt-24">
      <TopNav activeSmartstoreSub="review-track" />

      <section className="mx-auto max-w-[1240px] px-3 py-2 pb-16 md:px-6 md:py-5 lg:px-8">
        <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="flex flex-col gap-2.5 md:gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                  상품 리뷰 관리
                </h1>
                <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:py-1 md:text-[11px]">
                  REVIEW
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-5 text-[#4b5563] md:mt-1 md:text-[13px]">
                <span className="md:hidden">상품 리뷰와 평점을 관리합니다.</span>
                <span className="hidden md:inline">
                  스마트스토어 상품의 리뷰 수와 평점 변화를 한 화면에서 추적합니다.
                </span>
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row md:gap-3 lg:items-center">
              <button
                type="button"
                className={`
                  relative inline-flex h-[40px] min-w-0 items-center justify-center overflow-hidden rounded-[12px]
                  bg-[#333333] px-3 text-[12px] font-bold text-white font-sans
                  transition-all duration-300 ease-in-out
                  md:h-[44px] md:min-w-[108px] md:rounded-[14px] md:px-4 md:text-[13px]
                `}
                onMouseEnter={() => setIsAddHovered(true)}
                onMouseLeave={() => setIsAddHovered(false)}
                onMouseMove={handleMouseMove}
                onClick={() => {
                  setAddRegError("");
                  setShowManualInput(false);
                  setManualName("");
                  setManualImageUrl("");
                  setAddUrl("");
                  setAddOpen(true);
                }}
              >
                <span className="relative z-30 inline-flex items-center gap-1.5 pointer-events-none">
                  <Plus size={15} />
                  상품 등록
                </span>
                <div
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                  style={{
                    transformOrigin: "left",
                    transform: isAddHovered ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                    backgroundColor: "#2563EB",
                  }}
                />
                <div
                  className={`
                    absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-32 md:w-32
                    transition-opacity duration-200 ease-out
                    ${isAddHovered ? "opacity-100" : "opacity-0"}
                  `}
                  style={{
                    left: `${mousePos.x}px`,
                    top: `${mousePos.y}px`,
                    pointerEvents: "none",
                    zIndex: 25,
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                    mixBlendMode: "soft-light",
                    filter:
                      "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                  }}
                />
              </button>

            <button
              type="button"
              onClick={syncAll}
              disabled={syncAllLoading || targets.length === 0}
              onMouseEnter={() => setIsSyncAllHovered(true)}
              onMouseLeave={() => setIsSyncAllHovered(false)}
              onMouseMove={handleSyncAllMouseMove}
              className={`
                relative inline-flex h-[40px] min-w-0 items-center justify-center overflow-hidden rounded-[12px]
                bg-[#333333] px-3 text-[12px] font-bold text-white font-sans
                transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-50
                md:h-[44px] md:min-w-[108px] md:rounded-[14px] md:px-4 md:text-[13px]
              `}
            >
              <span className="relative z-30 inline-flex min-w-0 items-center gap-1.5 pointer-events-none">
                <RefreshCw size={15} className={syncAllLoading ? "animate-spin" : ""} />
                <span className="truncate">{syncAllLoading ? "업데이트 중..." : "전체 업데이트"}</span>
              </span>
              <div
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                style={{
                  transformOrigin: "left",
                  transform: isSyncAllHovered ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                  backgroundColor: "#2563EB",
                }}
              />
              <div
                className={`
                  absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-32 md:w-32
                  transition-opacity duration-200 ease-out
                  ${isSyncAllHovered ? "opacity-100" : "opacity-0"}
                `}
                style={{
                  left: `${syncAllMousePos.x}px`,
                  top: `${syncAllMousePos.y}px`,
                  pointerEvents: "none",
                  zIndex: 25,
                  backgroundImage:
                    "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                  mixBlendMode: "soft-light",
                  filter:
                    "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                }}
              />
            </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-2.5 rounded-[14px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2.5 text-[12px] font-bold text-[#b91c1c] md:mt-4 md:p-3 md:text-[13px]">
            {error}
          </div>
        ) : null}
        {syncWarning ? (
          <div className="mt-2.5 rounded-[14px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-[12px] font-bold text-[#92400e] md:mt-4 md:p-3 md:text-[13px]">
            ⚠ {syncWarning}
          </div>
        ) : null}

        <div className="mt-2.5 overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:mt-5 md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          {selectedTarget ? (
            <div className="flex min-w-0 items-center gap-2.5 md:gap-4">
              <ProductThumb
              src={selectedTarget.target.imageUrl}
              alt={selectedTarget.target.name}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-black tracking-[-0.03em] text-[#111827] md:text-[20px]">
                {selectedTarget.target.name}
                </div>
                <div className="mt-0.5 truncate text-[12px] font-semibold text-[#6b7280] md:mt-1.5 md:text-[13px]">
                {selectedTarget.target.storeName ? `${selectedTarget.target.storeName} · ` : ""}
                상품ID {selectedTarget.target.productId}
                </div>
              </div>
              <a
              href={selectedTarget.target.productUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 shrink-0 items-center rounded-[10px] border border-[#d1d5db] bg-white px-2.5 text-[11px] font-bold text-[#111827] transition hover:bg-[#f9fafb] md:h-[38px] md:rounded-[12px] md:px-3 md:text-[12px]"
              >
                상품 보기
              </a>
            </div>
          ) : (
            <div className="text-[12px] font-bold leading-5 text-[#6b7280] md:text-[13px]">
              아직 리뷰 관리 대상 상품이 없습니다. 상단의 상품 등록으로 시작하세요.
            </div>
          )}
        </div>

        <div className="mt-2.5 space-y-3 md:mt-5 md:space-y-4">
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-1.5 md:gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-[15px] font-black tracking-[-0.02em] text-[#111827] md:text-[17px]">
                    등록된 상품
                  </div>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:px-2.5 md:py-1 md:text-[11px]">
                    {targets.length}개
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#6b7280] md:mt-2 md:text-[12px]">
                  {loading ? "상품 목록 불러오는 중..." : "각 상품은 개별 업데이트가 가능합니다."}
                </div>
              </div>
              <div className="text-[10px] leading-4 text-[#6b7280] md:text-[11px] md:text-[#9ca3af]">
                전체 업데이트는 상단 버튼을 사용합니다.
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-10 text-center text-[13px] text-[#9ca3af] md:rounded-[22px] md:px-6 md:py-14 md:text-[14px]">
              불러오는 중...
            </div>
          ) : targets.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-white px-4 py-10 text-center shadow-[0_4px_18px_rgba(15,23,42,0.025)] md:rounded-[22px] md:px-6 md:py-14 md:shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
              <p className="text-[15px] font-bold text-[#111827] md:text-[18px]">아직 등록된 상품이 없어요</p>
              <p className="mt-2 text-[12px] text-[#9ca3af] md:text-[14px]">
                상단의 상품 등록 버튼으로 스마트스토어 상품 URL을 추가해보세요.
              </p>
            </div>
          ) : (
            targets.map((t) => {
              const stars = starSummaryToCounts(t.target.reviewStarSummary);
              const totalStars = stars
                ? stars["1"] + stars["2"] + stars["3"] + stars["4"] + stars["5"]
                : 0;
              return (
                <div
                  key={t.id}
                  className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] transition hover:shadow-[0_8px_24px_rgba(15,23,42,0.055)] md:rounded-[22px] md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-3 py-2.5 md:px-6 md:py-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex min-w-0 flex-1 gap-2.5 md:gap-4 xl:min-w-0">
                        <ProductThumb src={t.target.imageUrl} alt={t.target.name} />
                        <div className="min-w-0 flex-1">
                          <div className="min-w-0 overflow-hidden text-[15px] font-black leading-snug tracking-[-0.03em] text-[#111827] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] md:text-[20px]">
                            {t.target.name}
                          </div>
                          <div className="mt-0.5 truncate text-xs leading-5 text-[#4b5563] md:mt-1.5 md:text-[13px] md:text-[#6b7280]">
                            {t.target.storeName ? `${t.target.storeName} · ` : ""}
                            상품ID {t.target.productId}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] font-semibold text-[#9ca3af] md:mt-1">
                            업데이트 {t.target.updatedAtLabel}
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:shrink-0 xl:flex-none xl:px-4">
                        {/* PC(md+): 3×2 고정 열 너비. 모바일은 기존 2열·420px 이상 3열 유지 */}
                        <div className="grid w-full grid-cols-2 gap-1.5 min-[420px]:grid-cols-3 md:w-max md:max-w-none md:grid-cols-3 md:grid-rows-2 md:gap-2 md:[grid-template-columns:repeat(3,minmax(7rem,7rem))]">
                          <MetricStat
                            label="리뷰 수"
                            value={fmtNum(t.target.reviewCount)}
                            delta={t.delta.reviewCount}
                          />
                          <MetricStat
                            label="포토/영상"
                            value={fmtNum(t.target.reviewPhotoVideoCount)}
                            delta={t.delta.reviewPhotoVideoCount}
                          />
                          <MetricStat
                            label="한달사용"
                            value={fmtNum(t.target.reviewMonthlyUseCount)}
                            delta={t.delta.reviewMonthlyUseCount}
                          />
                          <MetricStat
                            label="재구매"
                            value={fmtNum(t.target.reviewRepurchaseCount)}
                            delta={t.delta.reviewRepurchaseCount}
                          />
                          <MetricStat
                            label="스토어픽"
                            value={fmtNum(t.target.reviewStorePickCount)}
                            delta={t.delta.reviewStorePickCount}
                          />
                          <MetricStat
                            label="평점"
                            value={
                              t.target.reviewRating == null
                                ? "-"
                                : `★ ${fmtRating(t.target.reviewRating)}`
                            }
                            delta={t.delta.reviewRating}
                          />
                        </div>
                      </div>

                      <div className="flex w-full items-center justify-end gap-1.5 md:gap-2 xl:w-auto xl:shrink-0">
                      <button
                        type="button"
                        onClick={() => syncOne(t)}
                        disabled={syncingTargetId === t.id}
                        onMouseEnter={() => setUpdateHover({ id: t.id, x: updateHover.x, y: updateHover.y })}
                        onMouseLeave={() => setUpdateHover((prev) => prev.id === t.id ? { ...prev, id: null } : prev)}
                        onMouseMove={(e) => handleUpdateMouseMove(e, t.id)}
                        className={`relative inline-flex h-8 min-w-[104px] items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-3 text-[12px] font-bold text-white font-sans transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-60 md:h-[42px] md:min-w-[118px] md:rounded-[14px] md:px-4 md:text-[13px]`}
                      >
                        <span className="relative z-30 inline-flex items-center gap-1.5 pointer-events-none">
                          <RefreshCw
                            size={14}
                            className={syncingTargetId === t.id ? "animate-spin" : ""}
                          />
                          {syncingTargetId === t.id ? "업데이트..." : "업데이트"}
                        </span>
                        <div
                          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                          style={{
                            transformOrigin: "left",
                            transform: updateHover.id === t.id ? "scaleX(1)" : "scaleX(0)",
                            transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                            backgroundColor: "#2563EB",
                          }}
                        />
                        <div
                          className={`
                            absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-32 md:w-32
                            transition-opacity duration-200 ease-out
                            ${updateHover.id === t.id ? "opacity-100" : "opacity-0"}
                          `}
                          style={{
                            left: `${updateHover.x}px`,
                            top: `${updateHover.y}px`,
                            pointerEvents: "none",
                            zIndex: 25,
                            backgroundImage:
                              "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                            mixBlendMode: "soft-light",
                            filter:
                              "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTarget(t.id)}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:border-[#d1d5db] hover:bg-[#f9fafb] hover:text-[#111827] md:h-[42px] md:w-[42px] md:rounded-[14px]`}
                        aria-label="삭제"
                        title="삭제"
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                      </div>
                    </div>
                  </div>

                  {stars ? (
                    <div className="px-3 py-2.5 md:px-6 md:py-4">
                      <div className="rounded-[14px] border border-[#e5e7eb] bg-white px-3 py-2.5 md:rounded-[16px] md:px-4 md:py-3">
                        <div className="grid grid-cols-5 gap-2 md:gap-4">
                          <StarTrackTick label="5점" count={stars["5"]} total={totalStars} />
                          <StarTrackTick label="4점" count={stars["4"]} total={totalStars} />
                          <StarTrackTick label="3점" count={stars["3"]} total={totalStars} />
                          <StarTrackTick label="2점" count={stars["2"]} total={totalStars} />
                          <StarTrackTick label="1점" count={stars["1"]} total={totalStars} />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <SmartstoreProductRegisterModal
          open={addOpen}
          onClose={closeAddModal}
          productUrl={addUrl}
          onProductUrlChange={setAddUrl}
          onProductUrlKeyDown={(e) => {
            if (e.key === "Enter") {
              if (showManualInput) handleReviewRegisterManual();
              else handleReviewRegisterAuto();
            }
          }}
          errorMessage={addRegError}
          showManualInput={showManualInput}
          manualName={manualName}
          onManualNameChange={setManualName}
          manualImageUrl={manualImageUrl}
          onManualImageUrlChange={setManualImageUrl}
          saving={adding}
          onPrimaryAction={showManualInput ? handleReviewRegisterManual : handleReviewRegisterAuto}
          primaryButtonLabel={
            adding
              ? showManualInput
                ? "수동 등록 중..."
                : "상품 정보 수집 중..."
              : showManualInput
                ? "수동 등록"
                : "등록"
          }
        />
      </section>
    </main>
  );
}
