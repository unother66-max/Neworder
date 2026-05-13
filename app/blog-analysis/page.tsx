"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import PageHeader from "@/components/page-header";
import type { BlogAnalysisSavedListItem } from "@/lib/blog-analysis-types";
import { extractBlogId } from "@/lib/scraper";

function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 검색 기록: 상대 시간(분·시간·일) 또는 날짜 */
function formatRelativeSearchTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "-";
  const diff = Date.now() - t;
  if (diff < 0) return formatPostDate(iso);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1일 전";
  if (days < 7) return `${days}일 전`;
  return formatPostDate(iso);
}

function formatCmpKeywordsCt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  const x = Number(n);
  const core = Number.isInteger(x) ? x.toLocaleString() : (Math.round(x * 10) / 10).toFixed(1);
  return `${core}개`;
}

export default function BlogAnalysisPage() {
  const router = useRouter();
  const [blogUrl, setBlogUrl] = useState("");

  const [savedList, setSavedList] = useState<BlogAnalysisSavedListItem[]>([]);
  const [savedListLoading, setSavedListLoading] = useState(false);
  /** 로컬 고정만 지원. 영구 저장은 향후 BlogAnalysisSaved 모델 예정. */
  const [pinnedBlogIds, setPinnedBlogIds] = useState<Record<string, boolean>>({});

  const fetchSavedList = useCallback(async () => {
    setSavedListLoading(true);
    try {
      const res = await fetch("/api/blog-analysis/saved?limit=20");
      const j = (await res.json()) as { ok?: boolean; items?: BlogAnalysisSavedListItem[] };
      if (Array.isArray(j.items)) setSavedList(j.items);
      else setSavedList([]);
    } catch {
      setSavedList([]);
    } finally {
      setSavedListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSavedList();
  }, [fetchSavedList]);

  const sortedSavedList = useMemo(() => {
    const list = [...savedList];
    list.sort((a, b) => {
      const ap = pinnedBlogIds[a.blogId] ? 1 : 0;
      const bp = pinnedBlogIds[b.blogId] ? 1 : 0;
      if (bp !== ap) return bp - ap;
      const ta = new Date(a.analyzedAt).getTime();
      const tb = new Date(b.analyzedAt).getTime();
      if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
      if (!Number.isFinite(ta)) return 1;
      if (!Number.isFinite(tb)) return -1;
      return tb - ta;
    });
    return list;
  }, [savedList, pinnedBlogIds]);

  const toggleLocalPin = (id: string) => {
    setPinnedBlogIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteSavedRow = async (targetBlogId: string) => {
    if (!window.confirm("이 블로그의 분석 기록을 모두 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/blog-analysis/saved?blogId=${encodeURIComponent(targetBlogId)}`, {
        method: "DELETE",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        setPinnedBlogIds((prev) => {
          const next = { ...prev };
          delete next[targetBlogId];
          return next;
        });
        await fetchSavedList();
      } else {
        alert(j.error ?? "삭제에 실패했습니다.");
      }
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const goToAnalysis = (id: string) => {
    router.push(`/blog-analysis/${encodeURIComponent(id)}`);
  };

  const handleStart = () => {
    const rawInput = blogUrl.trim();
    if (!rawInput) return alert("블로그 아이디 또는 주소를 입력해주세요!");
    const id = extractBlogId(rawInput);
    if (!id) return alert("올바른 네이버 블로그 아이디 또는 주소를 입력해주세요.");
    goToAnalysis(id);
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] pt-24 pb-20">
      <TopNav />
      <section className="mx-auto max-w-[1180px] px-5 py-8">
        <PageHeader title="블로그 채널 분석" description="내 블로그의 실질적인 영향력과 검색 노출 지수를 정밀하게 분석합니다." />

        <div className="mt-8 rounded-[18px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="text"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleStart();
              }}
              placeholder="블로그 아이디 또는 주소를 입력해주세요."
              className="h-[46px] flex-1 rounded-[12px] border border-[#d8dde6] px-4 outline-none focus:border-[#2563EB]"
            />
            <div className="flex h-[46px] min-w-[150px] items-center justify-center rounded-[14px] border border-[#e5e7eb] bg-[#f3f4f6] px-4 text-[14px] font-bold text-gray-400">
              방문자 -
            </div>
            <button
              type="button"
              onClick={handleStart}
              className="h-[46px] min-w-[120px] rounded-[14px] bg-[#333] px-5 font-bold text-white hover:bg-[#2563EB]"
            >
              분석 시작
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-[18px] border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
          <div className="border-b border-[#e5e7eb] bg-gray-50 px-6 py-4 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13px] font-bold text-gray-600 tracking-tighter">● 검색 기록</h4>
            {savedListLoading ? <span className="text-[11px] text-gray-400">불러오는 중…</span> : null}
          </div>
          <p className="px-6 pt-3 text-[11px] text-gray-400 leading-relaxed">
            고정(별)은 이 기기에서만 순서를 올립니다. 영구 저장·자동 재분석은 다음 단계에서{" "}
            <span className="text-gray-500">BlogAnalysisSaved</span> 모델로 붙일 예정입니다.
          </p>
          <div className="overflow-x-auto px-2 pb-4">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-700 w-12 text-center">고정</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-700 w-12 text-center">삭제</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-700">닉네임</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-700 whitespace-nowrap">검색 시간</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-700">카테고리</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">유효키워드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedSavedList.length > 0 ? (
                  sortedSavedList.map((row) => {
                    const displayName =
                      (row.nickname != null && String(row.nickname).trim() !== ""
                        ? row.nickname
                        : row.blogName != null && String(row.blogName).trim() !== ""
                          ? row.blogName
                          : null) ?? row.blogId;
                    const pinned = Boolean(pinnedBlogIds[row.blogId]);
                    return (
                      <tr key={row.blogId} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            aria-label={pinned ? "고정 해제" : "고정"}
                            onClick={() => toggleLocalPin(row.blogId)}
                            className={`text-lg leading-none p-1 rounded-md hover:bg-gray-100 ${pinned ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}`}
                          >
                            ★
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            aria-label="기록 삭제"
                            onClick={() => void handleDeleteSavedRow(row.blogId)}
                            className="text-gray-400 hover:text-red-600 text-sm font-bold w-8 h-8 rounded-md hover:bg-gray-100 inline-flex items-center justify-center"
                          >
                            ✕
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/blog-analysis/${encodeURIComponent(row.blogId)}`}
                            className="text-sm font-semibold text-slate-900 hover:text-[#2563EB] text-left max-w-[220px] truncate block"
                          >
                            {displayName}
                          </Link>
                          <p className="text-[10px] text-slate-500 truncate max-w-[220px]">@{row.blogId}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                          {formatRelativeSearchTime(row.analyzedAt)}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800 max-w-[140px] truncate" title={row.blogTopic ?? undefined}>
                          {row.blogTopic != null && String(row.blogTopic).trim() !== "" ? row.blogTopic : "-"}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-900 text-right tabular-nums whitespace-nowrap">
                          {formatCmpKeywordsCt(row.validKeywordCount)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-sm">
                      {savedListLoading ? "불러오는 중…" : "아직 검색 기록이 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
