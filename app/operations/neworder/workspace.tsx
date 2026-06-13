"use client";
/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  X,
} from "lucide-react";
import {
  FormEvent,
  Fragment,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  calculatePriceMetrics,
  comparePriceMetrics,
  formatComposition,
  getRecommendationMetric,
  priceSortValue,
  type PriceMetrics,
  type PriceSort,
} from "@/lib/neworder/price-analysis";
import {
  normalizeStringArray,
  parseLines,
} from "@/lib/neworder/item-keywords";
import { BAEMIN_MART_BASE_URL } from "@/lib/neworder/sellers";

type View =
  | "dashboard"
  | "check"
  | "orders"
  | "price-compare"
  | "items"
  | "suppliers"
  | "purchase-history";

type Supplier = {
  id: string;
  name: string;
  contact: string | null;
  website: string | null;
  memo: string | null;
  isActive: boolean;
  updatedAt: string;
};

type Item = {
  id: string;
  name: string;
  category: string;
  minimumStock: number;
  orderUnit: string;
  orderUnitQuantity: number;
  naverSearchKeyword: string | null;
  naverSearchKeywords: string[];
  coupangSearchKeyword: string | null;
  coupangSearchKeywords: string[];
  requiredKeywords: string[];
  optionalKeywords: string[];
  preferredKeywords: string[];
  excludedKeywords: string[];
  defaultSupplierId: string | null;
  defaultSupplier: { id: string; name: string } | null;
  isActive: boolean;
  updatedAt: string;
  purchases: Array<{
    purchasedAt: string;
    totalPrice: number;
    quantity: number;
    unitPrice: number;
  }>;
};

type Order = {
  id: string;
  store: "HANNAM" | "YEONNAM";
  requestedQty: number;
  status: "REQUESTED" | "REVIEWING" | "PURCHASED" | "ON_HOLD";
  memo: string | null;
  updatedAt: string;
  item: {
    id: string;
    name: string;
    category: string;
    orderUnit: string;
    orderUnitQuantity: number;
  };
};

type Purchase = {
  id: string;
  purchasedAt: string;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
  memo: string | null;
  createdByName: string;
  item: { id: string; name: string; category: string };
  supplier: { id: string; name: string } | null;
};

type InventoryCheck = {
  id: string;
  store: "HANNAM" | "YEONNAM";
  memo: string | null;
  completedAt: string;
  shortageItemCount: number;
};

type PriceCandidate = {
  id: string;
  itemId: string;
  source:
    | "NAVER"
    | "COUPANG"
    | "ORDERHERO"
    | "BAEMIN_MART"
    | "MANUAL"
    | "ETC";
  mallName: string;
  title: string;
  productUrl: string;
  imageUrl: string | null;
  productPrice: number;
  shippingFee: number;
  shippingUnitCount: number;
  shippingFeeMode:
    | "INCLUDED"
    | "UNKNOWN"
    | "ORDER_ONCE"
    | "PER_ITEM"
    | "PER_N_ITEMS";
  shippingStatus: "FREE" | "PAID" | "UNKNOWN";
  shippingNote: string | null;
  shippingCondition: string | null;
  shippingNeedsConfirmation: boolean;
  effectiveShippingFee: number;
  totalPrice: number;
  totalPriceWithShipping: number;
  unitPrice: number;
  quantityPerPack: number;
  bundleQuantity: number;
  volumePerUnit: number | null;
  volumeUnit: string | null;
  packageUnit: string | null;
  pricePer100: number | null;
  pricePerMeasure: number | null;
  optionMemo: string | null;
  optionPriceChecked: boolean;
  savedBy: string;
  isCurrentBest: boolean;
  isPinned: boolean;
  pinnedAt: string | null;
  checkedAt: string;
  item: { id: string; name: string };
};

type SavedPurchaseCandidate = Omit<PriceCandidate, "item"> & {
  item: { id: string; name: string; category: string };
};

type PriceHistory = {
  id: string;
  itemId: string;
  source: PriceCandidate["source"];
  mallName: string;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  productPrice: number;
  totalPrice: number;
  totalPriceWithShipping: number;
  shippingFee: number;
  shippingUnitCount: number;
  shippingFeeMode: PriceCandidate["shippingFeeMode"] | null;
  shippingStatus: "FREE" | "PAID" | "UNKNOWN";
  shippingNote: string | null;
  shippingCondition: string | null;
  shippingNeedsConfirmation: boolean;
  effectiveShippingFee: number;
  quantity: number;
  bundleQuantity: number;
  unitAmount: number | null;
  unitType: string | null;
  packageUnit: string | null;
  unitPrice: number;
  pricePer100: number | null;
  pricePerMeasure: number | null;
  optionMemo: string | null;
  optionPriceChecked: boolean;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

type Snapshot = {
  items: Item[];
  suppliers: Supplier[];
  orders: Order[];
  purchases: Purchase[];
  checks: InventoryCheck[];
  priceCandidates: PriceCandidate[];
  purchaseList: SavedPurchaseCandidate[];
  priceHistories: PriceHistory[];
};

function normalizeItem(item: Item): Item {
  const raw = item as Item & {
    excludeKeywords?: unknown;
    naverSearchKeywords?: unknown;
    coupangSearchKeywords?: unknown;
    requiredKeywords?: unknown;
    optionalKeywords?: unknown;
    preferredKeywords?: unknown;
    excludedKeywords?: unknown;
  };
  return {
    ...item,
    naverSearchKeywords: normalizeStringArray(raw.naverSearchKeywords),
    coupangSearchKeywords: normalizeStringArray(raw.coupangSearchKeywords),
    requiredKeywords: normalizeStringArray(raw.requiredKeywords),
    optionalKeywords: normalizeStringArray(raw.optionalKeywords),
    preferredKeywords: normalizeStringArray(raw.preferredKeywords),
    excludedKeywords: normalizeStringArray(
      raw.excludedKeywords ?? raw.excludeKeywords,
      /[,;\r\n]+/
    ),
  };
}

function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    items: Array.isArray(snapshot.items)
      ? snapshot.items.map(normalizeItem)
      : [],
    purchaseList: Array.isArray(snapshot.purchaseList)
      ? snapshot.purchaseList.map((candidate) => ({
          ...candidate,
          isPinned: candidate.isPinned === true,
          pinnedAt:
            typeof candidate.pinnedAt === "string"
              ? candidate.pinnedAt
              : null,
        }))
      : [],
    priceHistories: Array.isArray(snapshot.priceHistories)
      ? snapshot.priceHistories
      : [],
  };
}

async function readJsonResponse(
  response: Response
): Promise<Record<string, unknown>> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    throw new Error(
      response.ok
        ? "서버 응답이 비어 있습니다."
        : `서버 요청에 실패했습니다. (${response.status})`
    );
  }

  try {
    return JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error(
      response.ok
        ? "서버 응답 형식을 읽을 수 없습니다."
        : `서버 요청에 실패했습니다. (${response.status})`
    );
  }
}

function responseError(
  payload: Record<string, unknown>,
  fallback: string
): string {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }
  return typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : fallback;
}

type SearchCandidate = {
  source:
    | "NAVER"
    | "COUPANG"
    | "ORDERHERO"
    | "BAEMIN_MART"
    | "MANUAL"
    | "ETC";
  title: string;
  productUrl: string;
  image: string | null;
  mallName: string;
  matchedKeyword?: string | null;
  itemPrice: number;
  shippingFee: number;
  shippingUnitCount: number;
  shippingStatus: "FREE" | "PAID" | "UNKNOWN";
  shippingNote?: string | null;
  shippingEnrichmentStatus?:
    | "CHECKING"
    | "COMPLETED"
    | "FAILED"
    | "NOT_CHECKED";
  shippingCondition?: string | null;
  shippingNeedsConfirmation?: boolean;
  effectiveShippingFee?: number;
  quantityPerPack: number;
  volumePerUnit: number | null;
  volumeUnit: string | null;
  packageUnit: string;
  isManual?: boolean;
  isDirectSearch?: boolean;
  passesRequired?: boolean;
  optionalMatchCount?: number;
  preferredMatchCount?: number;
};

function defaultPriceSort(itemName: string, category: string): PriceSort {
  return getRecommendationMetric(itemName, category) === "pricePer100"
    ? "pricePer100"
    : "unitPrice";
}

const STORE_LABEL = { HANNAM: "한남점", YEONNAM: "연남점" } as const;
const STATUS_LABEL = {
  REQUESTED: "요청됨",
  REVIEWING: "확인중",
  PURCHASED: "구매완료",
  ON_HOLD: "보류",
} as const;

function money(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function PageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-black tracking-tight lg:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-600 focus:ring-2 focus:ring-slate-200";
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border-0 bg-[#123f34] px-4 text-sm font-bold text-white transition hover:bg-[#0f332b] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";
const primaryLinkClass =
  "inline-flex items-center justify-center gap-1 border-0 bg-[#123f34] font-bold !text-white transition hover:bg-[#0f332b] hover:!text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:bg-slate-200 aria-disabled:!text-slate-600";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function NewOrderWorkspace({ view }: { view: View }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/operations/neworder", {
        cache: "no-store",
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(responseError(payload, "조회에 실패했습니다."));
      }
      setData(normalizeSnapshot(payload as Snapshot));
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "조회에 실패했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data comes from the authenticated operations API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const mutate = useCallback(
    async (payload: Record<string, unknown>, successMessage: string) => {
      setSaving(true);
      setMessage(null);
      try {
        const response = await fetch("/api/operations/neworder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(responseError(result, "저장에 실패했습니다."));
        }
        setMessage(successMessage);
        await load();
        return true;
      } catch (cause) {
        setMessage(
          cause instanceof Error ? cause.message : "저장에 실패했습니다."
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const updateInlinePriceCandidate = useCallback(
    async (
      payload: Record<string, unknown>
    ): Promise<{ ok: boolean; message: string }> => {
      setSaving(true);
      setMessage(null);
      try {
        if (process.env.NODE_ENV === "development") {
          console.log("[neworder/inline-update] 요청", {
            candidateId: payload.candidateId,
            itemId: payload.itemId,
            title: payload.title,
            source: payload.source,
            optionPriceChecked: payload.optionPriceChecked,
            optionMemo: payload.optionMemo,
          });
        }
        const response = await fetch("/api/operations/neworder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await readJsonResponse(response);
        if (!response.ok || result.ok !== true) {
          const reason =
            typeof result.reason === "string" && result.reason
              ? ` (${result.reason})`
              : "";
          const failureMessage = `${responseError(
            result,
            "저장에 실패했습니다."
          )}${reason}`;
          if (process.env.NODE_ENV === "development") {
            console.warn("[neworder/inline-update] 실패", {
              status: response.status,
              response: result,
            });
          }
          setMessage(failureMessage);
          return { ok: false, message: failureMessage };
        }
        await load();
        const successMessage = "구매목록이 업데이트되었습니다.";
        setMessage(successMessage);
        return { ok: true, message: successMessage };
      } catch (cause) {
        const failureMessage =
          cause instanceof Error
            ? cause.message
            : "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
        if (process.env.NODE_ENV === "development") {
          console.warn("[neworder/inline-update] 요청 실패", {
            reason: failureMessage,
          });
        }
        setMessage(failureMessage);
        return { ok: false, message: failureMessage };
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const deletePriceCandidate = useCallback(async (candidateId: string) => {
    setMessage(null);
    try {
      const response = await fetch("/api/operations/neworder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deletePriceCandidate",
          candidateId,
        }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok || result.ok !== true) {
        throw new Error(
          responseError(result, "삭제에 실패했습니다. 다시 시도해 주세요.")
        );
      }
      setData((current) =>
        current
          ? {
              ...current,
              purchaseList: current.purchaseList.filter(
                (candidate) => candidate.id !== candidateId
              ),
            }
          : current
      );
      setMessage("구매목록에서 삭제했습니다.");
      return true;
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "삭제에 실패했습니다. 다시 시도해 주세요."
      );
      return false;
    }
  }, []);

  const togglePriceCandidatePin = useCallback(
    async (candidateId: string, nextPinned: boolean) => {
      if (!candidateId) {
        setMessage("고정할 상품 ID를 찾지 못했습니다.");
        return false;
      }

      const previous = data?.purchaseList.find(
        (candidate) => candidate.id === candidateId
      );
      if (!previous) {
        setMessage("고정할 상품을 찾지 못했습니다.");
        return false;
      }

      const optimisticPinnedAt = nextPinned
        ? new Date().toISOString()
        : null;
      setMessage(null);
      setData((current) =>
        current
          ? {
              ...current,
              purchaseList: current.purchaseList.map((candidate) =>
                candidate.id === candidateId
                  ? {
                      ...candidate,
                      isPinned: nextPinned,
                      pinnedAt: optimisticPinnedAt,
                    }
                  : candidate
              ),
            }
          : current
      );

      try {
        if (process.env.NODE_ENV === "development") {
          console.log("[neworder/toggle-pin] 요청", {
            candidateId,
            nextPinned,
          });
        }
        const response = await fetch("/api/operations/neworder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "togglePriceCandidatePin",
            candidateId,
            isPinned: nextPinned,
          }),
        });
        const result = await readJsonResponse(response);
        if (!response.ok || result.ok !== true) {
          const detail = responseError(
            result,
            "고정 상태 변경에 실패했습니다."
          );
          if (process.env.NODE_ENV === "development") {
            console.warn("[neworder/toggle-pin] 실패", {
              status: response.status,
              response: result,
            });
          }
          throw new Error(detail);
        }

        const pinnedAt =
          typeof result.pinnedAt === "string"
            ? result.pinnedAt
            : nextPinned
              ? optimisticPinnedAt
              : null;
        setData((current) =>
          current
            ? {
                ...current,
                purchaseList: current.purchaseList.map((candidate) =>
                  candidate.id === candidateId
                    ? { ...candidate, isPinned: nextPinned, pinnedAt }
                    : candidate
                ),
              }
            : current
        );
        setMessage(
          nextPinned
            ? `${previous.item.name}을(를) 상단에 고정했습니다.`
            : `${previous.item.name} 고정을 해제했습니다.`
        );
        return true;
      } catch (cause) {
        setData((current) =>
          current
            ? {
                ...current,
                purchaseList: current.purchaseList.map((candidate) =>
                  candidate.id === candidateId ? previous : candidate
                ),
              }
            : current
        );
        const detail =
          cause instanceof Error ? cause.message : "알 수 없는 오류";
        if (process.env.NODE_ENV === "development") {
          console.warn("[neworder/toggle-pin] 요청 실패", {
            candidateId,
            nextPinned,
            reason: detail,
          });
        }
        setMessage(
          detail === "고정 상태 변경에 실패했습니다."
            ? detail
            : `고정 상태 변경에 실패했습니다. ${detail}`
        );
        return false;
      }
    },
    [data]
  );

  if (loading && !data) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-slate-500">
        <Loader2 className="size-7 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <Panel>
        <p className="text-sm text-red-700">{message}</p>
        <button className={`${buttonClass} mt-4`} onClick={() => void load()}>
          다시 불러오기
        </button>
      </Panel>
    );
  }

  return (
    <>
      {message && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} aria-label="알림 닫기">
            ×
          </button>
        </div>
      )}
      {view === "dashboard" && <Dashboard data={data} />}
      {view === "check" && (
        <InventoryCheckView data={data} saving={saving} mutate={mutate} />
      )}
      {view === "orders" && (
        <PurchaseListView
          data={data}
          saving={saving}
          mutate={mutate}
          updateInlinePriceCandidate={updateInlinePriceCandidate}
          onTogglePin={togglePriceCandidatePin}
          onDeleteCandidate={deletePriceCandidate}
        />
      )}
      {view === "items" && (
        <ItemsView data={data} saving={saving} mutate={mutate} />
      )}
      {view === "suppliers" && (
        <SuppliersView data={data} saving={saving} mutate={mutate} />
      )}
      {view === "purchase-history" && (
        <PurchasesView data={data} saving={saving} mutate={mutate} />
      )}
      {view === "price-compare" && (
        <PriceCompareView
          data={data}
          saving={saving}
          mutate={mutate}
        />
      )}
    </>
  );
}

