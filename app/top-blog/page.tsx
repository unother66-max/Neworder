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
    <main className="min-h-screen bg-[#f8fafc] text-[#111827] pt-24">
      <TopNav active="blog" />

      <section className="mx-auto max-w-[1180px] px-5 py-8">
        <PageHeader
          title="상위 블로그 찾기"
          description="블로그 상위노출, 감으로 하지 마세요. 지금 상위에 노출되는 포스트를 확인하고, 포스트별 키워드 순위와 검색량을 기준으로 체험단용 블로그를 더 빠르게 고를 수 있습니다."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[20px] bg-[#eff6ff] text-[14px] font-bold text-[#2563EB]">
              1
            </div>
            <h2 className="text-[18px] font-bold text-[#111827]">블로그 등록</h2>
            <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
              블로그 URL을 입력하고 최근 발행 포스트를 자동으로 불러옵니다.
            </p>
          </div>

          <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[20px] bg-[#eff6ff] text-[14px] font-bold text-[#2563EB]">
              2
            </div>
            <h2 className="text-[18px] font-bold text-[#111827]">키워드 검색</h2>
            <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
              각 포스트에 핵심 키워드를 넣고 개별 검색으로 노출 여부를 확인하세요.
            </p>
          </div>

          <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[20px] bg-[#eff6ff] text-[14px] font-bold text-[#2563EB]">
              3
            </div>
            <h2 className="text-[18px] font-bold text-[#111827]">블로그 선정</h2>
            <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
              순위와 검색량을 보고 체험단 효율이 좋은 포스트를 선별할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[18px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#111827]">
              블로그 URL을 입력하세요
            </h2>
            <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
              네이버 블로그 URL을 입력하면 최신 포스트 목록을 불러오고,
              포스트별 키워드 검색을 바로 진행할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input
              type="text"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              placeholder="https://blog.naver.com/blogname"
              className="h-[46px] flex-1 rounded-[12px] border border-[#d8dde6] bg-white px-4 text-[14px] text-[#111827] outline-none placeholder:text-[#b7bec8] focus:border-[#2563EB] transition-colors"
            />

            <div className="flex h-[46px] min-w-[150px] items-center justify-center rounded-[14px] border border-[#e5e7eb] bg-[#f3f4f6] px-4 text-[14px] text-[#374151]">
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
              className="relative inline-flex h-[46px] min-w-[120px] items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-5 text-[15px] font-bold text-white transition-all duration-300 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed"
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
                  absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
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
            <p className="mt-4 text-[14px] font-medium text-[#ef4444]">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-[18px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#111827]">
                블로그 최신 포스트
              </h2>
              <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
                최근 발행 포스트를 불러온 뒤, 각 포스트별로 키워드를 직접 입력해
                순위와 검색량을 개별 확인할 수 있습니다.
              </p>
            </div>

            {posts.length > 0 && (
              <div className="inline-flex rounded-[12px] border border-[#e5e7eb] bg-[#f3f4f6] px-4 py-2.5 text-[14px] text-[#374151]">
                최근
                <span className="mx-1 font-bold text-[#111827]">{posts.length}개</span>
                포스트
              </div>
            )}
          </div>

          {posts.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#d7dbe3] bg-[#f9fafb] px-6 py-14 text-center text-[14px] text-[#9ca3af]">
              아직 불러온 포스트가 없습니다. 위에서 블로그 URL을 등록해 주세요.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-[#e5e7eb]">
              <table className="min-w-full border-collapse">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[14px] font-bold text-[#374151]">
                      발행일
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[14px] font-bold text-[#374151]">
                      제목
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[14px] font-bold text-[#374151]">
                      상위 노출 키워드 검색
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[14px] font-bold text-[#374151]">
                      순위
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[14px] font-bold text-[#374151]">
                      검색량
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {posts.map((post, index) => (
                    <tr key={`${post.link}-${index}`} className="hover:bg-[#fcfcfd] transition-colors">
                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px] font-medium text-[#6b7280]">
                        {post.date}
                      </td>

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px]">
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                          className="font-bold leading-6 text-[#111827] transition-colors hover:text-[#2563EB] hover:underline"
                        >
                          {post.title}
                        </a>
                      </td>

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px]">
                        <div className="flex flex-col gap-2 md:flex-row">
                          <input
                            type="text"
                            value={post.keyword}
                            onChange={(e) => updatePostKeyword(index, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && checkSinglePostRank(index)}
                            placeholder="핵심 키워드 입력"
                            className="h-[42px] w-full rounded-[12px] border border-[#d8dde6] bg-white px-4 text-[14px] text-[#111827] outline-none transition-colors placeholder:text-[#b7bec8] focus:border-[#2563EB] md:w-60"
                          />

                          <button
                            onClick={() => checkSinglePostRank(index)}
                            onMouseEnter={() => setSearchHover({ index, x: searchHover.x, y: searchHover.y })}
                            onMouseLeave={() => setSearchHover((prev) => prev.index === index ? { ...prev, index: null } : prev)}
                            onMouseMove={(e) => handleSearchMouseMove(e, index)}
                            className="relative inline-flex h-[42px] shrink-0 min-w-[70px] items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out"
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

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px] font-bold">
                        <span className={getRankTextColor(post.rank)}>{post.rank}</span>
                      </td>

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px] font-semibold text-[#6b7280]">
                        {typeof post.searchVolume === "object"
                          ? (post.searchVolume?.total ? post.searchVolume.total.toLocaleString() : "-")
                          : (post.searchVolume ? Number(post.searchVolume).toLocaleString() : "-")}
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
  );
}