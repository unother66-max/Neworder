"use client";

import { useState } from "react";
import PageHeader from "@/components/page-header";
import TopNav from "@/components/top-nav";
import Link from "next/link";
import { useSession } from "next-auth/react";
import UserMenu from "@/components/user-menu";

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

      if (!response.ok) {
        setErrorMessage(data.error || "최근글을 가져오는 중 오류가 났어요.");
        setPosts([]);
        return;
      }

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
    <main className="min-h-screen bg-[#f3f5f9] text-[#111827]">
      <TopNav active="blog" />

      <section className="mx-auto max-w-[1280px] px-6 py-8">
        <PageHeader
          title="상위 노출 블로그 찾기"
          description="블로그 상위노출, 감으로 하지 마세요. 지금 상위에 노출되는 포스트를 확인하고, 포스트별 키워드 순위와 검색량을 기준으로 체험단용 블로그를 더 빠르게 고를 수 있습니다."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[20px] border border-[#e5e9f0] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#f0fdf4] text-[14px] font-bold text-green-700">
              1
            </div>
            <h2 className="text-[17px] font-bold text-[#111827]">블로그 등록</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#6b7280]">
              블로그 URL을 입력하고 최근 발행 포스트를 자동으로 불러옵니다.
            </p>
          </div>

          <div className="rounded-[20px] border border-[#e5e9f0] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#f0fdf4] text-[14px] font-bold text-green-700">
              2
            </div>
            <h2 className="text-[17px] font-bold text-[#111827]">키워드 검색</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#6b7280]">
              각 포스트에 핵심 키워드를 넣고 개별 검색으로 노출 여부를 확인하세요.
            </p>
          </div>

          <div className="rounded-[20px] border border-[#e5e9f0] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#f0fdf4] text-[14px] font-bold text-green-700">
              3
            </div>
            <h2 className="text-[17px] font-bold text-[#111827]">블로그 선정</h2>
            <p className="mt-2 text-[13px] leading-6 text-[#6b7280]">
              순위와 검색량을 보고 체험단 효율이 좋은 포스트를 선별할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[20px] border border-[#e5e9f0] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
          <div className="mb-5">
            <h2 className="text-[22px] font-black tracking-[-0.02em] text-[#111827]">
              블로그 URL을 입력하세요
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#6b7280]">
              네이버 블로그 URL을 입력하면 최신 포스트 목록을 불러오고, 포스트별 키워드 검색을 바로 진행할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <input
              type="text"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              placeholder="예: https://blog.naver.com/kikolog"
              className="h-[46px] flex-1 rounded-[14px] border border-[#d9dee7] bg-white px-4 text-[14px] text-[#111827] outline-none placeholder:text-[#b7bec8] focus:border-[#8b2cf5]"
            />

            <button
              onClick={fetchPosts}
              className="h-[46px] rounded-[14px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[14px] font-semibold text-white shadow-[0_10px_20px_rgba(139,44,245,0.18)] transition hover:opacity-95"
            >
              {loading ? "불러오는 중..." : "분석 시작"}
            </button>
          </div>

          {errorMessage && (
            <p className="mt-4 text-[13px] font-medium text-red-600">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-[20px] border border-[#e5e9f0] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-[22px] font-black tracking-[-0.02em] text-[#111827]">
                블로그 최신 포스트
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-[#6b7280]">
                최근 발행 포스트를 불러온 뒤, 각 포스트별로 키워드를 직접 입력해 순위와 검색량을 개별 확인할 수 있습니다.
              </p>
            </div>

            {posts.length > 0 && (
              <div className="inline-flex rounded-[12px] bg-[#f4f6f9] px-4 py-2.5 text-[13px] text-[#6b7280] ring-1 ring-[#e5e9f0]">
                총
                <span className="mx-1 font-bold text-[#111827]">
                  {posts.length}개
                </span>
                포스트
              </div>
            )}
          </div>

          {posts.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-[#d1d5db] px-6 py-14 text-center text-[13px] text-[#9ca3af]">
              아직 불러온 포스트가 없습니다. 위에서 블로그 URL을 등록해 주세요.
            </div>
          ) : (
            <div className="overflow-hidden rounded-[16px] border border-[#e5e9f0]">
              <table className="min-w-full border-collapse">
                <thead className="bg-[#f4f6f9]">
                  <tr>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[13px] font-bold text-[#374151]">
                      발행일
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[13px] font-bold text-[#374151]">
                      제목
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[13px] font-bold text-[#374151]">
                      상위 노출 키워드 검색
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[13px] font-bold text-[#374151]">
                      순위
                    </th>
                    <th className="border-b border-[#e5e7eb] px-4 py-3 text-left text-[13px] font-bold text-[#374151]">
                      검색량
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {posts.map((post, index) => (
                    <tr key={`${post.link}-${index}`} className="hover:bg-[#fafbfc]">
                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[13px] font-medium text-[#6b7280]">
                        {post.date}
                      </td>

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[13px]">
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold leading-6 text-[#111827] hover:text-[#8b2cf5] hover:underline"
                        >
                          {post.title}
                        </a>
                      </td>

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[13px]">
                        <div className="flex flex-col gap-2 md:flex-row">
                          <input
                            type="text"
                            value={post.keyword}
                            onChange={(e) =>
                              updatePostKeyword(index, e.target.value)
                            }
                            placeholder="핵심 키워드 입력"
                            className="h-[42px] w-full rounded-[12px] border border-[#d9dee7] bg-white px-4 text-[13px] text-[#111827] outline-none placeholder:text-[#b7bec8] focus:border-[#8b2cf5] md:w-60"
                          />

                          <button
                            onClick={() => checkSinglePostRank(index)}
                            className="h-[42px] rounded-[12px] border border-[#d9dee7] bg-white px-4 text-[13px] font-medium text-[#374151] transition hover:bg-[#f8fafc]"
                          >
                            검색
                          </button>
                        </div>
                      </td>

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[13px] font-semibold">
                        <span className={getRankTextColor(post.rank)}>
                          {post.rank}
                        </span>
                      </td>

                      <td className="border-b border-[#e5e7eb] px-4 py-4 text-[13px] text-[#6b7280]">
                        {post.searchVolume || "-"}
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