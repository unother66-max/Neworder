"use client";

import React, { useEffect, useState } from "react";
import TopNav from "@/components/top-nav";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, User, Calendar, Eye, ThumbsUp } from "lucide-react";

export default function CommunityDetailPage() {
  const router = useRouter();
  const params = useParams(); // useParams()는 클라이언트 컴포넌트에서 동기적으로 작동합니다.
  const [post, setPost] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPost = async () => {
      // params.id가 존재하는지 먼저 확인
      if (!params?.id) return;

      try {
        const res = await fetch(`/api/community/${params.id}`);
        const data = await res.json();
        if (data.ok) {
          setPost(data.post);
        } else {
          console.error("게시글 로딩 실패:", data.error);
        }
      } catch (error) {
        console.error("데이터 로딩 중 오류 발생:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPost();
  }, [params?.id]);

  if (isLoading) return <div className="pt-40 text-center text-slate-400 font-bold">게시글을 불러오는 중...</div>;
  
  if (!post) return (
    <div className="pt-40 text-center">
      <p className="text-slate-400 font-bold mb-4">글을 찾을 수 없습니다.</p>
      <button onClick={() => router.push('/community')} className="text-blue-500 font-bold">목록으로 돌아가기</button>
    </div>
  );

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-white pt-24 pb-20">
        <div className="mx-auto max-w-[850px] px-6">
          {/* 뒤로가기 버튼 */}
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-800 transition-colors mb-8 group"
          >
            <ArrowLeft size={20} />
            <span className="text-[15px] font-bold">목록으로 돌아가기</span>
          </button>

          {/* 게시글 헤더 */}
          <div className="border-b border-slate-100 pb-8 mb-8">
            <span className="inline-block bg-blue-50 text-blue-600 text-[12px] font-black px-3 py-1 rounded-md mb-4">
              {post.category}
            </span>
            <h1 className="text-[32px] font-black text-slate-900 leading-tight mb-6">
              {post.title}
            </h1>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                <User size={20} />
              </div>
              <div>
                <div className="text-[14px] font-bold text-slate-800">
                  {post.author?.name || post.author?.email?.split('@')[0] || "익명"}
                </div>
                <div className="flex items-center gap-3 text-[12px] text-slate-400 mt-0.5">
                  <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(post.createdAt).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1"><Eye size={14} /> {post.views}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 게시글 본문 */}
          <div className="text-[16px] text-slate-700 leading-[1.8] min-h-[300px] whitespace-pre-wrap">
            {post.content}
          </div>

          {/* 추천 버튼 */}
          <div className="mt-20 flex justify-center">
            <button className="flex items-center gap-2 border-2 border-slate-100 px-8 py-3 rounded-full hover:bg-slate-50 transition-colors text-slate-400 hover:text-blue-500 hover:border-blue-100">
              <ThumbsUp size={20} />
              <span className="font-bold">추천 {post.likes}</span>
            </button>
          </div>
        </div>
      </main>
    </>
  );
}