"use client";

import React, { useState, useEffect } from "react";
import TopNav from "@/components/top-nav";
import { Search, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";

// 게시글 타입 정의
type PostType = {
  id: string;
  category: string;
  title: string;
  views: number;
  likes: number;
  createdAt: string;
  author: {
    name: string | null;
    email: string;
  };
};

export default function CommunityPage() {
  const [activeTab, setActiveTab] = useState("전체");
  const router = useRouter();
  
  const [posts, setPosts] = useState<PostType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 🚨 [추가] 버튼 애니메이션 및 마우스 위치 추적 상태
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [searchMouse, setSearchMouse] = useState({ x: 0, y: 0 });
  
  const [isWriteHovered, setIsWriteHovered] = useState(false);
  const [writeMouse, setWriteMouse] = useState({ x: 0, y: 0 });

  const tabs = ["전체", "공지", "질문", "요청", "자유"];
  
  // 🚨 관리자 이메일 정의
  const ADMIN_EMAIL = "natalie0@nate.com";

  // 데이터 불러오기
  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/community", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setPosts(data.posts);
      }
    } catch (error) {
      console.error("게시글 불러오기 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 🚨 [추가] 마우스 움직임 추적 핸들러
  const handleSearchMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSearchMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleWriteMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setWriteMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const filteredPosts = activeTab === "전체" 
    ? posts 
    : posts.filter(post => post.category === activeTab);

  const noticePosts = filteredPosts.filter(post => post.category === "공지");
  const regularPosts = filteredPosts.filter(post => post.category !== "공지");

  const getAuthorName = (post: PostType) =>
    post.author?.email === ADMIN_EMAIL
      ? "포스트랩스"
      : post.author?.name || post.author?.email?.split("@")[0];

  const getBadgeColor = (category: string) => {
    if (category === "공지") return "bg-slate-800 text-white border-slate-800";
    if (category === "질문") return "bg-blue-50 text-blue-600 border-blue-100";
    if (category === "요청") return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (category === "자유") return "bg-purple-50 text-purple-600 border-purple-100";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-[#f8fafc] pb-9 pt-16 md:pb-12 md:pt-24">
        <div className="mx-auto max-w-[1100px] px-5 sm:px-6">
          {/* 🚨 [수정] italic 제거, not-italic 적용 */}
          <h1 className="mb-3 text-[22px] font-black tracking-tight text-[#111827] not-italic md:mb-6 md:text-[26px]">커뮤니티</h1>

          <div className="-mx-5 mb-3 flex items-center gap-1.5 overflow-x-auto px-5 pb-1.5 scrollbar-hide md:mx-0 md:mb-6 md:gap-2 md:px-0">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-bold transition-all md:h-auto md:px-5 md:py-2.5 md:text-[14px] ${
                  activeTab === tab
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-3.5 shadow-sm md:mb-6 md:rounded-[20px] md:p-5">
            <div className="flex flex-col gap-2 md:flex-row md:gap-3">
              <div className="flex gap-2 md:min-w-[200px]">
                <select className="h-11 w-full cursor-pointer rounded-[16px] border border-slate-200 bg-slate-50 px-4 text-[13px] font-semibold outline-none transition-all focus:border-blue-500 md:h-auto md:rounded-[12px] md:px-3 md:py-2">
                  <option>제목+내용</option>
                  <option>제목</option>
                  <option>작성자</option>
                </select>
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="관심있는 키워드를 검색해보세요"
                  className="h-11 w-full rounded-[16px] border border-slate-200 bg-slate-50 pl-10 pr-4 text-[13px] outline-none transition-all focus:border-blue-500 focus:bg-white md:h-auto md:rounded-[12px] md:py-2.5 md:pl-10 md:text-[14px]"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              </div>
              
              {/* 🚨 [수정] 검색하기 버튼 글로우 효과 적용 */}
              <button 
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                onMouseMove={handleSearchMouseMove}
                className="relative h-11 overflow-hidden rounded-[16px] bg-[#333333] px-6 text-[13px] font-semibold text-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-xl md:h-auto md:rounded-[12px] md:py-2.5 md:text-[14px] md:font-bold"
              >
                <span className="relative z-30 pointer-events-none">검색하기</span>
                <div
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full bg-[#2563EB]"
                  style={{
                    transformOrigin: "left",
                    transform: isSearchHovered ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                  }}
                />
                <div
                  className={`
                    absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
                    transition-opacity duration-200 ease-out
                    ${isSearchHovered ? "opacity-100" : "opacity-0"}
                  `}
                  style={{
                    left: `${searchMouse.x}px`,
                    top: `${searchMouse.y}px`,
                    pointerEvents: "none",
                    zIndex: 25,
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                    mixBlendMode: "soft-light",
                    filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                  }}
                />
              </button>
              
              {/* 🚨 [수정] 글쓰기 버튼 글로우 효과 적용 */}
              <button 
                onClick={() => router.push("/community/write")} 
                onMouseEnter={() => setIsWriteHovered(true)}
                onMouseLeave={() => setIsWriteHovered(false)}
                onMouseMove={handleWriteMouseMove}
                className="relative flex h-11 items-center justify-center gap-2 overflow-hidden rounded-[16px] bg-[#333333] px-5 text-[13px] font-semibold text-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-xl md:h-auto md:rounded-[12px] md:py-2.5 md:text-[14px] md:font-bold"
              >
                <span className="relative z-30 pointer-events-none flex items-center gap-2">
                  <PenLine size={17} /> 글쓰기
                </span>
                <div
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full bg-[#2563EB]"
                  style={{
                    transformOrigin: "left",
                    transform: isWriteHovered ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                  }}
                />
                <div
                  className={`
                    absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
                    transition-opacity duration-200 ease-out
                    ${isWriteHovered ? "opacity-100" : "opacity-0"}
                  `}
                  style={{
                    left: `${writeMouse.x}px`,
                    top: `${writeMouse.y}px`,
                    pointerEvents: "none",
                    zIndex: 25,
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                    mixBlendMode: "soft-light",
                    filter: "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                  }}
                />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 md:hidden">
            {isLoading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-[14px] font-medium text-slate-400 shadow-sm">
                로딩 중...
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-[14px] font-medium text-slate-400 shadow-sm">
                게시글이 없습니다.
              </div>
            ) : (
              <>
                {[...noticePosts, ...regularPosts].map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => router.push(`/community/${post.id}`)}
                    className={`w-full rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-transform duration-150 active:scale-[0.99] active:bg-slate-50 ${
                      post.category === "공지" ? "bg-slate-50/80" : ""
                    }`}
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-2.5">
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${getBadgeColor(post.category)}`}>
                        {post.category}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-slate-400">
                        {formatDate(post.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <h2 className="min-w-0 flex-1 break-words text-[14px] font-bold leading-5 text-slate-900">
                        {post.title}
                      </h2>
                      {post.category === "공지" ? (
                        <span className="mt-0.5 shrink-0 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
                          필독
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2.5 text-[11px]">
                      <span className="min-w-0 truncate font-semibold text-slate-600">
                        {getAuthorName(post)}
                      </span>
                      <span className="shrink-0 font-medium text-slate-400">
                        조회 {post.views} · 추천 <span className="font-bold text-blue-500">{post.likes}</span>
                      </span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-6 py-4 text-left text-[13px] font-bold text-slate-500 w-[100px]">카테고리</th>
                    <th className="px-6 py-4 text-left text-[13px] font-bold text-slate-500">제목</th>
                    <th className="px-6 py-4 text-center text-[13px] font-bold text-slate-500 w-[120px]">작성자</th>
                    <th className="px-6 py-4 text-center text-[13px] font-bold text-slate-500 w-[110px]">날짜</th>
                    <th className="px-6 py-4 text-center text-[13px] font-bold text-slate-500 w-[80px]">조회</th>
                    <th className="px-6 py-4 text-center text-[13px] font-bold text-slate-500 w-[80px]">추천</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-[14px] text-slate-400 font-medium">로딩 중...</td></tr>
                  ) : filteredPosts.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-[14px] text-slate-400 font-medium">게시글이 없습니다.</td></tr>
                  ) : (
                    <>
                      {/* 1. 공지사항 렌더링 */}
                      {noticePosts.map((post) => (
                        <tr 
                          key={post.id} 
                          onClick={() => router.push(`/community/${post.id}`)}
                          className="bg-slate-50/80 hover:bg-slate-100 transition-colors cursor-pointer group border-b border-slate-200/60"
                        >
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-slate-800 text-white shadow-sm">공지</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-black text-slate-900 group-hover:text-blue-600 transition-colors">{post.title}</span>
                              <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold tracking-wider">필독</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center text-[13px] text-slate-800 font-bold">
                            {/* 🚨 관리자 이메일일 경우 "포스트랩스" 표시 */}
                            {getAuthorName(post)}
                          </td>
                          <td className="px-6 py-4 text-center text-[13px] text-slate-500 font-medium">{formatDate(post.createdAt)}</td>
                          <td className="px-6 py-4 text-center text-[13px] text-slate-500 font-medium">{post.views}</td>
                          <td className="px-6 py-4 text-center text-[13px] font-bold text-blue-500">{post.likes}</td>
                        </tr>
                      ))}

                      {/* 2. 일반 게시글 렌더링 */}
                      {regularPosts.map((post) => {
                        const badgeColor = getBadgeColor(post.category);

                        return (
                          <tr 
                            key={post.id} 
                            onClick={() => router.push(`/community/${post.id}`)}
                            className="hover:bg-slate-50/50 transition-colors cursor-pointer group"
                          >
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-md text-[11px] font-black border ${badgeColor}`}>{post.category}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{post.title}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center text-[13px] text-slate-600 font-medium">
                              {/* 🚨 관리자 이메일일 경우 "포스트랩스" 표시 */}
                              {getAuthorName(post)}
                            </td>
                            <td className="px-6 py-4 text-center text-[13px] text-slate-400">{formatDate(post.createdAt)}</td>
                            <td className="px-6 py-4 text-center text-[13px] text-slate-400">{post.views}</td>
                            <td className="px-6 py-4 text-center text-[13px] font-bold text-blue-500">{post.likes}</td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
