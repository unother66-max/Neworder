"use client";

import { useState } from "react";
import PageHeader from "@/components/page-header";
import TopNav from "@/components/top-nav";

type Post = {
  title: string;
  date: string;
  link: string;
  rank: string;
  keyword: string;
  searchVolume:
    | string
    | {
        mobile?: number;
        pc?: number;
        total?: number;
      };
};

function getRankTextColor(rank: string) {
  if (
    rank === "300위 밖에" ||
    rank === "오류" ||
    rank === "-" ||
    rank === "0개" ||
    rank === "키워드 없음" ||
    rank === "링크 없음" ||
    rank === "확인 중..."
  ) {
    return "text-[#9ca3af]";
  }

  const rankNumber = parseInt(rank.replace("위", ""), 10);

  if (!isNaN(rankNumber)) {
    if (rankNumber <= 10) return "text-[#16a34a]";
    if (rankNumber <= 100) return "text-[#d97706]";
    return "text-[#ef4444]";
  }

  return "text-[#6b7280]";
}

export default function Home() {
  const [blogUrl, setBlogUrl] = useState("");
  const [visitor, setVisitor] = useState<number | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 디자인 통일용 상태값 (호버 및 마우스 위치)
  const [isAnalyzeHovered, setIsAnalyzeHovered] = useState(false);
  const [analyzeMousePos, setAnalyzeMousePos] = useState({ x: 0, y: 0 });
  const [searchHover, setSearchHover] = useState<{ index: number | null; x: number; y: number; }>({ index: null, x: 0, y: 0 });

  const handleAnalyzeMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setAnalyzeMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleSearchMouseMove = (e: React.MouseEvent<HTMLButtonElement>, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSearchHover({ index, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const fetchPosts = async () => {
    if (!blogUrl.trim()) {
      setErrorMessage("블로그 주소를 입력해주세요.");
      setPosts([]);
      return;
    }

    setErrorMessage("");
    setLoading(true);

    try {
      const [postRes, visitorRes] = await Promise.all([
        fetch("/api/posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ blogUrl }),
        }),
        fetch("/api/blog-visitor", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ blogUrl }),
        }),
      ]);

      const postData = await postRes.json();
      const visitorData = await visitorRes.json();

      if (!postRes.ok) {
        setErrorMessage(postData.error || "최근글 불러오기 실패");
        setPosts([]);
        return;
      }

      setPosts(postData.posts || []);

      if (visitorRes.ok) {
        setVisitor(visitorData.visitor ?? null);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("데이터 불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  const updatePostKeyword = (index: number, value: string) => {
    setPosts((prev) =>
      prev.map((post, i) =>
        i === index
          ? {
              ...post,
              keyword: value,
            }
          : post
      )
    );
  };

  const checkSinglePostRank = async (index: number) => {
    const targetPost = posts[index];

    if (!targetPost.keyword.trim()) {
      setPosts((prev) =>
        prev.map((post, i) =>
          i === index
            ? {
                ...post,
                rank: "키워드 없음",
              }
            : post
        )
      );
      return;
    }

    setPosts((prev) =>
      prev.map((post, i) =>
        i === index
          ? {
              ...post,
              rank: "확인 중...",
            }
          : post
      )
    );

    try {
      const response = await fetch("/api/check-rank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keyword: targetPost.keyword,
          postLink: targetPost.link,
        }),
      });

      const data = await response.json();

      setPosts((prev) =>
        prev.map((post, i) =>
          i === index
            ? {
                ...post,
                rank: data.rank || "오류",
                searchVolume: data.searchVolume || "-",
              }
            : post
        )
      );
    } catch (error) {
      console.error(error);

      setPosts((prev) =>
        prev.map((post, i) =>
          i === index
            ? {
                ...post,
                rank: "오류",
                searchVolume: "-",
              }
            : post
        )
      );
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] pt-20 text-[#111827] md:pt-24">
      <TopNav active="blog" />

      <section className="mx-auto max-w-[1180px] px-3 py-2 md:px-5 md:py-8">
        <div className="[&_h1]:text-[20px] [&_p]:hidden md:[&_h1]:text-[28px] md:[&_p]:mt-3 md:[&_p]:block md:[&_p]:text-[14px] md:[&_p]:leading-7">
          <PageHeader
            title="상위 블로그 찾기"
            description="블로그 상위노출, 감으로 하지 마세요. 지금 상위에 노출되는 포스트를 확인하고, 포스트별 키워드 순위와 검색량을 기준으로 체험단용 블로그를 더 빠르게 고를 수 있습니다."
          />
        </div>

        <div className="mt-2 grid gap-1.5 md:mt-8 md:gap-4 md:grid-cols-3">
          <div className="rounded-[14px] border border-[#e5e7eb] bg-white px-2.5 py-2 shadow-[0_4px_18px_rgba(15,23,42,0.02)] md:rounded-[18px] md:p-5 md:shadow-sm">
            <div className="flex items-center gap-2 md:block">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[10px] font-bold text-[#2563EB] md:mb-4 md:h-10 md:w-10 md:text-[14px]">
                1
              </div>
              <h2 className="text-[13px] font-bold leading-tight text-[#111827] md:text-[18px]">블로그 등록</h2>
            </div>
            <p className="mt-0.5 text-[11px] leading-4 text-[#6b7280] md:mt-2 md:text-[14px] md:leading-6">
              블로그 URL을 입력하고 최근 발행 포스트를 자동으로 불러옵니다.
            </p>
          </div>

          <div className="rounded-[14px] border border-[#e5e7eb] bg-white px-2.5 py-2 shadow-[0_4px_18px_rgba(15,23,42,0.02)] md:rounded-[18px] md:p-5 md:shadow-sm">
            <div className="flex items-center gap-2 md:block">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[10px] font-bold text-[#2563EB] md:mb-4 md:h-10 md:w-10 md:text-[14px]">
                2
              </div>
              <h2 className="text-[13px] font-bold leading-tight text-[#111827] md:text-[18px]">키워드 검색</h2>
            </div>
            <p className="mt-0.5 text-[11px] leading-4 text-[#6b7280] md:mt-2 md:text-[14px] md:leading-6">
              각 포스트에 핵심 키워드를 넣고 개별 검색으로 노출 여부를 확인하세요.
            </p>
          </div>

          <div className="rounded-[14px] border border-[#e5e7eb] bg-white px-2.5 py-2 shadow-[0_4px_18px_rgba(15,23,42,0.02)] md:rounded-[18px] md:p-5 md:shadow-sm">
            <div className="flex items-center gap-2 md:block">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[10px] font-bold text-[#2563EB] md:mb-4 md:h-10 md:w-10 md:text-[14px]">
                3
              </div>
              <h2 className="text-[13px] font-bold leading-tight text-[#111827] md:text-[18px]">블로그 선정</h2>
            </div>
            <p className="mt-0.5 text-[11px] leading-4 text-[#6b7280] md:mt-2 md:text-[14px] md:leading-6">
              순위와 검색량을 보고 체험단 효율이 좋은 포스트를 선별할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-[18px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.025)] md:mt-6 md:p-6 md:shadow-sm">
          <div className="mb-3 md:mb-5">
            <h2 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[24px]">
              블로그 URL을 입력하세요
            </h2>
            <p className="hidden mt-1 text-[12px] leading-5 text-[#6b7280] md:mt-2 md:block md:text-[14px] md:leading-6">
              네이버 블로그 URL을 입력하면 최신 포스트 목록을 불러오고,
              포스트별 키워드 검색을 바로 진행할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:gap-3 md:flex-row md:items-center">
            <input
              type="text"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              placeholder="https://blog.naver.com/blogname"
              className="h-[40px] flex-1 rounded-[12px] border border-[#d8dde6] bg-white px-3 text-[12px] text-[#111827] outline-none placeholder:text-[#b7bec8] transition-colors focus:border-[#2563EB] md:h-[46px] md:px-4 md:text-[14px]"
            />

            <div className="flex h-[40px] min-w-[120px] items-center justify-center rounded-[12px] border border-[#e5e7eb] bg-[#f3f4f6] px-3 text-[12px] text-[#374151] md:h-[46px] md:min-w-[150px] md:rounded-[14px] md:px-4 md:text-[14px]">
              {visitor !== null ? (
                <>
                  방문자
                  <span className="ml-2 font-bold text-[#111827]">{visitor.toLocaleString()}</span>
                </>
              ) : (
                <span className="text-[#b7bec8]">방문자 -</span>
              )}
            </div>

            <button
              onClick={fetchPosts}
              onMouseEnter={() => setIsAnalyzeHovered(true)}
              onMouseLeave={() => setIsAnalyzeHovered(false)}
              onMouseMove={handleAnalyzeMouseMove}
              disabled={loading}
              className="relative inline-flex h-[40px] min-w-[96px] items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-60 md:h-[46px] md:min-w-[120px] md:rounded-[14px] md:px-5 md:text-[15px]"
            >
              <span className="relative z-30 pointer-events-none">
                {loading ? "불러오는 중..." : "분석 시작"}
              </span>
              <div
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                style={{
                  transformOrigin: "left",
                  transform: isAnalyzeHovered ? "scaleX(1)" : "scaleX(0)",
                  transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                  backgroundColor: "#2563EB",
                }}
              />
              <div
                className={`
                  absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-32 md:w-32
                  transition-opacity duration-200 ease-out
                  ${isAnalyzeHovered ? "opacity-100" : "opacity-0"}
                `}
                style={{
                  left: `${analyzeMousePos.x}px`,
                  top: `${analyzeMousePos.y}px`,
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

          {errorMessage && (
            <p className="mt-3 text-[12px] font-medium text-[#ef4444] md:mt-4 md:text-[14px]">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="mt-3 rounded-[18px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.025)] md:mt-6 md:p-6 md:shadow-sm">
          <div className="mb-3 flex flex-col gap-2 md:mb-6 md:gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[24px]">
                블로그 최신 포스트
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:mt-2 md:text-[14px] md:leading-6">
                최근 발행 포스트를 불러온 뒤, 각 포스트별로 키워드를 직접 입력해
                순위와 검색량을 개별 확인할 수 있습니다.
              </p>
            </div>

            {posts.length > 0 && (
              <div className="inline-flex w-fit rounded-[10px] border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1.5 text-[12px] text-[#374151] md:rounded-[12px] md:px-4 md:py-2.5 md:text-[14px]">
                최근
                <span className="mx-1 font-bold text-[#111827]">{posts.length}개</span>
                포스트
              </div>
            )}
          </div>

          {posts.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[#d7dbe3] bg-[#f9fafb] px-4 py-8 text-center text-[12px] text-[#9ca3af] md:rounded-[14px] md:px-6 md:py-14 md:text-[14px]">
              아직 불러온 포스트가 없습니다. 위에서 블로그 URL을 등록해 주세요.
            </div>
          ) : (
            <>
            <div className="space-y-2 md:hidden">
              {posts.map((post, index) => (
                <div
                  key={`${post.link}-${index}-mobile`}
                  className="rounded-[12px] border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_18px_rgba(15,23,42,0.02)]"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-[#6b7280]">{post.date}</div>
                    <a
                      href={post.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 block overflow-hidden text-[13px] font-bold leading-5 text-[#111827] transition-colors [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] hover:text-[#2563EB] hover:underline"
                    >
                      {post.title}
                    </a>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={post.keyword}
                      onChange={(e) => updatePostKeyword(index, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && checkSinglePostRank(index)}
                      placeholder="핵심 키워드 입력"
                      className="h-9 min-w-0 flex-1 rounded-[10px] border border-[#d8dde6] bg-white px-3 text-[12px] text-[#111827] outline-none transition-colors placeholder:text-[#b7bec8] focus:border-[#2563EB]"
                    />

                    <button
                      onClick={() => checkSinglePostRank(index)}
                      onMouseEnter={() => setSearchHover({ index, x: searchHover.x, y: searchHover.y })}
                      onMouseLeave={() => setSearchHover((prev) => prev.index === index ? { ...prev, index: null } : prev)}
                      onMouseMove={(e) => handleSearchMouseMove(e, index)}
                      className="relative inline-flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out"
                    >
                      <span className="relative z-30 pointer-events-none">검색</span>
                      <div
                        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                        style={{
                          transformOrigin: "left",
                          transform: searchHover.index === index ? "scaleX(1)" : "scaleX(0)",
                          transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                          backgroundColor: "#2563EB",
                        }}
                      />
                      <div
                        className={`
                          absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-xl
                          transition-opacity duration-200 ease-out
                          ${searchHover.index === index ? "opacity-100" : "opacity-0"}
                        `}
                        style={{
                          left: `${searchHover.x}px`,
                          top: `${searchHover.y}px`,
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

                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-2.5 py-2">
                      <div className="text-[10px] font-semibold leading-none text-[#6b7280]">순위</div>
                      <div className={`mt-1 text-[13px] font-bold leading-none ${getRankTextColor(post.rank)}`}>
                        {post.rank}
                      </div>
                    </div>
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-[#f9fafb] px-2.5 py-2">
                      <div className="text-[10px] font-semibold leading-none text-[#6b7280]">검색량</div>
                      <div className="mt-1 text-[13px] font-bold leading-none text-[#111827]">
                        {typeof post.searchVolume === "object"
                          ? (post.searchVolume?.total ? post.searchVolume.total.toLocaleString() : "-")
                          : (post.searchVolume === "-" || post.searchVolume === "NaN" || isNaN(Number(post.searchVolume))
                              ? "-"
                              : Number(post.searchVolume).toLocaleString())}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-[14px] border border-[#e5e7eb] md:block">
              <table className="min-w-[780px] border-collapse md:min-w-full">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    <th className="border-b border-[#e5e7eb] px-2 py-2 text-left text-[12px] font-bold text-[#374151] md:px-4 md:py-3 md:text-[14px]">
                      발행일
                    </th>
                    <th className="border-b border-[#e5e7eb] px-2 py-2 text-left text-[12px] font-bold text-[#374151] md:px-4 md:py-3 md:text-[14px]">
                      제목
                    </th>
                    <th className="border-b border-[#e5e7eb] px-2 py-2 text-left text-[12px] font-bold text-[#374151] md:px-4 md:py-3 md:text-[14px]">
                      상위 노출 키워드 검색
                    </th>
                    <th className="border-b border-[#e5e7eb] px-2 py-2 text-left text-[12px] font-bold text-[#374151] md:px-4 md:py-3 md:text-[14px]">
                      순위
                    </th>
                    <th className="border-b border-[#e5e7eb] px-2 py-2 text-left text-[12px] font-bold text-[#374151] md:px-4 md:py-3 md:text-[14px]">
                      검색량
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {posts.map((post, index) => (
                    <tr key={`${post.link}-${index}`} className="transition-colors hover:bg-[#fcfcfd]">
                      <td className="border-b border-[#e5e7eb] px-2 py-3 text-[12px] font-medium text-[#6b7280] md:px-4 md:py-4 md:text-[14px]">
                        {post.date}
                      </td>

                      <td className="border-b border-[#e5e7eb] px-2 py-3 text-[12px] md:px-4 md:py-4 md:text-[14px]">
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold leading-5 text-[#111827] transition-colors hover:text-[#2563EB] hover:underline md:leading-6"
                        >
                          {post.title}
                        </a>
                      </td>

                      <td className="border-b border-[#e5e7eb] px-2 py-3 text-[12px] md:px-4 md:py-4 md:text-[14px]">
                        <div className="flex flex-col gap-1.5 md:gap-2 md:flex-row">
                          <input
                            type="text"
                            value={post.keyword}
                            onChange={(e) => updatePostKeyword(index, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && checkSinglePostRank(index)}
                            placeholder="핵심 키워드 입력"
                            className="h-9 w-full rounded-[10px] border border-[#d8dde6] bg-white px-3 text-[12px] text-[#111827] outline-none transition-colors placeholder:text-[#b7bec8] focus:border-[#2563EB] md:h-[42px] md:w-60 md:rounded-[12px] md:px-4 md:text-[14px]"
                          />

                          <button
                            onClick={() => checkSinglePostRank(index)}
                            onMouseEnter={() => setSearchHover({ index, x: searchHover.x, y: searchHover.y })}
                            onMouseLeave={() => setSearchHover((prev) => prev.index === index ? { ...prev, index: null } : prev)}
                            onMouseMove={(e) => handleSearchMouseMove(e, index)}
                            className="relative inline-flex h-9 shrink-0 min-w-[60px] items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out md:h-[42px] md:min-w-[70px] md:rounded-[12px] md:px-4 md:text-[14px]"
                          >
                            <span className="relative z-30 pointer-events-none">검색</span>
                            <div
                              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                              style={{
                                transformOrigin: "left",
                                transform: searchHover.index === index ? "scaleX(1)" : "scaleX(0)",
                                transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                                backgroundColor: "#2563EB",
                              }}
                            />
                            <div
                              className={`
                                absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-xl
                                transition-opacity duration-200 ease-out
                                ${searchHover.index === index ? "opacity-100" : "opacity-0"}
                              `}
                              style={{
                                left: `${searchHover.x}px`,
                                top: `${searchHover.y}px`,
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
                      </td>

                      <td className="border-b border-[#e5e7eb] px-2 py-3 text-[12px] font-bold md:px-4 md:py-4 md:text-[14px]">
                        <span className={getRankTextColor(post.rank)}>{post.rank}</span>
                      </td>

                      <td className="border-b border-[#e5e7eb] px-2 py-3 text-[12px] font-semibold text-[#6b7280] md:px-4 md:py-4 md:text-[14px]">
  {typeof post.searchVolume === "object"
    ? (post.searchVolume?.total ? post.searchVolume.total.toLocaleString() : "-")
    : (post.searchVolume === "-" || post.searchVolume === "NaN" || isNaN(Number(post.searchVolume)) 
        ? "-" 
        : Number(post.searchVolume).toLocaleString())}
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
