"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { Pin, Trash2 } from "lucide-react";

type KeywordItem = {
  keyword: string;
  monthly: string;
  mobile: string;
  pc: string;
  rank: string;
  currentRank?: string;
  previousRank?: string;
  rankChange?: number | null;
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
  isPinned?: boolean;
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
  updatedAt?: string;
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
  rankPinned?: boolean;
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
const MAX_KEYWORDS_PER_STORE = 10;
const RANK_CHECK_BATCH_SIZE = 3;

function chunkArray<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function formatKST(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function computeLatestUpdatedAtText(place: PlaceItem): string | undefined {
  let maxMs = 0;

  for (const k of place.keywords || []) {
    const u = k.updatedAt;
    if (!u) continue;
    const t = new Date(u).getTime();
    if (!Number.isNaN(t)) maxMs = Math.max(maxMs, t);
  }

  for (const h of place.rankHistory || []) {
    if (!h?.createdAt) continue;
    const t = new Date(h.createdAt).getTime();
    if (!Number.isNaN(t)) maxMs = Math.max(maxMs, t);
  }

  if (!maxMs) return undefined;
  return formatKST(new Date(maxMs));
}

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

  const adminToken =
    [...parts].reverse().find((part) => /(동|읍|면|리)$/.test(part)) || "";

  if (adminToken) {
    return adminToken;
  }

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

function getDateKey(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDailyRankHistory(
  rankHistory?: {
    id: string;
    placeId: string;
    keyword: string;
    rank: number;
    createdAt: string;
  }[]
) {
  if (!rankHistory || rankHistory.length === 0) return [];

  const sorted = [...rankHistory].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const dailyMap = new Map<
    string,
    {
      id: string;
      placeId: string;
      keyword: string;
      rank: number;
      createdAt: string;
    }
  >();

  for (const item of sorted) {
    const key = getDateKey(item.createdAt);

    if (!dailyMap.has(key)) {
      dailyMap.set(key, item);
    }
  }

  return Array.from(dailyMap.values()).sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
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
  const daily = getDailyRankHistory(rankHistory);
  const latest = daily[0];

  if (!latest || latest.rank === null || latest.rank === undefined) return "-";
  return String(latest.rank);
}

function getPreviousRankString(
  rankHistory?: {
    id: string;
    placeId: string;
    keyword: string;
    rank: number;
    createdAt: string;
  }[]
) {
  const daily = getDailyRankHistory(rankHistory);
  const previous = daily[1];

  if (!previous || previous.rank === null || previous.rank === undefined) {
    return "-";
  }

  return String(previous.rank);
}

function parseRankValue(rank?: string | number | null) {
  if (
    rank === null ||
    rank === undefined ||
    rank === "" ||
    rank === "-" ||
    rank === "오류"
  ) {
    return null;
  }

  if (typeof rank === "number") {
    return Number.isFinite(rank) && rank > 0 ? rank : null;
  }

  const matched = String(rank).match(/\d+/);
  if (!matched) return null;

  const num = Number(matched[0]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function getRankChangeValue(
  previousRank?: string | number | null,
  currentRank?: string | number | null
) {
  const prev = parseRankValue(previousRank);
  const curr = parseRankValue(currentRank);

  if (prev === null || curr === null) return null;

  return prev - curr;
}

function getRankChangeUi(rankChange?: number | null) {
  if (rankChange === null || rankChange === undefined || rankChange === 0) {
    return {
      text: "-",
      className: "text-[#9ca3af]",
    };
  }

  if (rankChange > 0) {
    return {
      text: `▲ ${rankChange}`,
      className: "text-[#ef4444]",
    };
  }

  return {
    text: `▼ ${Math.abs(rankChange)}`,
    className: "text-[#2563eb]",
  };
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

    placeMonthlyVolume: (place as any).placeMonthlyVolume ?? 0,
    placeMobileVolume: (place as any).placeMobileVolume ?? 0,
    placePcVolume: (place as any).placePcVolume ?? 0,

    latestUpdatedAtText:
      computeLatestUpdatedAtText(place) ||
      String(
        (place as { latestUpdatedAtText?: string | null }).latestUpdatedAtText ??
          ""
      ).trim() ||
      undefined,
    isPinned: !!place.rankPinned,

    keywords: (place.keywords || []).map((keyword) => {
      const keywordRankHistory = (place.rankHistory || []).filter(
        (history) => history.keyword === keyword.keyword
      );

      const latestRank = getLatestRankString(keywordRankHistory);
      const previousRank = getPreviousRankString(keywordRankHistory);

      return {
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
        rank: latestRank,
        currentRank: undefined,
        previousRank,
        rankChange: getRankChangeValue(previousRank, latestRank),
        placeKeywordId: keyword.id,
        isTracking: keyword.isTracking,
      };
    }),
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
  const [registeringPlaceKey, setRegisteringPlaceKey] = useState<string | null>(
    null
  );

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
  const [savingKeywords, setSavingKeywords] = useState(false);
  const [trackingLoadingKeywordId, setTrackingLoadingKeywordId] = useState<
    string | null
  >(null);
  const [deletingKeywordKey, setDeletingKeywordKey] = useState<string | null>(
    null
  );

  // --- 디자인 통일용 호버 상태값 ---
  const [isAddHovered, setIsAddHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const [updateHover, setUpdateHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [rankChangeHover, setRankChangeHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [trackingHover, setTrackingHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [kwManageHover, setKwManageHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });

  // 모달 안쪽 버튼들 호버 상태값
  const [modalSearchHovered, setModalSearchHovered] = useState(false);
  const [modalSearchMousePos, setModalSearchMousePos] = useState({ x: 0, y: 0 });
  const [registerHover, setRegisterHover] = useState<{ id: string | null; x: number; y: number; }>({ id: null, x: 0, y: 0 });
  const [saveKwHovered, setSaveKwHovered] = useState(false);
  const [saveKwMousePos, setSaveKwMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleUpdateMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setUpdateHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleRankChangeMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRankChangeHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleTrackingMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTrackingHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleKwManageMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setKwManageHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // 모달 마우스 무브 핸들러
  const handleModalSearchMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setModalSearchMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleRegisterMouseMove = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRegisterHover({ id, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleSaveKwMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setSaveKwMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

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
      if (!session?.user?.id) return;

      setPlaceLoading(true);

      const res = await fetch("/api/place-list", {
        cache: "no-store",
        credentials: "include",
      });

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
        <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center pt-24">
          <div className="text-[15px] text-[#6b7280]">불러오는 중...</div>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <TopNav active="place" />
        <main className="min-h-screen bg-[#f8fafc] flex items-center justify-center pt-24">
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
    setRegisteringPlaceKey(null);
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
    const key = `${item.title}__${item.address}__${item.link}`;
    if (registeringPlaceKey === key) return;
    try {
      setRegisteringPlaceKey(key);
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
          store.dbId &&
          ((publicPlaceId && store.placeId === publicPlaceId) ||
            (store.name === item.title && store.address === item.address))
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
    } finally {
      setRegisteringPlaceKey(null);
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
      const next = [...prev];

      for (const keyword of keywords) {
        const trimmed = keyword.trim();
        if (!trimmed) continue;

        if (next.includes(trimmed)) continue;

        if (next.length >= MAX_KEYWORDS_PER_STORE) {
          alert(`키워드는 매장당 최대 ${MAX_KEYWORDS_PER_STORE}개까지 등록할 수 있어요.`);
          break;
        }

        next.push(trimmed);
      }

      return next;
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
    if (savingKeywords) return;

    const targetStore = stores[selectedStoreIndex];
    if (!targetStore?.dbId) {
      alert("매장 정보가 올바르지 않습니다.");
      return;
    }

    if (tempKeywords.length > MAX_KEYWORDS_PER_STORE) {
      alert(`키워드는 매장당 최대 ${MAX_KEYWORDS_PER_STORE}개까지 등록할 수 있어요.`);
      return;
    }

    const recommendedMap = new Map(
      getDefaultRecommendedKeywords(targetStore).map((item) => [
        item.keyword,
        item.monthly || "",
      ])
    );

    try {
      setSavingKeywords(true);
      const existingKeywordSet = new Set(
        targetStore.keywords.map((k) => k.keyword)
      );

      const keywordsToCreate = tempKeywords.filter(
        (keyword) => !existingKeywordSet.has(keyword)
      );

      if (targetStore.keywords.length + keywordsToCreate.length > MAX_KEYWORDS_PER_STORE) {
        alert(`키워드는 매장당 최대 ${MAX_KEYWORDS_PER_STORE}개까지 등록할 수 있어요.`);
        return;
      }

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
    } finally {
      setSavingKeywords(false);
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

    if (target.keywords.length > MAX_KEYWORDS_PER_STORE) {
      alert(`키워드는 매장당 최대 ${MAX_KEYWORDS_PER_STORE}개까지만 순위 조회할 수 있어요.`);
      return;
    }

    setCheckingStoreIndex(realIndex);

    try {
      const batches = chunkArray(target.keywords, RANK_CHECK_BATCH_SIZE);

      for (const batch of batches) {
        for (const item of batch) {
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
              ...(item.placeKeywordId
                ? { placeKeywordId: item.placeKeywordId }
                : {}),
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            console.error("rank check error:", item.keyword, data);
            continue;
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
        }
      }

      await fetchPlaces();
    } catch (error) {
      console.error(error);
      alert("순위 조회 중 오류가 났어요.");
    } finally {
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

  const handleTogglePin = async (store: Store) => {
    if (!store.dbId) {
      alert("placeId가 없습니다.");
      return;
    }

    try {
      const res = await fetch("/api/place-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: store.dbId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        alert(data?.message || "핀 변경 실패");
        return;
      }

      await fetchPlaces();
    } catch (error) {
      console.error(error);
      alert("핀 변경 중 오류가 발생했습니다.");
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

      <main className="min-h-screen bg-[#f8fafc] text-[#111111] pt-24">
        <section className="mx-auto max-w-[1240px] px-5 py-5 md:px-6 lg:px-8">
          <div className="rounded-[22px] border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] md:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[22px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    플레이스 순위 추적
                  </h1>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-1 text-[11px] font-bold text-[#4b5563]">
                    PLACE
                  </span>
                </div>

                <p className="mt-1 text-[12px] leading-5 text-[#6b7280] md:text-[13px]">
                  등록된 플레이스의 검색량, 키워드, 순위를 한 화면에서 관리합니다.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
                <div className="relative w-full sm:w-[320px]">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="등록된 매장 검색"
                    className="h-[44px] w-full rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-4 pr-11 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white"
                  />
                  <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">
                    🔍
                  </div>
                </div>

                <button
                  onMouseEnter={() => setIsAddHovered(true)}
                  onMouseLeave={() => setIsAddHovered(false)}
                  onMouseMove={handleMouseMove}
                  onClick={openRegisterModal}
                  className="relative inline-flex h-[44px] min-w-[108px] items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[13px] font-bold text-white transition-all duration-300 ease-in-out"
                >
                  <span className="relative z-30 pointer-events-none">매장 등록</span>
                  <div
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    style={{
                      transformOrigin: "left",
                      transform: isAddHovered ? "scaleX(1)" : "scaleX(0)",
                      transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                      backgroundColor: "#2563EB",
                    }}
                  />
                  <div
                    className={`
                      absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
                      transition-opacity duration-200 ease-out
                      ${isAddHovered ? "opacity-100" : "opacity-0"}
                    `}
                    style={{
                      left: `${mousePos.x}px`,
                      top: `${mousePos.y}px`,
                      pointerEvents: "none",
                      zIndex: 25,
                      backgroundImage:
                        "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                      mixBlendMode: "soft-light",
                      filter:
                        "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                    }}
                  />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f3f4f6] pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[17px] font-black tracking-[-0.02em] text-[#111827]">
                    등록된 매장
                  </h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                    {filteredStores.length}개
                  </span>
                </div>

                <p className="mt-2 text-[12px] text-[#6b7280]">
                  {placeLoading ? "📍 매장 목록 불러오는 중..." : "📍 기준 순위 조회중"}
                </p>
              </div>

              <div className="text-[11px] text-[#9ca3af]">
                IP, 위치, 시간에 따라 순위 오차가 발생할 수 있습니다.
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {filteredStores.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#d1d5db] bg-white px-6 py-14 text-center shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[18px] font-bold text-[#111827]">
                  아직 등록된 매장이 없어요
                </p>
                <p className="mt-2 text-[14px] text-[#9ca3af]">
                  상단의 매장 등록 버튼으로 첫 매장을 추가해보세요.
                </p>
              </div>
            ) : (
              filteredStores.map((store, index) => {
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
                const rowId = store.dbId || String(index);

                return (
                  <div
                    key={`${store.dbId || store.placeId || store.name}-${store.address}-${index}`}
                    className="overflow-hidden rounded-[22px] border border-[#e5e7eb] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                  >
                    <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-5 py-4 md:px-6">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 gap-4">
                          {store.image ? (
                            <img
                              src={store.image}
                              alt={store.name}
                              className="h-[70px] w-[70px] shrink-0 rounded-[16px] object-cover ring-1 ring-[#e5e7eb]"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-[16px] bg-[#f3f4f6] text-[12px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb]">
                              이미지
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-[20px] font-black tracking-[-0.03em] text-[#111827]">
                                {store.name}
                              </h3>

                              {store.category ? (
                                <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#4b5563]">
                                  {store.category}
                                </span>
                              ) : null}
                            </div>

                            <p className="mt-1.5 text-[13px] text-[#6b7280]">
                              {store.address || "-"}
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                                <div className="text-[10px] font-semibold text-[#6b7280]">
                                  월 검색량
                                </div>
                                <div className="mt-1 text-[15px] font-black text-[#111827]">
                                  {formatCount(store.placeMonthlyVolume)}
                                </div>
                              </div>

                              <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                                <div className="text-[10px] font-semibold text-[#6b7280]">
                                  모바일
                                </div>
                                <div className="mt-1 text-[14px] font-extrabold text-[#111827]">
                                  {formatCount(store.placeMobileVolume)}
                                </div>
                              </div>

                              <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                                <div className="text-[10px] font-semibold text-[#6b7280]">
                                  PC
                                </div>
                                <div className="mt-1 text-[14px] font-extrabold text-[#111827]">
                                  {formatCount(store.placePcVolume)}
                                </div>
                              </div>

                              <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                                <div className="text-[10px] font-semibold text-[#6b7280]">
                                  자동 추적
                                </div>
                                <div className="mt-1 text-[14px] font-black text-[#111827]">
                                  {trackingLabel}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
                              <span className="font-semibold text-[#6b7280]">
                                바로가기
                              </span>

                              {store.mobilePlaceLink ? (
                                <a
                                  href={store.mobilePlaceLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
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
                                  className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-3 py-1.5 font-semibold text-[#111827] transition hover:bg-[#f9fafb]"
                                >
                                  PC
                                </a>
                              ) : (
                                <span className="text-[#c0c6d0]">PC 없음</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto xl:overflow-visible">
                          {/* 핀 */}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(store)}
                            className={`inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[14px] bg-white transition hover:bg-[#f9fafb]`}
                            aria-label="핀 고정"
                          >
                            <Pin
                              className={`h-[20px] w-[20px] transition ${
                                store.isPinned
                                  ? "fill-[#b91c1c] stroke-[#b91c1c]"
                                  : "stroke-[#6b7280]"
                              }`}
                              strokeWidth={2}
                            />
                          </button>
                          {/* 업데이트 */}
                          <button
                            onClick={() => handleCheckRanks(index)}
                            disabled={isChecking}
                            onMouseEnter={() => setUpdateHover({ id: rowId, x: updateHover.x, y: updateHover.y })}
                            onMouseLeave={() => setUpdateHover((prev) => prev.id === rowId ? { ...prev, id: null } : prev)}
                            onMouseMove={(e) => handleUpdateMouseMove(e, rowId)}
                            className={`relative inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <span className="relative z-30 pointer-events-none">
                              {isChecking ? "업데이트 중..." : "업데이트"}
                            </span>
                            <div
                              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                              style={{
                                transformOrigin: "left",
                                transform: updateHover.id === rowId ? "scaleX(1)" : "scaleX(0)",
                                transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                                backgroundColor: "#2563EB",
                              }}
                            />
                            <div
                              className={`
                                absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl
                                transition-opacity duration-200 ease-out
                                ${updateHover.id === rowId ? "opacity-100" : "opacity-0"}
                              `}
                              style={{
                                left: `${updateHover.x}px`,
                                top: `${updateHover.y}px`,
                                pointerEvents: "none",
                                zIndex: 25,
                                backgroundImage:
                                  "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                                mixBlendMode: "soft-light",
                                filter:
                                  "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                              }}
                            />
                          </button>
                          {/* 순위변화보기 */}
                          <button
                            onClick={() => goToPlaceDetail(index)}
                            onMouseEnter={() => setRankChangeHover({ id: rowId, x: rankChangeHover.x, y: rankChangeHover.y })}
                            onMouseLeave={() => setRankChangeHover((prev) => prev.id === rowId ? { ...prev, id: null } : prev)}
                            onMouseMove={(e) => handleRankChangeMouseMove(e, rowId)}
                            className={`relative isolate inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] border px-4 text-[14px] font-bold transition-colors duration-0 ease-in-out ${rankChangeHover.id === rowId ? "border-[#2563EB] text-white" : "border-[#d1d5db] text-[#111827]"}`}
                          >
                            <span className="relative z-30 pointer-events-none">순위변화보기</span>
                            <div
                              className="pointer-events-none absolute inset-0 z-0 h-full w-full"
                              style={{
                                transformOrigin: "left",
                                transform: rankChangeHover.id === rowId ? "scaleX(1)" : "scaleX(0)",
                                transition: "transform 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                                backgroundColor: "#2563EB",
                              }}
                            />
                            <div
                              className={`
                                absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl
                                transition-opacity duration-200 ease-out
                                ${rankChangeHover.id === rowId ? "opacity-100" : "opacity-0"}
                              `}
                              style={{
                                left: `${rankChangeHover.x}px`,
                                top: `${rankChangeHover.y}px`,
                                pointerEvents: "none",
                                zIndex: 25,
                                backgroundImage:
                                  "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                                mixBlendMode: "soft-light",
                                filter:
                                  "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                              }}
                            />
                          </button>
                          {/* 자동추적 */}
                          <button
                            onClick={() => handleToggleTrackingByStore(store)}
                            disabled={isTrackingLoading}
                            onMouseEnter={() => setTrackingHover({ id: rowId, x: trackingHover.x, y: trackingHover.y })}
                            onMouseLeave={() => setTrackingHover((prev) => prev.id === rowId ? { ...prev, id: null } : prev)}
                            onMouseMove={(e) => handleTrackingMouseMove(e, rowId)}
                            className={`relative inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] px-4 text-[14px] font-bold transition-colors duration-0 ease-in-out disabled:cursor-not-allowed ${
                              trackingLabel === "ON"
                                ? "bg-[#2563EB] text-white"
                                : trackingHover.id === rowId
                                  ? "bg-transparent border border-[#2563EB] text-white"
                                  : "bg-transparent border border-[#d1d5db] text-[#111827]"
                            } ${isTrackingLoading ? "opacity-60" : ""}`}
                          >
                            <span className="relative z-30 pointer-events-none">
                              {isTrackingLoading ? "처리 중..." : `자동추적 ${trackingLabel}`}
                            </span>
                            <div
                              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                              style={{
                                transformOrigin: "left",
                                transform: trackingHover.id === rowId ? "scaleX(1)" : "scaleX(0)",
                                transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                                backgroundColor: "#2563EB",
                              }}
                            />
                            <div
                              className={`
                                absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl
                                transition-opacity duration-200 ease-out
                                ${trackingHover.id === rowId ? "opacity-100" : "opacity-0"}
                              `}
                              style={{
                                left: `${trackingHover.x}px`,
                                top: `${trackingHover.y}px`,
                                pointerEvents: "none",
                                zIndex: 25,
                                backgroundImage:
                                  "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                                mixBlendMode: "soft-light",
                                filter:
                                  "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                              }}
                            />
                          </button>
                          {/* 키워드관리 */}
                          <button
                            onClick={() => openKeywordModal(index)}
                            onMouseEnter={() => setKwManageHover({ id: rowId, x: kwManageHover.x, y: kwManageHover.y })}
                            onMouseLeave={() => setKwManageHover((prev) => prev.id === rowId ? { ...prev, id: null } : prev)}
                            onMouseMove={(e) => handleKwManageMouseMove(e, rowId)}
                            className="relative inline-flex h-[42px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out"
                          >
                            <span className="relative z-30 pointer-events-none">키워드 관리</span>
                            <div
                              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                              style={{
                                transformOrigin: "left",
                                transform: kwManageHover.id === rowId ? "scaleX(1)" : "scaleX(0)",
                                transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                                backgroundColor: "#2563EB",
                              }}
                            />
                            <div
                              className={`
                                absolute -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full blur-2xl
                                transition-opacity duration-200 ease-out
                                ${kwManageHover.id === rowId ? "opacity-100" : "opacity-0"}
                              `}
                              style={{
                                left: `${kwManageHover.x}px`,
                                top: `${kwManageHover.y}px`,
                                pointerEvents: "none",
                                zIndex: 25,
                                backgroundImage:
                                  "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                                mixBlendMode: "soft-light",
                                filter:
                                  "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                              }}
                            />
                          </button>
                          {/* 삭제 */}
                          <button
                            onClick={() => handleDeleteStore(store)}
                            disabled={isDeleting}
                            className={`inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-white transition hover:bg-[#f3f4f6] ${
                              isDeleting ? "opacity-60" : ""
                            }`}
                            aria-label="삭제"
                          >
                            {isDeleting ? (
                              <span className="text-[12px] text-[#111827]">...</span>
                            ) : (
                              <Trash2 className="h-[18px] w-[18px] stroke-[#111827]" strokeWidth={2} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-5 md:px-6">
                      <div className="overflow-hidden rounded-[18px] border border-[#e5e7eb]">
                        <div className="overflow-x-auto">
                          <table className="min-w-full border-collapse">
                            <thead className="bg-[#f9fafb]">
                              <tr>
                                <th className="px-5 py-3.5 text-left text-[12px] font-extrabold text-[#6b7280]">
                                  키워드
                                </th>
                                <th className="px-4 py-3.5 text-right text-[12px] font-extrabold text-[#6b7280]">
                                  월 검색량
                                </th>
                                <th className="px-4 py-3.5 text-right text-[12px] font-extrabold text-[#6b7280]">
                                  모바일
                                </th>
                                <th className="px-4 py-3.5 text-right text-[12px] font-extrabold text-[#6b7280]">
                                  PC
                                </th>
                                <th className="px-5 py-3.5 text-right text-[12px] font-extrabold text-[#6b7280]">
                                  검색 순위
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {store.keywords.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="px-5 py-10 text-center text-[14px] text-[#9ca3af]"
                                  >
                                    등록된 키워드가 없습니다.
                                  </td>
                                </tr>
                              ) : (
                                store.keywords.map((item, keywordIndex) => {
                                  const displayRank = item.currentRank ?? item.rank;
                                  const rankMeta = getRankMeta(displayRank);
                                  const rankChangeUi = getRankChangeUi(item.rankChange);

                                  return (
                                    <tr
                                      key={`${store.dbId}-${item.keyword}-${keywordIndex}`}
                                      className="border-t border-[#f3f4f6] bg-white transition hover:bg-[#fcfcfc]"
                                    >
                                      <td className="px-5 py-4">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[14px] font-bold text-[#111827]">
                                            {item.keyword}
                                          </span>
                                          {item.isTracking ? (
                                            <span className="rounded-full bg-[#eff6ff] px-2 py-1 text-[10px] font-bold text-[#2563eb]">
                                              ON
                                            </span>
                                          ) : (
                                            <span className="rounded-full bg-[#f3f4f6] px-2 py-1 text-[10px] font-bold text-[#6b7280]">
                                              OFF
                                            </span>
                                          )}
                                        </div>
                                      </td>

                                      <td className="px-4 py-4 text-right text-[14px] font-semibold text-[#111827]">
                                        {formatCount(item.monthly)}
                                      </td>

                                      <td className="px-4 py-4 text-right text-[14px] font-semibold text-[#6b7280]">
                                        {formatCount(item.mobile)}
                                      </td>

                                      <td className="px-4 py-4 text-right text-[14px] font-semibold text-[#6b7280]">
                                        {formatCount(item.pc)}
                                      </td>

                                      <td className="px-5 py-4 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                          <div className="text-right">
                                            <div className="text-[15px] font-black text-[#111827]">
                                              {rankMeta.main}
                                            </div>
                                            <div className="mt-0.5 text-[11px] font-semibold text-[#9ca3af]">
                                              {rankMeta.sub}
                                            </div>
                                          </div>

                                          <div className={`min-w-[42px] text-[13px] font-bold ${rankChangeUi.className}`}>
                                            {rankChangeUi.text}
                                          </div>
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

                      <div className="mt-3 flex justify-end text-[11px] text-[#9ca3af]">
                        <div>
                          마지막 업데이트:{" "}
                          <span className="font-semibold text-[#6b7280]">
                            {store.latestUpdatedAtText || "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[760px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
              <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
                      REGISTER PLACE
                    </p>
                    <h2 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-[#111827]">
                      매장 등록
                    </h2>
                    <p className="mt-2 text-[14px] text-[#6b7280]">
                      매장명을 검색해서 추적할 플레이스를 등록하세요.
                    </p>
                  </div>

                  <button
                    onClick={closeRegisterModal}
                    disabled={Boolean(registeringPlaceKey)}
                    className="rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="px-6 py-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePlaceSearch();
                    }}
                    placeholder="예: 뉴오더클럽 한남"
                    className="h-[50px] flex-1 rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[15px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white"
                  />

                  {/* 매장 검색 모달 내 버튼 */}
                  <button
                    onMouseEnter={() => setModalSearchHovered(true)}
                    onMouseLeave={() => setModalSearchHovered(false)}
                    onMouseMove={handleModalSearchMouseMove}
                    onClick={handlePlaceSearch}
                    disabled={placeSearchLoading}
                    className={`relative inline-flex h-[50px] min-w-[100px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[#333333] px-5 text-[15px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed ${
                      placeSearchLoading ? "opacity-60" : ""
                    }`}
                  >
                    <span className="relative z-30 pointer-events-none">
                      {placeSearchLoading ? "검색 중..." : "매장 검색"}
                    </span>
                    <div
                      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                      style={{
                        transformOrigin: "left",
                        transform: modalSearchHovered ? "scaleX(1)" : "scaleX(0)",
                        transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                        backgroundColor: "#2563EB",
                      }}
                    />
                    <div
                      className={`
                        absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
                        transition-opacity duration-200 ease-out
                        ${modalSearchHovered ? "opacity-100" : "opacity-0"}
                      `}
                      style={{
                        left: `${modalSearchMousePos.x}px`,
                        top: `${modalSearchMousePos.y}px`,
                        pointerEvents: "none",
                        zIndex: 25,
                        backgroundImage:
                          "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                        mixBlendMode: "soft-light",
                        filter:
                          "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                      }}
                    />
                  </button>
                </div>

                {placeSearchError ? (
                  <div className="mt-4 rounded-[14px] border border-[#fecaca] bg-[#fff] px-4 py-3 text-[14px] text-[#dc2626]">
                    {placeSearchError}
                  </div>
                ) : null}

                <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {placeResults.length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-5 py-10 text-center text-[14px] text-[#9ca3af]">
                      검색 결과가 여기에 표시됩니다.
                    </div>
                  ) : (
                    placeResults.map((item, idx) => {
                      const itemKey = `${item.title}-${item.address}-${idx}`;
                      return (
                        <div
                          key={itemKey}
                          className="flex flex-col gap-4 rounded-[18px] border border-[#e5e7eb] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)] md:flex-row md:items-center md:justify-between"
                        >
                          <div className="flex min-w-0 gap-4">
                            {item.image ? (
                              <img
                                src={item.image}
                                alt={item.title}
                                className="h-[64px] w-[64px] rounded-[14px] object-cover ring-1 ring-[#e5e7eb]"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  console.warn(`[place modal] image load failed: ${item.image}`);
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[14px] bg-[#f3f4f6] text-[12px] text-[#9ca3af]">
                                이미지
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="text-[16px] font-black tracking-[-0.02em] text-[#111827]">
                                {item.title}
                              </div>
                              <div className="mt-1 text-[13px] font-semibold text-[#4b5563]">
                                {item.category}
                              </div>
                              <div className="mt-1 text-[13px] text-[#6b7280]">
                                {item.address}
                              </div>
                            </div>
                          </div>

                          {/* 검색된 항목 등록 버튼 */}
                          <button
                            onMouseEnter={() => setRegisterHover({ id: itemKey, x: registerHover.x, y: registerHover.y })}
                            onMouseLeave={() => setRegisterHover((prev) => prev.id === itemKey ? { ...prev, id: null } : prev)}
                            onMouseMove={(e) => handleRegisterMouseMove(e, itemKey)}
                            onClick={() => handleRegisterPlace(item)}
                            disabled={
                              registeringPlaceKey === `${item.title}__${item.address}__${item.link}`
                            }
                            className={`relative inline-flex h-[42px] shrink-0 min-w-[100px] items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed ${
                              registeringPlaceKey === `${item.title}__${item.address}__${item.link}`
                                ? "opacity-60"
                                : ""
                            }`}
                          >
                            <span className="relative z-30 pointer-events-none">
                              {registeringPlaceKey === `${item.title}__${item.address}__${item.link}`
                                ? "매장 등록중"
                                : "이 매장 등록"}
                            </span>
                            <div
                              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                              style={{
                                transformOrigin: "left",
                                transform: registerHover.id === itemKey ? "scaleX(1)" : "scaleX(0)",
                                transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                                backgroundColor: "#2563EB",
                              }}
                            />
                            <div
                              className={`
                                absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
                                transition-opacity duration-200 ease-out
                                ${registerHover.id === itemKey ? "opacity-100" : "opacity-0"}
                              `}
                              style={{
                                left: `${registerHover.x}px`,
                                top: `${registerHover.y}px`,
                                pointerEvents: "none",
                                zIndex: 25,
                                backgroundImage:
                                  "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                                mixBlendMode: "soft-light",
                                filter:
                                  "saturate(1.25) brightness(1.15) drop-shadow(0 0 12px rgba(255,255,255,0.30))",
                              }}
                            />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {isKeywordModalOpen && selectedStore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[860px] overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
              <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#6b7280]">
                      KEYWORD MANAGER
                    </p>
                    <h2 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-[#111827]">
                      {selectedStore.name}
                    </h2>
                    <p className="mt-2 text-[14px] text-[#6b7280]">
                      추천 키워드를 선택하거나 직접 입력해서 관리하세요.
                    </p>
                  </div>

                  <button
                    onClick={closeKeywordModal}
                    className="rounded-full border border-[#d1d5db] bg-white px-3 py-2 text-[13px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="max-h-[78vh] overflow-y-auto px-6 py-6">
                <div className="rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-[13px] font-bold text-[#4b5563]">
                    추천 키워드
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {recommendedKeywords.map((item, idx) => {
                      const active = selectedRecommendedKeywords.includes(
                        item.keyword
                      );

                      return (
                        <button
                          key={`${item.keyword}-${idx}`}
                          type="button"
                          onClick={() => toggleRecommendedKeyword(item.keyword)}
                          className={`rounded-full px-4 py-2 text-[13px] font-bold transition ${
                            active
                              ? "border border-[#111827] bg-[#111827] text-white"
                              : "border border-[#d1d5db] bg-white text-[#111827] hover:bg-[#f9fafb]"
                          }`}
                        >
                          {item.keyword}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                  <p className="text-[13px] font-bold text-[#4b5563]">
                    직접 키워드 추가
                  </p>

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addDirectKeywords();
                      }}
                      placeholder="쉼표(,)로 여러 개 입력 가능"
                      className="h-[48px] flex-1 rounded-[16px] border border-[#d1d5db] bg-[#fafafa] px-4 text-[14px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white"
                    />

                    <button
                      type="button"
                      onClick={addDirectKeywords}
                      className="h-[48px] rounded-[16px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                    >
                      추가
                    </button>
                  </div>
                </div>

                <div className="mt-5 rounded-[18px] border border-[#e5e7eb] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-bold text-[#4b5563]">
                      저장 예정 키워드
                    </p>
                    <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-bold text-[#4b5563]">
                      {tempKeywords.length}개
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {tempKeywords.length === 0 ? (
                      <div className="w-full rounded-[14px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 py-8 text-center text-[14px] text-[#9ca3af]">
                        아직 추가된 키워드가 없습니다.
                      </div>
                    ) : (
                      tempKeywords.map((keyword, idx) => (
                        <div
                          key={`${keyword}-${idx}`}
                          className="inline-flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-[13px] font-bold text-[#111827]"
                        >
                          <span>{keyword}</span>
                          <button
                            type="button"
                            onClick={() => removeTempKeyword(keyword)}
                            disabled={deletingKeywordKey === keyword}
                            className="text-[#dc2626] transition hover:opacity-80"
                          >
                            {deletingKeywordKey === keyword ? "..." : "✕"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#f3f4f6] bg-[#fcfcfc] px-6 py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    onClick={closeKeywordModal}
                    disabled={savingKeywords}
                    className="h-[46px] rounded-[14px] border border-[#d1d5db] bg-white px-5 text-[14px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                  >
                    취소
                  </button>

                  {/* 키워드 저장 모달 버튼 */}
                  <button
                    onMouseEnter={() => setSaveKwHovered(true)}
                    onMouseLeave={() => setSaveKwHovered(false)}
                    onMouseMove={handleSaveKwMouseMove}
                    onClick={saveKeywords}
                    disabled={savingKeywords}
                    className={`relative inline-flex h-[46px] min-w-[120px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-5 text-[14px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed ${
                      savingKeywords ? "opacity-60" : ""
                    }`}
                  >
                    <span className="relative z-30 pointer-events-none">
                      {savingKeywords ? "키워드 저장중" : "키워드 저장"}
                    </span>
                    <div
                      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                      style={{
                        transformOrigin: "left",
                        transform: saveKwHovered ? "scaleX(1)" : "scaleX(0)",
                        transition: "transform 300ms cubic-bezier(0.19, 1, 0.22, 1)",
                        backgroundColor: "#2563EB",
                      }}
                    />
                    <div
                      className={`
                        absolute -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full blur-2xl
                        transition-opacity duration-200 ease-out
                        ${saveKwHovered ? "opacity-100" : "opacity-0"}
                      `}
                      style={{
                        left: `${saveKwMousePos.x}px`,
                        top: `${saveKwMousePos.y}px`,
                        pointerEvents: "none",
                        zIndex: 25,
                        backgroundImage:
                          "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(100,255,200,0.4) 30%, rgba(0,100,255,0.1) 60%, rgba(255,255,255,0) 80%)",
                        mixBlendMode: "soft-light",
                        filter:
                          "saturate(1.1) brightness(1.02) drop-shadow(0 0 8px rgba(255,255,255,0.14))",
                      }}
                    />
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