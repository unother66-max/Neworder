"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useSession } from "next-auth/react";
import { Pin, Trash2, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PostlabsSlideHoverButton } from "@/components/postlabs-slide-hover-button";
import { debugFetchBrowserAllSearchJson } from "@/lib/browser-allsearch-debug";
import { isIntentMixedKeyword } from "@/lib/check-place-rank-intent";

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

function monthlyVolumeLabelForModal(
  keyword: string,
  savedMap: Map<string, KeywordItem>,
  recommended: RecommendedKeyword[],
): string | null {
  const item = savedMap.get(keyword);
  const fromSaved = item?.monthly?.trim();
  if (fromSaved && fromSaved !== "-") {
    const only = fromSaved.replace(/,/g, "");
    if (/^\d+$/.test(only)) return formatCount(only);
  }
  const hit = recommended.find((r) => r.keyword === keyword);
  const raw = hit?.monthly != null ? String(hit.monthly).trim() : "";
  if (raw && raw !== "-") {
    const only = raw.replace(/,/g, "");
    if (/^\d+$/.test(only)) return formatCount(only);
  }
  return null;
}

function PlaceKeywordModalSortRow({
  keyword,
  index,
  monthlyLabel,
  deleting,
  onRemove,
}: {
  keyword: string;
  index: number;
  monthlyLabel: string | null;
  deleting: boolean;
  onRemove: () => void;
}) {
  const showTopRibbon = index < 3;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: keyword });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: "none",
    ...(isDragging
      ? {
          boxShadow: "0 10px 24px rgba(15,23,42,0.12)",
          opacity: 0.22,
          zIndex: 6,
        }
      : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-[12px] border border-[#e8eaef] bg-white px-2 py-2.5 shadow-sm last:mb-0 sm:flex-nowrap md:gap-3 md:rounded-[14px] md:px-3 md:py-3"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="-ml-0.5 flex shrink-0 cursor-grab touch-manipulation rounded-md bg-transparent p-1 text-[#c4cad4] outline-none hover:text-[#9ca3af] active:cursor-grabbing"
        aria-label="드래그하여 순서 변경"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-5 w-5 md:h-[18px] md:w-[18px]" strokeWidth={2} />
      </button>

      <div className="min-w-0 flex-1 basis-[min(100%,10rem)] sm:basis-auto">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[12px] font-bold leading-snug text-[#111827] md:text-[13px]">
            {keyword}
          </span>
          {monthlyLabel ? (
            <span className="text-[10px] font-semibold whitespace-nowrap text-[#9ca3af] md:text-[11px]">
              월 검색량 {monthlyLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
       
        <button
          type="button"
          onClick={onRemove}
          disabled={deleting}
          className="flex h-8 min-w-[2rem] items-center justify-center text-[13px] text-[#dc2626] transition hover:opacity-80 disabled:opacity-60"
          aria-label="키워드 제거"
        >
          {deleting ? "..." : "✕"}
        </button>
      </div>
    </div>
  );
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

// 🔥여기에 x와 y 매핑이 누락되어 있었습니다! 이 두 줄을 똑같이 넣어주세요.
x: (place as any).x ? String((place as any).x) : undefined,
y: (place as any).y ? String((place as any).y) : undefined,

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
  const [activeKeywordDrag, setActiveKeywordDrag] = useState<string | null>(
    null
  );
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

 // 🔥 등록 후 즉시 순위 조회를 실행할 대상을 기억하는 상태값 추가 (새 키워드 포함)
 const [autoCheckData, setAutoCheckData] = useState<{ storeId: string; keywords: string[] } | null>(null);
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

  const keywordModalSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleKeywordModalDragStart = (event: DragStartEvent) => {
    setActiveKeywordDrag(String(event.active.id));
  };

  const handleKeywordModalDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveKeywordDrag(null);

    if (!over) return;
    if (active.id === over.id) return;

    setTempKeywords((items) => {
      const oid = String(active.id);
      const nid = String(over.id);
      const oldIndex = items.indexOf(oid);
      const newIndex = items.indexOf(nid);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleKeywordModalDragCancel = () => {
    setActiveKeywordDrag(null);
  };

// 🔥 자동 순위 조회 감지 로직 (새 키워드만 필터링해서 넘겨줌)
useEffect(() => {
  if (autoCheckData && !placeLoading) {
    const index = filteredStores.findIndex(s => s.dbId === autoCheckData.storeId);
    if (index !== -1) {
      // 특정 키워드 목록을 두 번째 파라미터로 넘겨줍니다.
      handleCheckRanks(index, autoCheckData.keywords); 
    }
    setAutoCheckData(null);
  }
}, [autoCheckData, placeLoading, filteredStores]);
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
    setActiveKeywordDrag(null);
    setDeletingKeywordKey(null);
    setIsKeywordModalOpen(true);
  };

  const closeKeywordModal = () => {
    setIsKeywordModalOpen(false);
    setSelectedStoreIndex(null);
    setKeywordInput("");
    setSelectedRecommendedKeywords([]);
    setTempKeywords([]);
    setDeletingKeywordKey(null);
    setActiveKeywordDrag(null);
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

      const reorderRes = await fetch("/api/place-keyword-reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          placeId: targetStore.dbId,
          keywords: tempKeywords,
        }),
      });

      const reorderPayload = await reorderRes.json();

      if (!reorderRes.ok) {
        throw new Error(reorderPayload.error || "키워드 순서 저장 실패");
      }

      await fetchPlaces();
      closeKeywordModal();
      
      // 🔥 [변경됨] '새로 추가된 키워드'만 자동 조회하도록 매장 ID와 키워드 목록을 함께 저장
      if (keywordsToCreate.length > 0) {
        setAutoCheckData({
          storeId: targetStore.dbId,
          keywords: keywordsToCreate,
        });
      }
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

 // 두 번째 파라미터로 specificKeywords 를 받을 수 있게 추가
 const handleCheckRanks = async (filteredIndex: number, specificKeywords?: string[]) => {
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

    // 🔥 특정 키워드 목록이 넘어왔다면, 그 키워드들만 골라냅니다.
    let keywordsToProcess = target.keywords;
    if (specificKeywords && specificKeywords.length > 0) {
      keywordsToProcess = target.keywords.filter((k) => specificKeywords.includes(k.keyword));
    }

    setCheckingStoreIndex(realIndex);

    try {
      // 🔥 전체 키워드(target.keywords) 대신 필터링된(keywordsToProcess) 키워드만 조회합니다.
      const batches = chunkArray(keywordsToProcess, RANK_CHECK_BATCH_SIZE);

      for (const batch of batches) {
        
        for (const item of batch) {
          let browserAllSearchJson: unknown | undefined;
          if (isIntentMixedKeyword(item.keyword)) {
            try {
              const dbg = await debugFetchBrowserAllSearchJson({
                keyword: item.keyword,
                x: target.x,
                y: target.y,
              });
              if (dbg.ok) {
                browserAllSearchJson = dbg.json;
              }
            } catch {
              /* 브라우저 allSearch 디버그 실패는 순위 조회에 영향 없음 */
            }
          }

          const response = await fetch("/api/check-place-rank", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              keyword: item.keyword,
              targetName: target.name,
              placeId: target.placeId,
              x: target.x,
              y: target.y,
              ...(item.placeKeywordId
                ? { placeKeywordId: item.placeKeywordId }
                : {}),
              ...(browserAllSearchJson !== undefined
                ? { browserAllSearchJson }
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
          // 🚨 [추가된 부분] 키워드 하나를 처리한 후 2~3초(2000ms~3000ms) 사이의 랜덤 딜레이를 줍니다.
          await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 1000) + 2000));
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

  // 🔽 스크롤을 여기까지 쭈욱 내리신 다음, 여기에 코드를 넣으세요! 🔽
 

  // 이 return문이 파일 전체에서 거의 마지막에 있는 메인 return문입니다!
  return (
    <>
      <TopNav active="place" />

      <main className="min-h-screen bg-[#f8fafc] pt-20 text-[#111111] md:pt-24">
        <section className="mx-auto max-w-[1240px] px-3 py-2 md:px-6 md:py-5 lg:px-8">
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:px-6 md:py-4 md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-col gap-2.5 md:gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] md:text-[26px]">
                    플레이스 순위 추적
                  </h1>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:py-1 md:text-[11px]">
                    PLACE
                  </span>
                </div>

                <p className="mt-0.5 text-[11px] leading-5 text-[#4b5563] md:mt-1 md:text-[13px]">
                  등록된 플레이스의 검색량, 키워드, 순위를 한 화면에서 관리합니다.
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row md:gap-3 lg:w-auto lg:items-center">
                <div className="relative w-full sm:w-[320px]">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="등록된 매장 검색"
                    className="h-[40px] w-full rounded-[12px] border border-[#d1d5db] bg-[#fafafa] px-3 pr-9 text-[12px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white md:h-[44px] md:rounded-[14px] md:px-4 md:pr-11 md:text-[13px]"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#6b7280] md:right-4 md:text-[14px]">
                    🔍
                  </div>
                </div>

                <button
                  onMouseEnter={() => setIsAddHovered(true)}
                  onMouseLeave={() => setIsAddHovered(false)}
                  onMouseMove={handleMouseMove}
                  onClick={openRegisterModal}
                  className="relative inline-flex h-[40px] min-w-[96px] items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out md:h-[44px] md:min-w-[108px] md:rounded-[14px] md:px-4 md:text-[13px]"
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
                      absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-32 md:w-32
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

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#f3f4f6] pt-2 md:mt-3 md:gap-2 md:pt-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-black tracking-[-0.02em] text-[#111827] md:text-[17px]">
                    등록된 매장
                  </h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:px-2.5 md:py-1 md:text-[11px]">
                    {filteredStores.length}개
                  </span>
                </div>

                <p className="mt-1 text-[11px] text-[#6b7280] md:mt-2 md:text-[12px]">
                  {placeLoading ? "📍 매장 목록 불러오는 중..." : "📍 기준 순위 조회중"}
                </p>
              </div>

              <div className="text-[10px] leading-4 text-[#6b7280] md:text-[11px] md:text-[#9ca3af]">
                IP, 위치, 시간에 따라 순위 오차가 발생할 수 있습니다.
              </div>
            </div>
          </div>

          <div className="mt-2.5 space-y-3 md:mt-5 md:space-y-4">
            {filteredStores.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[#d1d5db] bg-white px-4 py-10 text-center shadow-[0_4px_18px_rgba(15,23,42,0.025)] md:rounded-[22px] md:px-6 md:py-14 md:shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
                <p className="text-[15px] font-bold text-[#111827] md:text-[18px]">
                  아직 등록된 매장이 없어요
                </p>
                <p className="mt-2 text-[12px] text-[#9ca3af] md:text-[14px]">
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
                    className="overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)] md:rounded-[22px] md:shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                  >
                    <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-3 py-2.5 md:px-6 md:py-4">
                      <div className="flex flex-col gap-2.5 md:gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 gap-2.5 md:gap-4">
                          {store.image ? (
                            <img
                              src={store.image}
                              alt={store.name}
                              className="h-12 w-12 shrink-0 rounded-[12px] object-cover ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px]"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[10px] font-semibold text-[#9ca3af] ring-1 ring-[#e5e7eb] md:h-[70px] md:w-[70px] md:rounded-[16px] md:text-[12px]">
                              이미지
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-wrap md:gap-2">
                                <h3 className="truncate text-[15px] font-black tracking-[-0.03em] text-[#111827] md:text-[20px]">
                                  {store.name}
                                </h3>

                                {store.category ? (
                                  <span className="max-w-[88px] shrink-0 truncate rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-bold text-[#4b5563] md:max-w-none md:px-2.5 md:py-1 md:text-[11px]">
                                    {store.category}
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex shrink-0 items-center gap-1 md:hidden">
                                {store.mobilePlaceLink ? (
                                  <a
                                    href={store.mobilePlaceLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-6 items-center rounded-full border border-[#d1d5db] bg-white px-2 text-[10px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                                  >
                                    모바일
                                  </a>
                                ) : null}

                                {store.pcPlaceLink ? (
                                  <a
                                    href={store.pcPlaceLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-6 items-center rounded-full border border-[#d1d5db] bg-white px-2 text-[10px] font-bold text-[#111827] transition hover:bg-[#f9fafb]"
                                  >
                                    PC
                                  </a>
                                ) : null}

                                <button
                                  onClick={() => handleDeleteStore(store)}
                                  disabled={isDeleting}
                                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#fecdd3] bg-[#fff1f2] text-[#dc2626] transition hover:border-[#fda4af] hover:bg-[#ffe4e6] active:bg-[#fecdd3] ${
                                    isDeleting ? "opacity-60" : ""
                                  }`}
                                  aria-label="삭제"
                                >
                                  {isDeleting ? (
                                    <span className="text-[11px] text-[#dc2626]">...</span>
                                  ) : (
                                    <Trash2 className="h-4 w-4 stroke-[#dc2626]" strokeWidth={2} />
                                  )}
                                </button>
                              </div>
                            </div>

                            <p className="mt-0.5 truncate text-xs leading-5 text-[#4b5563] md:mt-1.5 md:text-[13px] md:text-[#6b7280]">
                              {store.address || "-"}
                            </p>

                            <div className="mt-1.5 grid grid-cols-4 gap-1.5 md:mt-3 md:flex md:flex-wrap md:gap-2">
                              <div className="flex h-10 min-w-0 flex-col justify-center rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-1.5 md:h-auto md:rounded-[12px] md:px-3 md:py-2">
                                <div className="truncate text-[10px] font-semibold leading-none text-[#6b7280]">
                                  월 검색량
                                </div>
                                <div className="mt-1 truncate text-sm font-semibold leading-none text-[#111827] md:text-[15px] md:font-black">
                                  {formatCount(store.placeMonthlyVolume)}
                                </div>
                              </div>

                              <div className="flex h-10 min-w-0 flex-col justify-center rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-1.5 md:h-auto md:rounded-[12px] md:px-3 md:py-2">
                                <div className="truncate text-[10px] font-semibold leading-none text-[#6b7280]">
                                  모바일
                                </div>
                                <div className="mt-1 truncate text-sm font-semibold leading-none text-[#111827] md:text-[14px] md:font-extrabold">
                                  {formatCount(store.placeMobileVolume)}
                                </div>
                              </div>

                              <div className="flex h-10 min-w-0 flex-col justify-center rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-1.5 md:h-auto md:rounded-[12px] md:px-3 md:py-2">
                                <div className="truncate text-[10px] font-semibold leading-none text-[#6b7280]">
                                  PC
                                </div>
                                <div className="mt-1 truncate text-sm font-semibold leading-none text-[#111827] md:text-[14px] md:font-extrabold">
                                  {formatCount(store.placePcVolume)}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleToggleTrackingByStore(store)}
                                disabled={isTrackingLoading}
                                className={`flex h-10 min-w-0 flex-col justify-center rounded-[10px] border px-1.5 text-left transition active:scale-[0.98] md:hidden ${
                                  trackingLabel === "ON"
                                    ? "border-[#2563EB] bg-[#2563EB] text-white"
                                    : "border-[#e5e7eb] bg-[#f3f4f6] text-[#374151]"
                                } ${isTrackingLoading ? "opacity-60" : ""}`}
                                aria-label={`자동 추적 ${trackingLabel}`}
                              >
                                <div className={`truncate text-[10px] font-semibold leading-none ${
                                  trackingLabel === "ON" ? "text-white/85" : "text-[#4b5563]"
                                }`}>
                                  자동 추적
                                </div>
                                <div className={`mt-1 truncate text-sm font-semibold leading-none ${
                                  trackingLabel === "ON" ? "text-white" : "text-[#111827]"
                                }`}>
                                  {trackingLabel}
                                </div>
                              </button>

                              <div className="hidden h-10 min-w-0 flex-col justify-center rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-1.5 md:flex md:h-auto md:rounded-[12px] md:px-3 md:py-2">
                                <div className="truncate text-[10px] font-semibold leading-none text-[#6b7280]">
                                  자동 추적
                                </div>
                                <div className="mt-1 truncate text-sm font-semibold leading-none text-[#111827] md:text-[14px] md:font-black">
                                  {trackingLabel}
                                </div>
                              </div>
                            </div>

                            <div className="mt-2 hidden flex-wrap items-center gap-1.5 text-[11px] md:mt-3 md:flex md:gap-2 md:text-[12px]">
                              <span className="font-semibold text-[#6b7280]">
                                바로가기
                              </span>

                              {store.mobilePlaceLink ? (
                                <a
                                  href={store.mobilePlaceLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-2.5 py-1 font-semibold text-[#111827] transition hover:bg-[#f9fafb] md:px-3 md:py-1.5"
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
                                  className="inline-flex items-center rounded-full border border-[#d1d5db] bg-white px-2.5 py-1 font-semibold text-[#111827] transition hover:bg-[#f9fafb] md:px-3 md:py-1.5"
                                >
                                  PC
                                </a>
                              ) : (
                                <span className="text-[#c0c6d0]">PC 없음</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="ml-5 flex w-[calc(100%-1.25rem)] flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:ml-0 md:w-auto md:gap-2 xl:overflow-visible">
                          {/* 핀 */}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(store)}
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white transition hover:bg-[#f9fafb] md:h-[44px] md:w-[44px] md:rounded-[14px]`}
                            aria-label="핀 고정"
                          >
                            <Pin
                              className={`h-4 w-4 transition md:h-[20px] md:w-[20px] ${
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
                            className={`relative inline-flex h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-2.5 text-[13px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-60 md:h-[42px] md:flex-none md:shrink-0 md:rounded-[14px] md:px-4 md:text-[14px]`}
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
                                absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-40 md:w-40
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
                            className={`relative isolate inline-flex h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] border px-2.5 text-[13px] font-bold transition-colors duration-0 ease-in-out md:h-[42px] md:flex-none md:shrink-0 md:rounded-[14px] md:px-4 md:text-[14px] ${rankChangeHover.id === rowId ? "border-[#2563EB] text-white" : "border-[#d1d5db] text-[#111827]"}`}
                          >
                            <span className="relative z-30 pointer-events-none md:hidden">순위변화</span>
                            <span className="relative z-30 pointer-events-none hidden md:inline">순위변화보기</span>
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
                                absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-40 md:w-40
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
                            className={`relative hidden h-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] px-2.5 text-xs font-bold transition-colors duration-0 ease-in-out disabled:cursor-not-allowed md:inline-flex md:h-[42px] md:rounded-[14px] md:px-4 md:text-[14px] ${
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
                                absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-40 md:w-40
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
                            className="relative inline-flex h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] bg-[#333333] px-2.5 text-[13px] font-bold text-white transition-all duration-300 ease-in-out md:h-[42px] md:flex-none md:shrink-0 md:rounded-[14px] md:px-4 md:text-[14px]"
                          >
                            <span className="relative z-30 pointer-events-none md:hidden">키워드 관리</span>
                            <span className="relative z-30 pointer-events-none hidden md:inline">키워드 관리</span>
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
                                absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-40 md:w-40
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
                            className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white transition hover:bg-[#f3f4f6] md:inline-flex md:h-[42px] md:w-[42px] md:rounded-[14px] ${
                              isDeleting ? "opacity-60" : ""
                            }`}
                            aria-label="삭제"
                          >
                            {isDeleting ? (
                              <span className="text-[12px] text-[#111827]">...</span>
                            ) : (
                              <Trash2 className="h-4 w-4 stroke-[#111827] md:h-[18px] md:w-[18px]" strokeWidth={2} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="px-3 py-3 md:px-6 md:py-5">
                      <div className="overflow-hidden rounded-[14px] border border-[#e5e7eb] md:rounded-[18px]">
                        <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          <table className="w-full table-fixed border-collapse md:min-w-full md:table-auto">
                            <colgroup>
                              <col className="w-[31%] md:w-auto" />
                              <col className="w-[16%] md:w-auto" />
                              <col className="w-[15%] md:w-auto" />
                              <col className="w-[13%] md:w-auto" />
                              <col className="w-[25%] md:w-auto" />
                            </colgroup>
                            <thead className="bg-[#f9fafb]">
                              <tr>
                                <th className="px-1.5 py-2 text-left text-[10px] font-extrabold text-[#6b7280] md:px-5 md:py-3.5 md:text-[12px]">
                                  키워드
                                </th>
                                <th className="px-1 py-2 text-right text-[10px] font-extrabold text-[#6b7280] md:px-4 md:py-3.5 md:text-[12px]">
                                  월 검색량
                                </th>
                                <th className="px-1 py-2 text-right text-[10px] font-extrabold text-[#6b7280] md:px-4 md:py-3.5 md:text-[12px]">
                                  모바일
                                </th>
                                <th className="px-1 py-2 text-right text-[10px] font-extrabold text-[#6b7280] md:px-4 md:py-3.5 md:text-[12px]">
                                  PC
                                </th>
                                <th className="px-1.5 py-2 text-right text-[10px] font-extrabold text-[#6b7280] md:px-5 md:py-3.5 md:text-[12px]">
                                  검색 순위
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {store.keywords.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={5}
                                    className="px-2 py-7 text-center text-[12px] text-[#9ca3af] md:px-5 md:py-10 md:text-[14px]"
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
                                      <td className="min-w-0 px-1.5 py-2.5 md:px-5 md:py-4">
                                        <div className="flex min-w-0 items-center gap-1 md:gap-2">
                                          <span className="min-w-0 truncate text-[11px] font-bold text-[#111827] md:text-[14px]">
                                            {item.keyword}
                                          </span>
                                          {item.isTracking ? (
                                            <span className="shrink-0 rounded-full bg-[#eff6ff] px-1 py-0.5 text-[8px] font-bold leading-none text-[#2563eb] md:px-2 md:py-1 md:text-[10px]">
                                              ON
                                            </span>
                                          ) : (
                                            <span className="shrink-0 rounded-full bg-[#f3f4f6] px-1 py-0.5 text-[8px] font-bold leading-none text-[#6b7280] md:px-2 md:py-1 md:text-[10px]">
                                              OFF
                                            </span>
                                          )}
                                        </div>
                                      </td>

                                      <td className="px-1 py-2.5 text-right text-[11px] font-semibold text-[#111827] md:px-4 md:py-4 md:text-[14px]">
                                        {formatCount(item.monthly)}
                                      </td>

                                      <td className="px-1 py-2.5 text-right text-[11px] font-semibold text-[#6b7280] md:px-4 md:py-4 md:text-[14px]">
                                        {formatCount(item.mobile)}
                                      </td>

                                      <td className="px-1 py-2.5 text-right text-[11px] font-semibold text-[#6b7280] md:px-4 md:py-4 md:text-[14px]">
                                        {formatCount(item.pc)}
                                      </td>

                                      <td className="px-1.5 py-2.5 text-right md:px-5 md:py-4">
                                        <div className="flex items-center justify-end gap-1 md:gap-3">
                                          <div className="text-right">
                                            <div className="text-xs font-black leading-tight text-[#111827] md:text-[15px]">
                                              {rankMeta.main}
                                            </div>
                                            <div className="mt-0.5 text-[9px] font-semibold leading-tight text-[#9ca3af] md:text-[11px]">
                                              {rankMeta.sub}
                                            </div>
                                            {isIntentMixedKeyword(item.keyword) ? (
                                              <div className="mt-0.5 text-[8px] leading-snug text-[#b0b6bf] md:text-[10px] md:leading-tight">
                                                모바일 기준
                                              </div>
                                            ) : null}
                                          </div>

                                          <div className={`min-w-[22px] text-[10px] font-bold md:min-w-[42px] md:text-[13px] ${rankChangeUi.className}`}>
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

                      <div className="mt-3 flex justify-end text-[10px] text-[#9ca3af] md:text-[11px]">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-[3px] md:px-4">
            <div className="max-h-[92vh] w-full max-w-[760px] overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] md:max-h-none md:rounded-[24px]">
              <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-4 py-4 md:px-6 md:py-5">
                <div className="flex items-start justify-between gap-3 md:gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6b7280] md:text-[12px] md:tracking-[0.18em]">
                      REGISTER PLACE
                    </p>
                    <h2 className="mt-1.5 text-[18px] font-black tracking-[-0.03em] text-[#111827] md:mt-2 md:text-[22px]">
                      매장 등록
                    </h2>
                    <p className="mt-1.5 text-[12px] leading-4 text-[#6b7280] md:mt-2 md:text-[14px]">
                      매장명을 검색해서 추적할 플레이스를 등록하세요.
                    </p>
                  </div>

                  <button
                    onClick={closeRegisterModal}
                    disabled={Boolean(registeringPlaceKey)}
                    className="rounded-full border border-[#d1d5db] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb] md:px-3 md:py-2 md:text-[13px]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(92vh-96px)] overflow-y-auto overscroll-contain px-4 py-4 md:max-h-none md:overflow-visible md:px-6 md:py-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={placeQuery}
                    onChange={(e) => setPlaceQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handlePlaceSearch();
                    }}
                    placeholder="예: 뉴오더클럽 한남"
                    className="h-[44px] flex-1 rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-3 text-[13px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white md:h-[50px] md:rounded-[16px] md:px-4 md:text-[15px]"
                  />

                  {/* 매장 검색 모달 내 버튼 */}
                  <button
                    onMouseEnter={() => setModalSearchHovered(true)}
                    onMouseLeave={() => setModalSearchHovered(false)}
                    onMouseMove={handleModalSearchMouseMove}
                    onClick={handlePlaceSearch}
                    disabled={placeSearchLoading}
                    className={`relative inline-flex h-[44px] min-w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#333333] px-4 text-[13px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed md:h-[50px] md:min-w-[100px] md:rounded-[16px] md:px-5 md:text-[15px] ${
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
                        absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-32 md:w-32
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
                  <div className="mt-3 rounded-[12px] border border-[#fecaca] bg-[#fff] px-3 py-2.5 text-[12px] text-[#dc2626] md:mt-4 md:rounded-[14px] md:px-4 md:py-3 md:text-[14px]">
                    {placeSearchError}
                  </div>
                ) : null}

                <div className="mt-4 max-h-[52vh] space-y-2.5 overflow-y-auto pr-1 md:mt-5 md:max-h-[420px] md:space-y-3">
                  {placeResults.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-4 py-8 text-center text-[12px] text-[#9ca3af] md:rounded-[18px] md:px-5 md:py-10 md:text-[14px]">
                      검색 결과가 여기에 표시됩니다.
                    </div>
                  ) : (
                    placeResults.map((item, idx) => {
                      const itemKey = `${item.title}-${item.address}-${idx}`;
                      return (
                        <div
                          key={itemKey}
                          className="flex flex-col gap-3 rounded-[14px] border border-[#e5e7eb] bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.03)] md:flex-row md:items-center md:justify-between md:gap-4 md:rounded-[18px] md:p-4"
                        >
                          <div className="flex min-w-0 gap-3 md:gap-4">
                            {item.image ? (
                              <img
                                src={item.image}
                                alt={item.title}
                                className="h-[52px] w-[52px] rounded-[12px] object-cover ring-1 ring-[#e5e7eb] md:h-[64px] md:w-[64px] md:rounded-[14px]"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  console.warn(`[place modal] image load failed: ${item.image}`);
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[10px] text-[#9ca3af] md:h-[64px] md:w-[64px] md:rounded-[14px] md:text-[12px]">
                                이미지
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="text-[14px] font-black tracking-[-0.02em] text-[#111827] md:text-[16px]">
                                {item.title}
                              </div>
                              <div className="mt-0.5 text-[11px] font-semibold text-[#4b5563] md:mt-1 md:text-[13px]">
                                {item.category}
                              </div>
                              <div className="mt-0.5 text-[11px] leading-4 text-[#6b7280] md:mt-1 md:text-[13px]">
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
                            className={`relative inline-flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#333333] px-3 text-[12px] font-bold text-white transition-all duration-300 ease-in-out disabled:cursor-not-allowed md:h-[42px] md:min-w-[100px] md:rounded-[14px] md:px-4 md:text-[14px] ${
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
                                absolute -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full blur-2xl md:h-32 md:w-32
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-[3px] md:px-4">
            <div className="max-h-[92vh] w-full max-w-[860px] overflow-hidden rounded-[18px] border border-[#e5e7eb] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] md:max-h-none md:rounded-[24px]">
              <div className="border-b border-[#f3f4f6] bg-[#fcfcfc] px-4 py-4 md:px-6 md:py-5">
                <div className="flex items-start justify-between gap-3 md:gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6b7280] md:text-[12px] md:tracking-[0.18em]">
                      KEYWORD MANAGER
                    </p>
                    <h2 className="mt-1.5 text-[18px] font-black tracking-[-0.03em] text-[#111827] md:mt-2 md:text-[22px]">
                      {selectedStore.name}
                    </h2>
                    <p className="mt-1.5 text-[12px] leading-4 text-[#6b7280] md:mt-2 md:text-[14px]">
                      추천 키워드를 선택하거나 직접 입력해서 관리하세요.
                    </p>
                  </div>

                  <button
                    onClick={closeKeywordModal}
                    className="rounded-full border border-[#d1d5db] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#6b7280] transition hover:bg-[#f9fafb] md:px-3 md:py-2 md:text-[13px]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="max-h-[68vh] overflow-y-auto overscroll-contain px-4 py-4 md:max-h-[78vh] md:px-6 md:py-6">
                <div className="rounded-[14px] border border-[#e5e7eb] bg-white p-4 md:rounded-[18px] md:p-5">
                  <p className="text-[12px] font-bold text-[#4b5563] md:text-[13px]">
                    추천 키워드
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-2 md:mt-3 md:gap-2.5">
                    {recommendedKeywords.map((item, idx) => {
                      const active = selectedRecommendedKeywords.includes(
                        item.keyword
                      );

                      return (
                        <button
                          key={`${item.keyword}-${idx}`}
                          type="button"
                          onClick={() => toggleRecommendedKeyword(item.keyword)}
                          className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition md:px-4 md:py-2 md:text-[13px] ${
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

                <div className="mt-4 rounded-[14px] border border-[#e5e7eb] bg-white p-4 md:mt-5 md:rounded-[18px] md:p-5">
                  <p className="text-[12px] font-bold text-[#4b5563] md:text-[13px]">
                    직접 키워드 추가
                  </p>

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (e.nativeEvent.isComposing) return;
                        addDirectKeywords();
                      }}
                      placeholder="쉼표(,)로 여러 개 입력 가능"
                      className="h-[42px] flex-1 rounded-[14px] border border-[#d1d5db] bg-[#fafafa] px-3 text-[12px] outline-none transition placeholder:text-[#9ca3af] focus:border-[#2563EB] focus:bg-white md:h-[48px] md:rounded-[16px] md:px-4 md:text-[14px]"
                    />

                    <PostlabsSlideHoverButton
                      type="button"
                      variant="outline-fill"
                      onClick={addDirectKeywords}
                      className="h-[42px] shrink-0 rounded-[14px] border border-[#d1d5db] bg-white px-4 text-[12px] font-bold md:h-[48px] md:rounded-[16px] md:px-5 md:text-[14px]"
                    >
                      <span className="transition-colors duration-200 motion-reduce:transition-none group-hover:text-white">
                        추가
                      </span>
                    </PostlabsSlideHoverButton>
                  </div>
                </div>

                <div className="mt-4 rounded-[14px] border border-[#e5e7eb] bg-white p-4 md:mt-5 md:rounded-[18px] md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 basis-[min(100%,12rem)] sm:basis-auto">
                      <p className="text-[12px] font-bold leading-snug text-[#4b5563] md:text-[13px]">
                        키워드 순서 변경
                      </p>
                      <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#6b7280] md:mt-2 md:text-[12px] md:leading-[1.65]">
                        키워드를 드래그 앤 드롭하여 순서를 변경하세요. 상위 3개의 키워드는 전체 목록에서도 검색량과 순위를 쉽게 확인하실 수 있습니다.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-bold leading-none text-[#4b5563] md:px-2.5 md:py-1 md:text-[12px]">
                      {tempKeywords.length}개
                    </span>
                  </div>

                  <div className="mt-3 md:mt-4">
                    {tempKeywords.length === 0 ? (
                      <div className="flex min-h-[100px] w-full flex-col justify-center rounded-[12px] border border-dashed border-[#d1d5db] bg-[#fafafa] px-3 py-6 text-center text-[12px] text-[#9ca3af] md:rounded-[14px] md:px-4 md:py-8 md:text-[14px]">
                        아직 추가된 키워드가 없습니다.
                      </div>
                    ) : (
                      <div
                        className="max-h-[min(46vh,380px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
                        style={{ position: "relative" }}
                      >
                        <DndContext
                          sensors={keywordModalSensors}
                          collisionDetection={closestCenter}
                          onDragStart={handleKeywordModalDragStart}
                          onDragEnd={handleKeywordModalDragEnd}
                          onDragCancel={handleKeywordModalDragCancel}
                        >
                          <SortableContext
                            items={tempKeywords}
                            strategy={verticalListSortingStrategy}
                          >
                            {tempKeywords.map((keyword, idx) => (
                              <PlaceKeywordModalSortRow
                                key={keyword}
                                keyword={keyword}
                                index={idx}
                                monthlyLabel={monthlyVolumeLabelForModal(
                                  keyword,
                                  selectedStoreSavedKeywordMap,
                                  recommendedKeywords
                                )}
                                deleting={deletingKeywordKey === keyword}
                                onRemove={() => removeTempKeyword(keyword)}
                              />
                            ))}
                          </SortableContext>
                          <DragOverlay dropAnimation={null}>
                            {activeKeywordDrag ? (
                              <div className="flex cursor-grabbing items-center gap-2 rounded-[12px] border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-lg md:rounded-[14px] md:py-3">
                                <GripVertical
                                  className="h-5 w-5 text-[#c4cad4]"
                                  strokeWidth={2}
                                />
                                <span className="text-[12px] font-bold text-[#111827] md:text-[13px]">
                                  {activeKeywordDrag}
                                </span>
                              </div>
                            ) : null}
                          </DragOverlay>
                        </DndContext>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#f3f4f6] bg-[#fcfcfc] px-4 py-3 md:px-6 md:py-4">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <PostlabsSlideHoverButton
                    variant="outline-soft"
                    onClick={closeKeywordModal}
                    disabled={savingKeywords}
                    className="h-[40px] w-full shrink-0 rounded-[12px] border border-[#d1d5db] bg-white px-4 text-[12px] font-bold md:h-[46px] md:w-auto md:min-w-[112px] md:rounded-[14px] md:px-5 md:text-[14px]"
                  >
                    취소
                  </PostlabsSlideHoverButton>

                  <PostlabsSlideHoverButton
                    variant="primary"
                    onClick={saveKeywords}
                    disabled={savingKeywords}
                    className={`h-[40px] w-full min-w-[108px] shrink-0 rounded-[12px] bg-[#333333] px-4 text-[12px] font-bold text-white md:h-[46px] md:w-auto md:min-w-[120px] md:rounded-[14px] md:px-5 md:text-[14px] ${
                      savingKeywords ? "opacity-60" : ""
                    }`}
                  >
                    {savingKeywords ? "키워드 저장중" : "키워드 저장"}
                  </PostlabsSlideHoverButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
