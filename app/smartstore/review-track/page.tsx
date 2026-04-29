"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import TopNav from "@/components/top-nav";
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
      <div className="h-1 overflow-hidden rounded-full bg-gray-200">
        <div className="h-1 rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-center text-[10px] font-semibold text-gray-500">{label}</div>
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
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[10px] font-extrabold text-gray-600">{label}</div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <div className="text-[16px] font-black tracking-[-0.02em] text-gray-900">{value}</div>
        <div className="text-[10px] font-semibold text-gray-400">{d}</div>
      </div>
    </div>
  );
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  const finalSrc = src?.trim();
  if (!finalSrc || broken) {
    return (
      <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-[14px] bg-[#f3f4f6] ring-1 ring-[#e5e7eb]">
        <img
          src={PRODUCT_CARD_PLACEHOLDER_IMG}
          alt=""
          className="h-8 w-8 opacity-[0.35]"
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
      className="h-[56px] w-[56px] shrink-0 rounded-[14px] object-cover ring-1 ring-[#e5e7eb]"
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

  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
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

  const addTargetByUrl = useCallback(async () => {
    const productUrl = addUrl.trim();
    if (!productUrl) {
      setError("상품 URL을 입력해주세요.");
      return;
    }
    if (showManualInput && !manualName.trim()) {
      setError("상품명을 입력해주세요.");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/smartstore-review-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productUrl,
          manualName: showManualInput ? manualName.trim() : undefined,
          manualImageUrl: showManualInput ? manualImageUrl.trim() : undefined,
        }),
      });
      const data = (await res.json()) as any;
      if (res.status === 429) {
        setShowManualInput(true);
        throw new Error(typeof data?.error === "string" ? data.error : "네이버 차단(429)");
      }
      if (!res.ok) {
        if (res.status === 400) {
          setShowManualInput(true);
        }
        throw new Error(typeof data?.error === "string" ? data.error : "추가 실패");
      }
      await fetchTargets();
      setAddOpen(false);
      setShowManualInput(false);
      setManualName("");
      setManualImageUrl("");
      setAddUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }, [addUrl, fetchTargets, manualImageUrl, manualName, showManualInput]);

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
    <main className="min-h-screen bg-[#f8fafc] pt-24">
      <TopNav activeSmartstoreSub="review-track" />

      <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[18px] font-black text-[#111827]">상품 리뷰 관리</div>
            <div className="text-[12px] font-semibold text-[#9ca3af]">
              스마트스토어 상품의 리뷰 수/평점을 수집하고 변화를 추적합니다.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError("");
                setShowManualInput(false);
                setManualName("");
                setManualImageUrl("");
                setAddOpen(true);
              }}
              className="h-[44px] min-w-[108px] rounded-[14px] bg-[#b91c1c] px-4 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b]"
            >
              상품 등록
            </button>
            <button
              type="button"
              onClick={syncAll}
              disabled={syncAllLoading || targets.length === 0}
              className="rounded-[12px] bg-[#111827] px-4 py-2 text-[13px] font-extrabold text-white shadow-sm disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={16} className={syncAllLoading ? "animate-spin" : ""} />
                {syncAllLoading ? "전체 업데이트 중..." : "전체 업데이트"}
              </span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff1f2] p-3 text-[13px] font-bold text-[#b91c1c]">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-[18px] bg-white p-4 shadow-sm ring-1 ring-[#e5e7eb]">
          {selectedTarget ? (
            <div className="flex items-center gap-4">
              <ProductThumb
              src={selectedTarget.target.imageUrl}
              alt={selectedTarget.target.name}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-black text-[#111827]">
                {selectedTarget.target.name}
                </div>
                <div className="mt-0.5 truncate text-[12px] font-semibold text-[#9ca3af]">
                {selectedTarget.target.storeName ? `${selectedTarget.target.storeName} · ` : ""}
                상품ID {selectedTarget.target.productId}
                </div>
              </div>
              <a
              href={selectedTarget.target.productUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-[12px] bg-white px-3 py-2 text-[12px] font-extrabold text-[#111827] ring-1 ring-[#e5e7eb] hover:bg-[#f9fafb]"
              >
                상품 보기
              </a>
            </div>
          ) : (
            <div className="text-[13px] font-bold text-[#6b7280]">
              아직 리뷰 관리 대상 상품이 없습니다. 상단의 ‘상품 추가’로 시작하세요.
            </div>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                  등록된 상품
                </div>
                <div className="mt-1 text-[12px] text-[#6b7280]">
                  각 상품은 개별 업데이트/삭제가 가능합니다.
                </div>
              </div>
              <div className="text-[11px] text-[#9ca3af]">* 상단 버튼은 전체 업데이트입니다.</div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-6 py-14 text-center text-[14px] text-[#9ca3af]">
              불러오는 중...
            </div>
          ) : targets.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
              <p className="text-[18px] font-bold text-[#111827]">아직 등록된 상품이 없어요</p>
              <p className="mt-2 text-[14px] text-[#9ca3af]">
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
                  className="rounded-[22px] border border-gray-200 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)] md:px-6"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <ProductThumb src={t.target.imageUrl} alt={t.target.name} />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-gray-900">
                          {t.target.name}
                        </div>
                        <div className="mt-1 truncate text-[12px] font-semibold text-gray-600">
                          {t.target.storeName ? `${t.target.storeName} · ` : ""}
                          상품ID {t.target.productId}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-gray-400">
                          업데이트 {t.target.updatedAtLabel}
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-3 md:flex-1 md:px-4">
                      <div className="grid w-full grid-cols-3 gap-2">
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

                    <div className="flex items-center justify-end gap-2 md:shrink-0">
                      <button
                        type="button"
                        onClick={() => syncOne(t)}
                        disabled={syncingTargetId === t.id}
                        className="h-[40px] rounded-[14px] bg-[#111827] px-4 text-[12px] font-extrabold text-white shadow-sm disabled:opacity-50"
                      >
                        <span className="inline-flex items-center gap-2">
                          <RefreshCw
                            size={14}
                            className={syncingTargetId === t.id ? "animate-spin" : ""}
                          />
                          {syncingTargetId === t.id ? "업데이트..." : "업데이트"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTarget(t.id)}
                        className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[14px] bg-white text-[#ef4444] ring-1 ring-[#fee2e2] transition hover:bg-[#fff1f2]"
                        aria-label="삭제"
                        title="삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {stars ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <div className="grid grid-cols-5 gap-4">
                        <StarTrackTick label="5점" count={stars["5"]} total={totalStars} />
                        <StarTrackTick label="4점" count={stars["4"]} total={totalStars} />
                        <StarTrackTick label="3점" count={stars["3"]} total={totalStars} />
                        <StarTrackTick label="2점" count={stars["2"]} total={totalStars} />
                        <StarTrackTick label="1점" count={stars["1"]} total={totalStars} />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {addOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[520px] rounded-[24px] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#f3f4f6] px-6 py-5">
                <h2 className="text-[18px] font-black text-[#111827]">상품 등록</h2>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setShowManualInput(false);
                    setManualName("");
                    setManualImageUrl("");
                    setAddUrl("");
                    setError("");
                  }}
                  className="text-[22px] leading-none text-[#9ca3af] hover:text-[#111827]"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              <div className="px-6 py-5">
                <p className="text-[13px] leading-relaxed text-[#6b7280]">
                  추적할 스마트스토어·브랜드스토어 상품 페이지 주소를 입력하세요. 브라우저 주소창의{" "}
                  <span className="font-bold text-[#374151]">상품 상세 URL</span>을 붙여넣으면 됩니다.
                </p>

                <div className="mt-4 rounded-[16px] border border-[#eef2f7] bg-[#f9fafb] px-4 py-3">
                  <p className="text-[12px] font-extrabold text-[#4b5563]">
                    상품 URL 형식{" "}
                    <span className="font-bold text-[#6b7280]">
                      (상점ID와 상품ID를 꼭 포함하여 추가해주세요.)
                    </span>
                  </p>
                  <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-[#6b7280]">
                    <li className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" />
                      <span>
                        일반 상품:{" "}
                        <span className="font-semibold text-[#374151]">
                          http://smartstore.naver.com/
                          <span className="text-[#7c3aed]">상점ID</span>/products/
                          <span className="text-[#7c3aed]">상품ID</span>?..
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" />
                      <span>
                        브랜드 상품:{" "}
                        <span className="font-semibold text-[#374151]">
                          http://brand.naver.com/
                          <span className="text-[#7c3aed]">상점ID</span>/products/
                          <span className="text-[#7c3aed]">상품ID</span>?..
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" />
                      <span>
                        윈도우 상품:{" "}
                        <span className="font-semibold text-[#374151]">
                          http://shopping.naver.com/window-products/
                          <span className="text-[#7c3aed]">카테고리</span>/
                          <span className="text-[#7c3aed]">상품ID</span>?..
                        </span>
                      </span>
                    </li>
                  </ul>
                </div>

                <label className="mt-4 block text-[12px] font-bold text-[#4b5563]">상품 URL</label>
                <input
                  type="url"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTargetByUrl()}
                  placeholder="https://smartstore.naver.com/…/products/1234567890"
                  className="mt-2 w-full rounded-[12px] border border-[#e5e7eb] px-4 py-3 text-[14px] focus:border-[#b91c1c] focus:outline-none"
                />
                {error ? <p className="mt-2 text-[13px] text-[#dc2626]">{error}</p> : null}

                {showManualInput ? (
                  <div className="mt-4 rounded-[16px] border border-[#fee2e2] bg-[#fff1f2] px-4 py-4">
                    <p className="text-[12px] font-extrabold text-[#b91c1c]">
                      자동 등록에 실패했어요. 수동으로 상품 정보를 입력해 등록할 수 있습니다.
                    </p>
                    <label className="mt-3 block text-[12px] font-bold text-[#7f1d1d]">
                      상품명
                    </label>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="예: 아이폰 케이스"
                      className="mt-2 w-full rounded-[12px] border border-[#fecaca] bg-white px-4 py-3 text-[14px] focus:border-[#b91c1c] focus:outline-none"
                    />
                    <label className="mt-3 block text-[12px] font-bold text-[#7f1d1d]">
                      이미지 URL
                    </label>
                    <input
                      type="url"
                      value={manualImageUrl}
                      onChange={(e) => setManualImageUrl(e.target.value)}
                      placeholder="https://...jpg"
                      className="mt-2 w-full rounded-[12px] border border-[#fecaca] bg-white px-4 py-3 text-[14px] focus:border-[#b91c1c] focus:outline-none"
                    />
                  </div>
                ) : null}

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(false);
                      setShowManualInput(false);
                      setManualName("");
                      setManualImageUrl("");
                      setAddUrl("");
                      setError("");
                    }}
                    className="h-[46px] rounded-[14px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={addTargetByUrl}
                    disabled={adding}
                    className="h-[46px] rounded-[14px] bg-[#b91c1c] px-5 text-[14px] font-bold text-white transition hover:bg-[#991b1b] disabled:opacity-60"
                  >
                    {adding ? (showManualInput ? "수동 등록 중..." : "상품 정보 수집 중...") : showManualInput ? "수동 등록" : "등록"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

