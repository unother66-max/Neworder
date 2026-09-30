"use client";

import {
  Check,
  Clipboard,
  Copy,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

type PlaceCandidate = {
  id: string;
  name: string;
  category?: string;
  businessCategory?: string;
  roadAddress?: string;
  address?: string;
  x?: string;
  y?: string;
  thumUrl?: string;
};

type LookupStatus = "pending" | "success" | "needs-review" | "failed";
type SelectedBy = "auto" | "manual" | null;

type LookupRow = {
  key: string;
  input: string;
  name: string;
  region: string;
  query: string;
  status: LookupStatus;
  selectedId: string | null;
  selectedBy: SelectedBy;
  candidates: PlaceCandidate[];
  error: string | null;
};

type LookupApiResponse = {
  ok?: boolean;
  places?: PlaceCandidate[];
  totalCount?: number;
  code?: string;
  message?: string;
  error?: string;
  source?: string;
};

const MAX_ITEMS = 100;
const CONCURRENCY = 2;

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}<>,."'’‘“”·ㆍ_\-&/\\]/g, "");
}

function parseRows(raw: string): LookupRow[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
    .map((line, index) => {
      const [namePart, ...regionParts] = line.split("|");
      const name = (namePart ?? "").trim();
      const region = regionParts.join("|").trim();
      const query = region ? `${name} ${region}` : name;

      return {
        key: `${index}-${line}`,
        input: line,
        name,
        region,
        query,
        status: "pending" as const,
        selectedId: null,
        selectedBy: null,
        candidates: [],
        error: null,
      };
    });
}

function getCandidateAddress(candidate: PlaceCandidate) {
  return candidate.roadAddress || candidate.address || "";
}

