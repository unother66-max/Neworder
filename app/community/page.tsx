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

  // 버튼 애니메이션 상태
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [isWriteHovered, setIsWriteHovered] = useState(false);

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

  const filteredPosts = activeTab === "전체" 
    ? posts 
    : posts.filter(post => post.category === activeTab);

  const noticePosts = filteredPosts.filter(post => post.category === "공지");
  const regularPosts = filteredPosts.filter(post => post.category !== "공지");

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-[#f8fafc] pt-24 pb-12">
        <div className="mx-auto max-w-[1100px] px-6">
          <h1 className="text-[26px] font-black tracking-tight text-[#111827] mb-6 italic">커뮤니티</h1>

          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-full text-[14px] font-bold transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-[#2563eb] text-white shadow-md shadow-blue-200"
                    : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-[20px] border border-slate-200 p-5 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex gap-2 min-w-[200px]">
                <select className="bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2 text-[13px] font-semibold outline-none focus:border-blue-500 cursor-pointer">
                  <option>제목+내용</option>
                  <option>제목</option>
                  <option>작성자</option>
                </select>
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="관심있는 키워드를 검색해보세요"
                  className="w-full bg-slate-50 border border-slate-200 rounded-[12px] pl-10 pr-4 py-2.5 text-[14px] outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              </div>
              
              <button 
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                className="relative overflow-hidden bg-[#333333] text-white px-6 py-2.5 rounded-[12px] text-[14px] font-bold transition-all shadow-sm"
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
              </button>
              
              <button 
                onClick={() => router.push("/community/write")} 
                onMouseEnter={() => setIsWriteHovered(true)}
                onMouseLeave={() => setIsWriteHovered(false)}
                className="relative overflow-hidden bg-[#333333] text-white px-5 py-2.5 rounded-[12px] text-[14px] font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <span className="relative z-30 pointer-events-none flex items-center gap-2">
                  <PenLine size={18} /> 글쓰기
                </span>
                <div
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full bg-[#2563EB]"
                  style={{
                    transformOrigin: "left",
                    transform: isWriteHovered ? "scaleX(1)" : "scaleX(0)",
                    transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                  }}
                />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[22px] border border-slate-200 overflow-hidden shadow-sm">
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
                            {post.author?.email === ADMIN_EMAIL ? "포스트랩스" : (post.author?.name || post.author?.email?.split('@')[0])}
                          </td>
                          <td className="px-6 py-4 text-center text-[13px] text-slate-500 font-medium">{formatDate(post.createdAt)}</td>
                          <td className="px-6 py-4 text-center text-[13px] text-slate-500 font-medium">{post.views}</td>
                          <td className="px-6 py-4 text-center text-[13px] font-bold text-blue-500">{post.likes}</td>
                        </tr>
                      ))}

                      {/* 2. 일반 게시글 렌더링 */}
                      {regularPosts.map((post) => {
                        let badgeColor = "bg-slate-50 text-slate-600 border-slate-200";
                        if (post.category === "질문") badgeColor = "bg-blue-50 text-blue-600 border-blue-100";
                        else if (post.category === "요청") badgeColor = "bg-emerald-50 text-emerald-600 border-emerald-100";
                        else if (post.category === "자유") badgeColor = "bg-purple-50 text-purple-600 border-purple-100";

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
                              {post.author?.email === ADMIN_EMAIL ? "포스트랩스" : (post.author?.name || post.author?.email?.split('@')[0])}
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