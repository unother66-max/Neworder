import type { MouseEventHandler } from "react";

export type MobileWebAnalysisResult = {
  collectedIndex: number;
  page: number;
  title: string;
  url: string;
  domain: string;
  source: string;
  thumbnail?: string;
};

export function webAnalysisSourceLabel(
  row: Pick<MobileWebAnalysisResult, "source" | "domain">
): string {
  return (
    String(row.source ?? "").trim() ||
    String(row.domain ?? "").trim() ||
    "-"
  );
}

export function WebAnalysisMobileResultHeader() {
  return (
    <div
      data-mobile-web-analysis-header
      className="grid min-w-0 grid-cols-[40px_54px_minmax(0,1fr)] items-center gap-x-1.5 border-b border-[#e5e7eb] bg-[#f9fafb] px-3 py-1.5 text-[9px] font-bold leading-3 text-[#6b7280]"
    >
      <span className="whitespace-nowrap text-center">수집순번</span>
      <span className="text-center">페이지</span>
      <span className="min-w-0 truncate text-left">결과 정보</span>
    </div>
  );
}

export default function WebAnalysisMobileResultItem({
  row,
  isPreview,
  onLoginRequired,
}: {
  row: MobileWebAnalysisResult;
  isPreview: boolean;
  onLoginRequired?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const href = isPreview ? "#login-required" : row.url;
  const source = webAnalysisSourceLabel(row);
  const linkProps = isPreview
    ? { onClick: onLoginRequired }
    : { target: "_blank", rel: "noopener noreferrer" };

  return (
    <article
      role="listitem"
      data-mobile-web-analysis-row={`${row.page}-${row.collectedIndex}`}
      className="grid min-h-[56px] min-w-0 grid-cols-[40px_54px_minmax(0,1fr)] items-center gap-x-1.5 px-3 py-2"
    >
      <div className="text-center text-[11px] font-bold tabular-nums text-[#4b5563]">
        {row.collectedIndex}
      </div>

      <div className="text-center">
        <span
          data-mobile-web-analysis-page-badge
          className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#eff6ff] px-1.5 py-0.5 text-[10px] font-black leading-4 text-[#2563eb]"
        >
          {row.page}페이지
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {row.thumbnail ? (
          <div
            aria-hidden="true"
            className="h-10 w-10 shrink-0 overflow-hidden rounded-[8px] bg-[#f3f4f6]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <a
            data-mobile-web-analysis-title-link
            href={href}
            {...linkProps}
            aria-label={`${row.title}${
              isPreview ? " (로그인 필요)" : " 열기"
            }`}
            title={row.title}
            className="line-clamp-2 text-[12px] font-bold leading-4 text-[#111827] transition hover:text-[#2563eb]"
          >
            {row.title}
          </a>
          <div
            data-mobile-web-analysis-source
            title={source}
            className="mt-0.5 truncate whitespace-nowrap text-[9px] font-semibold leading-3 text-[#9ca3af]"
          >
            {source}
          </div>
        </div>
      </div>
    </article>
  );
}