function mapUrl(candidate: PlaceCandidate) {
  return `https://map.naver.com/p/entry/place/${candidate.id}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function PlaceIdBulkLookupPage() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<"ids" | "rows" | null>(null);

  const parsedCount = useMemo(() => parseRows(input).length, [input]);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "success") acc.success += 1;
        if (row.status === "needs-review") acc.review += 1;
        if (row.status === "failed") acc.failed += 1;
        if (row.status === "pending") acc.pending += 1;
        return acc;
      },
      { total: 0, success: 0, review: 0, failed: 0, pending: 0 }
    );
  }, [rows]);

  function updateRow(key: string, patch: Partial<LookupRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  async function lookupOne(row: LookupRow) {
    try {
      const response = await fetch("/api/operations/neworder/place-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          keyword: row.query,
        }),
      });

      const text = await response.text();
      let payload: LookupApiResponse = {};

      if (text.trim()) {
        try {
          payload = JSON.parse(text) as LookupApiResponse;
        } catch {
          updateRow(row.key, {
            status: "failed",
            error: `응답을 읽지 못했습니다. (HTTP ${response.status})`,
          });
          return;
        }
      }

      if (!response.ok || payload.ok !== true) {
        updateRow(row.key, {
          status: "failed",
          error:
            payload.message ||
            payload.error ||
            payload.code ||
            `조회 실패 (HTTP ${response.status})`,
        });
        return;
      }

      const candidates = Array.isArray(payload.places)
        ? payload.places
            .filter(
              (place) =>
                place &&
                typeof place.id === "string" &&
                place.id.trim() &&
                typeof place.name === "string" &&
                place.name.trim()
            )
            .slice(0, 8)
        : [];

      if (candidates.length === 0) {
        updateRow(row.key, {
          status: "failed",
          candidates: [],
          error: "검색 결과가 없습니다.",
        });
        return;
      }

      const target = normalizeName(row.name);
      const exactMatches = candidates.filter(
        (candidate) => normalizeName(candidate.name) === target
      );

      if (exactMatches.length === 1) {
        updateRow(row.key, {
          status: "success",
          selectedId: exactMatches[0].id,
          selectedBy: "auto",
          candidates,
          error: null,
        });
        return;
      }

      updateRow(row.key, {
        status: "needs-review",
        selectedId: null,
        selectedBy: null,
        candidates,
        error:
          exactMatches.length > 1
            ? "동일 상호가 여러 개입니다. 주소를 확인해 주세요."
            : "정확히 일치하는 상호를 자동 확정하지 못했습니다.",
      });
    } catch (error) {
      updateRow(row.key, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "조회 중 알 수 없는 오류가 발생했습니다.",
      });
    }
  }

  async function runLookup() {
    const nextRows = parseRows(input);

    if (nextRows.length === 0) {
      setNotice("상호명을 한 줄에 하나씩 입력해 주세요.");
      return;
    }

    setNotice(null);
    setCopied(null);
    setRows(nextRows);
    setRunning(true);

    let cursor = 0;

    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= nextRows.length) return;

        await lookupOne(nextRows[index]);

        // 너무 빠른 연속 호출로 네이버 차단 확률이 올라가지 않도록 짧게 간격을 둔다.
        await sleep(250);
      }
    }

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(CONCURRENCY, nextRows.length) },
          () => worker()
        )
      );
    } finally {
      setRunning(false);
    }
  }

  function selectCandidate(rowKey: string, placeId: string) {
    if (!placeId) {
      updateRow(rowKey, {
        selectedId: null,
        selectedBy: null,
        status: "needs-review",
      });
      return;
    }

    updateRow(rowKey, {
      selectedId: placeId,
      selectedBy: "manual",
      status: "success",
      error: null,
    });
  }

  async function copyIds() {
    const value = rows
      .filter((row) => row.selectedId)
      .map((row) => row.selectedId)
      .join("\n");

    if (!value) {
      setNotice("복사할 플레이스 ID가 없습니다.");
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied("ids");
    setNotice(`${rows.filter((row) => row.selectedId).length}개 ID를 복사했습니다.`);
  }

  async function copyRows() {
    const value = rows
      .filter((row) => row.selectedId)
      .map((row) => `${row.name}\t${row.selectedId}`)
      .join("\n");

    if (!value) {
      setNotice("복사할 조회 결과가 없습니다.");
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied("rows");
    setNotice(
      `${rows.filter((row) => row.selectedId).length}개 상호명 + ID를 복사했습니다.`
    );
  }

  function resetAll() {
    if (running) return;
    setInput("");
    setRows([]);
    setNotice(null);
    setCopied(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 lg:text-3xl">
          플레이스 ID 일괄 조회
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          네이버 플레이스 상호명을 여러 개 붙여넣고 Place ID를 한 번에 확인합니다.
        </p>
      </div>

      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-bold text-slate-400 hover:text-slate-700"
            aria-label="알림 닫기"
          >
            ×
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950">상호명 입력</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                한 줄에 하나씩 입력하세요. 동명이면{" "}
                <strong className="font-semibold text-slate-700">
                  상호명 | 지역
                </strong>{" "}
                형식도 사용할 수 있습니다.
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {parsedCount}개 / 최대 {MAX_ITEMS}개
            </div>
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={running}
            rows={12}
            placeholder={`윤슬커튼블라인드
춘천에스샵왁싱
헤이데이브로우
써니사진관 양재사진관
블랑네일 | 포항`}
            className="min-h-[260px] w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runLookup()}
              disabled={running || parsedCount === 0}
              className="postlabs-action-button inline-flex h-10 items-center justify-center gap-2 rounded-xl border-0 bg-[#123f34] px-4 text-sm font-bold text-white transition hover:bg-[#0f332b] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  조회 중 {stats.total - stats.pending}/{stats.total}
                </>
              ) : (
                <>
                  <Search className="size-4" />
                  {parsedCount > 0 ? `${parsedCount}개 조회` : "조회"}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={resetAll}
              disabled={running}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <RotateCcw className="size-4" />
              초기화
            </button>
          </div>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-950">조회 결과</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                    전체 {stats.total}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    확정 {stats.success}
                  </span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    확인 필요 {stats.review}
                  </span>
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">
                    실패 {stats.failed}
                  </span>
                  {stats.pending > 0 && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                      조회 중 {stats.pending}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyIds()}
                  disabled={stats.success === 0}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {copied === "ids" ? (
                    <Check className="size-4" />
                  ) : (
                    <Clipboard className="size-4" />
                  )}
                  ID만 복사
                </button>
                <button
                  type="button"
                  onClick={() => void copyRows()}
                  disabled={stats.success === 0}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {copied === "rows" ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  상호명 + ID 복사
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[900px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500">
                  <tr>
                    <th className="px-4 py-3">상호명</th>
                    <th className="px-4 py-3">플레이스 ID</th>
                    <th className="px-4 py-3">주소 / 후보</th>
                    <th className="px-4 py-3">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const selectedCandidate = row.selectedId
                      ? row.candidates.find(
                          (candidate) => candidate.id === row.selectedId
                        )
                      : null;

                    return (
                      <tr
                        key={row.key}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-900">{row.name}</div>
                          {row.region && (
                            <div className="mt-1 text-xs text-slate-400">
                              검색 지역: {row.region}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {row.status === "pending" ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-400">
                              <Loader2 className="size-3.5 animate-spin" />
                              조회 중
                            </span>
                          ) : row.selectedId ? (
                            <div className="flex items-center gap-2">
                              <code className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-800">
                                {row.selectedId}
                              </code>
                              {selectedCandidate && (
                                <a
                                  href={mapUrl(selectedCandidate)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#123f34] hover:underline"
                                >
                                  <MapPin className="size-3.5" />
                                  지도
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {row.status === "needs-review" ? (
                            <div className="space-y-2">
                              <select
                                value={row.selectedId ?? ""}
                                onChange={(event) =>
                                  selectCandidate(row.key, event.target.value)
                                }
                                className="h-10 w-full max-w-[430px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
                              >
                                <option value="">업체를 선택하세요</option>
                                {row.candidates.map((candidate) => (
                                  <option
                                    key={candidate.id}
                                    value={candidate.id}
                                  >
                                    {candidate.name} ·{" "}
                                    {getCandidateAddress(candidate) || "주소 없음"} ·{" "}
                                    {candidate.id}
                                  </option>
                                ))}
                              </select>
                              {row.error && (
                                <p className="text-xs text-amber-700">
                                  {row.error}
                                </p>
                              )}
                            </div>
                          ) : selectedCandidate ? (
                            <div>
                              <div className="font-semibold text-slate-700">
                                {selectedCandidate.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {getCandidateAddress(selectedCandidate) || "-"}
                              </div>
                            </div>
                          ) : row.error ? (
                            <p className="max-w-[430px] text-xs leading-5 text-red-600">
                              {row.error}
                            </p>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          {row.status === "pending" && (
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                              조회 중
                            </span>
                          )}
                          {row.status === "success" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                              <Check className="size-3.5" />
                              {row.selectedBy === "manual"
                                ? "선택 완료"
                                : "자동 확정"}
                            </span>
                          )}
                          {row.status === "needs-review" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                              <TriangleAlert className="size-3.5" />
                              확인 필요
                            </span>
                          )}
                          {row.status === "failed" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                              <TriangleAlert className="size-3.5" />
                              실패
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
