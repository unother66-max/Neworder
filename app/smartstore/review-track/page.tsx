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
        body: JSON.stringify({ targetId: t.id }),
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
    <main className="min-h-screen bg-[#f8fafc]">
      <TopNav activeSmartstoreSub="review-track" />

      <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[18px] font-black text-[#111827]">리뷰 관리</div>
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
                {syncAllLoading ? "업데이트 중..." : "업데이트"}
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

        <div className="mt-6 overflow-hidden rounded-[18px] bg-white shadow-sm ring-1 ring-[#e5e7eb]">
          <div className="border-b border-[#f3f4f6] px-4 py-3 text-[13px] font-black text-[#111827]">
            리뷰 추적
          </div>
          {loading ? (
            <div className="p-4 text-[13px] font-semibold text-[#6b7280]">불러오는 중...</div>
          ) : targets.length === 0 ? (
            <div className="p-4 text-[13px] font-semibold text-[#6b7280]">대상 없음</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-0">
                <thead>
                  <tr className="bg-[#f9fafb] text-left text-[12px] font-black text-[#6b7280]">
                    <th className="sticky left-0 z-10 bg-[#f9fafb] px-4 py-3">상품</th>
                    <th className="px-4 py-3">전체 리뷰수</th>
                    <th className="px-4 py-3">포토/동영상</th>
                    <th className="px-4 py-3">한달사용</th>
                    <th className="px-4 py-3">재구매</th>
                    <th className="px-4 py-3">스토어픽</th>
                    <th className="px-4 py-3">평점</th>
                    <th className="px-4 py-3">5점~1점 분포</th>
                    <th className="px-4 py-3 text-right">동작</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => {
                    const stars = starSummaryToCounts(t.target.reviewStarSummary);
                    const totalStars = stars
                      ? stars["1"] + stars["2"] + stars["3"] + stars["4"] + stars["5"]
                      : 0;
                    return (
                      <tr key={t.id} className="border-b border-[#f3f4f6] align-top">
                        <td className="sticky left-0 z-10 bg-white px-4 py-4">
                          <div className="flex items-start gap-3">
                            <ProductThumb src={t.target.imageUrl} alt={t.target.name} />
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-black text-[#111827]">
                                {t.target.name}
                              </div>
                              <div className="mt-0.5 truncate text-[12px] font-semibold text-[#9ca3af]">
                                {t.target.storeName ? `${t.target.storeName} · ` : ""}상품ID {t.target.productId}
                              </div>
                              <div className="mt-1 text-[11px] font-semibold text-[#9ca3af]">
                                업데이트 {t.target.updatedAtLabel}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="text-[14px] font-black text-[#111827]">
                            {fmtNum(t.target.reviewCount)}
                          </div>
                          <DeltaChip n={t.delta.reviewCount} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-[14px] font-black text-[#111827]">
                            {fmtNum(t.target.reviewPhotoVideoCount)}
                          </div>
                          <DeltaChip n={t.delta.reviewPhotoVideoCount} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-[14px] font-black text-[#111827]">
                            {fmtNum(t.target.reviewMonthlyUseCount)}
                          </div>
                          <DeltaChip n={t.delta.reviewMonthlyUseCount} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-[14px] font-black text-[#111827]">
                            {fmtNum(t.target.reviewRepurchaseCount)}
                          </div>
                          <DeltaChip n={t.delta.reviewRepurchaseCount} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-[14px] font-black text-[#111827]">
                            {fmtNum(t.target.reviewStorePickCount)}
                          </div>
                          <DeltaChip n={t.delta.reviewStorePickCount} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-[14px] font-black text-[#111827]">
                            {fmtRating(t.target.reviewRating)}
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-extrabold text-[#9ca3af]">
                            {t.delta.reviewRating == null || t.delta.reviewRating === 0 ? (
                              <>
                                <Minus size={12} /> 0
                              </>
                            ) : t.delta.reviewRating > 0 ? (
                              <>
                                <ArrowUpRight size={12} /> +{t.delta.reviewRating}
                              </>
                            ) : (
                              <>
                                <ArrowDownRight size={12} /> {t.delta.reviewRating}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {stars ? (
                            <div className="min-w-[260px] space-y-1.5">
                              <StarBar label="5점" count={stars["5"]} total={totalStars} />
                              <StarBar label="4점" count={stars["4"]} total={totalStars} />
                              <StarBar label="3점" count={stars["3"]} total={totalStars} />
                              <StarBar label="2점" count={stars["2"]} total={totalStars} />
                              <StarBar label="1점" count={stars["1"]} total={totalStars} />
                            </div>
                          ) : (
                            <div className="text-[12px] font-semibold text-[#9ca3af]">-</div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => syncOne(t)}
                              disabled={syncingTargetId === t.id}
                              className="rounded-[12px] bg-[#111827] px-3 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
                            >
                              <span className="inline-flex items-center gap-2">
                                <RefreshCw
                                  size={14}
                                  className={syncingTargetId === t.id ? "animate-spin" : ""}
                                />
                                {syncingTargetId === t.id ? "동기화..." : "동기화"}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeTarget(t.id)}
                              className="rounded-[12px] bg-white px-3 py-2 text-[12px] font-extrabold text-[#ef4444] ring-1 ring-[#fee2e2] hover:bg-[#fff1f2]"
                            >
                              <span className="inline-flex items-center gap-2">
                                <Trash2 size={14} /> 삭제
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {addOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal
          >
            <div className="w-full max-w-[720px] rounded-[18px] bg-white shadow-xl ring-1 ring-black/5">
              <div className="flex items-center justify-between border-b border-[#f3f4f6] px-4 py-3">
                <div className="text-[14px] font-black text-[#111827]">리뷰 대상 상품 추가</div>
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
                  className="rounded-[10px] px-3 py-1.5 text-[12px] font-extrabold text-[#6b7280] hover:bg-[#f9fafb]"
                >
                  닫기
                </button>
              </div>
              <div className="p-4">
                <div className="text-[12px] font-semibold text-[#6b7280]">
                  상품 URL을 입력하면 네이버에서 즉석으로 정보를 수집해 리뷰 추적 대상에 추가합니다.
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    placeholder="예: https://smartstore.naver.com/.../products/123"
                    className="h-10 flex-1 rounded-[12px] border border-[#e5e7eb] px-3 text-[13px] font-semibold text-[#111827] outline-none focus:ring-2 focus:ring-[#111827]/10"
                  />
                  <button
                    type="button"
                    onClick={addTargetByUrl}
                    disabled={adding}
                    className="h-10 rounded-[12px] bg-[#111827] px-4 text-[13px] font-extrabold text-white disabled:opacity-50"
                  >
                    {adding ? "추가 중..." : "추가"}
                  </button>
                </div>

                {showManualInput ? (
                  <div className="mt-4 rounded-[16px] border border-[#fee2e2] bg-[#fff1f2] p-4">
                    <div className="text-[12px] font-extrabold text-[#b91c1c]">
                      자동 불러오기에 실패했습니다. 상품 정보를 직접 입력해 주세요.
                    </div>
                    <label className="mt-3 block text-[12px] font-bold text-[#7f1d1d]">
                      상품명 (필수)
                    </label>
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="예: 아이폰 케이스"
                      className="mt-2 h-10 w-full rounded-[12px] border border-[#fecaca] bg-white px-3 text-[13px] font-semibold text-[#111827] outline-none focus:ring-2 focus:ring-[#b91c1c]/10"
                    />
                    <label className="mt-3 block text-[12px] font-bold text-[#7f1d1d]">
                      이미지 URL (선택)
                    </label>
                    <input
                      value={manualImageUrl}
                      onChange={(e) => setManualImageUrl(e.target.value)}
                      placeholder="https://...jpg"
                      className="mt-2 h-10 w-full rounded-[12px] border border-[#fecaca] bg-white px-3 text-[13px] font-semibold text-[#111827] outline-none focus:ring-2 focus:ring-[#b91c1c]/10"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

