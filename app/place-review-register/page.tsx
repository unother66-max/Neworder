"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [hasSearched, setHasSearched] = useState(false);

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
      setPlaceSearchError("매장명을 입력해주세요.");
      setPlaceResults([]);
      setHasSearched(false);
      return;
    }

    setPlaceSearchLoading(true);
    setPlaceSearchError("");
    setHasSearched(true);

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
        alert(saveData.error || "리뷰 플레이스 저장 실패");
        return;
      }

      alert("리뷰 플레이스가 등록되었습니다.");
      router.push("/place-review");
    } catch (error) {
      console.error(error);
      alert("매장 등록 중 오류가 났어요.");
    } finally {
      setRegisteringName(null);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <main className="min-h-screen bg-[rgba(15,23,42,0.28)] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[1520px] rounded-[40px] bg-[#f7f7f8] px-10 py-16 text-center text-[18px] text-[#6b7280]">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[rgba(15,23,42,0.28)] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[1520px] rounded-[40px] bg-[#f7f7f8] px-10 py-16 text-center text-[18px] text-[#6b7280]">
          로그인 페이지로 이동 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[rgba(15,23,42,0.28)] px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto w-full max-w-[1520px] overflow-hidden rounded-[40px] border border-[#d7dbe1] bg-[#f7f7f8] shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between px-12 pb-10 pt-12 md:px-14 md:pb-12 md:pt-12">
          <div className="min-w-0">
            <p className="text-[18px] font-bold tracking-[0.22em] text-[#6b7280] md:text-[22px]">
              REVIEW PLACE REGISTER
            </p>

            <h1 className="mt-5 text-[42px] font-black tracking-[-0.04em] text-[#0f172a] md:text-[56px]">
              리뷰 매장 등록
            </h1>

            <p className="mt-8 text-[22px] leading-[1.65] text-[#6b7280] md:text-[28px]">
              매장명을 검색해서 리뷰 추적할 플레이스를 등록하세요.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/place-review")}
            className="ml-8 flex h-[92px] w-[118px] shrink-0 items-center justify-center rounded-full border border-[#c8cdd4] bg-[#f7f7f8] text-[26px] font-medium text-[#6b7280] transition hover:bg-white"
          >
            닫기
          </button>
        </div>

        <div className="border-t border-[#e2e5ea] px-12 py-12 md:px-14 md:py-12">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
            <input
              type="text"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handlePlaceSearch();
                }
              }}
              placeholder="예: 뉴오더클럽 한남"
              className="h-[100px] flex-1 rounded-[30px] border border-[#c8cdd4] bg-[#f7f7f8] px-8 text-[28px] text-[#111827] outline-none transition placeholder:text-[#a3acb8] focus:bg-white"
            />

            <button
              type="button"
              onClick={handlePlaceSearch}
              disabled={placeSearchLoading}
              className="h-[100px] min-w-[210px] rounded-[30px] bg-[#c91717] px-10 text-[24px] font-bold text-white shadow-[0_18px_34px_rgba(201,23,23,0.16)] transition hover:bg-[#ae1414] disabled:opacity-60"
            >
              {placeSearchLoading ? "검색 중..." : "매장 검색"}
            </button>
          </div>

          {placeSearchError ? (
            <p className="mt-4 text-[16px] font-medium text-[#dc2626]">
              {placeSearchError}
            </p>
          ) : null}

          <div className="mt-8 rounded-[34px] border-2 border-dashed border-[#cfd5dc] bg-[#f7f7f8] px-8 py-8">
            {!hasSearched && (
              <div className="flex min-h-[210px] items-center justify-center text-center text-[26px] text-[#a3acb8]">
                검색 결과가 여기에 표시됩니다.
              </div>
            )}

            {hasSearched && placeSearchLoading && (
              <div className="flex min-h-[210px] items-center justify-center text-center text-[26px] text-[#a3acb8]">
                검색 중입니다.
              </div>
            )}

            {hasSearched && !placeSearchLoading && placeResults.length === 0 && (
              <div className="flex min-h-[210px] items-center justify-center text-center text-[26px] text-[#a3acb8]">
                검색 결과가 없습니다.
              </div>
            )}

            {hasSearched && !placeSearchLoading && placeResults.length > 0 && (
              <div className="space-y-4">
                {placeResults.map((item, index) => (
                  <div
                    key={`${item.title}-${item.address}-${index}`}
                    className="flex flex-col gap-4 rounded-[26px] border border-[#e5e7eb] bg-white p-5 md:flex-row md:items-center md:justify-between md:p-6"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[18px] bg-[#eef2f7]">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[13px] text-[#9ca3af]">
                            이미지 없음
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-[24px] font-bold text-[#111827]">
                          {item.title}
                        </div>
                        <div className="mt-1 text-[16px] text-[#6b7280]">
                          {item.category}
                        </div>
                        <div className="mt-2 text-[16px] text-[#6b7280]">
                          {item.address}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRegisterPlace(item)}
                      disabled={registeringName === item.title}
                      className="h-[60px] min-w-[130px] rounded-[18px] bg-[#c91717] px-6 text-[18px] font-bold text-white transition hover:bg-[#ae1414] disabled:opacity-60"
                    >
                      {registeringName === item.title ? "등록 중..." : "등록"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}