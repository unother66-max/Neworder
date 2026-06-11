"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Building2,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Menu,
  PackageSearch,
  ShoppingCart,
  X,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/operations/neworder", label: "운영 현황", icon: LayoutDashboard },
  {
    href: "/operations/neworder/check",
    label: "재고 체크",
    icon: ClipboardCheck,
  },
  {
    href: "/operations/neworder/orders",
    label: "발주 목록",
    icon: ShoppingCart,
  },
  {
    href: "/operations/neworder/price-compare",
    label: "가격비교",
    icon: PackageSearch,
  },
  { href: "/operations/neworder/items", label: "품목 관리", icon: Boxes },
  {
    href: "/operations/neworder/suppliers",
    label: "거래처 관리",
    icon: Building2,
  },
  {
    href: "/operations/neworder/purchase-history",
    label: "구매내역",
    icon: History,
  },
] as const;

const ROLE_LABEL = {
  STORE_MANAGER: "점장",
  ADMIN: "관리자",
  SUPERADMIN: "최고관리자",
} as const;

export function NewOrderShell({
  children,
  operatorName,
  role,
}: {
  children: React.ReactNode;
  operatorName: string;
  role: keyof typeof ROLE_LABEL;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[#f5f7f4] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
              onClick={() => setOpen((value) => !value)}
              aria-label="운영 메뉴 열기"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <Link href="/operations/neworder" className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#173f35] text-sm font-black text-white">
                NO
              </span>
              <span>
                <strong className="block text-sm">NEW ORDER CLUB</strong>
                <span className="block text-xs text-slate-500">
                  PostLabs 운영관리
                </span>
              </span>
            </Link>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{operatorName}</p>
            <p className="text-xs text-slate-500">
              {ROLE_LABEL[role]} · 전체 운영 권한
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside
          className={`${open ? "block" : "hidden"} fixed inset-x-0 top-16 z-30 border-b border-slate-200 bg-white p-3 shadow-lg lg:sticky lg:top-16 lg:block lg:h-[calc(100dvh-4rem)] lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0 lg:p-5 lg:shadow-none`}
        >
          <nav className="grid gap-1">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/operations/neworder"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#173f35] text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            이 페이지는 내부 운영 전용입니다. 고객용 뉴오더클럽 사이트와
            분리되어 있습니다.
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

