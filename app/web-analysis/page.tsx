"use client";

import { useState, type FormEvent } from "react";

import { GlobalLoading } from "@/components/global-loading";
import { PostlabsSlideHoverButton } from "@/components/postlabs-slide-hover-button";
import TopNav from "@/components/top-nav";

type WebAnalysisRow = {
  collectedIndex: number;
  page: number;
  positionInPage: number;
  title: string;
  url: string;
  domain: string;
  source: string;
  snippet?: string;
  thumbnail?: string;
};

type WebAnalysisResponse = {
  ok: boolean;
  message?: string;
  keyword: string;
  requestedPages: number[];
  successfulPages: number[];
  failedPages: number[];
  totalResults: number;
  results: WebAnalysisRow[];
};

function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

function isNaverBlogResult(row: WebAnalysisRow): boolean {
  const domain = row.domain.trim().toLowerCase();
  return (
    domain === "blog.naver.com" ||
    domain === "m.blog.naver.com" ||
    domain.endsWith(".blog.naver.com") ||
    row.source.trim() === "네이버 블로그"
  );
}

export default function WebAnalysisPage() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<WebAnalysisResponse | null>(null);
  const [excludeNaverBlog, setExcludeNaverBlog] = useState(false);

  const displayedResults = analysis
    ? excludeNaverBlog
      ? analysis.results.filter((row) => !isNaverBlogResult(row))
      : analysis.results
    : [];

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const trimmed = keyword.trim();
    if (!trimmed) {
      setError("분석할 키워드를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const response = await fetch("/api/web-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: trimmed }),
      });
      const responseText = await response.text();
      let data: WebAnalysisResponse | null = null;

      try {
        data = JSON.parse(responseText) as WebAnalysisResponse;
      } catch {
        data = null;
      }

      if (!response.ok || !data?.ok) {
        setError(
          data?.message ||
            `웹 분석 서버 응답을 확인할 수 없습니다. (${response.status})`
        );
        return;
      }

      setAnalysis({
        ...data,
        requestedPages: Array.isArray(data.requestedPages)
          ? data.requestedPages
          : [],
        successfulPages: Array.isArray(data.successfulPages)
          ? data.successfulPages
          : [],
        failedPages: Array.isArray(data.failedPages) ? data.failedPages : [],
        results: Array.isArray(data.results) ? data.results : [],
      });
    } catch (requestError) {
      console.error("web-analysis request error", requestError);
      setError("웹 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TopNav active="web-analysis" />
      {loading ? (
        <GlobalLoading message="네이버 웹문서를 수집하고 있습니다..." />
      ) : null}

      <main className="min-h-screen bg-[#f8fafc] pt-20 text-[#111827] md:pt-24">
        <section className="mx-auto max-w-[1240px] px-3 py-2 md:px-6 md:py-5 lg:px-8">
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-2.5 md:gap-4">
              <div className="min-w-0">
                <h1 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                  웹 분석
                </h1>
                <p className="mt-0.5 text-[11px] leading-5 text-[#4b5563] md:mt-1 md:text-[13px] md:text-[#6b7280]">
                  네이버 웹검색 2~10페이지의 문서를 분석합니다.
                </p>
              </div>

              <form
                className="flex flex-col gap-2 md:gap-3"
                onSubmit={handleAnalyze}
              >
                <div className="flex flex-col gap-2 md:gap-3 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={keyword}
                      onChange={(event) => {
                        setKeyword(event.target.value);
                        if (error) setError("");
                      }}
                      placeholder="분석할 키워드를 입력하세요"
                      aria-label="분석할 키워드"
                      className="h-[40px] w-full rounded-[12px] border border-[#d1d5db] bg-[#fafafa] px-3 pr-9 text-[12px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white md:h-[54px] md:rounded-[16px] md:px-4 md:pr-11 md:text-[15px]"
                    />
                    {keyword ? (
                      <button
                        type="button"
                        onClick={() => setKeyword("")}
                        aria-label="키워드 지우기"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-[#6b7280] md:right-4 md:text-[22px]"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>

                  <PostlabsSlideHoverButton
                    type="submit"
                    variant="primary"
                    disabled={loading}
                    className="h-[40px] min-w-[96px] shrink-0 rounded-[12px] bg-[#333333] px-4 text-[12px] font-bold text-white disabled:opacity-60 md:h-[54px] md:min-w-[116px] md:rounded-[16px] md:px-7 md:text-[15px]"
                  >
                    {loading ? "분석 중..." : "웹 분석"}
                  </PostlabsSlideHoverButton>
                </div>

                <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[11px] font-semibold text-[#4b5563] md:text-[13px]">
                  <input
                    type="checkbox"
                    checked={excludeNaverBlog}
                    onChange={(event) =>
                      setExcludeNaverBlog(event.target.checked)
                    }
                    className="h-4 w-4 rounded border-[#d1d5db] accent-[#2563eb]"
                  />
                  네이버 블로그 글 제외하기
                </label>
              </form>

              {error ? (
                <div
                  role="alert"
                  className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-semibold text-red-700 md:rounded-[14px] md:px-4 md:text-[13px]"
                >
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          {analysis ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 md:mt-4 md:grid-cols-3 md:gap-3 lg:grid-cols-5">
                <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.03)] md:rounded-[20px] md:p-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] md:text-[11px]">
                    분석 키워드
                  </div>
                  <div className="mt-1 truncate text-[14px] font-black text-[#111827] md:text-[16px]">
                    {analysis.keyword}
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.03)] md:rounded-[20px] md:p-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] md:text-[11px]">
                    수집 페이지
                  </div>
                  <div className="mt-1 text-[14px] font-black text-[#111827] md:text-[16px]">
                    2 ~ 10
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.03)] md:rounded-[20px] md:p-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] md:text-[11px]">
                    전체 수집 문서
                  </div>
                  <div className="mt-1 text-[14px] font-black text-[#111827] md:text-[16px]">
                    {formatCount(analysis.totalResults)}건
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.03)] md:rounded-[20px] md:p-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] md:text-[11px]">
                    현재 표시 문서
                  </div>
                  <div className="mt-1 text-[14px] font-black text-[#111827] md:text-[16px]">
                    {formatCount(displayedResults.length)}건
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.03)] md:rounded-[20px] md:p-4">
                  <div className="text-[10px] font-bold text-[#9ca3af] md:text-[11px]">
                    성공
                  </div>
                  <div className="mt-1 text-[14px] font-black text-[#111827] md:text-[16px]">
                    {analysis.successfulPages.length} / {analysis.requestedPages.length} 페이지
                  </div>
                  {analysis.failedPages.length > 0 ? (
                    <div className="mt-1 text-[10px] font-semibold text-red-600 md:text-[11px]">
                      실패 페이지 {analysis.failedPages.join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:mt-4 md:rounded-[22px] md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="border-b border-[#eef0f3] px-3 py-3 md:px-5 md:py-4">
                  <h2 className="text-[15px] font-black tracking-[-0.02em] text-[#111827] md:text-[18px]">
                    웹문서 수집 결과
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse">
                    <thead className="bg-[#f9fafb]">
                      <tr>
                        <th className="w-[90px] px-4 py-2.5 text-center text-[11px] font-bold text-[#6b7280] md:text-[12px]">
                          수집순번
                        </th>
                        <th className="w-[90px] px-4 py-2.5 text-center text-[11px] font-bold text-[#6b7280] md:text-[12px]">
                          페이지
                        </th>
                        <th className="min-w-[300px] px-4 py-2.5 text-left text-[11px] font-bold text-[#6b7280] md:text-[12px]">
                          결과 정보
                        </th>
                        <th className="min-w-[260px] px-4 py-2.5 text-left text-[11px] font-bold text-[#6b7280] md:text-[12px]">
                          URL
                        </th>
                        <th className="w-[150px] px-4 py-2.5 text-left text-[11px] font-bold text-[#6b7280] md:text-[12px]">
                          출처
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedResults.length > 0 ? (
                        displayedResults.map((row) => (
                          <tr
                            key={`${row.page}-${row.positionInPage}-${row.url}`}
                            className="border-t border-[#f0f2f5] transition hover:bg-[#fcfcfc]"
                          >
                            <td className="px-4 py-2.5 text-center text-[12px] font-bold text-[#4b5563] md:text-[13px]">
                              {row.collectedIndex}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className="inline-flex rounded-full bg-[#eff6ff] px-2 py-0.5 text-[11px] font-black text-[#2563eb] md:text-[12px]">
                                {row.page}페이지
                              </span>
                            </td>
                            <td className="max-w-[500px] px-4 py-2.5 align-middle">
                              <div className="flex min-w-0 items-center gap-2.5">
                                {row.thumbnail ? (
                                  <a
                                    href={row.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`${row.title} 열기`}
                                    className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-[#f3f4f6]"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={row.thumbnail}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      referrerPolicy="no-referrer"
                                      className="h-full w-full object-cover"
                                    />
                                  </a>
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  <a
                                    href={row.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={row.title}
                                    className="block truncate text-[13px] font-bold leading-5 text-[#111827] transition hover:text-[#2563eb] md:text-[14px]"
                                  >
                                    {row.title}
                                  </a>
                                </div>
                              </div>
                            </td>
                            <td className="max-w-[320px] px-4 py-2.5 align-middle">
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={row.url}
                                className="block truncate text-[11px] font-semibold text-[#4b5563] underline decoration-[#d1d5db] underline-offset-4 transition hover:text-[#2563eb] md:text-[12px]"
                              >
                                {row.url}
                              </a>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 align-middle text-[12px] font-semibold text-[#4b5563] md:text-[13px]">
                              {row.source || row.domain}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-14 text-center text-[13px] text-[#6b7280]"
                          >
                            {excludeNaverBlog
                              ? "네이버 블로그를 제외한 웹문서가 없습니다."
                              : "수집된 웹문서가 없습니다."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}
