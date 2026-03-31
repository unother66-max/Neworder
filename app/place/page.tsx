"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";

type KeywordItem = {
  keyword: string;
  monthly: string;
  mobile: string;
  pc: string;
  rank: string;
  placeKeywordId?: string;
  isTracking?: boolean;
};

type Store = {
  dbId?: string;
  name: string;
  category: string;
  address: string;
  placeId?: string;
  mobilePlaceLink?: string;
  pcPlaceLink?: string;
  image?: string;
  keywords: KeywordItem[];
};

type SearchPlaceItem = {
  title: string;
  category: string;
  address: string;
  link: string;
  image?: string;
};

type RecommendedKeyword = {
  keyword: string;
  monthly?: string;
};

type PlaceKeywordItem = {
  id: string;
  keyword: string;
  mobileVolume: number | null;
  pcVolume: number | null;
  totalVolume: number | null;
  isTracking: boolean;
  rankHistory: {
    id: string;
    rank: number;
    createdAt: string;
  }[];
};

type PlaceItem = {
  id: string;
  userId: string;
  name: string;
  category: string | null;
  address: string | null;
  placeUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  keywords: PlaceKeywordItem[];
  rankHistory: {
    id: string;
    placeId: string;
    keyword: string;
    rank: number;
    createdAt: string;
  }[];
};

const PAGE_SIZE = 15;
const DEMO_USER_ID = "test-user";



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

function getProxyImageUrl(image?: string) {
  const normalized = normalizeImageUrl(image);
  if (!normalized) return "";

  if (normalized.startsWith("/api/place-image?url=")) return normalized;

  return `/api/place-image?url=${encodeURIComponent(normalized)}`;
}

function formatCount(value?: string | number | null) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "-" ||
    value === "null"
  ) {
    return "-";
  }

  const onlyNumber = String(value).replace(/,/g, "").trim();
  if (!/^\d+$/.test(onlyNumber)) return String(value);

  return Number(onlyNumber).toLocaleString("ko-KR");
}

function getRankMeta(rank: string) {
  if (!rank || rank === "-" || rank === "오류") {
    return {
      main: rank || "-",
      sub: "-",
    };
  }

  const matched = rank.match(/\d+/);
  if (!matched) {
    return {
      main: rank,
      sub: "-",
    };
  }

  const numericRank = Number(matched[0]);
  const page = Math.ceil(numericRank / PAGE_SIZE);
  const pagePosition = ((numericRank - 1) % PAGE_SIZE) + 1;

  return {
    main: `${numericRank}위`,
    sub: `${page}p ${pagePosition}위`,
  };
}

function getDefaultRecommendedKeywords(store: Store): RecommendedKeyword[] {
  const area = store.address.includes("한남")
    ? "한남동"
    : store.address.includes("연남")
      ? "연남동"
      : store.address.includes("서울역")
        ? "서울역"
        : store.address.includes("숙대")
          ? "숙대입구"
          : "";

  if (store.name.includes("뉴오더클럽") && area === "한남동") {
    return [
      { keyword: "블루스퀘어청모생일파티" },
      { keyword: "가성비소개팅회식" },
      { keyword: "한남동청첩장모임또간집" },
      { keyword: "맥주숩집내돈내산낮술" },
      { keyword: "화덕피자", monthly: "28180" },
    ];
  }

  if (store.name.includes("뉴오더클럽") && area === "연남동") {
    return [
      { keyword: "연남동 피자", monthly: "12410" },
      { keyword: "연남동 맛집", monthly: "41280" },
      { keyword: "연남동 데이트" },
      { keyword: "연남동 화덕피자" },
      { keyword: "연남 피자집" },
    ];
  }

  if (store.category.includes("필라테스")) {
    return [
      { keyword: "서울역 필라테스", monthly: "240" },
      { keyword: "숙대입구 필라테스", monthly: "30" },
      { keyword: "용산 필라테스" },
      { keyword: "자세교정 필라테스" },
      { keyword: "기구필라테스" },
    ];
  }

  return [
    {
      keyword:
        `${area} ${store.category}`.trim() ||
        `${store.name} ${store.category}`.trim(),
    },
    { keyword: `${area} 맛집`.trim() || `${store.name} 맛집`.trim() },
    { keyword: `${store.category} 추천` },
    { keyword: `${store.name} 후기` },
    { keyword: `${store.name} 예약` },
  ];
}

function moveItem<T>(arr: T[], from: number, to: number) {
  const copy = [...arr];
  const [target] = copy.splice(from, 1);
  copy.splice(to, 0, target);
  return copy;
}

