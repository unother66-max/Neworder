"use client";
/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Store,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  calculatePriceMetrics,
  formatComposition,
  getRecommendationMetric,
  metricValue,
  type PriceMetrics,
  type RecommendationMetric,
} from "@/lib/neworder/price-analysis";
import {
  normalizeStringArray,
  parseLines,
} from "@/lib/neworder/item-keywords";

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
  source: "NAVER" | "COUPANG" | "MANUAL";
  title: string;
  productUrl: string;
  totalPrice: number;
  unitPrice: number;
  quantityPerPack: number;
  volumePerUnit: number | null;
  volumeUnit: string | null;
  packageUnit: string | null;
  pricePer100: number | null;
  pricePerMeasure: number | null;
  checkedAt: string;
  item: { id: string; name: string };
};

type Snapshot = {
  items: Item[];
  suppliers: Supplier[];
  orders: Order[];
  purchases: Purchase[];
  checks: InventoryCheck[];
  priceCandidates: PriceCandidate[];
};

function normalizeItem(item: Item): Item {
  const raw = item as Item & {
    excludeKeywords?: unknown;
    naverSearchKeywords?: unknown;
    coupangSearchKeywords?: unknown;
    excludedKeywords?: unknown;
  };
  return {
    ...item,
    naverSearchKeywords: normalizeStringArray(raw.naverSearchKeywords),
    coupangSearchKeywords: normalizeStringArray(raw.coupangSearchKeywords),
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
  };
}

type SearchCandidate = {
  source: "NAVER" | "COUPANG" | "MANUAL";
  title: string;
  productUrl: string;
  image: string | null;
  mallName: string;
  matchedKeyword?: string | null;
  itemPrice: number;
  shippingFee: number;
  quantityPerPack: number;
  volumePerUnit: number | null;
  volumeUnit: string | null;
  packageUnit: string;
};

