type ReviewDeltaDirection =
  | "increase"
  | "decrease"
  | "flat"
  | "unavailable";

export type ReviewDeltaPresentation = {
  direction: ReviewDeltaDirection;
  label: string;
  accessibleLabel: string;
};

const deltaNumberFormat = new Intl.NumberFormat("ko-KR");

export function getReviewDeltaPresentation(
  value?: number | null
): ReviewDeltaPresentation {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      direction: "unavailable",
      label: "-",
      accessibleLabel: "비교할 전일 기록 없음",
    };
  }
  if (value === 0) {
    return {
      direction: "flat",
      label: "-",
      accessibleLabel: "전일 대비 변화 없음",
    };
  }
  if (value > 0) {
    const formatted = deltaNumberFormat.format(value);
    return {
      direction: "increase",
      label: `▲ ${formatted}`,
      accessibleLabel: `전일 대비 ${formatted}개 증가`,
    };
  }

  const formatted = deltaNumberFormat.format(Math.abs(value));
  return {
    direction: "decrease",
    label: `▼ ${formatted}`,
    accessibleLabel: `전일 대비 ${formatted}개 감소`,
  };
}

export function PlaceReviewDeltaBadge({
  value,
  className = "",
}: {
  value?: number | null;
  className?: string;
}) {
  const presentation = getReviewDeltaPresentation(value);
  const toneClass =
    presentation.direction === "increase"
      ? "text-[#ef4444]"
      : presentation.direction === "decrease"
        ? "text-[#2563eb]"
        : "text-[#9ca3af]";

  return (
    <span
      data-review-delta={presentation.direction}
      aria-label={presentation.accessibleLabel}
      className={`inline-flex w-fit items-center whitespace-nowrap text-[13px] font-extrabold leading-none tabular-nums md:text-[14px] ${toneClass} ${className}`}
    >
      {presentation.label}
    </span>
  );
}