function extractPublicPlaceId(placeUrl?: string | null) {
  if (!placeUrl) return "";

  const matched =
    placeUrl.match(/restaurant\/(\d+)/) ||
    placeUrl.match(/place\/(\d+)/) ||
    placeUrl.match(/placeId=(\d+)/) ||
    placeUrl.match(/entry\/place\/(\d+)/);

  return matched?.[1] ?? "";
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

function getLatestRankString(
  rankHistory?: {
    id: string;
    placeId: string;
    keyword: string;
    rank: number;
    createdAt: string;
  }[]
) {
  if (!rankHistory || rankHistory.length === 0) return "-";

  const sorted = [...rankHistory].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const latest = sorted[0];
  if (latest?.rank === null || latest?.rank === undefined) return "-";

  return String(latest.rank);
}

function mapPlaceToStore(place: PlaceItem): Store {
  const publicPlaceId = extractPublicPlaceId(place.placeUrl);
  const links = buildPlaceLinks(publicPlaceId, place.name);

  return {
    dbId: place.id,
    name: place.name,
    category: place.category ?? "",
    address: place.address ?? "",
    placeId: publicPlaceId,
    mobilePlaceLink: links.mobilePlaceLink,
    pcPlaceLink: links.pcPlaceLink,
    image: place.imageUrl ? getProxyImageUrl(place.imageUrl) : "",
    keywords: (place.keywords || []).map((keyword) => ({
      keyword: keyword.keyword,
      monthly:
        keyword.totalVolume === null || keyword.totalVolume === undefined
          ? "-"
          : String(keyword.totalVolume),
      mobile:
        keyword.mobileVolume === null || keyword.mobileVolume === undefined
          ? "-"
          : String(keyword.mobileVolume),
      pc:
        keyword.pcVolume === null || keyword.pcVolume === undefined
          ? "-"
          : String(keyword.pcVolume),
      rank: getLatestRankString(
  (place.rankHistory || []).filter(
    (history) => history.keyword === keyword.keyword
  )
),
      placeKeywordId: keyword.id,
      isTracking: keyword.isTracking,
    })),
  };
}

export default function PlacePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<SearchPlaceItem[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState("");

  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [selectedStoreIndex, setSelectedStoreIndex] = useState<number | null>(
    null
  );
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedRecommendedKeywords, setSelectedRecommendedKeywords] =
    useState<string[]>([]);
  const [tempKeywords, setTempKeywords] = useState<string[]>([]);
  const [draggingKeywordIndex, setDraggingKeywordIndex] = useState<
    number | null
  >(null);
  const [checkingStoreIndex, setCheckingStoreIndex] = useState<number | null>(
    null
  );
  const [trackingLoadingKeywordId, setTrackingLoadingKeywordId] = useState<
    string | null
  >(null);
  const [deletingKeywordKey, setDeletingKeywordKey] = useState<string | null>(
    null
  );

  useEffect(() => {
  setMounted(true);
}, []);



useEffect(() => {
  if (!mounted) return;
  if (!session) return;
  fetchPlaces();
}, [mounted, session]);

useEffect(() => {
  if (status === "loading") return;

  if (!session) {
    router.replace("/login");
  }
}, [session, status, router]);

const fetchPlaces = async () => {
  try {
    setPlaceLoading(true);

    const res = await fetch("/api/place-list", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      console.error(data?.message || "매장 목록 불러오기 실패");
      return;
    }

    const nextStores = (data.places || []).map((place: PlaceItem) =>
      mapPlaceToStore(place)
    );
    setStores(nextStores);
  } catch (e) {
    console.error(e);
    alert("에러 발생");
  } finally {
    setPlaceLoading(false);
  }
};


const filteredStores = useMemo(() => {
  const text = searchText.trim().toLowerCase();
  if (!text) return stores;

  return stores.filter((store) => {
    return (
      store.name.toLowerCase().includes(text) ||
      store.category.toLowerCase().includes(text) ||
      store.address.toLowerCase().includes(text)
    );
  });
}, [searchText, stores]);

const selectedStore =
  selectedStoreIndex !== null ? stores[selectedStoreIndex] : null;

const selectedStoreSavedKeywordMap = useMemo(() => {
  if (!selectedStore) return new Map<string, KeywordItem>();

  return new Map(
    selectedStore.keywords.map((item) => [item.keyword, item] as const)
  );
}, [selectedStore]);

const recommendedKeywords = useMemo(() => {
  if (!selectedStore) return [];
  return getDefaultRecommendedKeywords(selectedStore);
}, [selectedStore]);

if (!mounted || status === "loading") {
  return (
    <>
      <TopNav active="place" />
      <main className="min-h-screen bg-[#f3f5f9] flex items-center justify-center">
        <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
      </main>
    </>
  );
}

if (!session) {
  return (
    <>
      <TopNav active="place" />
      <main className="min-h-screen bg-[#f3f5f9] flex items-center justify-center">
        <div className="text-[15px] text-[#6b7280]">로그인 페이지로 이동 중...</div>
      </main>
    </>
  );
}



  const openRegisterModal = () => {
    setIsRegisterModalOpen(true);
    setPlaceQuery("");
    setPlaceResults([]);
    setPlaceSearchError("");
  };

  const closeRegisterModal = () => {
    setIsRegisterModalOpen(false);
    setPlaceQuery("");
    setPlaceResults([]);
    setPlaceSearchError("");
  };

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

      const alreadyExists = stores.some(
        (store) =>
          (publicPlaceId && store.placeId === publicPlaceId) ||
          (store.name === item.title && store.address === item.address)
      );

      if (alreadyExists) {
        alert("이미 등록된 매장입니다.");
        return;
      }

      const links = buildPlaceLinks(publicPlaceId, item.title);

      const saveRes = await fetch("/api/place-save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: DEMO_USER_ID,
          name: item.title,
          category: item.category.split(">").pop()?.trim() || item.category,
          address: item.address,
          placeUrl: links.mobilePlaceLink || item.link,
          imageUrl: rawImage || "",
        }),
      });

      const saveData = await saveRes.json();

      if (!saveRes.ok) {
        alert(saveData.error || "매장 저장 실패");
        return;
      }

      await fetchPlaces();
      closeRegisterModal();
    } catch (error) {
      console.error(error);
      alert("매장 등록 중 오류가 났어요.");
    }
  };

  const openKeywordModal = (storeIndex: number) => {
    const targetStore = filteredStores[storeIndex];
    const realIndex = stores.findIndex(
      (item) =>
        item.name === targetStore.name &&
        item.address === targetStore.address &&
        item.dbId === targetStore.dbId
    );

    if (realIndex === -1) return;

    const existingKeywords = stores[realIndex].keywords.map(
      (item) => item.keyword
    );

    setSelectedStoreIndex(realIndex);
    setTempKeywords(existingKeywords);
    setSelectedRecommendedKeywords(
      getDefaultRecommendedKeywords(stores[realIndex])
        .map((item) => item.keyword)
        .filter((keyword) => existingKeywords.includes(keyword))
    );
    setKeywordInput("");
    setDraggingKeywordIndex(null);
    setDeletingKeywordKey(null);
    setIsKeywordModalOpen(true);
  };

  const closeKeywordModal = () => {
    setIsKeywordModalOpen(false);
    setSelectedStoreIndex(null);
    setKeywordInput("");
    setSelectedRecommendedKeywords([]);
    setTempKeywords([]);
    setDraggingKeywordIndex(null);
    setDeletingKeywordKey(null);
  };

  const addKeywordsToTemp = (keywords: string[]) => {
    setTempKeywords((prev) => {
      const set = new Set(prev);
      keywords.forEach((keyword) => {
        const trimmed = keyword.trim();
        if (trimmed) set.add(trimmed);
      });
      return Array.from(set);
    });
  };

  const toggleRecommendedKeyword = (keyword: string) => {
    setSelectedRecommendedKeywords((prev) => {
      const exists = prev.includes(keyword);

      if (exists) {
        setTempKeywords((current) => current.filter((item) => item !== keyword));
        return prev.filter((item) => item !== keyword);
      }

      addKeywordsToTemp([keyword]);
      return [...prev, keyword];
    });
  };

  const addDirectKeywords = () => {
    const keywords = keywordInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.slice(0, 20));

    if (keywords.length === 0) return;

    addKeywordsToTemp(keywords);
    setKeywordInput("");
  };

  const removeTempKeyword = async (keyword: string) => {
    if (!selectedStore) return;

    const existingKeyword = selectedStoreSavedKeywordMap.get(keyword);

    setTempKeywords((prev) => prev.filter((item) => item !== keyword));
    setSelectedRecommendedKeywords((prev) =>
      prev.filter((item) => item !== keyword)
    );

    if (!existingKeyword?.placeKeywordId) {
      return;
    }

    try {
      setDeletingKeywordKey(keyword);

      const res = await fetch("/api/place-keyword-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeKeywordId: existingKeyword.placeKeywordId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "키워드 삭제 실패");
      }

      await fetchPlaces();

      if (selectedStoreIndex !== null) {
        setTimeout(() => {
          setSelectedStoreIndex((currentIndex) => {
            if (currentIndex === null) return null;
            return currentIndex;
          });
        }, 0);
      }
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "키워드 삭제 중 오류가 났어요."
      );
      await fetchPlaces();

      if (selectedStoreIndex !== null) {
        const latestStore = stores[selectedStoreIndex];
        const latestKeywords = latestStore?.keywords.map((item) => item.keyword) ?? [];
        setTempKeywords(latestKeywords);
        setSelectedRecommendedKeywords(
          getDefaultRecommendedKeywords(latestStore || selectedStore)
            .map((item) => item.keyword)
            .filter((item) => latestKeywords.includes(item))
        );
      }
    } finally {
      setDeletingKeywordKey(null);
    }
  };

  const saveKeywords = async () => {
    if (selectedStoreIndex === null) return;

    const targetStore = stores[selectedStoreIndex];
    if (!targetStore?.dbId) {
      alert("매장 정보가 올바르지 않습니다.");
      return;
    }

    const recommendedMap = new Map(
      getDefaultRecommendedKeywords(targetStore).map((item) => [
        item.keyword,
        item.monthly || "",
      ])
    );

    try {
      const existingKeywordSet = new Set(targetStore.keywords.map((k) => k.keyword));

      const keywordsToCreate = tempKeywords.filter(
        (keyword) => !existingKeywordSet.has(keyword)
      );

      await Promise.all(
        keywordsToCreate.map(async (keyword) => {
          const monthly = recommendedMap.get(keyword) || "";
          const totalVolume =
            monthly && /^\d+$/.test(monthly.replace(/,/g, ""))
              ? Number(monthly.replace(/,/g, ""))
              : null;

          const res = await fetch("/api/place-keyword-save", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              placeId: targetStore.dbId,
              keyword,
              mobileVolume: null,
              pcVolume: null,
              totalVolume,
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `${keyword} 저장 실패`);
          }
        })
      );

      await fetchPlaces();
      closeKeywordModal();
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "키워드 저장 중 오류가 났어요."
      );
    }
  };

  const handleCheckRanks = async (filteredIndex: number) => {
    const targetStore = filteredStores[filteredIndex];
    const realIndex = stores.findIndex(
      (item) =>
        item.name === targetStore.name &&
        item.address === targetStore.address &&
        item.dbId === targetStore.dbId
    );

    if (realIndex === -1) return;

    const target = stores[realIndex];

    if (!target.placeId) {
      alert("placeId가 없어 순위 조회를 할 수 없어요. 매장을 다시 등록해주세요.");
      return;
    }

    if (target.keywords.length === 0) {
      alert("먼저 키워드를 등록해주세요.");
      return;
    }

    setCheckingStoreIndex(realIndex);

    try {
      const updatedKeywords = await Promise.all(
        target.keywords.map(async (item) => {
          const response = await fetch("/api/check-place-rank", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              keyword: item.keyword,
              placeId: target.placeId,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            return {
              ...item,
              monthly: item.monthly || "-",
              mobile: "-",
              pc: "-",
              rank: "오류",
            };
          }

          if (item.placeKeywordId && data.rank && data.rank !== "-") {
            try {
              await fetch("/api/place-rank-history-save", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  placeKeywordId: item.placeKeywordId,
                  rank: Number(String(data.rank).match(/\d+/)?.[0] ?? 0),
                }),
              });
            } catch (historyError) {
              console.error("rank history save error", historyError);
            }
          }

          return {
            ...item,
            monthly: data.monthly || item.monthly || "-",
            mobile: data.mobile || "-",
            pc: data.pc || "-",
            rank: data.rank || "-",
          };
        })
      );

      setStores((prev) =>
        prev.map((store, index) =>
          index === realIndex
            ? {
                ...store,
                keywords: updatedKeywords,
              }
            : store
        )
      );
    } catch (error) {
      console.error(error);
      alert("순위 조회 중 오류가 났어요.");
    } finally {
      await fetchPlaces();
      setCheckingStoreIndex(null);
    }
  };


