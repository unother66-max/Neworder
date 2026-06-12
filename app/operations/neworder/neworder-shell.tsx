"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Menu,
  PackageSearch,
  ShoppingCart,
  X,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  {
    href: "/operations/neworder/price-compare",
    label: "가격비교",
    icon: PackageSearch,
  },
  {
    href: "/operations/neworder/orders",
    label: "구매목록",
    icon: ShoppingCart,
  },
  { href: "/operations/neworder/items", label: "품목 관리", icon: Boxes },
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
    <div className="min-h-dvh bg-[#f7f8f8] text-slate-950">
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
            <Link
              href="/operations/neworder/price-compare"
              className="flex items-center gap-3"
            >
              <Image
                src="/images/new-order-club-logo.png"
                width={491}
                height={412}
                alt=""
                className="h-auto w-[58px] max-w-[58px] shrink-0 object-contain sm:w-[72px] sm:max-w-[72px]"
                priority
              />
              <span>
                <strong className="block text-sm">NEW ORDER CLUB</strong>
                <span className="block text-xs text-slate-500">
                  발주 및 운영관리
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
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#173f35] !text-white hover:bg-[#173f35] hover:!text-white [&_svg]:!text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            이 페이지는 내부 운영 전용입니다. 고객용 뉴오더클럽 사이트와
            분리되어 있습니다.
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
