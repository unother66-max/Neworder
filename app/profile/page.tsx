"use client";

import React, { useEffect, useState } from "react";
import TopNav from "@/components/top-nav";
import { User, ShieldCheck, Database, Package, MapPin, Map as MapIcon } from "lucide-react";

export default function ProfilePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user-quota")
      .then((res) => res.json())
      .then((res) => {
        if (res.ok) setData(res);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-10 text-center">불러오는 중...</div>;
  if (!data) return <div className="p-10 text-center text-red-500">정보를 불러오지 못했습니다.</div>;

  return (
    <>
      <TopNav />
      <main className="min-h-screen bg-[#f8fafc] pt-24 pb-12">
        <div className="mx-auto max-w-[900px] px-6">
          <h1 className="text-[28px] font-black tracking-tight text-[#111827] mb-8">내 정보</h1>

          <div className="grid gap-6">
            {/* 계정 정보 카드 */}
            <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
              <div className="flex items-center gap-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
                  <User size={32} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#111827]">{data.name || "사용자"}</h2>
                  <p className="text-sm text-[#6b7280]">{data.email}</p>
                </div>
                <div className="ml-auto">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold shadow-sm ring-1 ring-inset ${
                    data.tier === "PRO" 
                      ? "bg-blue-50 text-blue-700 ring-blue-700/10" 
                      : "bg-emerald-50 text-emerald-700 ring-emerald-700/10"
                  }`}>
                    <ShieldCheck size={16} />
                    {data.tier} 멤버십
                  </span>
                </div>
              </div>
            </div>

            {/* 전체 등록 현황 카드 */}
            <div className="rounded-[24px] border border-[#e5e7eb] bg-white p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2 text-lg font-bold text-[#111827]">
                  <Database size={20} className="text-slate-400" />
                  전체 등록 현황
                </div>
                <div className="text-sm font-bold">
                  <span className={data.totalItems >= data.maxLimit ? "text-red-500" : "text-blue-600"}>{data.totalItems}</span>
                  <span className="text-slate-400"> / {data.maxLimit}개 사용 중</span>
                </div>
              </div>

              {/* 진행률 바 */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div 
                  className={`h-full transition-all duration-500 ${data.totalItems >= data.maxLimit ? "bg-red-500" : "bg-blue-600"}`}
                  style={{ width: `${Math.min((data.totalItems / data.maxLimit) * 100, 100)}%` }}
                />
              </div>

              {/* 3개 카테고리 상세 내역 */}
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. 스마트스토어 */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-slate-500 mb-2">
                    <Package size={16} /> 스마트스토어
                  </div>
                  <div className="text-2xl font-black text-slate-900">{data.counts.smartstore}개</div>
                </div>

                {/* 2. 네이버 지도 */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-slate-500 mb-2">
                    <MapPin size={16} /> 네이버 지도
                  </div>
                  <div className="text-2xl font-black text-slate-900">{data.counts.naverMap}개</div>
                </div>

                {/* 3. 카카오맵 */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-slate-500 mb-2">
                    <MapIcon size={16} /> 카카오맵
                  </div>
                  <div className="text-2xl font-black text-slate-900">{data.counts.kakaoMap}개</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}