const goToPlaceDetail = (filteredIndex: number) => {
  const targetStore = filteredStores[filteredIndex];

  const realIndex = stores.findIndex(
    (item) =>
      item.name === targetStore.name &&
      item.address === targetStore.address &&
      item.dbId === targetStore.dbId
  );

  if (realIndex === -1) return;

  const store = stores[realIndex];
  if (!store.dbId) {
    alert("상세 페이지로 이동할 매장 ID가 없어요.");
    return;
  }

  router.push(`/place/${store.dbId}`);
};

  const handleDeleteStore = async (store: Store) => {
    if (!store.dbId) {
      alert("삭제할 매장 ID가 없어요.");
      return;
    }

    const ok = window.confirm(
      `[${store.name}] 매장을 삭제할까요?\n삭제하면 연결된 키워드/순위 데이터도 함께 사라질 수 있어요.`
    );

    if (!ok) return;

    try {
      setDeletingStoreId(store.dbId);

      const res = await fetch("/api/place-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: store.dbId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "매장 삭제 실패");
        return;
      }

      await fetchPlaces();
    } catch (error) {
      console.error(error);
      alert("매장 삭제 중 오류가 났어요.");
    } finally {
      setDeletingStoreId(null);
    }
  };
const handleToggleTrackingByStore = async (store: Store) => {
  const firstKeyword = store.keywords[0];

  if (!firstKeyword?.placeKeywordId) {
    alert("먼저 키워드를 등록해주세요.");
    return;
  }

  const placeKeywordId = firstKeyword.placeKeywordId;
  const nextValue = !firstKeyword.isTracking;

  try {
    setTrackingLoadingKeywordId(placeKeywordId);

    const res = await fetch("/api/toggle-tracking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        placeKeywordId,
        isTracking: nextValue,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "자동추적 상태 변경 실패");
      return;
    }

    setStores((prev) =>
      prev.map((item) => {
        if (item.dbId !== store.dbId) return item;

        return {
          ...item,
          keywords: item.keywords.map((keyword, index) =>
            index === 0
              ? {
                  ...keyword,
                  isTracking: nextValue,
                }
              : keyword
          ),
        };
      })
    );
  } catch (e) {
    console.error(e);
    alert("에러 발생");
  } finally {
    setTrackingLoadingKeywordId(null);
  }
};






