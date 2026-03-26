"use client";

import { useState } from "react";

type Post = {
  title: string;
  date: string;
  link: string;
  rank: string;
  keyword: string;
  searchVolume: string;
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
    return "text-gray-400";
  }

  const rankNumber = parseInt(rank.replace("위", ""), 10);

  if (!isNaN(rankNumber)) {
    if (rankNumber <= 10) return "text-green-600";
    if (rankNumber <= 100) return "text-orange-500";
    return "text-red-400";
  }

  return "text-gray-500";
}

export default function page() {
  const [blogUrl, setBlogUrl] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchPosts = async () => {
    if (!blogUrl.trim()) {
      setErrorMessage("블로그 주소를 입력해주세요.");
      setPosts([]);
      return;
    }

    setErrorMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ blogUrl }),
      });

      const data = await response.json();
      setPosts(data.posts || []);
    } catch (error) {
      console.error(error);
      setErrorMessage("최근글을 가져오는 중 오류가 났어요.");
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
    <main className="min-h-screen bg-[#f7f8fa] text-gray-900">
      <div className="flex min-h-screen">
        {/* 좌측 메뉴 */}
        <aside className="hidden w-[250px] border-r border-gray-200 bg-white xl:block">
          <div className="border-b border-gray-100 px-6 py-6">
            <div className="text-xl font-bold">뉴오더 검색기</div>
            <p className="mt-1 text-sm text-gray-500">
              상위 노출 블로그 분석 도구
            </p>
          </div>

          <nav className="px-4 py-6 text-sm">
            <div className="mb-6">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Blog
              </p>
              <ul className="space-y-1">
                <li className="rounded-xl bg-green-50 px-3 py-2 font-medium text-green-700">
                  상위 노출 블로그 찾기
                </li>
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  기자단 주문하기
                </li>
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  기자단 주문 내역
                </li>
              </ul>
            </div>

            <div className="mb-6">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Menu
              </p>
              <ul className="space-y-1">
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  플레이스 순위
                </li>
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  키워드 실험실
                </li>
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  경쟁 매장 참고하기
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Info
              </p>
              <ul className="space-y-1">
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  내 정보
                </li>
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  멤버십 안내
                </li>
                <li className="rounded-xl px-3 py-2 text-gray-600 hover:bg-gray-50">
                  공지사항
                </li>
              </ul>
            </div>
          </nav>
        </aside>

        {/* 메인 */}
        <section className="flex-1">
          <div className="mx-auto max-w-7xl px-6 py-8">
            {/* 헤더 */}
            <div className="mb-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
              <p className="text-sm font-medium text-green-600">
                Home / 상위 노출 블로그 찾기
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
                상위 노출 블로그 찾기
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
                지금 상위에 노출되는 블로그를 뽑아야 체험단 효율이 높아집니다.
                블로그 URL을 입력하고 최근 포스팅을 불러온 뒤, 각 포스트별로
                키워드를 검색해 순위와 검색량을 확인하세요.
              </p>
            </div>

            {/* 3단계 안내 */}
            <div className="mb-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 font-bold text-green-700">
                  1
                </div>
                <h2 className="text-lg font-semibold text-gray-900">URL 입력</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  블로그 URL을 입력하고 최근 포스팅 목록을 확인하세요.
                </p>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 font-bold text-green-700">
                  2
                </div>
                <h2 className="text-lg font-semibold text-gray-900">키워드 검색</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  포스팅마다 핵심 키워드를 입력하고 검색해 실제 노출 여부를
                  확인하세요.
                </p>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 font-bold text-green-700">
                  3
                </div>
                <h2 className="text-lg font-semibold text-gray-900">블로그 선정</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  순위와 검색량을 보고 체험단에 적합한 블로그를 고르세요.
                </p>
              </div>
            </div>

            {/* URL 입력 카드 */}
            <div className="mb-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-xl font-semibold text-gray-900">
                블로그 URL을 입력하세요
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                네이버 블로그의 최신 포스트를 불러오고, 포스트별 키워드 분석을
                진행할 수 있습니다.
              </p>

              <div className="mt-6 flex flex-col gap-3 md:flex-row">
                <input
                  type="text"
                  value={blogUrl}
                  onChange={(e) => setBlogUrl(e.target.value)}
                  placeholder="예: https://blog.naver.com/kikolog"
                  className="flex-1 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-black outline-none placeholder-gray-400 focus:border-green-500"
                />

                <button
                  onClick={fetchPosts}
                  className="rounded-2xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700"
                >
                  {loading ? "불러오는 중..." : "등록"}
                </button>
              </div>

              {errorMessage && (
                <p className="mt-4 text-sm font-medium text-red-600">
                  {errorMessage}
                </p>
              )}
            </div>

            {/* 최신 포스트 */}
            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    블로그 최신 포스트
                  </h2>
                  <p className="mt-2 text-sm text-gray-600">
                    최근글을 불러온 뒤, 각 포스트 옆에서 키워드를 직접 검색할 수
                    있습니다.
                  </p>
                </div>

                {posts.length > 0 && (
                  <div className="rounded-2xl bg-gray-50 px-4 py-2 text-sm text-gray-600">
                    총{" "}
                    <span className="font-semibold text-gray-900">
                      {posts.length}개
                    </span>
                  </div>
                )}
              </div>

              {posts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500">
                  블로그를 검색하거나 목록을 불러와 주세요.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-200">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border-b border-gray-200 px-4 py-4 text-left text-sm font-semibold text-gray-700">
                          발행일
                        </th>
                        <th className="border-b border-gray-200 px-4 py-4 text-left text-sm font-semibold text-gray-700">
                          제목
                        </th>
                        <th className="border-b border-gray-200 px-4 py-4 text-left text-sm font-semibold text-gray-700">
                          상위 노출 키워드 검색
                        </th>
                        <th className="border-b border-gray-200 px-4 py-4 text-left text-sm font-semibold text-gray-700">
                          순위
                        </th>
                        <th className="border-b border-gray-200 px-4 py-4 text-left text-sm font-semibold text-gray-700">
                          검색량
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {posts.map((post, index) => (
                        <tr key={`${post.link}-${index}`} className="hover:bg-gray-50">
                          <td className="border-b border-gray-200 px-4 py-4 text-sm text-gray-500">
                            {post.date}
                          </td>

                          <td className="border-b border-gray-200 px-4 py-4 text-sm">
                            <a
                              href={post.link}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-gray-900 hover:text-green-700 hover:underline"
                            >
                              {post.title}
                            </a>
                          </td>

                          <td className="border-b border-gray-200 px-4 py-4 text-sm">
                            <div className="flex flex-col gap-2 md:flex-row">
                              <input
                                type="text"
                                value={post.keyword}
                                onChange={(e) =>
                                  updatePostKeyword(index, e.target.value)
                                }
                                placeholder="핵심 키워드 입력"
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-black outline-none placeholder-gray-400 focus:border-green-500 md:w-56"
                              />

                              <button
                                onClick={() => checkSinglePostRank(index)}
                                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                검색
                              </button>
                            </div>
                          </td>

                          <td className="border-b border-gray-200 px-4 py-4 text-sm font-semibold">
                            <span className={getRankTextColor(post.rank)}>
                              {post.rank}
                            </span>
                          </td>

                          <td className="border-b border-gray-200 px-4 py-4 text-sm text-gray-600">
                            {post.searchVolume || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}