function Dashboard({ data }: { data: Snapshot }) {
  const activeItems = data.items.filter((item) => item.isActive);
  const pending = data.orders.filter((order) => order.status !== "PURCHASED");
  const recentPurchases = data.purchases.slice(0, 5);
  const cards = [
    {
      label: "활성 품목",
      value: activeItems.length,
      icon: PackageCheck,
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "미완료 발주",
      value: pending.length,
      icon: ShoppingCart,
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "등록 거래처",
      value: data.suppliers.filter((supplier) => supplier.isActive).length,
      icon: Store,
      tone: "bg-slate-100 text-slate-700",
    },
    {
      label: "구매 기록",
      value: data.purchases.length,
      icon: CircleDollarSign,
      tone: "bg-slate-100 text-slate-700",
    },
  ];

  return (
    <>
      <PageTitle
        title="뉴오더클럽 운영 현황"
        description="한남점과 연남점의 재고, 발주, 구매 흐름을 한 곳에서 관리합니다."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Panel key={label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-3xl font-black">{value}</p>
              </div>
              <span className={`rounded-2xl p-3 ${tone}`}>
                <Icon className="size-5" />
              </span>
            </div>
          </Panel>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel>
          <h2 className="font-bold">최근 재고 체크</h2>
          <div className="mt-4 space-y-3">
            {data.checks.slice(0, 6).map((check) => (
              <div
                key={check.id}
                className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0"
              >
                <div>
                  <p className="font-semibold">{STORE_LABEL[check.store]}</p>
                  <p className="text-xs text-slate-500">
                    {dateTime(check.completedAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    check.shortageItemCount
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  부족 {check.shortageItemCount}개
                </span>
              </div>
            ))}
            {data.checks.length === 0 && (
              <p className="text-sm text-slate-400">아직 체크 기록이 없습니다.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <h2 className="font-bold">최근 구매내역</h2>
          <div className="mt-4 space-y-3">
            {recentPurchases.map((purchase) => (
              <div
                key={purchase.id}
                className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0"
              >
                <div>
                  <p className="font-semibold">{purchase.item.name}</p>
                  <p className="text-xs text-slate-500">
                    {purchase.supplier?.name || "거래처 미지정"} ·{" "}
                    {purchase.quantity}개
                  </p>
                </div>
                <strong>{money(purchase.totalPrice)}</strong>
              </div>
            ))}
            {recentPurchases.length === 0 && (
              <p className="text-sm text-slate-400">아직 구매 기록이 없습니다.</p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function InventoryCheckView({
  data,
  saving,
  mutate,
}: {
  data: Snapshot;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
}) {
  const items = data.items.filter((item) => item.isActive);
  const [store, setStore] = useState<"HANNAM" | "YEONNAM">("HANNAM");
  const [memo, setMemo] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate(
      {
        action: "saveCheck",
        store,
        memo,
        entries: items.map((item) => ({
          itemId: item.id,
          currentQty: quantities[item.id] ?? 0,
        })),
      },
      "재고 체크를 저장하고 부족 품목을 발주 목록에 반영했습니다."
    );
    if (ok) {
      setMemo("");
      setQuantities({});
    }
  }

  return (
    <>
      <PageTitle
        title="재고 체크"
        description="현재 수량을 입력하면 최소 재고 기준으로 부족분과 발주 필요 수량을 계산합니다."
      />
      <form onSubmit={submit}>
        <Panel>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <label className="text-sm font-semibold">
              매장
              <select
                className={`${inputClass} mt-2`}
                value={store}
                onChange={(event) =>
                  setStore(event.target.value as "HANNAM" | "YEONNAM")
                }
              >
                <option value="HANNAM">한남점</option>
                <option value="YEONNAM">연남점</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              체크 메모
              <input
                className={`${inputClass} mt-2`}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="특이사항을 입력하세요."
              />
            </label>
          </div>
        </Panel>
        <Panel className="mt-4 overflow-hidden p-0 lg:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">품목</th>
                  <th className="px-4 py-3">카테고리</th>
                  <th className="px-4 py-3">최소 재고</th>
                  <th className="px-4 py-3">현재 수량</th>
                  <th className="px-4 py-3">판정</th>
                  <th className="px-4 py-3">발주 필요</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const current = quantities[item.id] ?? 0;
                  const rawShortage = Math.max(item.minimumStock - current, 0);
                  const shortage =
                    rawShortage === 0
                      ? 0
                      : Math.ceil(rawShortage / item.orderUnitQuantity) *
                        item.orderUnitQuantity;
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold">{item.name}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {item.category}
                      </td>
                      <td className="px-4 py-3">{item.minimumStock}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          className="h-9 w-28 rounded-lg border border-slate-200 px-3"
                          value={current}
                          onChange={(event) =>
                            setQuantities((values) => ({
                              ...values,
                              [item.id]: Math.max(
                                0,
                                Number(event.target.value) || 0
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        {shortage > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                            <AlertTriangle className="size-3" /> 부족
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            <Check className="size-3" /> 정상
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {shortage
                          ? `${shortage} (${item.orderUnit})`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.length === 0 && (
            <p className="p-6 text-sm text-slate-500">
              품목 관리에서 활성 품목을 먼저 등록해 주세요.
            </p>
          )}
        </Panel>
        <div className="mt-4 flex justify-end">
          <button className={buttonClass} disabled={saving || items.length === 0}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            체크 완료 저장
          </button>
        </div>
      </form>
    </>
  );
}

function sourceLabel(source: PriceCandidate["source"]) {
  return {
    NAVER: "네이버",
    COUPANG: "쿠팡",
    ORDERHERO: "오더히어로",
    BAEMIN_MART: "배민상회",
    MANUAL: "직접 추가",
    ETC: "기타",
  }[source];
}

function sourceBadgeClass(source: PriceCandidate["source"]) {
  return {
    NAVER: "bg-slate-100 text-slate-700",
    COUPANG: "bg-slate-100 text-slate-700",
    ORDERHERO: "bg-slate-100 text-slate-700",
    BAEMIN_MART: "bg-slate-100 text-slate-700",
    MANUAL: "bg-slate-100 text-slate-700",
    ETC: "bg-slate-100 text-slate-700",
  }[source];
}

function detectManualSource(
  value: string
): "NAVER" | "COUPANG" | "BAEMIN_MART" | "ETC" | null {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (
      host === "naver.com" ||
      host.endsWith(".naver.com")
    ) {
      return "NAVER";
    }
    if (
      host === "coupang.com" ||
      host.endsWith(".coupang.com")
    ) {
      return "COUPANG";
    }
    if (host === "mart.baemin.com") return "BAEMIN_MART";
    return "ETC";
  } catch {
    return null;
  }
}

function formatSavedComposition(candidate: {
  quantity: number;
  unitAmount: number | null;
  unitType: string | null;
  packageUnit: string | null;
}) {
  if (candidate.unitAmount && candidate.unitType) {
    return `${candidate.unitAmount}${candidate.unitType} × ${candidate.quantity}${candidate.packageUnit || "개"}`;
  }
  return `${candidate.quantity}${candidate.packageUnit || "개"}`;
}

function ProductImage({
  src,
  alt,
  compact = false,
}: {
  src: string | null;
  alt: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-center font-black tracking-wide text-slate-400 ${
        compact
          ? "size-14 text-[9px]"
          : "size-[72px] text-[10px]"
      }`}
    >
      <span aria-hidden="true">NO IMAGE</span>
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full bg-white object-contain p-1"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}

function normalizePurchaseSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
}

function PurchaseListView({
  data,
  saving,
  mutate,
  updateInlinePriceCandidate,
  onTogglePin,
  onDeleteCandidate,
}: {
  data: Snapshot;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
  updateInlinePriceCandidate: (
    payload: Record<string, unknown>
  ) => Promise<{ ok: boolean; message: string }>;
  onTogglePin: (
    candidateId: string,
    nextPinned: boolean
  ) => Promise<boolean>;
  onDeleteCandidate: (candidateId: string) => Promise<boolean>;
}) {
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const [deletingCandidate, setDeletingCandidate] =
    useState<SavedPurchaseCandidate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [editingShippingId, setEditingShippingId] = useState<string | null>(
    null
  );
  const [shippingMode, setShippingMode] = useState<
    "INCLUDED" | "ENTERED" | "UNKNOWN"
  >("UNKNOWN");
  const [shippingChargeMode, setShippingChargeMode] = useState<
    "ORDER_ONCE" | "PER_ITEM" | "PER_N_ITEMS"
  >("ORDER_ONCE");
  const [shippingFeeDraft, setShippingFeeDraft] = useState("");
  const [shippingUnitCountDraft, setShippingUnitCountDraft] = useState("1");
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [shippingSavingId, setShippingSavingId] = useState<string | null>(null);
  const [openedCompareItemId, setOpenedCompareItemId] = useState<string | null>(
    null
  );
  const categories = [
    ...new Set(data.purchaseList.map((candidate) => candidate.item.category)),
  ];
  const normalizedQuery = normalizePurchaseSearch(query);
  const filtered = data.purchaseList
    .filter((candidate) => {
      if (category !== "ALL" && candidate.item.category !== category) {
        return false;
      }
      if (!normalizedQuery) return true;
      const searchable = [
        candidate.item.name,
        candidate.title,
        candidate.item.category,
        candidate.source,
        sourceLabel(candidate.source),
        candidate.mallName,
        candidate.shippingNote,
      ]
        .filter(Boolean)
        .join(" ");
      return normalizePurchaseSearch(searchable).includes(normalizedQuery);
    })
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isPinned && b.isPinned) {
        return (
          new Date(b.pinnedAt || 0).getTime() -
          new Date(a.pinnedAt || 0).getTime()
        );
      }
      return 0;
    });
  const selectedCandidate = data.purchaseList.find(
    (candidate) => candidate.itemId === historyItemId
  );
  const historyRows = historyItemId
    ? [
        ...data.priceHistories
          .filter((history) => history.itemId === historyItemId)
          .map((history) => ({
            id: `saved-${history.id}`,
            date: history.createdAt,
            type: "저장" as const,
            source: history.mallName || sourceLabel(history.source),
            totalPrice:
              history.totalPriceWithShipping || history.totalPrice,
            composition: formatSavedComposition(history),
            pricePer100: history.pricePer100,
            unitType: history.unitType,
            shippingFee: history.shippingFee,
            shippingUnitCount: history.shippingUnitCount || 1,
            shippingStatus: history.shippingStatus,
            shippingNote: history.shippingNote,
            shippingCondition: history.shippingCondition,
            effectiveShippingFee:
              history.effectiveShippingFee || history.shippingFee,
            shippingNeedsConfirmation:
              history.shippingNeedsConfirmation,
            person: history.createdBy,
            url: history.productUrl as string | null,
            imageUrl: history.imageUrl,
          })),
        ...data.purchases
          .filter((purchase) => purchase.item.id === historyItemId)
          .map((purchase) => ({
            id: `purchase-${purchase.id}`,
            date: purchase.purchasedAt,
            type: "구매" as const,
            source: purchase.supplier?.name || "구매처 미지정",
            totalPrice: purchase.totalPrice,
            composition: `${purchase.quantity}개`,
            pricePer100: null,
            unitType: null,
            shippingFee: 0,
            shippingUnitCount: 1,
            shippingStatus: null,
            shippingNote: null,
            shippingCondition: null,
            effectiveShippingFee: 0,
            shippingNeedsConfirmation: false,
            person: purchase.createdByName,
            url: null,
            imageUrl: null,
          })),
      ].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    : [];

  function startPriceEdit(candidate: SavedPurchaseCandidate) {
    setEditingPriceId(candidate.id);
    setPriceDraft(String(candidate.productPrice));
    setPriceError(null);
  }

  function cancelPriceEdit() {
    setEditingPriceId(null);
    setPriceDraft("");
    setPriceError(null);
  }

  async function savePriceEdit(candidate: SavedPurchaseCandidate) {
    const nextPrice = Number(priceDraft);
    if (!Number.isInteger(nextPrice) || nextPrice < 1) {
      setPriceError("상품가는 1원 이상으로 입력해 주세요.");
      return;
    }
    setPriceError(null);
    const ok = await mutate(
      {
        action: "updatePriceCandidatePrice",
        candidateId: candidate.id,
        itemPrice: nextPrice,
      },
      `${candidate.item.name} 상품가를 수정했습니다.`
    );
    if (ok) cancelPriceEdit();
  }

  function startShippingEdit(candidate: SavedPurchaseCandidate) {
    setEditingShippingId(candidate.id);
    setShippingMode(
      candidate.shippingStatus === "FREE"
        ? "INCLUDED"
        : candidate.shippingStatus === "PAID"
          ? "ENTERED"
          : "UNKNOWN"
    );
    setShippingFeeDraft(
      candidate.shippingStatus === "PAID"
        ? String(candidate.shippingFee)
        : ""
    );
    setShippingChargeMode(
      candidate.shippingFeeMode === "PER_ITEM" ||
        candidate.shippingFeeMode === "PER_N_ITEMS"
        ? candidate.shippingFeeMode
        : "ORDER_ONCE"
    );
    setShippingUnitCountDraft(
      candidate.shippingFeeMode === "PER_N_ITEMS"
        ? String(Math.max(1, candidate.shippingUnitCount || 1))
        : "1"
    );
    setShippingError(null);
  }

  function cancelShippingEdit() {
    setEditingShippingId(null);
    setShippingFeeDraft("");
    setShippingChargeMode("ORDER_ONCE");
    setShippingUnitCountDraft("1");
    setShippingError(null);
  }

  async function saveShippingEdit(candidate: SavedPurchaseCandidate) {
    if (!candidate.id) {
      setShippingError("배송비를 저장할 상품 ID를 찾지 못했습니다.");
      return;
    }
    if (shippingSavingId) return;
    const shippingFee =
      shippingMode === "ENTERED" ? Number(shippingFeeDraft) : 0;
    const shippingUnitCount =
      shippingChargeMode === "PER_N_ITEMS"
        ? Number(shippingUnitCountDraft)
        : 1;
    if (
      shippingMode === "ENTERED" &&
      (shippingFeeDraft.trim() === "" ||
        !Number.isInteger(shippingFee) ||
        shippingFee < 0)
    ) {
      setShippingError("배송비 금액을 입력해 주세요.");
      return;
    }
    if (
      shippingMode === "ENTERED" &&
      shippingChargeMode === "PER_N_ITEMS" &&
      (!Number.isInteger(shippingUnitCount) || shippingUnitCount < 1)
    ) {
      setShippingError("몇 개당 배송비가 붙는지 입력해 주세요.");
      return;
    }
    setShippingError(null);
    const payload = {
      action: "updatePriceCandidateShipping",
      candidateId: candidate.id,
      shippingMode,
      shippingFee,
      shippingFeeMode:
        shippingMode === "ENTERED" ? shippingChargeMode : shippingMode,
      shippingUnitCount,
    };
    if (process.env.NODE_ENV === "development") {
      console.log("[shipping fee save clicked]", {
        itemId: candidate.id,
        selectedShippingMode: payload.shippingFeeMode,
        shippingFee,
        shippingFeeUnitCount: shippingUnitCount,
      });
    }
    setShippingSavingId(candidate.id);
    try {
      const ok = await mutate(
        payload,
        `${candidate.item.name} 배송비 설정을 변경했습니다.`
      );
      if (ok) {
        cancelShippingEdit();
      } else {
        setShippingError("배송비 설정 변경에 실패했습니다.");
      }
    } finally {
      setShippingSavingId(null);
    }
  }

  async function togglePin(candidate: SavedPurchaseCandidate) {
    if (pinningId) return;
    if (!candidate.id) return;
    setPinningId(candidate.id);
    await onTogglePin(candidate.id, !candidate.isPinned);
    setPinningId(null);
  }

  return (
    <>
      <PageTitle
        title="구매목록"
        description="상품등록에서 저장한 품목별 최신 구매 후보를 함께 확인하고 구매 링크를 엽니다."
      />
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex w-full flex-1 flex-wrap items-end gap-3">
            <label className="w-full max-w-xs text-xs font-semibold text-slate-500">
              카테고리
              <select
                className={`${inputClass} mt-1`}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="ALL">전체 카테고리</option>
                {categories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="w-full min-w-0 flex-1 text-xs font-semibold text-slate-500 sm:min-w-72">
              검색
              <span className="relative mt-1 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="품목명, 상품명, 구매처 검색"
                  className={`${inputClass} px-9`}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="검색어 초기화"
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </span>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {data.purchaseList.length}개 품목 중 {filtered.length}개 표시
          </p>
        </div>
      </Panel>
      <div className="mt-4 space-y-2.5">
        {filtered.map((candidate) => {
          const pricePer100 =
            candidate.pricePer100 != null &&
            (candidate.volumeUnit === "ml" ||
              candidate.volumeUnit === "g")
              ? money(candidate.pricePer100)
              : null;
          const shippingUnknown = candidate.shippingStatus === "UNKNOWN";
          const shippingQuantity = Math.max(
            1,
            candidate.quantityPerPack || candidate.bundleQuantity || 1
          );
          const shippingFeeMode =
            candidate.shippingFeeMode ||
            (candidate.shippingStatus === "FREE"
              ? "INCLUDED"
              : candidate.shippingStatus === "UNKNOWN"
                ? "UNKNOWN"
                : candidate.shippingUnitCount > 1
                  ? "PER_N_ITEMS"
                  : "ORDER_ONCE");
          const shippingLabel =
            candidate.shippingStatus === "FREE"
              ? "배송비 포함"
              : candidate.shippingStatus === "PAID"
                ? `배송비 ${money(candidate.shippingFee)} / ${
                    shippingFeeMode === "PER_ITEM"
                      ? "1개당"
                      : shippingFeeMode === "PER_N_ITEMS"
                        ? `${Math.max(1, candidate.shippingUnitCount)}개당`
                        : "주문"
                  }`
                : "배송비 미확인";
          const shippingPreviewFee = (() => {
            const fee = Number(shippingFeeDraft);
            if (
              shippingMode !== "ENTERED" ||
              shippingFeeDraft.trim() === "" ||
              !Number.isInteger(fee) ||
              fee < 0
            ) {
              return null;
            }
            if (shippingChargeMode === "PER_ITEM") {
              return fee * shippingQuantity;
            }
            if (shippingChargeMode === "PER_N_ITEMS") {
              const unitCount = Number(shippingUnitCountDraft);
              return Number.isInteger(unitCount) && unitCount > 0
                ? Math.ceil(shippingQuantity / unitCount) * fee
                : null;
            }
            return fee;
          })();
          const priceSummary = [
            ...(pricePer100
              ? [
                  `100${candidate.volumeUnit}당 ${pricePer100}${
                    shippingUnknown ? " (배송비 제외)" : ""
                  }`,
                ]
              : []),
          ];
          return (
            <article
              key={candidate.id}
              className={`min-w-0 overflow-hidden rounded-2xl border bg-white transition ${
                openedCompareItemId === candidate.itemId
                  ? "border-slate-400 shadow-md ring-1 ring-slate-200"
                  : "border-slate-200 shadow-sm"
              }`}
            >
              <div className="grid min-w-0 grid-cols-[32px_72px_minmax(0,1fr)] items-start gap-3 p-3 md:min-h-[112px] md:grid-cols-[32px_72px_minmax(0,1fr)_minmax(300px,auto)] md:items-center">
                <button
                  type="button"
                  title={
                    candidate.isPinned ? "즐겨찾기 해제" : "즐겨찾기 고정"
                  }
                  aria-label={
                    candidate.isPinned ? "즐겨찾기 해제" : "즐겨찾기 고정"
                  }
                  aria-pressed={candidate.isPinned}
                  disabled={pinningId === candidate.id || saving}
                  onClick={(event) => {
                    event.stopPropagation();
                    void togglePin(candidate);
                  }}
                  className={`mt-1 inline-flex size-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    candidate.isPinned
                      ? "border-amber-200 bg-amber-50 text-amber-500 hover:bg-amber-100"
                      : "border-slate-200 bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  }`}
                >
                  {pinningId === candidate.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Star
                      className="size-4"
                      fill={candidate.isPinned ? "currentColor" : "none"}
                    />
                  )}
                </button>
                <ProductImage
                  src={candidate.imageUrl}
                  alt={`${candidate.title} 상품 이미지`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="mr-1 font-black text-slate-950">
                      {candidate.item.name}
                    </h2>
                    {candidate.isPinned && (
                      <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        고정
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {candidate.item.category}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sourceBadgeClass(candidate.source)}`}
                    >
                      {sourceLabel(candidate.source)}
                    </span>
                    {candidate.shippingStatus === "PAID" && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        배송비 직접 입력
                      </span>
                    )}
                    {candidate.shippingStatus === "FREE" && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        배송비 포함
                      </span>
                    )}
                    {shippingUnknown && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        배송비 확인 필요
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        candidate.optionPriceChecked
                          ? "bg-slate-200 text-slate-700"
                          : "border border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {candidate.optionPriceChecked
                        ? "옵션가 확인 완료"
                        : "옵션가 확인 필요"}
                    </span>
                  </div>

                  <p className="mt-1.5 line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-800">
                    {candidate.title}
                  </p>
                  {candidate.optionMemo && (
                    <p className="mt-1 text-xs">
                      <span className="text-slate-500">구매 옵션: </span>
                      <span className="font-semibold text-blue-600">
                        {candidate.optionMemo}
                      </span>
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {candidate.mallName || sourceLabel(candidate.source)}
                  </p>
                </div>

                <div className="col-span-3 flex min-w-0 flex-col md:col-span-1 md:items-end md:text-right">
                  <div className="flex min-w-0 flex-col md:w-fit md:items-start md:text-left">
                  <p className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs leading-5 text-slate-600">
                    {editingPriceId === candidate.id ? (
                      <span className="flex flex-wrap items-center gap-1.5 rounded-lg bg-red-50 p-1.5">
                        <input
                          type="number"
                          min="1"
                          value={priceDraft}
                          autoFocus
                          aria-label={`${candidate.item.name} 상품가`}
                          className="h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm font-bold text-red-600 outline-none focus:border-[#123f34] focus:ring-2 focus:ring-slate-200"
                          onChange={(event) => {
                            setPriceDraft(event.target.value);
                            setPriceError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void savePriceEdit(candidate);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelPriceEdit();
                            }
                          }}
                        />
                        <span className="text-xs text-slate-500">원</span>
                        <button
                          type="button"
                          className={`${buttonClass} h-8 rounded-lg px-2.5 text-xs`}
                          disabled={saving || shippingSavingId === candidate.id}
                          onClick={() => void savePriceEdit(candidate)}
                        >
                          {saving && <Loader2 className="size-3 animate-spin" />}
                          저장
                        </button>
                        <button
                          type="button"
                          className={`${secondaryButtonClass} h-8 rounded-lg px-2.5 text-xs`}
                          disabled={saving}
                          onClick={cancelPriceEdit}
                        >
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 text-sm font-extrabold leading-5 text-red-600 transition hover:bg-red-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                        onClick={() => startPriceEdit(candidate)}
                        aria-label={`${candidate.item.name} 상품가 수정`}
                      >
                        상품가 {money(candidate.productPrice)}
                        <Pencil className="size-3" />
                      </button>
                    )}
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 font-semibold text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                      onClick={() =>
                        editingShippingId === candidate.id
                          ? cancelShippingEdit()
                          : startShippingEdit(candidate)
                      }
                      aria-expanded={editingShippingId === candidate.id}
                    >
                      {shippingLabel}
                      <Pencil className="size-3" />
                    </button>
                    {priceSummary.map((summary) => (
                      <Fragment key={summary}>
                        <span aria-hidden="true">·</span>
                        <span>{summary}</span>
                      </Fragment>
                    ))}
                  </p>
                  {editingPriceId === candidate.id && priceError && (
                    <p className="mt-1 text-xs font-semibold text-red-600">
                      {priceError}
                    </p>
                  )}
                  {editingShippingId === candidate.id && (
                    <div className="mt-2 w-full max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                      <p className="text-xs font-black text-slate-800">
                        배송비 설정
                      </p>
                      <div className="mt-2 grid gap-1.5">
                        {(
                          [
                            ["INCLUDED", "배송비 포함"],
                            ["ENTERED", "배송비 직접 입력"],
                            ["UNKNOWN", "미확인으로 변경"],
                          ] as const
                        ).map(([value, label]) => (
                          <label
                            key={value}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                          >
                            <input
                              type="radio"
                              name={`shipping-mode-${candidate.id}`}
                              value={value}
                              checked={shippingMode === value}
                              onChange={() => {
                                setShippingMode(value);
                                setShippingError(null);
                              }}
                              className="size-4 accent-[#123f34]"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      {shippingMode === "ENTERED" && (
                        <label className="mt-2 block text-[11px] font-semibold text-slate-600">
                          배송비 금액
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={shippingFeeDraft}
                              onChange={(event) => {
                                setShippingFeeDraft(event.target.value);
                                setShippingError(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void saveShippingEdit(candidate);
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelShippingEdit();
                                }
                              }}
                              placeholder="예: 3000"
                              className={`${inputClass} h-9 flex-1`}
                            />
                            <span className="text-xs text-slate-500">원</span>
                          </div>
                        </label>
                      )}
                      {shippingMode === "ENTERED" && (
                        <div className="mt-3">
                          <p className="text-[11px] font-semibold text-slate-600">
                            배송비 부과 기준
                          </p>
                          <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
                            {(
                              [
                                ["ORDER_ONCE", "주문 전체 1회"],
                                ["PER_ITEM", "1개당"],
                                ["PER_N_ITEMS", "n개당"],
                              ] as const
                            ).map(([value, label]) => (
                              <label
                                key={value}
                                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-semibold text-slate-700"
                              >
                                <input
                                  type="radio"
                                  name={`shipping-charge-mode-${candidate.id}`}
                                  checked={shippingChargeMode === value}
                                  onChange={() => {
                                    setShippingChargeMode(value);
                                    setShippingError(null);
                                  }}
                                  className="size-3.5 accent-[#123f34]"
                                />
                                {label}
                              </label>
                            ))}
                          </div>
                          {shippingChargeMode === "PER_N_ITEMS" && (
                            <label className="mt-2 block text-[11px] font-semibold text-slate-600">
                              몇 개당 배송비가 붙나요?
                              <input
                                type="number"
                                min="1"
                                value={shippingUnitCountDraft}
                                onChange={(event) => {
                                  setShippingUnitCountDraft(event.target.value);
                                  setShippingError(null);
                                }}
                                placeholder="예: 3"
                                className={`${inputClass} mt-1 h-9`}
                              />
                            </label>
                          )}
                          {shippingPreviewFee != null && (
                            <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600">
                              구성 수량 {shippingQuantity}개 기준 예상 총 배송비{" "}
                              <strong className="text-slate-900">
                                {money(shippingPreviewFee)}
                              </strong>
                            </p>
                          )}
                        </div>
                      )}
                      {shippingError && (
                        <p className="mt-2 text-xs font-semibold text-red-600">
                          {shippingError}
                        </p>
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          className={`${secondaryButtonClass} h-8 rounded-lg px-3 text-xs`}
                          disabled={saving}
                          onClick={cancelShippingEdit}
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          className={`${buttonClass} h-8 rounded-lg px-3 text-xs`}
                          disabled={
                            saving ||
                            shippingSavingId === candidate.id ||
                            (shippingMode === "ENTERED" &&
                              (shippingFeeDraft.trim() === "" ||
                                !Number.isInteger(Number(shippingFeeDraft)) ||
                                Number(shippingFeeDraft) < 0)) ||
                            (shippingMode === "ENTERED" &&
                              shippingChargeMode === "PER_N_ITEMS" &&
                              (!Number.isInteger(
                                Number(shippingUnitCountDraft)
                              ) ||
                                Number(shippingUnitCountDraft) < 1))
                          }
                          onClick={() => void saveShippingEdit(candidate)}
                        >
                          {shippingSavingId === candidate.id && (
                            <Loader2 className="size-3 animate-spin" />
                          )}
                          {shippingSavingId === candidate.id
                            ? "저장 중..."
                            : "저장"}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a
                      href={candidate.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${primaryLinkClass} h-8 rounded-lg px-3 text-xs`}
                    >
                      구매 링크 열기 <ArrowUpRight className="size-3.5" />
                    </a>
                    <button
                      type="button"
                      className={`${secondaryButtonClass} h-8 px-3 text-xs`}
                      onClick={() => setHistoryItemId(candidate.itemId)}
                    >
                      가격변동
                    </button>
                    <button
                      type="button"
                      className={`${secondaryButtonClass} h-8 px-3 text-xs`}
                      aria-expanded={openedCompareItemId === candidate.itemId}
                      onClick={() =>
                        setOpenedCompareItemId((current) =>
                          current === candidate.itemId
                            ? null
                            : candidate.itemId
                        )
                      }
                    >
                      {openedCompareItemId === candidate.itemId
                        ? "비교창 닫기"
                        : "가격비교 다시하기"}
                      <ChevronDown
                        className={`size-3.5 transition-transform ${
                          openedCompareItemId === candidate.itemId
                            ? "rotate-180"
                            : ""
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingCandidate(candidate)}
                      disabled={deletingId === candidate.id}
                      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === candidate.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      삭제
                    </button>
                  </div>
                  <p
                    className="mt-1.5 max-w-full truncate text-xs font-bold text-slate-500 md:ml-auto"
                    title={`업데이트 ${candidate.savedBy} · ${dateTime(candidate.checkedAt)}`}
                  >
                    업데이트{" "}
                    <span className="text-blue-600">{candidate.savedBy}</span> ·{" "}
                    {dateTime(candidate.checkedAt)}
                  </p>
                  </div>
                </div>
              </div>
              {openedCompareItemId === candidate.itemId && (
                <InlinePriceComparePanel
                  key={candidate.itemId}
                  purchaseCandidate={candidate}
                  item={
                    data.items.find((item) => item.id === candidate.itemId) ??
                    null
                  }
                  saving={saving}
                  updateInlinePriceCandidate={updateInlinePriceCandidate}
                  onClose={() => setOpenedCompareItemId(null)}
                />
              )}
            </article>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <Panel className="mt-4 text-sm text-slate-500">
          {query || category !== "ALL" ? (
            <>
              <p className="font-bold text-slate-700">검색 결과가 없습니다.</p>
              <p className="mt-1">품목명이나 상품명을 다시 확인해 주세요.</p>
            </>
          ) : (
            "저장된 구매 후보가 없습니다. 상품등록에서 후보를 구매목록에 저장해 주세요."
          )}
        </Panel>
      )}
      {deletingCandidate && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingId) {
              setDeletingCandidate(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-purchase-candidate-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2
              id="delete-purchase-candidate-title"
              className="text-lg font-black text-slate-950"
            >
              이 구매 후보를 구매목록에서 삭제할까요?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              가격변동 기록은 보존되며, 구매목록에서는 보이지 않게 됩니다.
            </p>
            <p className="mt-3 line-clamp-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              {deletingCandidate.item.name} · {deletingCandidate.title}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setDeletingCandidate(null)}
                className={secondaryButtonClass}
              >
                취소
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={async () => {
                  const candidateId = deletingCandidate.id;
                  setDeletingId(candidateId);
                  const deleted = await onDeleteCandidate(candidateId);
                  setDeletingId(null);
                  if (deleted) setDeletingCandidate(null);
                }}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
      {historyItemId && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          onClick={() => setHistoryItemId(null)}
        >
          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl lg:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-600">가격변동</p>
                <h2 className="mt-1 text-xl font-black">
                  {selectedCandidate?.item.name || "품목"}
                </h2>
              </div>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full bg-slate-100 text-xl"
                onClick={() => setHistoryItemId(null)}
                aria-label="가격변동 닫기"
              >
                ×
              </button>
            </div>
            <div className="mt-6 space-y-3">
              {historyRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex items-start gap-3">
                    <ProductImage
                      src={row.imageUrl}
                      alt={`${row.source} 저장 상품 이미지`}
                      compact
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>
                          {new Date(row.date).toLocaleDateString("ko-KR")} ·{" "}
                          {row.source}
                        </strong>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${
                            row.type === "구매"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.type}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {money(row.totalPrice)} · {row.composition}
                        {row.pricePer100 != null && row.unitType
                          ? ` · 100${row.unitType}당 ${money(row.pricePer100)}`
                          : ""}
                      </p>
                      {row.shippingFee > 0 && (
                        <p className="mt-1 text-xs text-slate-500">
                          배송비 {money(row.shippingFee)} /{" "}
                          {row.shippingUnitCount}개마다 · 반영 배송비{" "}
                          {money(row.effectiveShippingFee)}
                        </p>
                      )}
                      {row.shippingStatus === "FREE" && (
                        <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                          무료배송
                        </span>
                      )}
                      {row.shippingStatus === "UNKNOWN" && (
                        <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">
                          배송비 확인 필요
                        </span>
                      )}
                      {row.person && (
                        <p className="mt-1 text-xs text-slate-500">
                          {row.person}
                        </p>
                      )}
                      {row.url && (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-slate-800 hover:text-slate-950"
                        >
                          저장 링크 열기{" "}
                          <ArrowUpRight className="size-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {historyRows.length === 0 && (
                <p className="text-sm text-slate-500">아직 기록이 없습니다.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function InlinePriceComparePanel({
  purchaseCandidate,
  item,
  saving,
  updateInlinePriceCandidate,
  onClose,
}: {
  purchaseCandidate: SavedPurchaseCandidate;
  item: Item | null;
  saving: boolean;
  updateInlinePriceCandidate: (
    payload: Record<string, unknown>
  ) => Promise<{ ok: boolean; message: string }>;
  onClose: () => void;
}) {
  const initialQuery =
    item?.naverSearchKeywords[0] ||
    item?.naverSearchKeyword ||
    item?.name ||
    purchaseCandidate.title;
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [sort, setSort] = useState<PriceSort>(
    defaultPriceSort(item?.name || purchaseCandidate.item.name, item?.category || "")
  );
  const [pendingSave, setPendingSave] = useState<{
    candidate: SearchCandidate;
    metrics: PriceMetrics;
  } | null>(null);
  const [optionPriceChecked, setOptionPriceChecked] = useState(false);
  const [optionMemo, setOptionMemo] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const analyzedCandidates = candidates.map((candidate, originalIndex) => ({
    candidate,
    originalIndex,
    metrics: calculatePriceMetrics(candidate),
  }));
  const sortedCandidates = [...analyzedCandidates].sort((a, b) => {
    const shippingDiff =
      Number(a.candidate.shippingStatus === "UNKNOWN") -
      Number(b.candidate.shippingStatus === "UNKNOWN");
    if (shippingDiff) return shippingDiff;
    return (
      comparePriceMetrics(a.metrics, b.metrics, sort, null) ||
      a.metrics.totalPrice - b.metrics.totalPrice ||
      a.originalIndex - b.originalIndex
    );
  });
  const coupangUrl = query.trim()
    ? `https://www.coupang.com/np/search?q=${encodeURIComponent(query.trim())}`
    : "";

  function updateCandidate(index: number, patch: Partial<SearchCandidate>) {
    setCandidates((rows) =>
      rows.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, ...patch } : candidate
      )
    );
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchQuery = query.trim();
    if (!searchQuery || searching) return;

    setSearching(true);
    setSearched(true);
    setSearchError(null);
    setCandidates([]);
    try {
      const params = new URLSearchParams({
        itemId: purchaseCandidate.itemId,
        query: searchQuery,
      });
      const response = await fetch(
        `/api/operations/neworder/price-search?${params.toString()}`,
        { cache: "no-store" }
      );
      const responseText = await response.text();
      let payload: {
        ok?: boolean;
        candidates?: SearchCandidate[];
        message?: string | null;
        reason?: string | null;
      } = {};

      if (responseText.trim()) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          if (process.env.NODE_ENV === "development") {
            console.warn("[neworder/inline-price-search] JSON 파싱 실패", {
              status: response.status,
              responseText,
            });
          }
          setSearchError(
            "가격 조회 API 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
          return;
        }
      }

      if (!response.ok || payload.ok !== true) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[neworder/inline-price-search] API 응답", {
            status: response.status,
            data: payload,
            responseText,
          });
        }
        setSearchError(
          [payload.message, payload.reason].filter(Boolean).join(" ") ||
            "가격 후보 조회에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }

      setCandidates(
        Array.isArray(payload.candidates) ? payload.candidates : []
      );
    } catch (cause) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[neworder/inline-price-search] 요청 실패", {
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
      setSearchError(
        "가격 후보 조회에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setSearching(false);
    }
  }

  async function saveCandidate() {
    if (!pendingSave) return;
    setSaveError(null);
    if (!optionPriceChecked) {
      setSaveError("실제 옵션 가격 확인 후 체크해 주세요.");
      return;
    }
    const { candidate, metrics } = pendingSave;
    if (!purchaseCandidate.id || !purchaseCandidate.itemId) {
      setSaveError("업데이트할 구매목록 항목을 찾지 못했습니다.");
      return;
    }
    if (!candidate.title || !candidate.productUrl) {
      setSaveError("저장할 후보 상품 정보를 찾지 못했습니다.");
      return;
    }
    const result = await updateInlinePriceCandidate({
      action: "updateExistingPriceCandidate",
      candidateId: purchaseCandidate.id,
      itemId: purchaseCandidate.itemId,
      searchQuery: query.trim(),
      ...candidate,
      quantityPerPack: metrics.unitCount,
      volumePerUnit: metrics.volumePerUnit,
      volumeUnit: metrics.volumeUnit,
      packageUnit: metrics.packageUnit,
      optionPriceChecked,
      optionMemo: optionMemo.trim() || null,
    });
    if (result.ok) {
      setPendingSave(null);
      onClose();
    } else {
      setSaveError(result.message);
    }
  }

  return (
    <section className="border-l-4 border-t border-l-slate-700 border-t-slate-300 bg-slate-100/80 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-slate-600">
            가격비교 패널
          </span>
          <h3 className="mt-2 text-lg font-black text-slate-950">
            가격비교 다시하기
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            현재 구매목록 상품을 기준으로 새 가격 후보를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          className={`${secondaryButtonClass} h-8 px-3 text-xs`}
          onClick={onClose}
        >
          비교창 닫기
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-bold text-slate-500">현재 기준 상품</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <strong className="text-sm text-slate-950">
            {purchaseCandidate.item.name}
          </strong>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {sourceLabel(purchaseCandidate.source)}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {purchaseCandidate.shippingStatus === "UNKNOWN"
              ? "배송비 미확인"
              : purchaseCandidate.shippingStatus === "FREE"
                ? "무료배송"
                : "유료배송"}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
            {purchaseCandidate.optionPriceChecked
              ? "옵션가 확인 완료"
              : "옵션가 확인 필요"}
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs font-semibold text-slate-700">
          {purchaseCandidate.title}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          상품가 {money(purchaseCandidate.productPrice)} ·{" "}
          {purchaseCandidate.mallName ||
            sourceLabel(purchaseCandidate.source)}
        </p>
      </div>

      <form
        className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] md:p-4"
        onSubmit={search}
      >
        <label className="sr-only" htmlFor={`inline-query-${purchaseCandidate.id}`}>
          가격비교 검색어
        </label>
        <input
          id={`inline-query-${purchaseCandidate.id}`}
          className={inputClass}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="가격비교 검색어"
        />
        <button
          type="submit"
          className={buttonClass}
          disabled={searching || !query.trim()}
        >
          {searching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          네이버 가격 후보 조회
        </button>
        <a
          href={coupangUrl || undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!coupangUrl}
          onClick={(event) => {
            if (!coupangUrl) event.preventDefault();
          }}
          className={`${secondaryButtonClass} ${
            coupangUrl ? "" : "pointer-events-none opacity-60"
          }`}
        >
          쿠팡 검색 <ArrowUpRight className="size-4" />
        </a>
      </form>

      {searching && (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="size-4 animate-spin" />
          가격 후보를 불러오는 중입니다.
        </p>
      )}
      {searchError && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-red-600">
          {searchError}
        </p>
      )}

      {candidates.length > 0 && (
        <section className="mt-5 border-t border-slate-300 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-black text-slate-950">
                새 가격 후보
              </h4>
              <p className="text-xs text-slate-500">
                네이버 검색 결과 {candidates.length}개
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              결과 정렬
              <select
                className={`${inputClass} w-48`}
                value={sort}
                onChange={(event) => setSort(event.target.value as PriceSort)}
              >
                <option value="totalPrice">총액 낮은순</option>
                <option value="unitPrice">개당 가격 낮은순</option>
                <option value="pricePer100">100ml/g당 가격 낮은순</option>
                <option value="savings">최근 구매가 대비 절감액순</option>
              </select>
            </label>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {sortedCandidates.map(
              ({ candidate, metrics, originalIndex }) => (
                <article
                  key={`${candidate.productUrl}-${originalIndex}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-none transition hover:border-slate-300"
                >
                  <div className="flex min-w-0 gap-3">
                    <ProductImage
                      src={candidate.image}
                      alt={`${candidate.title} 상품 이미지`}
                      compact
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {candidate.source === "NAVER"
                            ? "네이버 후보"
                            : "가격 후보"}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          {candidate.mallName ||
                            sourceLabel(candidate.source)}
                        </span>
                      </div>
                      <h5 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-slate-900">
                        {candidate.title}
                      </h5>
                      <p className="mt-1 text-xs text-slate-500">
                        {candidate.shippingStatus === "UNKNOWN"
                          ? "배송비 확인 필요"
                          : candidate.shippingStatus === "FREE"
                            ? "무료배송"
                            : `배송비 ${money(candidate.shippingFee)}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <label className="text-[11px] font-semibold text-slate-500">
                      상품가
                      <input
                        className={`${inputClass} mt-1 h-9`}
                        type="number"
                        min="0"
                        value={candidate.itemPrice}
                        onChange={(event) =>
                          updateCandidate(originalIndex, {
                            itemPrice: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-500">
                      배송비
                      <input
                        className={`${inputClass} mt-1 h-9`}
                        type="number"
                        min="0"
                        value={candidate.shippingFee}
                        onChange={(event) => {
                          const shippingFee =
                            Number(event.target.value) || 0;
                          updateCandidate(originalIndex, {
                            shippingFee,
                            shippingStatus:
                              shippingFee > 0 ? "PAID" : "UNKNOWN",
                            shippingNeedsConfirmation: shippingFee <= 0,
                          });
                        }}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-500">
                      배송 상태
                      <select
                        className={`${inputClass} mt-1 h-9`}
                        value={candidate.shippingStatus}
                        onChange={(event) => {
                          const shippingStatus = event.target.value as
                            | "FREE"
                            | "PAID"
                            | "UNKNOWN";
                          updateCandidate(originalIndex, {
                            shippingStatus,
                            shippingFee:
                              shippingStatus === "FREE"
                                ? 0
                                : candidate.shippingFee,
                            shippingNeedsConfirmation:
                              shippingStatus === "UNKNOWN",
                          });
                        }}
                      >
                        <option value="UNKNOWN">확인 필요</option>
                        <option value="PAID">유료배송</option>
                        <option value="FREE">무료배송</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-slate-500">
                      배송비 부과 기준
                      <input
                        className={`${inputClass} mt-1 h-9`}
                        type="number"
                        min="1"
                        value={candidate.shippingUnitCount || 1}
                        onChange={(event) =>
                          updateCandidate(originalIndex, {
                            shippingUnitCount: Math.max(
                              1,
                              Number(event.target.value) || 1
                            ),
                          })
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <strong className="text-slate-950">
                      계산 단가 {money(metrics.unitPrice)}
                    </strong>
                    <span className="mx-1.5">·</span>
                    <span>
                      {candidate.shippingStatus === "UNKNOWN"
                        ? `상품가 기준 ${money(metrics.totalPrice)}`
                        : `배송비 포함 ${money(metrics.totalPrice)}`}
                    </span>
                    {metrics.pricePer100 != null && metrics.volumeUnit && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span>
                          100{metrics.volumeUnit}당{" "}
                          {money(metrics.pricePer100)}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={candidate.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${primaryLinkClass} h-8 rounded-lg px-3 text-xs`}
                    >
                      구매 링크 열기
                      <ArrowUpRight className="size-3.5" />
                    </a>
                    <button
                      type="button"
                      className={`${secondaryButtonClass} h-8 px-3 text-xs`}
                      disabled={saving || candidate.itemPrice <= 0}
                      onClick={() => {
                        setOptionPriceChecked(false);
                        setOptionMemo("");
                        setSaveError(null);
                        setPendingSave({ candidate, metrics });
                      }}
                    >
                      구매목록에 저장
                    </button>
                  </div>
                </article>
              )
            )}
          </div>
        </section>
      )}

      {searched && !searching && !searchError && candidates.length === 0 && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
          검색 결과가 없습니다. 검색어를 조금 더 구체적으로 입력해 주세요.
        </p>
      )}

      {pendingSave && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          onClick={() => {
            if (!saving) {
              setPendingSave(null);
              setSaveError(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inline-save-confirm-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="inline-save-confirm-title"
              className="text-lg font-black text-slate-950"
            >
              현재 구매목록을 업데이트할까요?
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              현재 구매목록의 &lsquo;
              <strong>{purchaseCandidate.item.name}</strong>&rsquo; 상품 정보를
              선택한 후보로 업데이트합니다.
            </p>
            <p className="mt-2 line-clamp-2 text-xs text-slate-500">
              {pendingSave.candidate.title}
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs leading-5 text-slate-600">
                옵션 상품인 경우 구매 링크에서 실제 옵션을 선택한 뒤
                상품가를 수정했는지 확인해 주세요.
              </p>
              <label className="mt-3 block text-xs font-semibold text-slate-600">
                구매 옵션 메모
                <input
                  className={`${inputClass} mt-1`}
                  value={optionMemo}
                  onChange={(event) => setOptionMemo(event.target.value)}
                  placeholder="예: 13인치 / 1000장"
                  maxLength={500}
                />
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  required
                  className="mt-0.5 size-4 rounded border-slate-300 accent-[#123f34]"
                  checked={optionPriceChecked}
                  onChange={(event) => {
                    setOptionPriceChecked(event.target.checked)
                    setSaveError(null);
                  }}
                />
                구매하려는 옵션을 선택한 뒤 실제 가격을 확인했습니다.
              </label>
              {!optionPriceChecked && (
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  옵션 상품은 실제 구매 옵션 선택 후 가격 확인이 필요합니다.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={saving}
                onClick={() => {
                  setPendingSave(null);
                  setSaveError(null);
                }}
              >
                취소
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={saving || !optionPriceChecked}
                onClick={() => void saveCandidate()}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? "저장 중..." : "업데이트 저장"}
              </button>
            </div>
            {saveError && (
              <p className="mt-3 text-right text-sm font-semibold text-red-600">
                {saveError}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Legacy inventory-based ordering UI is intentionally kept unreachable during migration.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OrdersView({
  data,
  saving,
  mutate,
}: {
  data: Snapshot;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
}) {
  const [store, setStore] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const categories = [...new Set(data.orders.map((order) => order.item.category))];
  const filtered = data.orders.filter(
    (order) =>
      (store === "ALL" || order.store === store) &&
      (category === "ALL" || order.item.category === category)
  );

  return (
    <>
      <PageTitle
        title="발주 목록"
        description="재고 체크에서 집계된 부족 품목의 발주 수량과 진행 상태를 관리합니다."
      />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
          <select
            className={inputClass}
            value={store}
            onChange={(event) => setStore(event.target.value)}
          >
            <option value="ALL">전체 매장</option>
            <option value="HANNAM">한남점</option>
            <option value="YEONNAM">연남점</option>
          </select>
          <select
            className={inputClass}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="ALL">전체 카테고리</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
      </Panel>
      <Panel className="mt-4 overflow-hidden p-0 lg:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">매장</th>
                <th className="px-4 py-3">품목</th>
                <th className="px-4 py-3">카테고리</th>
                <th className="px-4 py-3">필요 수량</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">메모</th>
                <th className="px-4 py-3">수정일</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  saving={saving}
                  mutate={mutate}
                />
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            조건에 맞는 발주 항목이 없습니다.
          </p>
        )}
      </Panel>
    </>
  );
}

function OrderRow({
  order,
  saving,
  mutate,
}: {
  order: Order;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
}) {
  const [qty, setQty] = useState(order.requestedQty);
  const [status, setStatus] = useState(order.status);
  const [memo, setMemo] = useState(order.memo || "");
  const [confirming, setConfirming] = useState(false);

  async function save(nextStatus = status) {
    await mutate(
      {
        action: "updateOrder",
        id: order.id,
        requestedQty: qty,
        status: nextStatus,
        memo,
      },
      `${order.item.name} 발주 정보를 수정했습니다.`
    );
    setConfirming(false);
  }

  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-4 py-3 font-semibold">{STORE_LABEL[order.store]}</td>
        <td className="px-4 py-3 font-bold">{order.item.name}</td>
        <td className="px-4 py-3 text-slate-500">{order.item.category}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              className="h-9 w-24 rounded-lg border border-slate-200 px-3"
              value={qty}
              onChange={(event) => setQty(Number(event.target.value) || 1)}
            />
            <span className="text-xs text-slate-500">{order.item.orderUnit}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <select
            className="h-9 rounded-lg border border-slate-200 px-2"
            value={status}
            onChange={(event) => {
              const next = event.target.value as Order["status"];
              if (next === "PURCHASED" && order.status !== "PURCHASED") {
                setConfirming(true);
                return;
              }
              setStatus(next);
            }}
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3">
          <input
            className="h-9 w-44 rounded-lg border border-slate-200 px-3"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="메모"
          />
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {dateTime(order.updatedAt)}
        </td>
        <td className="px-4 py-3">
          <button
            className={secondaryButtonClass}
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            저장
          </button>
        </td>
      </tr>
      {confirming && (
        <tr>
          <td colSpan={8}>
            <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-lg font-black">구매완료 처리 확인</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {STORE_LABEL[order.store]}의 {order.item.name} 발주를
                  구매완료로 변경합니다. 실제 구매 정보는 구매내역에서 별도로
                  기록해 주세요.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    className={secondaryButtonClass}
                    onClick={() => setConfirming(false)}
                  >
                    취소
                  </button>
                  <button
                    className={buttonClass}
                    disabled={saving}
                    onClick={() => {
                      setStatus("PURCHASED");
                      void save("PURCHASED");
                    }}
                  >
                    구매완료 처리
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ItemsView({
  data,
  saving,
  mutate,
}: {
  data: Snapshot;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
}) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState<{
    name: string;
    category: string;
    minimumStock: string;
    orderUnit: string;
    orderUnitQuantity: string;
    defaultSupplierId: string;
    isActive: boolean;
    naverSearchKeywords: string;
    coupangSearchKeywords: string;
    requiredKeywords: string;
    optionalKeywords: string;
    preferredKeywords: string;
    excludedKeywords: string;
  } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  async function submitNewItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const naverSearchKeywords = parseLines(
      String(formData.get("naverSearchKeywords") ?? "")
    );
    const coupangSearchKeywords = parseLines(
      String(formData.get("coupangSearchKeywords") ?? "")
    );
    const excludedKeywords = normalizeStringArray(
      formData.get("excludedKeywords"),
      /[,;\r\n]+/
    );
    const requiredKeywords = normalizeStringArray(
      formData.get("requiredKeywords"),
      /[,;\r\n]+/
    );
    const optionalKeywords = normalizeStringArray(
      formData.get("optionalKeywords"),
      /[,;\r\n]+/
    );
    const preferredKeywords = normalizeStringArray(
      formData.get("preferredKeywords"),
      /[,;\r\n]+/
    );
    const ok = await mutate(
      {
        action: "saveItem",
        name: formData.get("name"),
        category: formData.get("category"),
        minimumStock: formData.get("minimumStock"),
        orderUnit: formData.get("orderUnit"),
        orderUnitQuantity: formData.get("orderUnitQuantity"),
        naverSearchKeyword: formData.get("naverSearchKeyword"),
        naverSearchKeywords,
        coupangSearchKeyword: formData.get("coupangSearchKeyword"),
        coupangSearchKeywords,
        requiredKeywords,
        optionalKeywords,
        preferredKeywords,
        excludedKeywords,
        defaultSupplierId: formData.get("defaultSupplierId"),
      },
      "품목을 추가했습니다."
    );
    if (ok) {
      formElement.reset();
    }
  }

  function startInlineEdit(item: Item) {
    setEditingItemId(item.id);
    setInlineDraft({
      name: item.name,
      category: item.category,
      minimumStock: String(item.minimumStock),
      orderUnit: item.orderUnit,
      orderUnitQuantity: String(item.orderUnitQuantity),
      defaultSupplierId: item.defaultSupplierId || "",
      isActive: item.isActive,
      naverSearchKeywords: item.naverSearchKeywords.join("\n"),
      coupangSearchKeywords: item.coupangSearchKeywords.join("\n"),
      requiredKeywords: item.requiredKeywords.join(", "),
      optionalKeywords: item.optionalKeywords.join(", "),
      preferredKeywords: item.preferredKeywords.join(", "),
      excludedKeywords: item.excludedKeywords.join(", "),
    });
    setInlineError(null);
  }

  function cancelInlineEdit() {
    setEditingItemId(null);
    setInlineDraft(null);
    setInlineError(null);
  }

  async function saveInlineItem(item: Item) {
    if (!inlineDraft || editingItemId !== item.id) return;
    const name = inlineDraft.name.trim();
    const category = inlineDraft.category.trim();
    const orderUnit = inlineDraft.orderUnit.trim();
    const minimumStock = Number(inlineDraft.minimumStock);
    const orderUnitQuantity = Number(inlineDraft.orderUnitQuantity);

    if (!name) {
      setInlineError("품목명을 입력해 주세요.");
      return;
    }
    if (!category) {
      setInlineError("카테고리를 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      setInlineError("최소재고는 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    if (!orderUnit) {
      setInlineError("발주 단위를 입력해 주세요.");
      return;
    }
    if (!Number.isInteger(orderUnitQuantity) || orderUnitQuantity < 1) {
      setInlineError("단위당 수량은 1 이상의 정수로 입력해 주세요.");
      return;
    }

    setInlineError(null);
    const ok = await mutate(
      {
        action: "saveItem",
        id: item.id,
        name,
        category,
        minimumStock,
        orderUnit,
        orderUnitQuantity,
        naverSearchKeyword: item.naverSearchKeyword,
        naverSearchKeywords: parseLines(inlineDraft.naverSearchKeywords),
        coupangSearchKeyword: item.coupangSearchKeyword,
        coupangSearchKeywords: parseLines(inlineDraft.coupangSearchKeywords),
        requiredKeywords: normalizeStringArray(
          inlineDraft.requiredKeywords,
          /[,;\r\n]+/
        ),
        optionalKeywords: normalizeStringArray(
          inlineDraft.optionalKeywords,
          /[,;\r\n]+/
        ),
        preferredKeywords: normalizeStringArray(
          inlineDraft.preferredKeywords,
          /[,;\r\n]+/
        ),
        excludedKeywords: normalizeStringArray(
          inlineDraft.excludedKeywords,
          /[,;\r\n]+/
        ),
        defaultSupplierId: inlineDraft.defaultSupplierId,
        isActive: inlineDraft.isActive,
      },
      `${name} 품목을 수정했습니다.`
    );
    if (ok) cancelInlineEdit();
  }

  return (
    <>
      <PageTitle
        title="품목 관리"
        description="최소재고, 발주 단위, 가격 검색어와 기본 거래처를 관리합니다. 삭제 대신 비활성화합니다."
      />
      <Panel>
        <h2 className="mb-4 font-bold">새 품목 추가</h2>
        <form
          onSubmit={submitNewItem}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <input
            className={inputClass}
            name="name"
            placeholder="품목명"
            required
          />
          <input
            className={inputClass}
            name="category"
            placeholder="카테고리"
            required
          />
          <input
            className={inputClass}
            name="minimumStock"
            type="number"
            min="0"
            defaultValue={0}
            placeholder="최소재고"
            required
          />
          <input
            className={inputClass}
            name="orderUnit"
            placeholder="발주 단위 (예: 1박스)"
            required
          />
          <input
            className={inputClass}
            name="orderUnitQuantity"
            type="number"
            min="1"
            defaultValue={1}
            placeholder="단위당 수량"
            required
          />
          <textarea
            className="min-h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
            name="naverSearchKeywords"
            placeholder={"네이버 정확 검색어 (줄바꿈 구분)\n예: 올리타리아 트러플 오일 250ml"}
          />
          <textarea
            className="min-h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
            name="coupangSearchKeywords"
            placeholder="쿠팡 정확 검색어 (줄바꿈 구분)"
          />
          <label className="text-sm font-semibold">
            필수 포함 키워드
            <input
              className={`${inputClass} mt-1`}
              name="requiredKeywords"
              placeholder="예: 올리타리아"
            />
          </label>
          <label className="text-sm font-semibold">
            선택 포함 키워드
            <input
              className={`${inputClass} mt-1`}
              name="optionalKeywords"
              placeholder="예: 트러플, 송로버섯"
            />
          </label>
          <label className="text-sm font-semibold">
            우선 키워드 / 권장 키워드
            <input
              className={`${inputClass} mt-1`}
              name="preferredKeywords"
              placeholder="예: 250ml"
            />
          </label>
          <label className="text-sm font-semibold">
            제외 키워드
            <input
              className={`${inputClass} mt-1`}
              name="excludedKeywords"
              placeholder="쉼표로 구분"
            />
          </label>
          <select
            className={inputClass}
            name="defaultSupplierId"
            defaultValue=""
          >
            <option value="">기본 거래처 없음</option>
            {data.suppliers
              .filter((supplier) => supplier.isActive)
              .map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </select>
          <button className={buttonClass} disabled={saving}>
            <Plus className="size-4" />
            품목 추가
          </button>
        </form>
      </Panel>
      <Panel className="mt-4 overflow-hidden p-0 lg:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">품목</th>
                <th className="px-4 py-3">카테고리</th>
                <th className="px-4 py-3">최소재고</th>
                <th className="px-4 py-3">발주 단위</th>
                <th className="px-4 py-3">기본 거래처</th>
                <th className="px-4 py-3">최근 구매가</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                const draft =
                  editingItemId === item.id ? inlineDraft : null;
                const isEditing = draft !== null;
                return (
                  <Fragment key={item.id}>
                  <tr
                    className={`border-t border-slate-100 align-top ${
                      isEditing
                        ? "bg-slate-50 outline outline-1 -outline-offset-1 outline-slate-300"
                        : item.isActive
                          ? ""
                          : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    <td className="px-4 py-3 font-bold">
                      {draft ? (
                        <input
                          className={`${inputClass} min-w-48`}
                          value={draft.name}
                          onChange={(event) =>
                            setInlineDraft({
                              ...draft,
                              name: event.target.value,
                            })
                          }
                          aria-label={`${item.name} 품목명`}
                        />
                      ) : (
                        item.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {draft ? (
                        <input
                          className={`${inputClass} w-32`}
                          value={draft.category}
                          onChange={(event) =>
                            setInlineDraft({
                              ...draft,
                              category: event.target.value,
                            })
                          }
                          aria-label={`${item.name} 카테고리`}
                        />
                      ) : (
                        item.category
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {draft ? (
                        <input
                          className={`${inputClass} w-20`}
                          type="number"
                          min="0"
                          value={draft.minimumStock}
                          onChange={(event) =>
                            setInlineDraft({
                              ...draft,
                              minimumStock: event.target.value,
                            })
                          }
                          aria-label={`${item.name} 최소재고`}
                        />
                      ) : (
                        item.minimumStock
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {draft ? (
                        <div className="flex items-center gap-2">
                          <input
                            className={`${inputClass} w-32`}
                            value={draft.orderUnit}
                            onChange={(event) =>
                              setInlineDraft({
                                ...draft,
                                orderUnit: event.target.value,
                              })
                            }
                            aria-label={`${item.name} 발주 단위`}
                          />
                          <span className="text-slate-400">/</span>
                          <input
                            className={`${inputClass} w-20`}
                            type="number"
                            min="1"
                            value={draft.orderUnitQuantity}
                            onChange={(event) =>
                              setInlineDraft({
                                ...draft,
                                orderUnitQuantity: event.target.value,
                              })
                            }
                            aria-label={`${item.name} 단위당 수량`}
                          />
                          <span className="text-xs text-slate-500">개</span>
                        </div>
                      ) : (
                        <>
                          {item.orderUnit} / {item.orderUnitQuantity}개
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {draft ? (
                        <select
                          className={`${inputClass} w-40`}
                          value={draft.defaultSupplierId}
                          onChange={(event) =>
                            setInlineDraft({
                              ...draft,
                              defaultSupplierId: event.target.value,
                            })
                          }
                          aria-label={`${item.name} 기본 거래처`}
                        >
                          <option value="">기본 거래처 없음</option>
                          {data.suppliers
                            .filter(
                              (supplier) =>
                                supplier.isActive ||
                                supplier.id === item.defaultSupplierId
                            )
                            .map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        item.defaultSupplier?.name || "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.purchases[0]
                        ? money(item.purchases[0].unitPrice)
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {draft ? (
                        <select
                          className={`${inputClass} w-24`}
                          value={draft.isActive ? "ACTIVE" : "INACTIVE"}
                          onChange={(event) =>
                            setInlineDraft({
                              ...draft,
                              isActive: event.target.value === "ACTIVE",
                            })
                          }
                          aria-label={`${item.name} 상태`}
                        >
                          <option value="ACTIVE">활성</option>
                          <option value="INACTIVE">비활성</option>
                        </select>
                      ) : item.isActive ? (
                        "활성"
                      ) : (
                        "비활성"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {draft ? (
                        <div className="min-w-44">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={buttonClass}
                              disabled={saving}
                              onClick={() => void saveInlineItem(item)}
                            >
                              {saving && (
                                <Loader2 className="size-3.5 animate-spin" />
                              )}
                              저장
                            </button>
                            <button
                              type="button"
                              className={secondaryButtonClass}
                              disabled={saving}
                              onClick={cancelInlineEdit}
                            >
                              취소
                            </button>
                          </div>
                          {inlineError && (
                            <p className="mt-2 max-w-56 text-xs font-semibold leading-5 text-red-600">
                              {inlineError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={secondaryButtonClass}
                            disabled={saving}
                            onClick={() => startInlineEdit(item)}
                          >
                            <Pencil className="size-3.5" /> 수정
                          </button>
                          {item.isActive && (
                            <button
                              type="button"
                              className={secondaryButtonClass}
                              disabled={saving}
                              onClick={() =>
                                void mutate(
                                  { action: "deactivateItem", id: item.id },
                                  `${item.name} 품목을 비활성화했습니다.`
                                )
                              }
                            >
                              비활성화
                            </button>
                          )}
                          {!item.isActive && (
                            <button
                              type="button"
                              className={secondaryButtonClass}
                              disabled={saving}
                              onClick={() =>
                                void mutate(
                                  {
                                    action: "setItemActive",
                                    id: item.id,
                                    isActive: true,
                                  },
                                  `${item.name} 품목을 다시 활성화했습니다.`
                                )
                              }
                            >
                              활성화
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {draft && (
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={8} className="px-4 pb-4 pt-1">
                        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-3">
                          <label className="text-xs font-semibold text-slate-600">
                            네이버 검색어
                            <textarea
                              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
                              value={draft.naverSearchKeywords}
                              onChange={(event) =>
                                setInlineDraft({
                                  ...draft,
                                  naverSearchKeywords: event.target.value,
                                })
                              }
                              placeholder="줄바꿈으로 구분"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            쿠팡 검색어
                            <textarea
                              className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-600 focus:ring-2 focus:ring-slate-200"
                              value={draft.coupangSearchKeywords}
                              onChange={(event) =>
                                setInlineDraft({
                                  ...draft,
                                  coupangSearchKeywords: event.target.value,
                                })
                              }
                              placeholder="줄바꿈으로 구분"
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                            <label className="text-xs font-semibold text-slate-600">
                              필수 포함 키워드
                              <input
                                className={`${inputClass} mt-1`}
                                value={draft.requiredKeywords}
                                onChange={(event) =>
                                  setInlineDraft({
                                    ...draft,
                                    requiredKeywords: event.target.value,
                                  })
                                }
                                placeholder="쉼표로 구분"
                              />
                            </label>
                            <label className="text-xs font-semibold text-slate-600">
                              선택 포함 키워드
                              <input
                                className={`${inputClass} mt-1`}
                                value={draft.optionalKeywords}
                                onChange={(event) =>
                                  setInlineDraft({
                                    ...draft,
                                    optionalKeywords: event.target.value,
                                  })
                                }
                                placeholder="쉼표로 구분"
                              />
                            </label>
                          </div>
                          <label className="text-xs font-semibold text-slate-600">
                            우선 키워드 / 권장 키워드
                            <input
                              className={`${inputClass} mt-1`}
                              value={draft.preferredKeywords}
                              onChange={(event) =>
                                setInlineDraft({
                                  ...draft,
                                  preferredKeywords: event.target.value,
                                })
                              }
                              placeholder="쉼표로 구분"
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            제외 키워드
                            <input
                              className={`${inputClass} mt-1`}
                              value={draft.excludedKeywords}
                              onChange={(event) =>
                                setInlineDraft({
                                  ...draft,
                                  excludedKeywords: event.target.value,
                                })
                              }
                              placeholder="쉼표로 구분"
                            />
                          </label>
                          <p className="self-end text-xs leading-5 text-slate-500">
                            검색 설정도 이 행의 저장 버튼으로 함께 반영됩니다.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function SuppliersView({
  data,
  saving,
  mutate,
}: {
  data: Snapshot;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<Supplier | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const ok = await mutate(
      {
        action: "saveSupplier",
        id: editing?.id,
        name: formData.get("name"),
        contact: formData.get("contact"),
        website: formData.get("website"),
        memo: formData.get("memo"),
      },
      editing ? "거래처를 수정했습니다." : "거래처를 추가했습니다."
    );
    if (ok) {
      setEditing(null);
      formElement.reset();
    }
  }

  return (
    <>
      <PageTitle
        title="거래처 관리"
        description="기본 거래처와 추가 구매처의 연락처, 웹사이트, 메모를 관리합니다."
      />
      <Panel>
        <form
          key={editing?.id || "new"}
          onSubmit={submit}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
        >
          <input
            className={inputClass}
            name="name"
            defaultValue={editing?.name}
            placeholder="거래처명"
            required
          />
          <input
            className={inputClass}
            name="contact"
            defaultValue={editing?.contact || ""}
            placeholder="연락처"
          />
          <input
            className={inputClass}
            name="website"
            type="url"
            defaultValue={editing?.website || ""}
            placeholder="https://"
          />
          <input
            className={inputClass}
            name="memo"
            defaultValue={editing?.memo || ""}
            placeholder="메모"
          />
          <button className={buttonClass} disabled={saving}>
            {editing ? "수정 저장" : "거래처 추가"}
          </button>
        </form>
      </Panel>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.suppliers.map((supplier) => (
          <Panel key={supplier.id}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-black">{supplier.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {supplier.contact || "연락처 미등록"}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                {supplier.isActive ? "활성" : "비활성"}
              </span>
            </div>
            {supplier.memo && (
              <p className="mt-4 text-sm text-slate-600">{supplier.memo}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                className={secondaryButtonClass}
                onClick={() => setEditing(supplier)}
              >
                <Pencil className="size-3.5" /> 수정
              </button>
              {supplier.website && (
                <a
                  className={secondaryButtonClass}
                  href={supplier.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  사이트 <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}

function PurchasesView({
  data,
  saving,
  mutate,
}: {
  data: Snapshot;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const ok = await mutate(
      {
        action: "savePurchase",
        purchasedAt: formData.get("purchasedAt"),
        itemId: formData.get("itemId"),
        supplierId: formData.get("supplierId"),
        quantity: formData.get("quantity"),
        totalPrice: formData.get("totalPrice"),
        memo: formData.get("memo"),
      },
      "구매내역을 저장했습니다."
    );
    if (ok) formElement.reset();
  }

  return (
    <>
      <PageTitle
        title="구매내역"
        description="실제 구매 정보는 품목별 최근 구매가와 가격비교 기준으로 사용됩니다."
      />
      <Panel>
        <form
          onSubmit={submit}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-7"
        >
          <input
            className={inputClass}
            name="purchasedAt"
            type="date"
            defaultValue={today()}
            required
          />
          <select className={inputClass} name="itemId" required defaultValue="">
            <option value="" disabled>
              품목 선택
            </option>
            {data.items
              .filter((item) => item.isActive)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
          <select className={inputClass} name="supplierId" defaultValue="">
            <option value="">구매처 미지정</option>
            {data.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            name="quantity"
            type="number"
            min="1"
            placeholder="구매 수량"
            required
          />
          <input
            className={inputClass}
            name="totalPrice"
            type="number"
            min="0"
            placeholder="총액"
            required
          />
          <input className={inputClass} name="memo" placeholder="메모" />
          <button className={buttonClass} disabled={saving}>
            구매 기록 추가
          </button>
        </form>
      </Panel>
      <Panel className="mt-4 overflow-hidden p-0 lg:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">구매일</th>
                <th className="px-4 py-3">품목</th>
                <th className="px-4 py-3">구매처</th>
                <th className="px-4 py-3">수량</th>
                <th className="px-4 py-3">총액</th>
                <th className="px-4 py-3">단위당 가격</th>
                <th className="px-4 py-3">메모</th>
              </tr>
            </thead>
            <tbody>
              {data.purchases.map((purchase) => (
                <tr key={purchase.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    {new Date(purchase.purchasedAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 font-bold">{purchase.item.name}</td>
                  <td className="px-4 py-3">
                    {purchase.supplier?.name || "-"}
                  </td>
                  <td className="px-4 py-3">{purchase.quantity}</td>
                  <td className="px-4 py-3 font-semibold">
                    {money(purchase.totalPrice)}
                  </td>
                  <td className="px-4 py-3">{money(purchase.unitPrice)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {purchase.memo || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function PriceCompareView({
  data,
  saving,
  mutate,
}: {
  data: Snapshot;
  saving: boolean;
  mutate: (
    payload: Record<string, unknown>,
    successMessage: string
  ) => Promise<boolean>;
}) {
  const activeItems = data.items.filter((item) => item.isActive);
  const [directQuery, setDirectQuery] = useState("");
  const [manualShippingStatus, setManualShippingStatus] = useState<
    "UNKNOWN" | "FREE" | "PAID"
  >("UNKNOWN");
  const [manualSource, setManualSource] = useState<
    "NAVER" | "COUPANG" | "BAEMIN_MART" | "ETC"
  >("ETC");
  const [manualSaveError, setManualSaveError] = useState<string | null>(null);
  const [searchedDirectQuery, setSearchedDirectQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [coupangUrl, setCoupangUrl] = useState("");
  const [searchedKeywords, setSearchedKeywords] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<{
    message: string;
    reason: string | null;
  } | null>(null);
  const [sort, setSort] = useState<PriceSort>(
    defaultPriceSort("", "기타")
  );
  const [pendingSave, setPendingSave] = useState<{
    candidate: SearchCandidate;
    metrics: PriceMetrics;
  } | null>(null);
  const [confirmingExistingSave, setConfirmingExistingSave] = useState(false);
  const [optionPriceChecked, setOptionPriceChecked] = useState(false);
  const [optionMemo, setOptionMemo] = useState("");
  const [connectionItemId, setConnectionItemId] = useState(
    activeItems[0]?.id || ""
  );
  const connectionItem =
    activeItems.find((item) => item.id === connectionItemId) ?? null;
  const connectionItemHasPurchase = connectionItem
    ? data.purchaseList.some(
        (candidate) => candidate.itemId === connectionItem.id
      )
    : false;
  const recentUnitPrice = null;
  const analyzedCandidates = candidates.map((candidate, originalIndex) => ({
    candidate,
    originalIndex,
    metrics: calculatePriceMetrics(candidate),
  }));
  const sortedCandidates = [...analyzedCandidates].sort((a, b) => {
    const requiredDiff =
      Number(b.candidate.passesRequired !== false) -
      Number(a.candidate.passesRequired !== false);
    if (requiredDiff) return requiredDiff;
    const shippingDiff =
      Number(a.candidate.shippingStatus === "UNKNOWN") -
      Number(b.candidate.shippingStatus === "UNKNOWN");
    if (shippingDiff) return shippingDiff;
    const priceDiff = comparePriceMetrics(
      a.metrics,
      b.metrics,
      sort,
      recentUnitPrice
    );
    if (priceDiff) return priceDiff;
    const keywordDiff =
      (b.candidate.optionalMatchCount ?? 0) -
        (a.candidate.optionalMatchCount ?? 0) ||
      (b.candidate.preferredMatchCount ?? 0) -
        (a.candidate.preferredMatchCount ?? 0);
    if (keywordDiff) return keywordDiff;
    return (
      a.metrics.totalPrice - b.metrics.totalPrice ||
      a.originalIndex - b.originalIndex
    );
  });
  const recommended = sortedCandidates.find(
    (entry) =>
      entry.candidate.passesRequired !== false &&
      entry.candidate.shippingStatus !== "UNKNOWN" &&
      entry.candidate.itemPrice > 0 &&
      priceSortValue(entry.metrics, sort, recentUnitPrice) != null
  );
  const hasConfirmedShippingCandidate = analyzedCandidates.some(
    ({ candidate }) =>
      candidate.passesRequired !== false &&
      candidate.shippingStatus !== "UNKNOWN"
  );
  async function search() {
    const query = directQuery.trim();
    if (!query) return;
    setSearching(true);
    setCandidates((rows) =>
      rows.map((candidate) =>
        candidate.source === "NAVER"
          ? { ...candidate, shippingEnrichmentStatus: "CHECKING" }
          : candidate
      )
    );
    setNotice(null);
    setSearchError(null);
    try {
      const params = new URLSearchParams();
      params.set("query", query);
      const response = await fetch(
        `/api/operations/neworder/price-search?${params.toString()}`,
        { cache: "no-store" }
      );
      const responseText = await response.text();
      let payload: {
        ok?: boolean;
        candidates?: SearchCandidate[];
        message?: string | null;
        reason?: string | null;
        searchedKeywords?: string[];
        coupangSearchUrl?: string | null;
        directSearch?: boolean;
        warning?: string | null;
      } = {};

      if (responseText.trim()) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          if (process.env.NODE_ENV === "development") {
            console.warn("[neworder/price-search] JSON 파싱 실패", {
              status: response.status,
              responseText,
            });
          }
          setSearchError({
            message: "가격 후보 조회에 실패했습니다.",
            reason: "가격 조회 API 응답을 읽지 못했습니다.",
          });
          return;
        }
      } else {
        if (process.env.NODE_ENV === "development") {
          console.warn("[neworder/price-search] 빈 API 응답", {
            status: response.status,
            responseText,
          });
        }
        setSearchError({
          message: "가격 후보 조회에 실패했습니다.",
          reason: "가격 조회 API 응답이 비어 있습니다.",
        });
        return;
      }

      if (!response.ok || payload.ok !== true) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[neworder/price-search] API 응답", {
            status: response.status,
            data: payload,
            responseText,
          });
        }
        setCoupangUrl(payload.coupangSearchUrl ?? "");
        setSearchedKeywords(payload.searchedKeywords ?? []);
        setSearchedDirectQuery(payload.searchedKeywords?.[0] ?? query);
        setSearchError({
          message: payload.message || "가격 후보 조회에 실패했습니다.",
          reason: payload.reason || null,
        });
        return;
      }

      const nextCandidates = Array.isArray(payload.candidates)
        ? payload.candidates
        : [];
      setCandidates(nextCandidates);
      setCoupangUrl(payload.coupangSearchUrl ?? "");
      setSearchedKeywords(payload.searchedKeywords ?? []);
      setSearchedDirectQuery(payload.searchedKeywords?.[0] ?? query);
      setSort(defaultPriceSort(query, "기타"));
      setNotice(
        nextCandidates.length === 0
          ? "조회된 후보가 없습니다. 검색어를 추가하거나 직접 후보를 추가해 주세요."
          : payload.warning ?? null
      );
    } catch (cause) {
      setCandidates((rows) =>
        rows.map((candidate) =>
          candidate.shippingEnrichmentStatus === "CHECKING"
            ? { ...candidate, shippingEnrichmentStatus: "FAILED" }
            : candidate
        )
      );
      if (process.env.NODE_ENV === "development") {
        console.warn("[neworder/price-search] 요청 실패", {
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
      setSearchError({
        message: "가격 후보 조회에 실패했습니다.",
        reason: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setSearching(false);
    }
  }

  function updateCandidate(index: number, patch: Partial<SearchCandidate>) {
    setCandidates((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    );
  }

  async function saveCandidate(
    candidate: SearchCandidate,
    metrics: PriceMetrics,
    targetItemId: string,
    createItemFromSearch = false,
    optionDetails?: {
      optionPriceChecked: boolean;
      optionMemo: string;
    }
  ) {
    const ok = await mutate(
      {
        action: "savePriceCandidate",
        itemId: targetItemId,
        createItemFromSearch,
        searchQuery: searchedDirectQuery || directQuery.trim(),
        ...candidate,
        quantityPerPack: metrics.unitCount,
        volumePerUnit: metrics.volumePerUnit,
        volumeUnit: metrics.volumeUnit,
        packageUnit: metrics.packageUnit,
        optionPriceChecked: optionDetails?.optionPriceChecked ?? false,
        optionMemo: optionDetails?.optionMemo.trim() || null,
      },
      "구매목록에 업데이트되었습니다"
    );
    if (ok) {
      setPendingSave(null);
      setConfirmingExistingSave(false);
      setOptionPriceChecked(false);
      setOptionMemo("");
    }
    return ok;
  }

  function requestCandidateSave(
    candidate: SearchCandidate,
    metrics: PriceMetrics
  ) {
    setConnectionItemId(activeItems[0]?.id || "");
    setConfirmingExistingSave(false);
    setOptionPriceChecked(false);
    setOptionMemo("");
    setPendingSave({ candidate, metrics });
  }

  async function saveManualLinkCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const title = String(formData.get("title") || "").trim();
    const productUrl = String(formData.get("productUrl") || "").trim();
    const itemPrice = Number(formData.get("itemPrice"));
    const shippingFee =
      manualShippingStatus === "PAID"
        ? Number(formData.get("shippingFee"))
        : 0;

    if (!title) {
      setManualSaveError("상품명을 입력해 주세요.");
      return;
    }
    if (!productUrl) {
      setManualSaveError("상품 링크를 입력해 주세요.");
      return;
    }
    try {
      new URL(productUrl);
    } catch {
      setManualSaveError("올바른 상품 링크를 입력해 주세요.");
      return;
    }
    if (!manualSource) {
      setManualSaveError("판매처를 선택해 주세요.");
      return;
    }
    if (!Number.isInteger(itemPrice) || itemPrice < 1) {
      setManualSaveError("상품총액을 입력해 주세요.");
      return;
    }
    if (
      manualShippingStatus === "PAID" &&
      (!Number.isInteger(shippingFee) || shippingFee < 0)
    ) {
      setManualSaveError("배송비 금액을 입력해 주세요.");
      return;
    }

    const payload = {
      action: "savePriceCandidate",
      manualLinkCreate: true,
      title,
      productUrl,
      source: manualSource,
      mallName: sourceLabel(manualSource),
      itemPrice,
      shippingFee,
      shippingUnitCount: 1,
      shippingFeeMode:
        manualShippingStatus === "FREE"
          ? "INCLUDED"
          : manualShippingStatus === "PAID"
            ? "ORDER_ONCE"
            : "UNKNOWN",
      shippingStatus: manualShippingStatus,
      shippingNote:
        manualShippingStatus === "UNKNOWN"
          ? "배송비를 직접 확인해 주세요."
          : null,
      shippingCondition:
        manualShippingStatus === "PAID"
          ? `배송비 ${shippingFee.toLocaleString("ko-KR")}원 / 주문`
          : manualShippingStatus === "FREE"
            ? "배송비 포함"
            : null,
      quantityPerPack: 1,
      volumePerUnit: null,
      volumeUnit: null,
      packageUnit: "개",
      optionPriceChecked: false,
    };
    if (process.env.NODE_ENV === "development") {
      console.log("[manual link save]", {
        manualProductName: title,
        manualProductUrl: productUrl,
        manualProvider: manualSource,
        manualTotalPrice: itemPrice,
        payload,
      });
    }

    setManualSaveError(null);
    const ok = await mutate(
      payload,
      "구매목록에 새 상품으로 저장되었습니다."
    );
    if (ok) {
      formElement.reset();
      setManualShippingStatus("UNKNOWN");
      setManualSource("ETC");
      setNotice("구매목록에 새 상품으로 저장되었습니다.");
    } else {
      setManualSaveError("직접 찾은 상품 저장에 실패했습니다.");
    }
  }

  return (
    <>
      <PageTitle
        title="상품등록"
        description="네이버·쿠팡에서 상품을 검색하고 구매목록에 저장하세요."
      />
      <section className="mx-auto w-full max-w-5xl py-6 sm:py-10">
        <form
          className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!searching && directQuery.trim()) {
              void search();
            }
          }}
        >
          <div className="grid gap-3 md:grid-cols-[104px_minmax(0,1fr)_112px_132px] md:items-center">
            <div className="flex h-14 items-center justify-center rounded-2xl bg-slate-100 px-4 text-sm font-bold text-slate-700">
              네이버
            </div>
            <label className="relative block">
              <span className="sr-only">상품 검색어</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-4 pl-12 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-100"
                value={directQuery}
                onChange={(event) => setDirectQuery(event.target.value)}
                placeholder="찾고 싶은 상품을 검색해보세요"
              />
            </label>
            <button
              type="submit"
              className={`${buttonClass} !h-14 min-h-14 w-full rounded-2xl px-5`}
              disabled={searching || !directQuery.trim()}
            >
              {searching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              검색
            </button>
            <a
              href={
                directQuery.trim()
                  ? `https://www.coupang.com/np/search?q=${encodeURIComponent(directQuery.trim())}`
                  : undefined
              }
              target={directQuery.trim() ? "_blank" : undefined}
              rel={directQuery.trim() ? "noopener noreferrer" : undefined}
              aria-disabled={!directQuery.trim()}
              tabIndex={directQuery.trim() ? 0 : -1}
              onClick={(event) => {
                if (!directQuery.trim()) event.preventDefault();
              }}
              className={`${secondaryButtonClass} !h-14 min-h-14 w-full rounded-2xl px-4 whitespace-nowrap aria-disabled:pointer-events-none aria-disabled:opacity-50`}
            >
              쿠팡보기
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </form>
        <p className="mt-3 text-center text-xs leading-5 text-slate-500">
          네이버에서 상품 후보를 조회하고, 쿠팡은 새 탭에서 확인할 수
          있습니다.
        </p>
      </section>

      <details className="mx-auto mb-6 max-w-5xl rounded-2xl border border-slate-200 bg-white/70 p-4">
        <summary className="cursor-pointer text-sm font-bold text-slate-800">
          직접 찾은 링크 추가
        </summary>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            검색 결과에 원하는 상품이 없으면 직접 링크로 새 구매목록에
            저장할 수 있습니다.
          </span>
          <a
            href={BAEMIN_MART_BASE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-bold text-slate-600 hover:text-slate-950"
          >
            배민상회에서 상품 찾기
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>
        <form
          onSubmit={saveManualLinkCandidate}
          className={`mt-4 grid grid-cols-1 gap-3 xl:items-end ${
            manualShippingStatus === "PAID"
              ? "xl:grid-cols-[200px_minmax(260px,1fr)_130px_160px_120px_140px_170px]"
              : "xl:grid-cols-[200px_minmax(260px,1fr)_130px_160px_140px_170px]"
          }`}
        >
          <input
            className={inputClass}
            name="title"
            placeholder="상품명"
            required
          />
          <input
            className={inputClass}
            name="productUrl"
            type="url"
            placeholder="상품 링크"
            required
            onChange={(event) => {
              const detected = detectManualSource(event.target.value);
              if (detected) setManualSource(detected);
              setManualSaveError(null);
            }}
          />
          <select
            className={inputClass}
            name="source"
            value={manualSource}
            onChange={(event) => {
              setManualSource(
                event.target.value as
                  | "NAVER"
                  | "COUPANG"
                  | "BAEMIN_MART"
                  | "ETC"
              );
              setManualSaveError(null);
            }}
          >
            <option value="NAVER">네이버</option>
            <option value="COUPANG">쿠팡</option>
            <option value="BAEMIN_MART">배민상회</option>
            <option value="ETC">기타</option>
          </select>
          <select
            className={inputClass}
            name="shippingStatus"
            value={manualShippingStatus}
            onChange={(event) => {
              setManualShippingStatus(
                event.target.value as "UNKNOWN" | "FREE" | "PAID"
              );
              setManualSaveError(null);
            }}
          >
            <option value="UNKNOWN">배송비 확인 필요</option>
            <option value="FREE">배송비 포함</option>
            <option value="PAID">배송비 직접 입력</option>
          </select>
          <input
            className={inputClass}
            name="itemPrice"
            type="number"
            min="1"
            placeholder="상품총액"
            required
          />
          {manualShippingStatus === "PAID" && (
            <input
              className={inputClass}
              name="shippingFee"
              type="number"
              min="0"
              placeholder="배송비 금액"
              required
            />
          )}
          <button
            className={`${buttonClass} w-full whitespace-nowrap`}
            disabled={saving}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            새 구매목록에 저장
          </button>
          {manualSaveError && (
            <p className="text-xs font-semibold text-red-600 xl:col-span-full">
              {manualSaveError}
            </p>
          )}
        </form>
      </details>

      <div className="mx-auto w-full max-w-5xl">
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {searchedDirectQuery && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-bold text-slate-600">
              직접 검색
            </span>
          )}
          {recommended && (
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
              현재 추천:{" "}
              <strong>{recommended.candidate.mallName}</strong>
            </span>
          )}
        </div>
        {searchedKeywords.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold">검색어:</span>
            {searchedKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-slate-200 bg-white px-2 py-1"
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
        {candidates.length > 0 && !hasConfirmedShippingCandidate && (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            모든 후보의 배송비가 미확인 상태입니다. 배송비 확인 후 추천
            가능합니다.
          </p>
        )}
        {searchError && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <p className="font-bold">{searchError.message}</p>
            {searchError.reason && (
              <p className="mt-1 text-red-700">{searchError.reason}</p>
            )}
          </div>
        )}
        {notice && (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {notice}
          </p>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-black text-slate-900">
              네이버 검색 결과
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {candidates.length}개 상품 후보를 확인합니다.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {coupangUrl && (
              <a
                href={coupangUrl}
                target="_blank"
                rel="noreferrer"
                className={secondaryButtonClass}
              >
                쿠팡 검색 열기 <ArrowUpRight className="size-4" />
              </a>
            )}
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              결과 정렬
              <select
                className={`${inputClass} min-w-0 flex-1 sm:w-[240px]`}
                value={sort}
                onChange={(event) => setSort(event.target.value as PriceSort)}
              >
                <option value="totalPrice">총액 낮은순</option>
                <option value="unitPrice">개당 가격 낮은순</option>
                <option value="pricePer100">100ml/g당 가격 낮은순</option>
                <option value="savings">
                  최근 구매가 대비 절감액 높은순
                </option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="mx-auto mt-4 grid max-w-6xl gap-4 xl:grid-cols-2">
        {sortedCandidates.map(({ candidate, metrics, originalIndex }) => {
          const needsManualPrice =
            candidate.source === "BAEMIN_MART" && candidate.itemPrice <= 0;
          const diff = null;
          const isRecommended =
            recommended?.originalIndex === originalIndex;
          const recommendationReason = isRecommended
            ? buildRecommendationReason(
                metrics,
                sort,
                recentUnitPrice,
                []
              )
            : null;
          return (
            <Panel
              key={`${candidate.productUrl}-${originalIndex}`}
              className={
                isRecommended
                  ? "border-slate-400 ring-1 ring-slate-300"
                  : "transition hover:border-slate-300 hover:shadow-md"
              }
            >
              <div className="flex gap-4">
                {candidate.image && (
                  <img
                    src={candidate.image}
                    alt=""
                    className="size-20 rounded-xl border border-slate-100 object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-600">
                        {candidate.mallName}
                      </p>
                      <h2 className="mt-1 line-clamp-2 font-bold">
                        {candidate.title}
                      </h2>
                    </div>
                    {isRecommended && (
                      <span className="shrink-0 rounded-full bg-slate-900 px-2 py-1 text-xs font-black text-white">
                        추천
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {metrics.unitCount > 1 && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        묶음상품
                      </span>
                    )}
                    {candidate.isManual && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        직접 추가
                      </span>
                    )}
                    {needsManualPrice && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">
                        가격 확인 필요
                      </span>
                    )}
                    {candidate.isDirectSearch && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        직접 검색
                      </span>
                    )}
                    {candidate.matchedKeyword && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {candidate.matchedKeyword}
                      </span>
                    )}
                    {candidate.shippingEnrichmentStatus === "CHECKING" && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        배송비 확인 중
                      </span>
                    )}
                    {candidate.shippingFee > 0 &&
                      candidate.shippingEnrichmentStatus !== "CHECKING" &&
                      candidate.shippingStatus === "PAID" &&
                      candidate.shippingUnitCount > 1 && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                          배송비 {candidate.shippingUnitCount}개마다 부과
                        </span>
                      )}
                    {candidate.shippingEnrichmentStatus !== "CHECKING" &&
                      candidate.shippingStatus === "FREE" && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        무료배송
                      </span>
                    )}
                    {candidate.shippingEnrichmentStatus !== "CHECKING" &&
                      candidate.shippingStatus === "UNKNOWN" && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-500">
                        배송비 확인 필요
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-6">
                <label className="text-xs font-semibold text-slate-500">
                  상품가
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="0"
                    value={candidate.itemPrice}
                    onChange={(event) =>
                      updateCandidate(originalIndex, {
                        itemPrice: Number(event.target.value) || 0,
                      })
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  기본 배송비
                  <input
                    className={`${inputClass} mt-1 ${
                      candidate.shippingStatus === "UNKNOWN"
                        ? "border-slate-400 bg-slate-50 focus:border-slate-600 focus:ring-slate-200"
                        : ""
                    }`}
                    type="number"
                    min="0"
                    value={candidate.shippingFee}
                    onChange={(event) =>
                      updateCandidate(originalIndex, {
                        shippingFee: Number(event.target.value) || 0,
                        shippingStatus:
                          Number(event.target.value) > 0 ? "PAID" : "UNKNOWN",
                        shippingNeedsConfirmation:
                          Number(event.target.value) <= 0,
                        shippingNote:
                          Number(event.target.value) > 0
                            ? "사용자가 배송비를 직접 입력했습니다."
                            : candidate.shippingNote,
                        shippingEnrichmentStatus:
                          Number(event.target.value) > 0
                            ? "COMPLETED"
                            : candidate.shippingEnrichmentStatus,
                      })
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  배송 상태
                  <select
                    className={`${inputClass} mt-1`}
                    value={candidate.shippingStatus}
                    onChange={(event) => {
                      const shippingStatus = event.target.value as
                        | "FREE"
                        | "PAID"
                        | "UNKNOWN";
                      updateCandidate(originalIndex, {
                        shippingStatus,
                        shippingFee:
                          shippingStatus === "FREE"
                            ? 0
                            : candidate.shippingFee,
                        shippingNeedsConfirmation:
                          shippingStatus === "UNKNOWN",
                        shippingNote:
                          shippingStatus === "FREE"
                            ? "사용자가 무료배송으로 확인했습니다."
                            : shippingStatus === "PAID"
                              ? "사용자가 유료배송으로 확인했습니다."
                              : candidate.shippingNote,
                        shippingEnrichmentStatus:
                          shippingStatus === "UNKNOWN"
                            ? candidate.shippingEnrichmentStatus
                            : "COMPLETED",
                      });
                    }}
                  >
                    <option value="UNKNOWN">확인 필요</option>
                    <option value="PAID">유료배송</option>
                    <option value="FREE">무료배송</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  배송비 부과 기준
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="1"
                    value={candidate.shippingUnitCount || 1}
                    onChange={(event) =>
                      updateCandidate(originalIndex, {
                        shippingUnitCount: Math.max(
                          1,
                          Number(event.target.value) || 1
                        ),
                        shippingStatus:
                          candidate.shippingFee > 0 ? "PAID" : "UNKNOWN",
                        shippingNeedsConfirmation:
                          candidate.shippingFee <= 0,
                      })
                    }
                  />
                  <span className="mt-1 block text-[10px] font-normal">
                    개마다
                  </span>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  묶음 수량
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="1"
                    value={candidate.quantityPerPack}
                    onChange={(event) =>
                      updateCandidate(originalIndex, {
                        quantityPerPack: Math.max(
                          1,
                          Number(event.target.value) || 1
                        ),
                      })
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  개당 용량
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={candidate.volumePerUnit ?? ""}
                    onChange={(event) =>
                      updateCandidate(originalIndex, {
                        volumePerUnit: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  용량 단위
                  <select
                    className={`${inputClass} mt-1`}
                    value={candidate.volumeUnit ?? ""}
                    onChange={(event) =>
                      updateCandidate(originalIndex, {
                        volumeUnit: event.target.value || null,
                      })
                    }
                  >
                    <option value="">없음</option>
                    <option value="ml">ml</option>
                    <option value="g">g</option>
                    <option value="매">매</option>
                  </select>
                </label>
              </div>
              {needsManualPrice ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <strong>가격 확인 필요</strong>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    배민상회에서 회원가와 배송 조건을 확인한 뒤 상품가를
                    직접 입력해 주세요.
                  </p>
                </div>
              ) : (
                <PriceCalculationSummary
                  metrics={metrics}
                  diff={diff}
                  shippingStatus={candidate.shippingStatus}
                  shippingNote={candidate.shippingNote ?? null}
                />
              )}
              {recommendationReason && (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-700">
                  {recommendationReason}
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-slate-500">
                옵션 선택 시 가격이 달라질 수 있습니다. 구매 링크에서 실제
                옵션을 선택한 뒤 상품가를 수정해 저장하세요.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={secondaryButtonClass}
                  disabled={saving}
                  onClick={() => requestCandidateSave(candidate, metrics)}
                >
                  구매목록에 저장
                </button>
                <a
                  href={candidate.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`${primaryLinkClass} h-10 rounded-xl px-4 text-sm`}
                >
                  구매처 열기 <ArrowUpRight className="size-4" />
                </a>
              </div>
            </Panel>
          );
        })}
      </div>
      {candidates.length === 0 && !searching && (
        <p className="mt-8 text-center text-sm text-slate-400">
          검색어를 입력하면 상품 후보를 확인할 수 있습니다.
        </p>
      )}

      {pendingSave && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          onClick={() => {
            setPendingSave(null);
            setConfirmingExistingSave(false);
            setOptionPriceChecked(false);
            setOptionMemo("");
          }}
        >
          <section
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl lg:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-600">품목 연결</p>
                <h2 className="mt-1 text-xl font-black">
                  구매목록에 저장할 품목을 선택해 주세요
                </h2>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                  {pendingSave.candidate.title}
                </p>
              </div>
              <button
                type="button"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xl"
                onClick={() => {
                  setPendingSave(null);
                  setConfirmingExistingSave(false);
                  setOptionPriceChecked(false);
                  setOptionMemo("");
                }}
                aria-label="품목 연결 닫기"
              >
                ×
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">
                실제 구매 옵션 확인
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                옵션 상품인 경우 구매 링크에서 실제 옵션을 선택한 뒤
                상품가를 수정했는지 확인해 주세요.
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500">상품가</dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {money(pendingSave.metrics.productPrice)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">배송비</dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {pendingSave.candidate.shippingStatus === "UNKNOWN"
                      ? "확인 필요"
                      : money(pendingSave.metrics.effectiveShippingFee)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">최종가</dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {pendingSave.candidate.shippingStatus === "UNKNOWN"
                      ? `${money(pendingSave.metrics.totalPrice)} (배송비 제외)`
                      : money(pendingSave.metrics.totalPrice)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">개당 가격</dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {money(pendingSave.metrics.unitPrice)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">구성</dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {formatComposition(pendingSave.metrics)}
                  </dd>
                </div>
              </dl>
              <label className="mt-4 block text-xs font-semibold text-slate-600">
                구매 옵션 메모
                <input
                  className={`${inputClass} mt-1`}
                  value={optionMemo}
                  onChange={(event) => setOptionMemo(event.target.value)}
                  placeholder="예: 13인치 / 1000장"
                  maxLength={500}
                />
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-slate-300 accent-[#123f34]"
                  checked={optionPriceChecked}
                  onChange={(event) =>
                    setOptionPriceChecked(event.target.checked)
                  }
                />
                <span>
                  구매하려는 옵션을 선택한 뒤 실제 가격을 확인했습니다.
                </span>
              </label>
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-bold">기존 품목에 저장</p>
              <select
                className={`${inputClass} mt-3`}
                value={connectionItemId}
                onChange={(event) => {
                  setConnectionItemId(event.target.value);
                  setConfirmingExistingSave(false);
                }}
              >
                <option value="">품목 선택</option>
                {activeItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.category}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${buttonClass} mt-3 w-full`}
                disabled={saving || !connectionItemId}
                onClick={() => setConfirmingExistingSave(true)}
              >
                선택한 품목에 저장
              </button>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">
                새 품목으로 등록 후 저장
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                품목명과 네이버·쿠팡 검색어는 “
                {searchedDirectQuery || directQuery.trim()}”, 카테고리는 기타로
                등록됩니다.
              </p>
              <button
                type="button"
                className={`${buttonClass} mt-3 w-full`}
                disabled={
                  saving || !(searchedDirectQuery || directQuery.trim())
                }
                onClick={() =>
                  void saveCandidate(
                    pendingSave.candidate,
                    pendingSave.metrics,
                    "",
                    true,
                    { optionPriceChecked, optionMemo }
                  )
                }
              >
                새 품목 등록 후 저장
              </button>
            </div>

            {confirmingExistingSave && connectionItem && (
              <div
                className="absolute inset-0 z-10 grid place-items-center rounded-3xl bg-slate-950/35 p-4"
                onClick={() => setConfirmingExistingSave(false)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="existing-save-confirm-title"
                  className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3
                    id="existing-save-confirm-title"
                    className="text-lg font-black text-slate-950"
                  >
                    기존 품목에 저장할까요?
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {connectionItemHasPurchase ? (
                      <>
                        기존 구매목록의 &lsquo;
                        <strong>{connectionItem.name}</strong>&rsquo;에 저장된
                        상품 정보를 현재 상품으로 덮어쓰시겠습니까?
                      </>
                    ) : (
                      <>
                        &lsquo;<strong>{connectionItem.name}</strong>&rsquo;
                        품목에 현재 상품을 새로 저장하시겠습니까?
                      </>
                    )}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    선택된 품목: {connectionItem.name} ·{" "}
                    {connectionItem.category}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    옵션 상품인 경우 실제 옵션 가격을 확인했는지 다시 확인해
                    주세요.
                  </p>
                  {connectionItemHasPurchase && (
                    <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                      이미 저장된 상품 정보가 있다면 새 상품 정보로
                      업데이트됩니다.
                    </p>
                  )}
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={saving}
                      onClick={() => setConfirmingExistingSave(false)}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={saving}
                      onClick={() =>
                        void saveCandidate(
                          pendingSave.candidate,
                          pendingSave.metrics,
                          connectionItem.id,
                          false,
                          { optionPriceChecked, optionMemo }
                        )
                      }
                    >
                      {saving && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                      확인 후 저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      {data.priceCandidates.length > 0 && (
        <section className="mx-auto mt-10 max-w-6xl border-t border-slate-200 pt-5">
          <h2 className="text-sm font-bold text-slate-700">최근 저장 기록</h2>
          <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white/60 px-4">
            {data.priceCandidates.slice(0, 10).map((candidate) => (
              <a
                key={candidate.id}
                href={candidate.productUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 py-3 text-sm hover:bg-slate-50/80"
              >
                <span className="min-w-0">
                  <strong className="block truncate">{candidate.title}</strong>
                  <span className="text-xs text-slate-500">
                    {candidate.item.name} · {candidate.source} ·{" "}
                    {dateTime(candidate.checkedAt)}
                  </span>
                </span>
                <span className="ml-4 shrink-0 text-right">
                  <strong className="block">
                    {money(candidate.unitPrice)}/{candidate.packageUnit || "개"}
                  </strong>
                  {candidate.pricePer100 != null && (
                    <span className="text-xs text-slate-500">
                      {money(candidate.pricePer100)}/100
                      {candidate.volumeUnit}
                    </span>
                  )}
                  {candidate.source === "MANUAL" && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      직접 추가
                    </span>
                  )}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function PriceCalculationSummary({
  metrics,
  diff,
  shippingStatus,
  shippingNote,
}: {
  metrics: PriceMetrics;
  diff: number | null;
  shippingStatus: "FREE" | "PAID" | "UNKNOWN";
  shippingNote: string | null;
}) {
  const shippingUnknown = shippingStatus === "UNKNOWN";
  const volumeLabel =
    metrics.pricePer100 != null && metrics.volumeUnit
      ? `100${metrics.volumeUnit}당`
      : metrics.pricePerMeasure != null
        ? "매당"
        : null;
  const volumePrice = metrics.pricePer100 ?? metrics.pricePerMeasure;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm lg:grid-cols-4">
      <div>
        <p className="text-xs text-slate-500">상품가</p>
        <strong>{money(metrics.productPrice)}</strong>
      </div>
      <div>
        <p className="text-xs text-slate-500">기본 배송비</p>
        <strong>
          {shippingUnknown ? "확인 필요" : money(metrics.shippingFee)}
        </strong>
        <span className="block text-[10px] text-slate-500">
          {shippingStatus === "FREE"
            ? "무료배송 확인됨"
            : shippingStatus === "UNKNOWN"
              ? "배송비 확인 필요"
              : `${metrics.shippingUnitCount}개마다`}
        </span>
      </div>
      <div>
        <p className="text-xs text-slate-500">반영 배송비</p>
        <strong>
          {shippingUnknown ? "확인 필요" : money(metrics.effectiveShippingFee)}
        </strong>
      </div>
      <div>
        <p className="text-xs text-slate-500">
          {shippingUnknown ? "상품가 기준 (배송비 제외)" : "배송비 포함 총액"}
        </p>
        <strong className="text-base">{money(metrics.totalPrice)}</strong>
        {shippingUnknown && (
          <span className="block text-[10px] text-slate-500">
            배송비 입력 시 최종 단가 계산
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-slate-500">
          {metrics.packageUnit}당 가격
          {shippingUnknown ? " (배송비 제외)" : ""}
        </p>
        <strong>{money(metrics.unitPrice)}</strong>
      </div>
      <div>
        <p className="text-xs text-slate-500">
          {volumeLabel || "용량 기준 단가"}
          {shippingUnknown ? " (배송비 제외 기준)" : ""}
        </p>
        <strong>{volumePrice == null ? "-" : money(volumePrice)}</strong>
      </div>
      <div>
        <p className="text-xs text-slate-500">구성</p>
        <strong>{formatComposition(metrics)}</strong>
      </div>
      <span className="sr-only">
        최근 구매가 대비 {diff == null ? "비교 없음" : `${diff.toFixed(1)}%`}
      </span>
      {shippingUnknown && shippingNote && (
        <p className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 lg:col-span-4">
          {shippingNote}
        </p>
      )}
    </div>
  );
}

function buildRecommendationReason(
  metrics: PriceMetrics,
  sort: PriceSort,
  recentUnitPrice: number | null,
  requiredKeywords: string[]
): string {
  const reason =
    sort === "pricePer100" && metrics.volumeUnit
      ? `100${metrics.volumeUnit}당 가격이 가장 낮아 추천합니다.`
      : sort === "unitPrice"
        ? `${metrics.packageUnit}당 가격이 가장 낮아 추천합니다.`
        : sort === "totalPrice"
          ? "배송비 포함 총액이 가장 낮아 추천합니다."
          : recentUnitPrice && recentUnitPrice > 0
            ? "최근 구매가 대비 절감액이 가장 커 추천합니다."
            : "최근 구매가 대비 절감액을 계산할 수 없습니다.";
  const keywordReason = requiredKeywordReason(requiredKeywords);
  return keywordReason ? `${reason} ${keywordReason}` : reason;
}

function requiredKeywordReason(requiredKeywords: string[]): string {
  return requiredKeywords.length > 0
    ? `${requiredKeywords.join(", ")} 필수 키워드를 통과했습니다.`
    : "";
}