return (
  <>
    <TopNav active="place" />

      <main className="min-h-screen b‹g-[#f3f5f9] text-[#111827]">
        <section className="mx-auto max-w-[1280px] px-6 py-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[28px] font-black tracking-[-0.02em] text-[#111827]">
                  매장 순위 추적
                </h1>
                <span className="text-[18px] text-[#9ca3af]">ⓘ</span>
              </div>

              <p className="mt-3 text-[14px] leading-7 text-[#6b7280]">
                스마트플레이스 순위 추적은 네이버 지도에 등록된 가게의 노출 순위를
                확인하실 수 있습니다.
              </p>
            </div>

            <button
              onClick={openRegisterModal}
              className="h-[46px] min-w-[118px] rounded-[14px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(139,44,245,0.18)] transition hover:opacity-95"
            >
              매장 등록
            </button>
          </div>

          <div className="mt-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-[22px] font-black tracking-[-0.02em] text-[#111827]">
                  등록된 매장
                </h2>

                <button className="rounded-[12px] bg-[#eef1f5] px-4 py-2.5 text-[14px] font-semibold text-[#374151]">
                  매장 관리
                </button>
              </div>

              <p className="mt-5 text-[13px] text-[#6b7280]">
                {placeLoading ? "📍 매장 목록 불러오는 중..." : "📍 기준 순위 조회중"}
              </p>
            </div>

            <div className="w-full xl:w-[420px]">
              <div className="relative">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="등록된 플레이스 검색"
                  className="h-[46px] w-full rounded-[14px] border border-[#d9dee7] bg-white px-4 pr-12 text-[14px] text-[#111827] outline-none placeholder:text-[#b7bec8] focus:border-[#8b2cf5]"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[18px] text-[#111827]">
                  🔍
                </div>
              </div>

              <div className="mt-3 text-right text-[12px] text-[#6b7280]">
                ⓘ IP, 설정한 위치, 시간에 따라 순위 오차가 발생할 수 있습니다.
              </div>
            </div>
          </div>

          <div className="mt-7 space-y-5">
            {filteredStores.map((store, index) => {
              const realIndex = stores.findIndex(
                (item) =>
                  item.name === store.name &&
                  item.address === store.address &&
                  item.dbId === store.dbId
              );

              const summaryKeyword = store.keywords[0];
              const trackingLabel = summaryKeyword?.isTracking ? "ON" : "OFF";

              return (
                <div
                  key={`${store.dbId || store.placeId || store.name}-${store.address}-${index}`}
                  className="rounded-[20px] border border-[#e5e9f0] bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.04)]"
                >
                  <div className="mb-6 flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                    <div className="flex gap-4">
                      {store.image ? (
                        <img
                          src={store.image}
                          alt={store.name}
                          className="h-[72px] w-[72px] rounded-[14px] object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[14px] bg-[#eef0f3] text-[12px] text-[#9ca3af]">
                          이미지
                        </div>
                      )}

                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-[17px] font-black tracking-[-0.01em] text-[#111827]">
                            {store.name}
                          </h3>
                          <span className="text-[14px] text-[#6b7280]">
                            {store.category}
                          </span>
                          <span className="text-[14px] text-[#c6cad3]">|</span>
                          <span className="text-[14px] text-[#374151]">
                            {store.address}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-5 text-[13px] text-[#6b7280]">
                          <span>
                            검색량{" "}
                            <strong className="text-[13px] font-bold text-[#111827]">
                              {summaryKeyword
                                ? formatCount(summaryKeyword.monthly)
                                : "-"}
                            </strong>
                          </span>
                          <span>
                            📱 {summaryKeyword ? formatCount(summaryKeyword.mobile) : "-"}
                          </span>
                          <span>
                            🖥 {summaryKeyword ? formatCount(summaryKeyword.pc) : "-"}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px]">
                          <span className="text-[#6b7280]">매장 바로가기</span>

                          {store.mobilePlaceLink ? (
                            <a
                              href={store.mobilePlaceLink}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-[#111827] underline underline-offset-2"
                            >
                              모바일
                            </a>
                          ) : (
                            <span className="text-[#b7bec8]">모바일 없음</span>
                          )}

                          {store.pcPlaceLink ? (
                            <a
                              href={store.pcPlaceLink}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-[#111827] underline underline-offset-2"
                            >
                              PC
                            </a>
                          ) : (
                            <span className="text-[#b7bec8]">PC 없음</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="px-1 text-[18px] text-[#374151]">📌</div>

                      <button
                        onClick={() => goToPlaceDetail(index)}
                        className="rounded-[10px] bg-[#f1f3f6] px-4 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#e9edf3]"
                      >
                        {checkingStoreIndex === realIndex
                          ? "조회중..."
                          : "순위 변화 보기"}
                      </button>

                      <button
                        onClick={() => handleToggleTrackingByStore(store)}
                        disabled={
                          !store.keywords[0]?.placeKeywordId ||
                          trackingLoadingKeywordId === store.keywords[0]?.placeKeywordId
                        }
                        className="rounded-[10px] bg-[#f1f3f6] px-4 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#e9edf3] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        자동 추적{" "}
                        <span
                          className={
                            trackingLabel === "ON"
                              ? "text-[#10b981]"
                              : "text-[#ff6b6b]"
                          }
                        >
                          {trackingLoadingKeywordId === store.keywords[0]?.placeKeywordId
                            ? "변경중..."
                            : trackingLabel}
                        </span>
                      </button>

                      <button
                        onClick={() => openKeywordModal(index)}
                        className="rounded-[10px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-95"
                      >
                        키워드 관리
                      </button>

                      <button
                        onClick={() => handleDeleteStore(store)}
                        disabled={deletingStoreId === store.dbId}
                        className="px-1 text-[20px] text-[#4b5563] disabled:cursor-not-allowed disabled:opacity-50"
                        title="매장 삭제"
                      >
                        {deletingStoreId === store.dbId ? "…" : "⋮"}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[16px] border border-[#e5e9f0]">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-[#f4f6f9]">
                        <tr>
                          <th className="w-[44%] px-7 py-4 text-left text-[13px] font-bold text-[#374151]">
                            키워드
                          </th>
                          <th className="w-[14%] px-4 py-4 text-right text-[13px] font-bold text-[#374151]">
                            월 검색량
                          </th>
                          <th className="w-[14%] px-4 py-4 text-right text-[13px] font-bold text-[#374151]">
                            📱 모바일
                          </th>
                          <th className="w-[14%] px-4 py-4 text-right text-[13px] font-bold text-[#374151]">
                            🖥 PC
                          </th>
                          <th className="w-[14%] px-7 py-4 text-right text-[13px] font-bold text-[#374151]">
                            검색 순위
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {store.keywords.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-6 py-14 text-center text-[13px] leading-7 text-[#6b7280]"
                            >
                              지금 키워드를 등록하고, 내 매장의 키워드 별 순위를
                              확인해보세요.
                              <br />
                              <span className="font-bold text-[#4b5563]">
                                [키워드 관리]
                              </span>
                              버튼을 눌러 시작할 수 있어요.
                            </td>
                          </tr>
                        ) : (
                          store.keywords.map((item, i) => {
                            const rankMeta = getRankMeta(item.rank);

                            return (
                              <tr
                                key={`${item.keyword}-${i}`}
                                className="border-t border-[#e5e7eb]"
                              >
                                <td className="px-7 py-5 text-[14px] font-medium text-[#111827]">
                                  {item.keyword}
                                </td>
                                <td className="px-4 py-5 text-right text-[14px] font-bold text-[#111827]">
                                  {formatCount(item.monthly)}
                                </td>
                                <td className="px-4 py-5 text-right text-[14px] text-[#8b95a1]">
                                  {formatCount(item.mobile)}
                                </td>
                                <td className="px-4 py-5 text-right text-[14px] text-[#8b95a1]">
                                  {formatCount(item.pc)}
                                </td>
                                <td className="px-7 py-5 text-right">
                                  <div className="text-[14px] font-bold text-[#111827]">
                                    {rankMeta.main}
                                  </div>
                                  <div className="mt-1 text-[12px] font-medium text-[#98a2b3]">
                                    {rankMeta.sub}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {!placeLoading && filteredStores.length === 0 && (
              <div className="rounded-[20px] border border-dashed border-[#d7dce5] bg-white px-6 py-14 text-center text-[14px] text-[#6b7280]">
                등록된 매장이 없습니다.
                <br />
                우측 상단의 <span className="font-bold text-[#111827]">[매장 등록]</span> 버튼으로 시작해보세요.
              </div>
            )}
          </div>
        </section>

        {isRegisterModalOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
            onClick={closeRegisterModal}
          >
            <div className="flex min-h-screen items-center justify-center p-4">
              <div
                className="w-full max-w-[860px] rounded-[18px] bg-[#f7f7f8] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-[#e5e7eb] px-6 py-5">
                  <h2 className="text-[24px] font-black tracking-[-0.02em] text-black">
                    매장등록
                  </h2>
                </div>

                <div className="px-6 py-8 md:px-8">
                  <div className="flex overflow-hidden rounded-[16px] border-2 border-[#6d28ff] bg-white">
                    <input
                      type="text"
                      value={placeQuery}
                      onChange={(e) => setPlaceQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handlePlaceSearch();
                      }}
                      placeholder="매장 이름을 검색하세요"
                      className="h-[56px] flex-1 bg-white px-5 text-[15px] text-[#111827] outline-none placeholder:text-[#a8afbb]"
                    />

                    <button
                      onClick={handlePlaceSearch}
                      className="min-w-[110px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[15px] font-bold text-white"
                    >
                      {placeSearchLoading ? "검색중" : "검색"}
                    </button>
                  </div>

                  {placeSearchError && (
                    <p className="mt-4 text-[13px] font-medium text-red-600">
                      {placeSearchError}
                    </p>
                  )}

                  <div className="mt-5 min-h-[220px]">
                    {placeResults.length > 0 && (
                      <div className="overflow-hidden rounded-[14px] border border-[#e5e7eb] bg-white">
                        {placeResults.map((item, index) => (
                          <button
                            key={`${item.title}-${item.address}-${index}`}
                            onClick={() => handleRegisterPlace(item)}
                            className="block w-full border-b border-[#e5e7eb] px-5 py-5 text-left transition last:border-b-0 hover:bg-[#fafafa]"
                          >
                            <div className="flex items-center gap-4">
                              {item.image ? (
                                <img
                                  src={getProxyImageUrl(item.image)}
                                  alt={item.title}
                                  className="h-[56px] w-[56px] rounded-[12px] object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[12px] bg-[#eef0f3] text-[11px] text-[#9ca3af]">
                                  이미지
                                </div>
                              )}

                              <div className="flex-1">
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <span className="text-[16px] font-bold text-[#4f46e5]">
                                    {item.title}
                                  </span>
                                  <span className="text-[13px] font-medium text-[#111827]">
                                    {item.category.split(">").pop()?.trim() ||
                                      item.category}
                                  </span>
                                </div>

                                <div className="mt-2 text-[13px] text-[#9ca3af]">
                                  {item.address}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {!placeSearchLoading &&
                      placeQuery.trim() &&
                      !placeSearchError &&
                      placeResults.length === 0 && (
                        <div className="mt-6 rounded-[14px] border border-dashed border-[#d1d5db] px-6 py-10 text-center text-[13px] text-[#9ca3af]">
                          검색 결과가 없습니다.
                        </div>
                      )}
                  </div>

                  <div className="mt-8 flex justify-end">
                    <button
                      onClick={closeRegisterModal}
                      className="h-[42px] rounded-[12px] bg-[#efeff3] px-6 text-[14px] font-bold text-[#222]"
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isKeywordModalOpen && selectedStore && (
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
            onClick={closeKeywordModal}
          >
            <div className="flex min-h-screen items-center justify-center p-4">
              <div
                className="w-full max-w-[860px] rounded-[18px] bg-[#f7f7f8] px-8 py-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-[34px] font-black leading-none tracking-[-0.03em] text-black">
                  키워드 관리
                </h2>
                <p className="mt-3 text-[16px] leading-[1.5] text-[#667085]">
                  해당 키워드로 검색 시 플레이스 순위를 확인할 수 있어요. 키워드를
                  추가해보세요.
                </p>

                <div className="mt-6 border-t border-[#e5e7eb] pt-6">
                  <div className="flex items-center gap-5">
                    {selectedStore.image ? (
                      <img
                        src={selectedStore.image}
                        alt={selectedStore.name}
                        className="h-[84px] w-[84px] rounded-[14px] object-cover"
                      />
                    ) : (
                      <div className="flex h-[84px] w-[84px] items-center justify-center rounded-[14px] bg-[#eef0f3] text-[13px] text-[#9ca3af]">
                        이미지
                      </div>
                    )}

                    <div>
                      <div className="text-[22px] font-black tracking-[-0.02em] text-black">
                        {selectedStore.name}
                      </div>
                      <div className="mt-1 text-[16px] text-black">
                        {selectedStore.category}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-[18px] font-black tracking-[-0.02em] text-black">
                      키워드 선택 추가
                    </h3>
                    <p className="mt-2 text-[14px] leading-[1.5] text-[#667085]">
                      플레이스에서 추천하는 키워드입니다. 원하는 키워드를 선택하여
                      추가하세요.
                    </p>

                    <div className="mt-4 border-t border-[#e5e7eb] pt-4">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-3">
                        {recommendedKeywords.map((item) => {
                          const checked = selectedRecommendedKeywords.includes(
                            item.keyword
                          );

                          return (
                            <label
                              key={item.keyword}
                              className="flex cursor-pointer items-center gap-3"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleRecommendedKeyword(item.keyword)
                                }
                                className="h-[18px] w-[18px] rounded border-[#94a3b8]"
                              />
                              <span className="text-[15px] font-medium text-black">
                                {item.keyword}
                              </span>
                              {item.monthly && (
                                <span className="text-[12px] font-semibold text-[#98a2b3]">
                                  월 검색량 {formatCount(item.monthly)}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-[18px] font-black tracking-[-0.02em] text-black">
                      키워드 직접 추가
                    </h3>

                    <div className="mt-3 flex overflow-hidden rounded-[14px] border border-[#d7dce5] bg-white">
                      <input
                        type="text"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addDirectKeywords();
                        }}
                        placeholder="키워드를 콤마(,)로 구분하여 입력 (키워드당 최대 20자)"
                        className="h-[60px] flex-1 px-5 text-[15px] text-[#111827] outline-none placeholder:text-[#b0b7c3]"
                      />
                      <button
                        onClick={addDirectKeywords}
                        className="min-w-[120px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-5 text-[16px] font-black text-white"
                      >
                        추가
                      </button>
                    </div>
                  </div>

                  <div className="mt-8">
                    <h3 className="text-[18px] font-black tracking-[-0.02em] text-black">
                      키워드 순서 변경
                    </h3>
                    <p className="mt-2 text-[14px] leading-[1.5] text-[#667085]">
                      키워드를 드래그 앤 드롭하여 순서를 변경하세요.
                      <br />
                      상위 3개의 키워드는 전체 목록에서도 검색량과 순위를 쉽게
                      확인하실 수 있습니다.
                    </p>

                    <div className="mt-4 border-t border-[#e5e7eb]">
                      {tempKeywords.length === 0 ? (
                        <div className="py-8 text-[14px] text-[#98a2b3]">
                          추가된 키워드가 없습니다.
                        </div>
                      ) : (
                        tempKeywords.map((keyword, index) => {
                          const existingKeyword =
                            selectedStoreSavedKeywordMap.get(keyword);
                          const isDeleting = deletingKeywordKey === keyword;

                          return (
                            <div
                              key={`${keyword}-${index}`}
                              draggable={!isDeleting}
                              onDragStart={() => setDraggingKeywordIndex(index)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (
                                  draggingKeywordIndex === null ||
                                  draggingKeywordIndex === index ||
                                  isDeleting
                                ) {
                                  return;
                                }

                                setTempKeywords((prev) =>
                                  moveItem(prev, draggingKeywordIndex, index)
                                );
                                setDraggingKeywordIndex(null);
                              }}
                              onDragEnd={() => setDraggingKeywordIndex(null)}
                              className="flex items-center justify-between border-b border-[#e5e7eb] py-5"
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  className="text-[18px] text-[#98a2b3]"
                                >
                                  ⠿
                                </button>

                                <div className="flex items-center gap-2">
                                  <span className="text-[16px] font-bold text-black">
                                    {keyword}
                                  </span>

                                  {index < 3 && (
                                    <span className="text-[12px] font-bold text-[#7c3aed]">
                                      전체 상품 목록에 표시됨
                                    </span>
                                  )}

                                  {existingKeyword?.placeKeywordId && (
                                    <span className="text-[12px] font-semibold text-[#94a3b8]">
                                      저장됨
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={() => removeTempKeyword(keyword)}
                                disabled={isDeleting}
                                className="text-[20px] text-[#374151] disabled:opacity-50"
                              >
                                {isDeleting ? "…" : "✕"}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end gap-3">
                    <button
                      onClick={closeKeywordModal}
                      className="h-[56px] min-w-[96px] rounded-[14px] bg-[#efeff3] px-6 text-[16px] font-black text-[#222]"
                    >
                      취소
                    </button>
                    <button
                      onClick={saveKeywords}
                      className="h-[56px] min-w-[96px] rounded-[14px] bg-gradient-to-b from-[#8b2cf5] to-[#6d13f2] px-6 text-[16px] font-black text-white"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
     
      </main>
    </>
  );
}