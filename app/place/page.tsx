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
  currentRank?: string;
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
  x?: string;
y?: string;
  keywords: KeywordItem[];
  latestUpdatedAtText?: string;

  placeMonthlyVolume?: number;
  placeMobileVolume?: number;
  placePcVolume?: number;
  jibunAddress?: string | null;
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
    currentRank?: string;
  }[];
};

type PlaceItem = {
  id: string;
  userId: string;
  name: string;
  category: string | null;
  address: string | null;
  jibunAddress?: string | null;
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

function getRankMeta(rank?: string | number | null) {
  if (rank === null || rank === undefined || rank === "" || rank === "-" || rank === "오류") {
    return {
      main: "-",
      sub: "-",
    };
  }

  if (typeof rank === "number") {
    if (!Number.isFinite(rank) || rank <= 0) {
      return {
        main: "-",
        sub: "-",
      };
    }

    const PAGE_SIZE = 70;
    const page = Math.ceil(rank / PAGE_SIZE);
    const pagePosition = ((rank - 1) % PAGE_SIZE) + 1;

    return {
      main: `${rank}위`,
      sub: `${page}p ${pagePosition}위`,
    };
  }

  const matched = String(rank).match(/\d+/);
  if (!matched) {
    return {
      main: String(rank),
      sub: "-",
    };
  }

  const numericRank = Number(matched[0]);
  const PAGE_SIZE = 70;
  const page = Math.ceil(numericRank / PAGE_SIZE);
  const pagePosition = ((numericRank - 1) % PAGE_SIZE) + 1;

  return {
    main: `${numericRank}위`,
    sub: `${page}p ${pagePosition}위`,
  };
}

function extractArea(address?: string | null) {
  if (!address) return "";

  const parts = String(address)
    .split(" ")
    .map((v) => v.trim())
    .filter(Boolean);

  if (!parts.length) return "";

  // 1️⃣ 행정동 찾기 (한남동, 연남동 등)
  const adminToken =
    [...parts].reverse().find((part) => /(동|읍|면|리)$/.test(part)) || "";

  if (adminToken) {
    return adminToken;
  }

  // ❌ 여기서 이상한 값(1층, 지하1층 등) 쓰지 않음
  return "";
}


function getDefaultRecommendedKeywords(store: Store): RecommendedKeyword[] {
  const area = extractArea(store.jibunAddress);

  if (store.category.includes("필라테스")) {
    return [
      { keyword: area ? `${area} 필라테스` : "필라테스" },
      { keyword: area ? `${area} 기구필라테스` : "기구필라테스" },
      { keyword: area ? `${area} 자세교정` : "자세교정 필라테스" },
      { keyword: "재활 필라테스" },
      { keyword: "체형교정 필라테스" },
    ];
  }

  return [
  { keyword: area ? `${area} ${store.category}` : `${store.category}` },
  { keyword: area ? `${area} 맛집` : `${store.category} 맛집` },
  { keyword: area ? `${area} 데이트` : `${store.category} 데이트` },
  { keyword: `${store.category} 추천` },
  { keyword: `${store.name} 후기` },
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
  jibunAddress: place.jibunAddress ?? null,
  placeId: publicPlaceId,
    mobilePlaceLink: links.mobilePlaceLink,
    pcPlaceLink: links.pcPlaceLink,
    image: place.imageUrl ? getProxyImageUrl(place.imageUrl) : "",

    // ✅ 추가 (API에서 받은 매장 검색량)
    placeMonthlyVolume: (place as any).placeMonthlyVolume ?? 0,
    placeMobileVolume: (place as any).placeMobileVolume ?? 0,
    placePcVolume: (place as any).placePcVolume ?? 0,

    latestUpdatedAtText: (place as any).latestUpdatedAtText ?? null,

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
currentRank: undefined,
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
  targetName: target.name,
  x: target.x,
  y: target.y,
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

        // 숫자 순위일 때만 히스토리 저장
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

        // ✅ 화면에는 현재 조회 결과를 그대로 반영
        return {
  ...item,
  monthly: data.monthly || item.monthly || "-",
  mobile: data.mobile || "-",
  pc: data.pc || "-",
  currentRank: data.rank ?? "-",
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
    // ❌ 여기서 fetchPlaces() 하면 예전 rankHistory 값이 다시 덮일 수 있음
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
  if (!store.dbId) {
    alert("placeId가 없습니다.");
    return;
  }

  if (!store.keywords.length) {
    alert("먼저 키워드를 등록해주세요.");
    return;
  }

  const nextValue = !store.keywords.every((k) => k.isTracking);

  try {
    setTrackingLoadingKeywordId(store.dbId);

    const res = await fetch("/api/toggle-tracking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        placeId: store.dbId,
        isTracking: nextValue,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "자동추적 상태 변경 실패");
      return;
    }

    // ✅ 모든 키워드 ON/OFF
    setStores((prev) =>
      prev.map((item) =>
        item.dbId === store.dbId
          ? {
              ...item,
              keywords: item.keywords.map((keyword) => ({
                ...keyword,
                isTracking: nextValue,
              })),
            }
          : item
      )
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

    <main className="min-h-screen bg-[#f5f6f8] text-[#111827]">
      <section className="mx-auto max-w-[1180px] px-5 py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[30px] font-black tracking-[-0.03em] text-[#111827]">
                매장 순위 추적
              </h1>
              <span className="text-[16px] text-[#b0b8c5]">ⓘ</span>
            </div>

            <p className="mt-2 text-[13px] leading-6 text-[#6b7280]">
              스마트플레이스 순위 추적은 네이버 지도에 등록된 가게의 노출 순위를
              확인하실 수 있습니다.
            </p>
          </div>

          <button
            onClick={openRegisterModal}
            className="h-[40px] min-w-[104px] rounded-[10px] bg-[#6d28d9] px-4 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-95"
          >
            매장 등록
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#111827]">
                등록된 매장
              </h2>

              <button className="h-[34px] rounded-[9px] bg-[#eef1f5] px-3 text-[12px] font-semibold text-[#4b5563]">
                매장 관리
              </button>
            </div>

            <p className="mt-3 text-[12px] text-[#7b8494]">
              {placeLoading ? "📍 매장 목록 불러오는 중..." : "📍 기준 순위 조회중"}
            </p>
          </div>

          <div className="w-full lg:w-[360px]">
            <div className="relative">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="등록된 플레이스 검색"
                className="h-[40px] w-full rounded-[10px] border border-[#d8dde6] bg-white px-4 pr-11 text-[13px] text-[#111827] outline-none placeholder:text-[#b8c0cc] focus:border-[#6d28d9]"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-[#6b7280]">
                🔍
              </div>
            </div>

            <div className="mt-2 text-right text-[11px] text-[#8b95a1]">
              ⓘ IP, 설정한 위치, 시간에 따라 순위 오차가 발생할 수 있습니다.
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {filteredStores.map((store, index) => {
            const realIndex = stores.findIndex(
              (item) =>
                item.name === store.name &&
                item.address === store.address &&
                item.dbId === store.dbId
            );

            const summaryKeyword = store.keywords[0];
            const trackingLabel = summaryKeyword?.isTracking ? "ON" : "OFF";
            const isTrackingLoading = trackingLoadingKeywordId === store.dbId;
            const isChecking = checkingStoreIndex === realIndex;
            const isDeleting = deletingStoreId === store.dbId;

            return (
              <div
                key={`${store.dbId || store.placeId || store.name}-${store.address}-${index}`}
                className="rounded-[16px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 gap-3">
                    {store.image ? (
                      <img
                        src={store.image}
                        alt={store.name}
                        className="h-[60px] w-[60px] rounded-[10px] object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[10px] bg-[#eef1f5] text-[11px] text-[#9ca3af]">
                        이미지
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[#111827]">
                          {store.name}
                        </h3>
                        <span className="text-[12px] text-[#6b7280]">
                          {store.category}
                        </span>
                        <span className="text-[12px] text-[#c4c9d1]">|</span>
                        <span className="truncate text-[12px] text-[#4b5563]">
                          {store.address}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6b7280]">
                        <span>
                          검색량{" "}
                          <strong className="font-semibold text-[#111827]">
                            {formatCount(store.placeMonthlyVolume)}
                          </strong>
                        </span>
                        <span>📱 {formatCount(store.placeMobileVolume)}</span>
                        <span>🖥 {formatCount(store.placePcVolume)}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                        <span className="text-[#8b95a1]">매장 바로가기</span>

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
                          <span className="text-[#c0c6d0]">모바일 없음</span>
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
                          <span className="text-[#c0c6d0]">PC 없음</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <button
                      onClick={() => goToPlaceDetail(index)}
                      className="h-[32px] rounded-[9px] bg-[#f3f4f6] px-3 text-[13px] leading-none font-bold tracking-tight text-[#111827] transition hover:bg-[#e9edf3]"
                    >
                      {isChecking ? "조회중..." : "순위 변화 보기"}
                    </button>

                    <button
                      onClick={() => handleToggleTrackingByStore(store)}
                      disabled={!store.keywords.length || isTrackingLoading}
                      className="h-[32px] rounded-[9px] bg-[#f3f4f6] px-3 text-[13px] leading-none font-bold tracking-tight text-[#111827] transition hover:bg-[#e9edf3]"
                    >
                      자동 추적{" "}
                      <span
                        className={
                          trackingLabel === "ON"
                            ? "text-[#10b981]"
                            : "text-[#ef4444]"
                        }
                      >
                        {isTrackingLoading ? "변경중..." : trackingLabel}
                      </span>
                    </button>

                    <button
                      onClick={() => openKeywordModal(index)}
                      className="h-[32px] rounded-[9px] bg-[#6d28d9] px-3 text-[13px] leading-none font-bold tracking-tight text-white transition hover:opacity-95"
                    >
                      키워드 관리
                    </button>

                    <button
                      onClick={() => handleCheckRanks(index)}
                      disabled={isChecking}
                      className="h-[32px] rounded-[9px] bg-[#f3f4f6] px-3 text-[13px] leading-none font-bold tracking-tight text-[#111827] transition hover:bg-[#e9edf3]"
                    >
                      {isChecking ? "업데이트중..." : "업데이트"}
                    </button>

                    <button
                      onClick={() => handleDeleteStore(store)}
                      disabled={isDeleting}
                      className="h-[34px] rounded-[9px] bg-[#f9fafb] px-2.5 text-[15px] text-[#6b7280] transition hover:bg-[#eef1f5] disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="매장 삭제"
                      title="매장 삭제"
                    >
                      {isDeleting ? "…" : "⋮"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-[12px] border border-[#edf0f4]">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#f8fafc]">
                      <tr>
                        <th className="px-5 py-3 text-left text-[11px] font-semibold text-[#6b7280]">
                          키워드
                        </th>
                        <th className="w-[14%] px-4 py-3 text-right text-[11px] font-semibold text-[#6b7280]">
                          월 검색량
                        </th>
                        <th className="w-[14%] px-4 py-3 text-right text-[11px] font-semibold text-[#6b7280]">
                          📱 모바일
                        </th>
                        <th className="w-[14%] px-4 py-3 text-right text-[11px] font-semibold text-[#6b7280]">
                          🖥 PC
                        </th>
                        <th className="w-[14%] px-5 py-3 text-right text-[11px] font-semibold text-[#6b7280]">
                          검색 순위
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {store.keywords.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-12 text-center text-[12px] leading-6 text-[#6b7280]"
                          >
                            지금 키워드를 등록하고, 내 매장의 키워드 별 순위를
                            확인해보세요.
                            <br />
                            <span className="font-semibold text-[#4b5563]">
                              [키워드 관리]
                            </span>
                            버튼을 눌러 시작할 수 있어요.
                          </td>
                        </tr>
                      ) : (
                        store.keywords.map((item, i) => {
                          const rankMeta = getRankMeta(
                            item.currentRank ?? item.rank
                          );

                          return (
                            <tr
                              key={`${item.keyword}-${i}`}
                              className="border-t border-[#edf0f4]"
                            >
                              <td className="px-5 py-4 text-[12px] font-medium text-[#111827]">
                                {item.keyword}
                              </td>
                              <td className="px-4 py-4 text-right text-[12px] font-semibold text-[#111827]">
                                {formatCount(item.monthly)}
                              </td>
                              <td className="px-4 py-4 text-right text-[12px] text-[#7b8494]">
                                {formatCount(item.mobile)}
                              </td>
                              <td className="px-4 py-4 text-right text-[12px] text-[#7b8494]">
                                {formatCount(item.pc)}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="text-[12px] font-semibold text-[#111827]">
                                  {rankMeta.main}
                                </div>
                                <div className="mt-0.5 text-[10px] text-[#98a2b3]">
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

                <div className="mt-3 text-right text-[11px] text-[#98a2b3]">
                  최근 업데이트: {store.latestUpdatedAtText ?? "-"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[640px] rounded-[18px] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#111827]">매장 등록</h2>
              <button
                onClick={closeRegisterModal}
                className="text-[14px] text-[#6b7280]"
              >
                닫기
              </button>
            </div>

            <div className="mt-5 flex gap-2">
              <input
                type="text"
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handlePlaceSearch();
                  }
                }}
                placeholder="매장 이름을 입력해주세요"
                className="h-[42px] flex-1 rounded-[10px] border border-[#d8dde6] px-4 text-[13px] outline-none focus:border-[#6d28d9]"
              />
              <button
                onClick={handlePlaceSearch}
                disabled={placeSearchLoading}
                className="h-[42px] rounded-[10px] bg-[#6d28d9] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {placeSearchLoading ? "검색중..." : "검색"}
              </button>
            </div>

            {placeSearchError ? (
              <div className="mt-3 text-[12px] text-[#ef4444]">
                {placeSearchError}
              </div>
            ) : null}

            <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto">
              {placeResults.length === 0 ? (
                <div className="rounded-[12px] bg-[#f8fafc] px-4 py-10 text-center text-[12px] text-[#8b95a1]">
                  검색 결과가 여기에 표시됩니다.
                </div>
              ) : (
                placeResults.map((item, idx) => (
                  <div
                    key={`${item.title}-${item.address}-${idx}`}
                    className="flex items-start justify-between gap-3 rounded-[12px] border border-[#edf0f4] p-4"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#111827]">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[12px] text-[#6b7280]">
                        {item.category}
                      </div>
                      <div className="mt-1 text-[12px] text-[#8b95a1]">
                        {item.address}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRegisterPlace(item)}
                      className="shrink-0 rounded-[9px] bg-[#111827] px-3 py-2 text-[12px] font-semibold text-white"
                    >
                      등록
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isKeywordModalOpen && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[720px] rounded-[18px] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-bold text-[#111827]">
                  키워드 관리
                </h2>
                <p className="mt-1 text-[12px] text-[#8b95a1]">
                  {selectedStore.name}
                </p>
              </div>

              <button
                onClick={closeKeywordModal}
                className="text-[14px] text-[#6b7280]"
              >
                닫기
              </button>
            </div>

            <div className="mt-5">
              <div className="flex gap-2">
                <input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDirectKeywords();
                    }
                  }}
                  placeholder="키워드 입력 (쉼표로 여러개)"
                  className="h-[42px] flex-1 rounded-[10px] border border-[#d8dde6] px-4 text-[13px] outline-none focus:border-[#6d28d9]"
                />
                <button
                  onClick={addDirectKeywords}
                  className="h-[42px] rounded-[10px] bg-[#111827] px-4 text-[13px] font-semibold text-white"
                >
                  추가
                </button>
              </div>

              {recommendedKeywords.length > 0 && (
                <div className="mt-5">
                  <div className="text-[12px] font-semibold text-[#6b7280]">
                    추천 키워드
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {recommendedKeywords.map((item) => {
                      const selected = selectedRecommendedKeywords.includes(
                        item.keyword
                      );

                      return (
                        <button
                          key={item.keyword}
                          onClick={() => toggleRecommendedKeyword(item.keyword)}
                          className={
                            selected
                              ? "rounded-[999px] bg-[#ede9fe] px-3 py-1.5 text-[12px] font-semibold text-[#6d28d9]"
                              : "rounded-[999px] bg-[#f3f4f6] px-3 py-1.5 text-[12px] font-medium text-[#4b5563]"
                          }
                        >
                          {item.keyword}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-5">
                <div className="text-[12px] font-semibold text-[#6b7280]">
                  등록 예정 키워드
                </div>

                <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto rounded-[12px] border border-[#edf0f4] p-3">
                  {tempKeywords.length === 0 ? (
                    <div className="py-8 text-center text-[12px] text-[#98a2b3]">
                      아직 추가된 키워드가 없습니다.
                    </div>
                  ) : (
                    tempKeywords.map((keyword, index) => (
                      <div
                        key={`${keyword}-${index}`}
                        draggable
                        onDragStart={() => setDraggingKeywordIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (
                            draggingKeywordIndex === null ||
                            draggingKeywordIndex === index
                          ) {
                            return;
                          }

                          setTempKeywords((prev) =>
                            moveItem(prev, draggingKeywordIndex, index)
                          );
                          setDraggingKeywordIndex(null);
                        }}
                        className="flex items-center justify-between rounded-[10px] bg-[#f8fafc] px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="cursor-grab text-[12px] text-[#9ca3af]">
                            ☰
                          </span>
                          <span className="text-[13px] text-[#111827]">
                            {keyword}
                          </span>
                        </div>

                        <button
                          onClick={() => removeTempKeyword(keyword)}
                          disabled={deletingKeywordKey === keyword}
                          className="text-[12px] font-medium text-[#ef4444] disabled:opacity-60"
                        >
                          {deletingKeywordKey === keyword ? "삭제중..." : "삭제"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  onClick={closeKeywordModal}
                  className="h-[40px] rounded-[10px] bg-[#f3f4f6] px-4 text-[13px] font-semibold text-[#4b5563]"
                >
                  취소
                </button>
                <button
                  onClick={saveKeywords}
                  className="h-[40px] rounded-[10px] bg-[#6d28d9] px-4 text-[13px] font-semibold text-white"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  </>
);
}