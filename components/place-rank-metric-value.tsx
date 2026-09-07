import {
  getTop300MetricMovement,
  getTop300MetricMovementLabel,
  getTop300SaveCountMovement,
  type Top300MetricMovement,
} from "@/lib/place-rank-top300-history";

function movementTone(movement: Top300MetricMovement): string {
  if (movement.kind === "up") return "text-[#ef4444]";
  if (movement.kind === "down") return "text-[#2563eb]";
  return "text-[#9ca3af]";
}

export default function PlaceRankMetricValue({
  value,
  currentValue,
  previousValue,
  comparisonActive,
  fractionDigits = 0,
  currentIsApproximate,
  previousIsApproximate,
  compact = false,
}: {
  value: string;
  currentValue: number | null;
  previousValue: number | null | undefined;
  comparisonActive: boolean;
  fractionDigits?: number;
  currentIsApproximate?: boolean | null;
  previousIsApproximate?: boolean | null;
  compact?: boolean;
}) {
  const movement = comparisonActive
    ? currentIsApproximate !== undefined || previousIsApproximate !== undefined
      ? getTop300SaveCountMovement(
          previousValue,
          currentValue,
          previousIsApproximate,
          currentIsApproximate
        )
      : getTop300MetricMovement(
          previousValue,
          currentValue,
          fractionDigits
        )
    : null;
  const showMovement = movement !== null && value !== "-";

  return (
    <span
      data-place-rank-metric-value
      className={
        compact
          ? "flex min-w-0 flex-col items-center justify-center gap-0 leading-none"
          : "inline-flex items-center justify-end gap-1 whitespace-nowrap"
      }
    >
      <span>{value}</span>
      {showMovement ? (
        <span
          data-metric-movement={movement.kind}
          className={`${
            compact ? "text-[7px] leading-[9px]" : "text-[10px] leading-none"
          } font-extrabold tabular-nums ${movementTone(movement)}`}
        >
          {getTop300MetricMovementLabel(movement, fractionDigits)}
        </span>
      ) : null}
    </span>
  );
}
