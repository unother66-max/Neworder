"use client";

import { useState } from "react";
import TopNav from "@/components/top-nav";
import PageHeader from "@/components/page-header";

type Post = { title: string; link: string; date: string; };

export default function BlogAnalysisPage() {
  const [blogUrl, setBlogUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("recent");
  const [rankTab, setRankTab] = useState("total");

  const [visitor, setVisitor] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [blogId, setBlogId] = useState("");
  const [totalVisitor, setTotalVisitor] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [blogLevel, setBlogLevel] = useState(0);
  const [blogGrade, setBlogGrade] = useState("");
  const [blogScore, setBlogScore] = useState(0);

  const handleAnalyze = async () => {
    if (!blogUrl) return alert("블로그 주소를 입력해주세요!");
    setLoading(true);
    try {
      const response = await fetch("/api/blog-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogUrl }),
      });
      const data = await response.json();
      
      if (response.ok) {
        setNickname(data.nickname);
        setBlogId(data.blogId);
        setVisitor(data.visitor);
        setTotalVisitor(data.totalVisitor);
        setPosts(data.posts || []);
        
        // ★ 서버에서 내려준 안전한 이미지를 그대로 세팅
        setProfileImage(data.profileImage || null);

        const total = data.totalVisitor; 
        const daily = data.visitor;      
        let calcLevel = 1;
        if (total >= 3000000) calcLevel = 10;
        else if (total >= 1000000) calcLevel = 9;
        else if (total >= 500000) calcLevel = 8;
        else if (total >= 100000) calcLevel = 7;
        else if (total >= 50000) calcLevel = 6;
        else if (total >= 10000) calcLevel = 5;
        else if (total >= 5000) calcLevel = 4;
        else if (total >= 1000) calcLevel = 3;
        else if (total > 0) calcLevel = 2;

        let calcGrade = "D";
        if (daily >= 5000) calcGrade = "S";
        else if (daily >= 1000) calcGrade = "A";
        else if (daily >= 300) calcGrade = "B";
        else if (daily >= 50) calcGrade = "C";

        let baseScore = calcLevel * 8.5; 
        let bonusScore = 0;
        if (calcGrade === "S") bonusScore = 15;
        else if (calcGrade === "A") bonusScore = 10;
        else if (calcGrade === "B") bonusScore = 5;
        else if (calcGrade === "C") bonusScore = 2;

        let calcScore = baseScore + bonusScore + (Math.random() * 2); 
        if (calcScore > 99.99) calcScore = 99.99; 

        setBlogLevel(calcLevel);
        setBlogGrade(calcGrade);
        setBlogScore(parseFloat(calcScore.toFixed(2)));
      } else { alert(data.error); }
    } catch (error) { alert("분석 중 오류가 발생했습니다."); }
    finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] pt-24 pb-20">
      <TopNav />
      <section className="mx-auto max-w-[1180px] px-5 py-8">
        <PageHeader title="블로그 채널 분석" description="내 블로그의 실질적인 영향력과 검색 노출 지수를 정밀하게 분석합니다." />

        <div className="mt-8 rounded-[18px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <input type="text" value={blogUrl} onChange={(e) => setBlogUrl(e.target.value)} placeholder="https://blog.naver.com/아이디" className="h-[46px] flex-1 rounded-[12px] border border-[#d8dde6] px-4 outline-none focus:border-[#2563EB]" />
            <div className="flex h-[46px] min-w-[150px] items-center justify-center rounded-[14px] border border-[#e5e7eb] bg-[#f3f4f6] px-4 text-[14px] font-bold">
              방문자 {visitor !== null ? visitor.toLocaleString() : "-"}
            </div>
            <button onClick={handleAnalyze} disabled={loading} className="h-[46px] min-w-[120px] rounded-[14px] bg-[#333] px-5 font-bold text-white hover:bg-[#2563EB] disabled:opacity-50">
              {loading ? "분석 중..." : "분석 시작"}
            </button>
          </div>
        </div>

        {visitor !== null && (
          <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-6 md:flex-row">
              <div className="w-full md:w-[280px] shrink-0">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm text-center h-full">
                  
                  {/* ★ 완전히 깔끔해진 프로필 사진 영역 ★ */}
                  <div className="h-20 w-20 rounded-full bg-gray-100 mx-auto mb-3 flex items-center justify-center text-3xl overflow-hidden border border-[#e5e7eb] shadow-sm">
                    {profileImage ? (
                      <img 
                        src={profileImage} 
                        alt="프로필" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <span className="text-gray-300">👤</span>
                    )}
                  </div>

                  <h3 className="text-[18px] font-bold text-[#111827]">{nickname}</h3>
                  <p className="text-[13px] text-gray-400">@{blogId}</p>
                  <div className="mt-6 pt-6 border-t border-gray-50 text-left">
                    <div className="flex justify-between items-end text-[13px] mb-1 text-gray-500">
                      <span>블로그 레벨 / 운영 등급</span>
                      <span className={`text-[16px] font-black ${blogGrade === 'S' || blogGrade === 'A' ? 'text-[#2563EB]' : 'text-[#f59e0b]'}`}>
                        {blogGrade}
                      </span>
                    </div>
                    <div className="text-[32px] font-black text-[#111827] mb-2">Lv.{blogLevel}</div>
                    <div className="flex justify-between text-[10px] mb-1 text-gray-400">
                      <span>영향력 지수 : {blogScore}</span>
                      <span className="text-[#2563EB] font-bold">다음 레벨까지 {(100 - blogScore).toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full">
                      <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000" style={{ width: `${blogScore}%` }}></div>
                    </div>
                    <div className="mt-4 p-3 bg-gray-50 rounded-xl text-[11px] text-gray-500 leading-tight">
                      <span className="font-bold text-[#111827]">TIPS: </span>
                      {blogLevel < 6 && (blogGrade === 'S' || blogGrade === 'A') 
                        ? "레벨은 낮지만 최근 통합검색/스마트블록 노출이 우수한 떡상 블로그입니다."
                        : blogLevel >= 7 && (blogGrade === 'C' || blogGrade === 'D')
                        ? "과거 영향력은 높지만 최근 검색 노출 활동이 다소 부족한 상태입니다."
                        : "레벨과 등급이 비례하여 꾸준하게 성장하고 있는 블로그입니다."}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 우측 지표들 */}
              <div className="flex-1 space-y-4">
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-400 mb-4 tracking-tighter">● 최신 순위</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="border-r border-gray-50"><p className="text-xl font-black text-red-500">330개</p><p className="text-[11px] text-gray-400 mt-1">유효 키워드</p></div>
                    <div className="border-r border-gray-50"><p className="text-xl font-black text-orange-500">5,674위</p><p className="text-[11px] text-gray-400 mt-1">전체 순위</p></div>
                    <div><p className="text-xl font-black text-[#111827]">259위</p><p className="text-[11px] text-gray-400 mt-1">IT·컴퓨터</p></div>
                  </div>
                </div>
                <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-6 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-400 mb-4 tracking-tighter">● 블로그 정보</h4>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[ {L:"주제", V:"IT·컴퓨터"}, {L:"게시물", V:"673개"}, {L:"작성빈도", V:"0.71개"}, {L:"스크랩", V:"954개"}, {L:"이웃 수", V:"1,101명"} ].map((o,i)=>(
                      <div key={i}><p className="font-bold text-[14px] text-[#111827] mb-1">{o.V}</p><p className="text-[10px] text-gray-400">{o.L}</p></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 중간 그래프/분석 박스 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <h4 className="px-6 py-3 bg-gray-600 text-white font-bold text-sm">방문자 수 지표</h4>
                <div className="p-6 flex gap-4 h-44">
                  <div className="flex-1 border-b border-l border-gray-50 relative">
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none"><path d="M0 80 L20 75 L40 85 L60 70 L80 75 L100 60" fill="none" stroke="#ef4444" strokeWidth="2"/></svg>
                  </div>
                  <div className="w-32 text-right space-y-4">
                    <p className="text-xs text-green-500 font-bold">전일 대비 -</p>
                    <div><p className="text-[10px] text-gray-400">일일</p><p className="font-black text-lg">{visitor?.toLocaleString()}명</p></div>
                    <div><p className="text-[10px] text-gray-400">누적</p><p className="font-black text-sm">{totalVisitor.toLocaleString()}명</p></div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="flex border-b border-gray-50">
                   <button className={`px-5 py-3 text-sm font-bold ${rankTab==='total'?'bg-gray-600 text-white':'text-gray-400'}`}>전체 순위</button>
                   <button className="px-5 py-3 text-sm font-bold text-gray-400">주제 순위</button>
                   <button className="px-5 py-3 text-sm font-bold text-gray-400">유효키워드</button>
                </div>
                <div className="p-6 flex-1 flex gap-4">
                  <div className="flex-1 bg-gray-50/50 rounded-lg relative overflow-hidden"><svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none"><path d="M0 20 L40 60 L100 40" fill="none" stroke="#ef4444" strokeWidth="2"/></svg></div>
                  <div className="w-32 text-right">
                    <p className="text-[10px] text-green-500 font-bold mb-4">3주 연속 상승!</p>
                    <p className="text-[10px] text-gray-400">이번주</p>
                    <p className="font-black text-red-500 text-xl">5,674위</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
                <h4 className="text-[16px] font-bold mb-6 text-[#111827]">최근 블로그 영향력을 분석했어요 ⓘ</h4>
                <div className="space-y-8">
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span className="font-bold">영향력 지수</span><span className="text-orange-500 font-bold">평균</span></div>
                    <p className="text-[11px] text-gray-400 mb-2">영향력 점수가 같은 레벨 평균과 비슷해요.</p>
                    <div className="h-2 w-full bg-gray-100 rounded-full"><div className="h-full bg-orange-400 rounded-full" style={{ width: `${blogScore}%` }}></div></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2"><span className="font-bold">키워드 영향력</span><span className="text-red-500 font-bold">평균 이하</span></div>
                    <div className="h-2 w-full bg-gray-100 rounded-full"><div className="h-full bg-red-400 w-[55%] rounded-full"></div></div>
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
                <h4 className="text-[16px] font-bold mb-6 text-[#111827]">최근 포스팅의 패턴을 분석했어요 ⓘ</h4>
                <div className="grid grid-cols-3 gap-2 text-center mb-8">
                  <div><p className="text-[11px] text-gray-400 mb-1">제목 길이</p><p className="font-bold text-orange-500">평균</p></div>
                  <div><p className="text-[11px] text-gray-400 mb-1">본문 길이</p><p className="font-bold text-red-500">평균 이하</p></div>
                  <div><p className="text-[11px] text-gray-400 mb-1">이미지 수</p><p className="font-bold text-red-500">평균 이하</p></div>
                </div>
                <div className="space-y-5">
                  <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                    <span className="w-16">제목 길이</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-orange-400 w-[70%]"></div></div>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold text-gray-500">
                    <span className="w-16">본문 길이</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 w-[45%]"></div></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="flex gap-1 mb-4 bg-gray-100/50 p-1 rounded-xl w-fit">
                {[{ id: "recent", label: "최근 포스팅" }, { id: "popular", label: "인기글 목록" }].map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? "bg-white shadow-sm" : "text-gray-400"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr><th className="px-6 py-4 text-xs font-bold text-gray-500">발행일</th><th className="px-6 py-4 text-xs font-bold text-gray-500">제목</th><th className="px-6 py-4 text-xs font-bold text-gray-500 text-center">분석</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {posts.length > 0 ? posts.map((post, i) => (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-5 text-xs text-gray-400">{post.date}</td>
                        <td className="px-6 py-5 text-sm font-bold text-[#111827]"><a href={post.link} target="_blank" className="hover:text-[#2563EB] transition-colors">{post.title}</a></td>
                        <td className="px-6 py-5 text-center"><button className="p-2 hover:bg-gray-100 rounded-lg">🔍</button></td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} className="px-6 py-10 text-center text-gray-300 text-sm">최근 글이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}