type PriceSort =
  | "totalPrice"
  | "unitPrice"
  | "pricePer100"
  | "savings";

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
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#2f6f5e]/15";
const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#173f35] px-4 text-sm font-bold text-white transition hover:bg-[#245b4c] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "조회에 실패했습니다.");
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
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "저장에 실패했습니다.");
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
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
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
        <OrdersView data={data} saving={saving} mutate={mutate} />
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
        <PriceCompareView data={data} saving={saving} mutate={mutate} />
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
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "미완료 발주",
      value: pending.length,
      icon: ShoppingCart,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "등록 거래처",
      value: data.suppliers.filter((supplier) => supplier.isActive).length,
      icon: Store,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "구매 기록",
      value: data.purchases.length,
      icon: CircleDollarSign,
      tone: "bg-violet-50 text-violet-700",
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
                      : "bg-emerald-50 text-emerald-700"
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
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
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
  const [editing, setEditing] = useState<Item | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const naverSearchKeywords = parseLines(
      String(form.get("naverSearchKeywords") ?? "")
    );
    const coupangSearchKeywords = parseLines(
      String(form.get("coupangSearchKeywords") ?? "")
    );
    const excludedKeywords = normalizeStringArray(
      form.get("excludedKeywords"),
      /[,;\r\n]+/
    );
    const ok = await mutate(
      {
        action: "saveItem",
        id: editing?.id,
        name: form.get("name"),
        category: form.get("category"),
        minimumStock: form.get("minimumStock"),
        orderUnit: form.get("orderUnit"),
        orderUnitQuantity: form.get("orderUnitQuantity"),
        naverSearchKeyword: form.get("naverSearchKeyword"),
        naverSearchKeywords,
        coupangSearchKeyword: form.get("coupangSearchKeyword"),
        coupangSearchKeywords,
        excludedKeywords,
        defaultSupplierId: form.get("defaultSupplierId"),
      },
      editing ? "품목을 수정했습니다." : "품목을 추가했습니다."
    );
    if (ok) {
      setEditing(null);
      event.currentTarget.reset();
    }
  }

  return (
    <>
      <PageTitle
        title="품목 관리"
        description="최소재고, 발주 단위, 가격 검색어와 기본 거래처를 관리합니다. 삭제 대신 비활성화합니다."
      />
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{editing ? "품목 수정" : "새 품목 추가"}</h2>
          {editing && (
            <button
              className={secondaryButtonClass}
              onClick={() => setEditing(null)}
            >
              신규 입력으로 전환
            </button>
          )}
        </div>
        <form
          key={editing?.id || "new"}
          onSubmit={submit}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <input
            className={inputClass}
            name="name"
            defaultValue={editing?.name}
            placeholder="품목명"
            required
          />
          <input
            className={inputClass}
            name="category"
            defaultValue={editing?.category}
            placeholder="카테고리"
            required
          />
          <input
            className={inputClass}
            name="minimumStock"
            type="number"
            min="0"
            defaultValue={editing?.minimumStock ?? 0}
            placeholder="최소재고"
            required
          />
          <input
            className={inputClass}
            name="orderUnit"
            defaultValue={editing?.orderUnit}
            placeholder="발주 단위 (예: 1박스)"
            required
          />
          <input
            className={inputClass}
            name="orderUnitQuantity"
            type="number"
            min="1"
            defaultValue={editing?.orderUnitQuantity ?? 1}
            placeholder="단위당 수량"
            required
          />
          <input
            className={inputClass}
            name="naverSearchKeyword"
            defaultValue={editing?.naverSearchKeyword || ""}
            placeholder="네이버 기본 검색어"
          />
          <textarea
            className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#2f6f5e]/15"
            name="naverSearchKeywords"
            defaultValue={(editing?.naverSearchKeywords ?? []).join("\n")}
            placeholder={"네이버 보조 검색어 (줄바꿈 구분)\n예: 올리타리아 트러플 오일 250ml"}
          />
          <input
            className={inputClass}
            name="coupangSearchKeyword"
            defaultValue={editing?.coupangSearchKeyword || ""}
            placeholder="쿠팡 기본 검색어"
          />
          <textarea
            className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f5e] focus:ring-2 focus:ring-[#2f6f5e]/15"
            name="coupangSearchKeywords"
            defaultValue={(editing?.coupangSearchKeywords ?? []).join("\n")}
            placeholder="쿠팡 보조 검색어 (줄바꿈 구분)"
          />
          <input
            className={inputClass}
            name="excludedKeywords"
            defaultValue={(editing?.excludedKeywords ?? []).join(", ")}
            placeholder="제외 키워드 (쉼표 구분)"
          />
          <select
            className={inputClass}
            name="defaultSupplierId"
            defaultValue={editing?.defaultSupplierId || ""}
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
            {editing ? "수정 저장" : "품목 추가"}
          </button>
        </form>
      </Panel>
      <Panel className="mt-4 overflow-hidden p-0 lg:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
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
              {data.items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-slate-100 ${
                    item.isActive ? "" : "bg-slate-50 text-slate-400"
                  }`}
                >
                  <td className="px-4 py-3 font-bold">{item.name}</td>
                  <td className="px-4 py-3">{item.category}</td>
                  <td className="px-4 py-3">{item.minimumStock}</td>
                  <td className="px-4 py-3">
                    {item.orderUnit} / {item.orderUnitQuantity}개
                  </td>
                  <td className="px-4 py-3">
                    {item.defaultSupplier?.name || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {item.purchases[0]
                      ? money(item.purchases[0].unitPrice)
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {item.isActive ? "활성" : "비활성"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        className={secondaryButtonClass}
                        onClick={() =>
                          setEditing(
                            normalizeItem({
                              ...item,
                              naverSearchKeywords:
                                item.naverSearchKeywords ?? [],
                              coupangSearchKeywords:
                                item.coupangSearchKeywords ?? [],
                            })
                          )
                        }
                      >
                        <Pencil className="size-3.5" /> 수정
                      </button>
                      {item.isActive && (
                        <button
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
    const form = new FormData(event.currentTarget);
    const ok = await mutate(
      {
        action: "saveSupplier",
        id: editing?.id,
        name: form.get("name"),
        contact: form.get("contact"),
        website: form.get("website"),
        memo: form.get("memo"),
      },
      editing ? "거래처를 수정했습니다." : "거래처를 추가했습니다."
    );
    if (ok) {
      setEditing(null);
      event.currentTarget.reset();
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
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
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
    const form = new FormData(event.currentTarget);
    const ok = await mutate(
      {
        action: "savePurchase",
        purchasedAt: form.get("purchasedAt"),
        itemId: form.get("itemId"),
        supplierId: form.get("supplierId"),
        quantity: form.get("quantity"),
        totalPrice: form.get("totalPrice"),
        memo: form.get("memo"),
      },
      "구매내역을 저장했습니다."
    );
    if (ok) event.currentTarget.reset();
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
  const [itemId, setItemId] = useState(activeItems[0]?.id || "");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [coupangUrl, setCoupangUrl] = useState("");
  const [searchedKeywords, setSearchedKeywords] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<{
    message: string;
    reason: string | null;
  } | null>(null);
  const [sort, setSort] = useState<PriceSort>("unitPrice");
  const selectedItem = data.items.find((item) => item.id === itemId);
  const recentUnitPrice = selectedItem?.purchases[0]?.unitPrice ?? null;
  const recommendationMetric = getRecommendationMetric(
    selectedItem?.name || "",
    selectedItem?.category || ""
  );
  const analyzedCandidates = useMemo(
    () =>
      candidates.map((candidate, originalIndex) => ({
        candidate,
        originalIndex,
        metrics: calculatePriceMetrics(candidate),
      })),
    [candidates]
  );
  const recommended = useMemo(() => {
    return [...analyzedCandidates].sort((a, b) => {
      const metricDiff =
        metricValue(a.metrics, recommendationMetric) -
        metricValue(b.metrics, recommendationMetric);
      return metricDiff || a.metrics.totalPrice - b.metrics.totalPrice;
    })[0];
  }, [analyzedCandidates, recommendationMetric]);
  const sortedCandidates = useMemo(() => {
    return [...analyzedCandidates].sort((a, b) => {
      if (sort === "savings") {
        const aSavings =
          recentUnitPrice == null ? 0 : recentUnitPrice - a.metrics.unitPrice;
        const bSavings =
          recentUnitPrice == null ? 0 : recentUnitPrice - b.metrics.unitPrice;
        return bSavings - aSavings;
      }
      const aValue =
        sort === "pricePer100"
          ? a.metrics.pricePer100 ?? Number.POSITIVE_INFINITY
          : a.metrics[sort];
      const bValue =
        sort === "pricePer100"
          ? b.metrics.pricePer100 ?? Number.POSITIVE_INFINITY
          : b.metrics[sort];
      return aValue - bValue;
    });
  }, [analyzedCandidates, recentUnitPrice, sort]);

  async function search() {
    if (!itemId) return;
    setSearching(true);
    setNotice(null);
    setSearchError(null);
    try {
      const response = await fetch(
        `/api/operations/neworder/price-search?itemId=${encodeURIComponent(itemId)}`,
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
      setNotice(
        nextCandidates.length === 0
          ? "조회된 후보가 없습니다. 검색어를 추가하거나 직접 후보를 추가해 주세요."
          : payload.warning ?? null
      );
    } catch (cause) {
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

  async function saveCoupangCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = "MANUAL";
    const title = String(form.get("title") || "").trim();
    const itemPrice = Number(form.get("itemPrice")) || 0;
    const shippingFee = Number(form.get("shippingFee")) || 0;
    const titleMetrics = calculatePriceMetrics({
      title,
      itemPrice,
      shippingFee,
    });
    const candidate: SearchCandidate = {
      source,
      title,
      productUrl: String(form.get("productUrl") || "").trim(),
      image: null,
      mallName: "직접 추가",
      itemPrice,
      shippingFee,
      quantityPerPack: form.get("quantityPerPack")
        ? Math.max(1, Number(form.get("quantityPerPack")) || 1)
        : titleMetrics.unitCount,
      volumePerUnit: form.get("volumePerUnit")
        ? Number(form.get("volumePerUnit"))
        : titleMetrics.volumePerUnit,
      volumeUnit:
        String(form.get("volumeUnit") || "") || titleMetrics.volumeUnit,
      packageUnit:
        String(form.get("packageUnit") || "") || titleMetrics.packageUnit,
    };
    const parsed = calculatePriceMetrics(candidate);
    candidate.quantityPerPack = parsed.unitCount;
    candidate.volumePerUnit = parsed.volumePerUnit;
    candidate.volumeUnit = parsed.volumeUnit;
    candidate.packageUnit = parsed.packageUnit;
    const ok = await mutate(
      {
        action: "savePriceCandidate",
        itemId,
        ...candidate,
      },
      "직접 추가 후보를 저장했습니다."
    );
    if (ok) {
      setCandidates((rows) => [
        ...rows.filter((row) => row.productUrl !== candidate.productUrl),
        candidate,
      ]);
      event.currentTarget.reset();
    }
  }

  return (
    <>
      <PageTitle
        title="가격비교"
        description="상품명의 구성과 용량을 분석해 배송비 포함 개당·100ml·100g·매당 가격을 비교합니다."
      />
      <Panel>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <select
            className={inputClass}
            value={itemId}
            onChange={(event) => {
              setItemId(event.target.value);
              setCandidates([]);
              setSearchedKeywords([]);
              setSearchError(null);
              setNotice(null);
            }}
          >
            {activeItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.category}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={sort}
            onChange={(event) => setSort(event.target.value as PriceSort)}
          >
            <option value="totalPrice">총액 낮은순</option>
            <option value="unitPrice">개당 가격 낮은순</option>
            <option value="pricePer100">100ml당 가격 낮은순</option>
            <option value="savings">최근 구매가 대비 절감액 높은순</option>
          </select>
          <button
            className={buttonClass}
            onClick={() => void search()}
            disabled={searching || !itemId}
          >
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            가격 후보 조회
          </button>
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
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">
            최근 구매 단가:{" "}
            <strong>
              {recentUnitPrice === null ? "기록 없음" : money(recentUnitPrice)}
            </strong>
          </span>
          {recommended && (
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800">
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
        {notice && <p className="mt-3 text-sm text-amber-700">{notice}</p>}
        <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-bold">
            네이버·쿠팡에서 찾은 후보 직접 추가
          </summary>
          <form
            onSubmit={saveCoupangCandidate}
            className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
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
              placeholder="쿠팡 상품 링크"
              required
            />
            <input
              className={inputClass}
              name="itemPrice"
              type="number"
              min="0"
              placeholder="상품가"
              required
            />
            <input
              className={inputClass}
              name="shippingFee"
              type="number"
              min="0"
              defaultValue="0"
              placeholder="배송비"
              required
            />
            <input
              className={inputClass}
              name="quantityPerPack"
              type="number"
              min="1"
              placeholder="묶음 수량 (자동)"
            />
            <input
              className={inputClass}
              name="volumePerUnit"
              type="number"
              min="0"
              step="0.1"
              placeholder="개당 용량 (자동 파싱)"
            />
            <select className={inputClass} name="volumeUnit" defaultValue="">
              <option value="">용량 단위 자동</option>
              <option value="ml">ml</option>
              <option value="g">g</option>
              <option value="매">매</option>
            </select>
            <select className={inputClass} name="packageUnit" defaultValue="">
              <option value="">포장 단위 자동</option>
              {["개", "병", "팩", "박스", "봉", "캔", "롤", "통", "세트"].map(
                (unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                )
              )}
            </select>
            <button className={buttonClass} disabled={saving || !itemId}>
              후보 저장
            </button>
          </form>
        </details>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {sortedCandidates.map(({ candidate, metrics, originalIndex }) => {
          const diff =
            recentUnitPrice === null
              ? null
              : ((metrics.unitPrice - recentUnitPrice) / recentUnitPrice) * 100;
          const isRecommended =
            recommended?.candidate.productUrl === candidate.productUrl;
          const recommendationReason = isRecommended
            ? buildRecommendationReason(
                metrics,
                recommendationMetric,
                recentUnitPrice
              )
            : null;
          return (
            <Panel
              key={`${candidate.productUrl}-${originalIndex}`}
              className={isRecommended ? "ring-2 ring-emerald-500" : ""}
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
                      <p className="text-xs font-bold text-emerald-700">
                        {candidate.mallName}
                      </p>
                      <h2 className="mt-1 line-clamp-2 font-bold">
                        {candidate.title}
                      </h2>
                    </div>
                    {isRecommended && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">
                        추천
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {metrics.unitCount > 1 && (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                        묶음상품
                      </span>
                    )}
                    {candidate.source === "MANUAL" && (
                      <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700">
                        직접 추가
                      </span>
                    )}
                    {candidate.matchedKeyword && (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {candidate.matchedKeyword}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-5">
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
                  배송비
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    min="0"
                    value={candidate.shippingFee}
                    onChange={(event) =>
                      updateCandidate(originalIndex, {
                        shippingFee: Number(event.target.value) || 0,
                      })
                    }
                  />
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
              <PriceCalculationSummary metrics={metrics} diff={diff} />
              {recommendationReason && (
                <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-800">
                  {recommendationReason}
                </p>
              )}
              <div className="mt-3">
                <div>
                  <p className="text-xs text-slate-500">최근 구매가 대비</p>
                  <strong
                    className={
                      diff === null
                        ? ""
                        : diff <= 0
                          ? "text-emerald-700"
                          : "text-red-700"
                    }
                  >
                    {diff === null
                      ? "-"
                      : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`}
                  </strong>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className={secondaryButtonClass}
                  disabled={saving}
                  onClick={() =>
                    void mutate(
                      {
                        action: "savePriceCandidate",
                        itemId,
                        ...candidate,
                        quantityPerPack: metrics.unitCount,
                        volumePerUnit: metrics.volumePerUnit,
                        volumeUnit: metrics.volumeUnit,
                        packageUnit: metrics.packageUnit,
                      },
                      "가격 후보를 저장했습니다."
                    )
                  }
                >
                  후보 저장
                </button>
                <a
                  href={candidate.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass}
                >
                  구매처 열기 <ArrowUpRight className="size-4" />
                </a>
              </div>
            </Panel>
          );
        })}
      </div>
      {candidates.length === 0 && !searching && (
        <Panel className="mt-4 text-center text-sm text-slate-500">
          품목을 선택하고 가격 후보 조회를 실행해 주세요.
        </Panel>
      )}
      {data.priceCandidates.length > 0 && (
        <Panel className="mt-6">
          <h2 className="font-bold">최근 저장한 가격 후보</h2>
          <div className="mt-4 grid gap-2">
            {data.priceCandidates.slice(0, 10).map((candidate) => (
              <a
                key={candidate.id}
                href={candidate.productUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm hover:bg-slate-50"
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
                    <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                      직접 추가
                    </span>
                  )}
                </span>
              </a>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

function PriceCalculationSummary({
  metrics,
  diff,
}: {
  metrics: PriceMetrics;
  diff: number | null;
}) {
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
        <p className="text-xs text-slate-500">배송비 포함 총액</p>
        <strong className="text-base">{money(metrics.totalPrice)}</strong>
      </div>
      <div>
        <p className="text-xs text-slate-500">구성</p>
        <strong>{formatComposition(metrics)}</strong>
      </div>
      <div>
        <p className="text-xs text-slate-500">
          {metrics.packageUnit}당 가격
        </p>
        <strong>{money(metrics.unitPrice)}</strong>
      </div>
      <div>
        <p className="text-xs text-slate-500">{volumeLabel || "용량 기준 단가"}</p>
        <strong>{volumePrice == null ? "-" : money(volumePrice)}</strong>
      </div>
      <span className="sr-only">
        최근 구매가 대비 {diff == null ? "비교 없음" : `${diff.toFixed(1)}%`}
      </span>
    </div>
  );
}

function buildRecommendationReason(
  metrics: PriceMetrics,
  recommendationMetric: RecommendationMetric,
  recentUnitPrice: number | null
): string {
  const metricLabel =
    recommendationMetric === "pricePer100" && metrics.volumeUnit
      ? `100${metrics.volumeUnit}당 가격`
        : recommendationMetric === "pricePerMeasure"
        ? metrics.pricePerMeasure != null
          ? "매당 가격"
          : `${metrics.packageUnit}당 가격`
        : `${metrics.packageUnit}당 가격`;
  const saving =
    recentUnitPrice && recentUnitPrice > 0
      ? ((recentUnitPrice - metrics.unitPrice) / recentUnitPrice) * 100
      : null;
  if (saving != null && saving > 0) {
    return `${metricLabel}이 가장 낮고, 최근 구매가보다 ${saving.toFixed(0)}% 저렴합니다.`;
  }
  return `${metricLabel}이 가장 낮고 배송비 포함 총액까지 반영한 추천입니다.`;
}
