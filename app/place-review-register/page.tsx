"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";

type SearchPlaceItem = {
  title: string;
  category: string;
  address: string;
  link: string;
  image?: string;
};

function normalizeImageUrl(image?: string) {
  if (!image) return "";

  const trimmed = image.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("/api/place-image?url=")) return trimmed;

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

function buildPlaceLinks(publicPlaceId: string, name: string) {
  const encodedQuery = encodeURIComponent(name.trim());

  return {
    mobilePlaceLink: publicPlaceId
      ? `https://m.place.naver.com/restaurant/${publicPlaceId}/home`
      : `https://m.map.naver.com/search2/search.naver?query=${encodedQuery}`,
    pcPlaceLink: publicPlaceId
      ? `https://map.naver.com/p/entry/place/${publicPlaceId}?c=15.00,0,0,0,dh`
      : `https://map.naver.com/p/search/${encodedQuery}`,
  };
}

export default function PlaceReviewRegisterPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [mounted, setMounted] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<SearchPlaceItem[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");
  const [registeringName, setRegisteringName] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.replace("/login");
    }
  }, [session, status, router]);

  const handlePlaceSearch = async () => {
    if (!placeQuery.trim()) {
      setPlaceSearchError("매장 이름을 입력해주세요.");
      setPlaceResults([]);
      return;
    }

    setPlaceSearchLoading(true);
    setPlaceSearchError("");

    try {
      const response = await fetch("/api/search-place", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: placeQuery }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPlaceSearchError(data.error || "매장 검색 중 오류가 났어요.");
        setPlaceResults([]);
        return;
      }

      const normalizedItems = (data.items || []).map(
        (item: SearchPlaceItem) => ({
          ...item,
          image: normalizeImageUrl(item.image),
        })
      );

      setPlaceResults(normalizedItems);
    } catch (error) {
      console.error(error);
      setPlaceSearchError("매장 검색 중 오류가 났어요.");
      setPlaceResults([]);
    } finally {
      setPlaceSearchLoading(false);
    }
  };

  const handleRegisterPlace = async (item: SearchPlaceItem) => {
    try {
      setRegisteringName(item.title);

      const response = await fetch("/api/resolve-place-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: item.title,
          address: item.address,
          link: item.link,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "플레이스 정보를 가져오지 못했어요.");
        return;
      }

      const rawImage = normalizeImageUrl(data.image || item.image || "");
      const publicPlaceId = String(data.placeId || "").trim();
      const links = buildPlaceLinks(publicPlaceId, item.title);

      const saveRes = await fetch("/api/place-review-save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: item.title,
          category: item.category.split(">").pop()?.trim() || item.category,
          address: item.address,
          jibunAddress: data.jibunAddress || "",
          placeUrl: links.mobilePlaceLink || item.link,
          imageUrl: rawImage || "",
          x: data.x || null,
          y: data.y || null,
        }),
      });

      const saveData = await saveRes.json();

      if (!saveRes.ok) {
  alert(saveData.error || "리뷰 추적 매장 저장 실패");
  return;
}

alert("리뷰 추적 매장이 등록되었습니다.");

if (window.parent) {
  window.parent.postMessage(
    { type: "PLACE_REVIEW_REGISTERED" },
    window.location.origin
  );
}
    } catch (error) {
      console.error(error);
      alert("매장 등록 중 오류가 났어요.");
    } finally {
      setRegisteringName(null);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <>
        <TopNav active="place-review" />
        <main className="min-h-screen bg-[#f4f4f5] flex items-center justify-center">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <TopNav active="place-review" />
        <main className="min-h-screen bg-[#f4f4f5] flex items-center justify-center">
          <div className="text-[15px] text-[#6b7280]">
            로그인 페이지로 이동 중...
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav active="place-review" />

      <main className="min-h-screen bg-[#f4f4f5] text-[#111111]">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                  리뷰 추적 매장 등록
                </h1>
                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  리뷰 추적에 사용할 매장을 검색하고 등록하세요.
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push("/place-review")}
                className="inline-flex h-[44px] items-center justify-center rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[13px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
              >
                리뷰 추적으로 돌아가기
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handlePlaceSearch();
                  }
                }}
                placeholder="매장명 검색"
                className="h-[46px] flex-1 rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[14px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:bg-white"
              />

              <button
                type="button"
                onClick={handlePlaceSearch}
                disabled={placeSearchLoading}
                className="inline-flex h-[46px] min-w-[110px] items-center justify-center rounded-[14px] bg-[#b91c1c] px-5 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b] disabled:opacity-60"
              >
                {placeSearchLoading ? "검색 중..." : "검색"}
              </button>
            </div>

            {placeSearchError ? (
              <p className="mt-3 text-[13px] font-medium text-[#dc2626]">
                {placeSearchError}
              </p>
            ) : null}
          </div>

          <div className="mt-5 space-y-4">
            {placeSearchLoading ? (
              <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[18px] font-bold text-[#111827]">
                  검색 중...
                </p>
                <p className="mt-2 text-[14px] text-[#9ca3af]">
                  네이버 플레이스를 불러오고 있습니다.
                </p>
              </div>
            ) : placeResults.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[18px] font-bold text-[#111827]">
                  검색 결과가 없습니다.
                </p>
                <p className="mt-2 text-[14px] text-[#9ca3af]">
                  매장명을 입력하고 검색해보세요.
                </p>
              </div>
            ) : (
              placeResults.map((item, index) => (
                <section
                  key={`${item.title}-${item.address}-${index}`}
                  className="overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-6">
                    <div className="flex min-w-0 gap-4">
                      <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[16px] bg-[#f3f4f6] ring-1 ring-[#e5e7eb]">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[12px] text-[#9ca3af]">
                            이미지
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h2 className="text-[18px] font-black tracking-[-0.03em] text-[#111827]">
                          {item.title}
                        </h2>

                        <p className="mt-1 text-[13px] font-semibold text-[#6b7280]">
                          {item.category}
                        </p>

                        <p className="mt-2 text-[13px] leading-5 text-[#6b7280]">
                          {item.address}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRegisterPlace(item)}
                        disabled={registeringName === item.title}
                        className="inline-flex h-[44px] min-w-[110px] items-center justify-center rounded-[14px] bg-[#b91c1c] px-5 text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(185,28,28,0.16)] transition hover:bg-[#991b1b] disabled:opacity-60"
                      >
                        {registeringName === item.title ? "등록 중..." : "등록"}
                      </button>
                    </div>
                  </div>
                </section>
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}