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
    return "text-[#d16a6a]";
  }

  return "text-[#6b7280]";
}

export default function Home() {
  const [blogUrl, setBlogUrl] = useState("");
  const [visitor, setVisitor] = useState<number | null>(null);
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
  <main className="min-h-screen bg-[#f3f5f9] text-[#111827]">
    <TopNav active="blog" />

    <section className="mx-auto max-w-[1180px] px-5 py-8">
      <PageHeader
        title="상위 블로그 찾기"
        description="블로그 상위노출, 감으로 하지 마세요. 지금 상위에 노출되는 포스트를 확인하고, 포스트별 키워드 순위와 검색량을 기준으로 체험단용 블로그를 더 빠르게 고를 수 있습니다."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[20px] bg-[#fdf2f2] text-[14px] font-bold text-[#9f3a3a]">
            1
          </div>
          <h2 className="text-[18px] font-bold text-[#111827]">블로그 등록</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
            블로그 URL을 입력하고 최근 발행 포스트를 자동으로 불러옵니다.
          </p>
        </div>

        <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[20px] bg-[#fdf2f2] text-[14px] font-bold text-[#9f3a3a]">
            2
          </div>
          <h2 className="text-[18px] font-bold text-[#111827]">키워드 검색</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#6b7280]">
            각 포스트에 핵심 키워드를 넣고 개별 검색으로 노출 여부를 확인하세요.
          </p>
        </div>

        <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[20px] bg-[#fdf2f2] text-[14px] font-bold text-[#9f3a3a]">
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
            className="h-[46px] flex-1 rounded-[12px] border border-[#d8dde6] bg-white px-4 text-[14px] text-[#111827] outline-none placeholder:text-[#b7bec8] focus:border-[#c96464]"
          />

          <div className="flex h-[46px] min-w-[150px] items-center justify-center rounded-[14px] border border-[#e5e7eb] bg-[#f3f4f6] px-4 text-[14px] text-[#374151]">
            {visitor !== null ? (
              <>
                방문자
                <span className="ml-2 font-bold text-[#111827]">{visitor}</span>
              </>
            ) : (
              <span className="text-[#b7bec8]">방문자 -</span>
            )}
          </div>

          <button
            onClick={fetchPosts}
            className="h-[46px] rounded-[14px] bg-[#c51d1d] px-5 text-[15px] font-bold text-white transition hover:bg-[#a81818]"
          >
            {loading ? "불러오는 중..." : "분석 시작"}
          </button>
        </div>

        {errorMessage && (
          <p className="mt-4 text-[14px] font-medium text-[#d16a6a]">
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
          <div className="rounded-[14px] border border-dashed border-[#d7dbe3] px-6 py-14 text-center text-[14px] text-[#9ca3af]">
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
                  <tr key={`${post.link}-${index}`} className="hover:bg-[#fcfcfd]">
                    <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px] font-medium text-[#6b7280]">
                      {post.date}
                    </td>

                    <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px]">
                      <a
                        href={post.link}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold leading-6 text-[#111827] hover:text-[#9f3a3a] hover:underline"
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
                          placeholder="핵심 키워드 입력"
                          className="h-[42px] w-full rounded-[12px] border border-[#d8dde6] bg-white px-4 text-[14px] text-[#111827] outline-none placeholder:text-[#b7bec8] focus:border-[#c96464] md:w-60"
                        />

                        <button
                          onClick={() => checkSinglePostRank(index)}
                          className="h-[42px] rounded-[12px] bg-[#c51d1d] px-4 text-[14px] font-bold text-white transition hover:bg-[#a81818]"
                        >
                          검색
                        </button>
                      </div>
                    </td>

                    <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px] font-bold">
                      <span className={getRankTextColor(post.rank)}>{post.rank}</span>
                    </td>

                    <td className="border-b border-[#e5e7eb] px-4 py-4 text-[14px] text-[#6b7280]">
                      {typeof post.searchVolume === "object"
                        ? post.searchVolume?.total ?? "-"
                        : post.searchVolume || "-"}
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