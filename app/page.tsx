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

export default function Home() {
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
    <main className="min-h-screen bg-[#f5f7fb] text-gray-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[260px] border-r border-gray-200 bg-white xl:block">
          <div className="border-b border-gray-100 px-7 py-7">
            <div className="text-2xl font-black tracking-tight text-gray-900">
              NEWORDER
            </div>
            <div className="mt-1 text-sm font-medium text-green-600">LAB</div>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              네이버 블로그 상위노출 분석 도구
            </p>
          </div>

          <nav className="px-4 py-6 text-sm">
            <div className="mb-7">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Blog
              </p>
              <ul className="space-y-1.5">
                <li className="rounded-2xl bg-green-50 px-4 py-3 font-semibold text-green-700">
                  상위 노출 블로그 찾기
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  블로그 분석 기록
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  체험단용 메모
                </li>
              </ul>
            </div>

            <div className="mb-7">
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Menu
              </p>
              <ul className="space-y-1.5">
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  키워드 실험실
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  경쟁 블로그 참고
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  플레이스 확장 준비
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                Info
              </p>
              <ul className="space-y-1.5">
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  서비스 소개
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  공지사항
                </li>
                <li className="rounded-2xl px-4 py-3 text-gray-600 hover:bg-gray-50">
                  업데이트 예정
                </li>
              </ul>
            </div>
          </nav>
        </aside>

        <section className="flex-1">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="mb-8 overflow-hidden rounded-[32px] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100">
              <div className="bg-[radial-gradient(circle_at_top_left,#dcfce7,transparent_28%),radial-gradient(circle_at_top_right,#dbeafe,transparent_24%),white] px-8 py-10">
                <p className="text-sm font-semibold text-green-600">
                  NEWORDER LAB
                </p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-gray-900">
                  상위 노출 블로그 찾기
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-gray-600">
                  블로그 상위노출, 감으로 하지 마세요. 지금 상위에 노출되는
                  포스트를 확인하고, 포스트별 키워드 순위와 검색량을 기준으로
                  체험단용 블로그를 더 빠르게 고를 수 있습니다.
                </p>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-gray-100 bg-white/90 p-6 shadow-sm">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-green-100 text-lg font-bold text-green-700">
                      1
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">블로그 등록</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      블로그 URL을 입력하고 최근 발행 포스트를 자동으로
                      불러옵니다.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white/90 p-6 shadow-sm">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-green-100 text-lg font-bold text-green-700">
                      2
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">키워드 검색</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      각 포스트에 핵심 키워드를 넣고 개별 검색으로 노출 여부를
                      확인하세요.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white/90 p-6 shadow-sm">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-green-100 text-lg font-bold text-green-700">
                      3
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">블로그 선정</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      순위와 검색량을 보고 체험단 효율이 좋은 포스트를 선별할 수
                      있습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8 rounded-[32px] bg-white p-8 shadow-[0_10px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100">
              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                  블로그 URL을 입력하세요
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  네이버 블로그 URL을 입력하면 최신 포스트 목록을 불러오고,
                  포스트별 키워드 검색을 바로 진행할 수 있습니다.
                </p>
              </div>

              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  type="text"
                  value={blogUrl}
                  onChange={(e) => setBlogUrl(e.target.value)}
                  placeholder="예: https://blog.naver.com/kikolog"
                  className="flex-1 rounded-2xl border border-gray-300 bg-white px-5 py-4 text-black outline-none placeholder-gray-400 transition focus:border-green-500 focus:ring-4 focus:ring-green-100"
                />

                <button
                  onClick={fetchPosts}
                  className="rounded-2xl bg-green-600 px-6 py-4 font-semibold text-white shadow-md transition hover:scale-[1.02] hover:bg-green-700"
                >
                  {loading ? "불러오는 중..." : "분석 시작"}
                </button>
              </div>

              {errorMessage && (
                <p className="mt-4 text-sm font-medium text-red-600">
                  {errorMessage}
                </p>
              )}
            </div>

            <div className="rounded-[32px] bg-white p-8 shadow-[0_10px_40px_rgba(15,23,42,0.06)] ring-1 ring-gray-100">
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                    블로그 최신 포스트
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    최근 발행 포스트를 불러온 뒤, 각 포스트별로 키워드를 직접
                    입력해 순위와 검색량을 개별 확인할 수 있습니다.
                  </p>
                </div>

                {posts.length > 0 && (
                  <div className="inline-flex rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600 ring-1 ring-gray-200">
                    총{" "}
                    <span className="mx-1 font-bold text-gray-900">
                      {posts.length}개
                    </span>
                    포스트
                  </div>
                )}
              </div>

              {posts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-300 px-6 py-14 text-center text-sm text-gray-500">
                  아직 불러온 포스트가 없습니다. 위에서 블로그 URL을 등록해
                  주세요.
                </div>
              ) : (
                <div className="overflow-hidden rounded-3xl border border-gray-200">
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
                          <td className="border-b border-gray-200 px-4 py-4 text-sm font-medium text-gray-500">
                            {post.date}
                          </td>

                          <td className="border-b border-gray-200 px-4 py-4 text-sm">
                            <a
                              href={post.link}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold leading-6 text-gray-900 hover:text-green-700 hover:underline"
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
                                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-black outline-none placeholder-gray-400 transition focus:border-green-500 focus:ring-4 focus:ring-green-100 md:w-60"
                              />

                              <button
                                onClick={() => checkSinglePostRank(index)}
                                className="rounded-2xl border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
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