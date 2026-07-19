import { getNewOpenBadgeLabel } from "@/lib/naver-place-new-open";

export function PlaceAnalysisNewOpenBadge({
  place,
}: {
  place: {
    isNewOpen?: boolean | null;
    newOpenLabel?: string | null;
  };
}) {
  const label = getNewOpenBadgeLabel(place);
  if (place.isNewOpen !== true || !label) return null;

  return (
    <span className="inline-flex shrink-0 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-extrabold leading-4 text-red-600 md:px-2 md:text-[10px]">
      {label}
    </span>
  );
}
